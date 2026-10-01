-- ───────────────────────────────────────────────────────────────────────────
-- יריד ספרים: איחוד המלאי לבריכה אחת
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 עד כה המלאי היה מופרד קשיחות לשתי מכסות — stock_web ו-stock_phone —
-- מתוך כוונה למנוע מצב שערוץ אחד "בולע" את כל המלאי. בפועל ההפרדה עשתה
-- בדיוק את ההיפך: כמעט כל המלאי הוקצה לאתר, ולכן המכירה הטלפונית ראתה
-- "אזל המלאי" על ספרים שהיו במחסן — 32 מתוך 35 הספרים המוגבלים היו עם
-- stock_phone = 0. הפרדה שדורשת הקצאה ידנית מדויקת מראש בין ערוצים אינה
-- ניתנת לתחזוקה ביריד שנמשך ימים.
--
-- המודל החדש: בריכה אחת — stock_total — שממנה *שני* הערוצים מנכים.
-- עמודת הערוץ ביומן (book_fair_stock_ledger.channel) נשארת, וממשיכה לתעד
-- מי מכר; מה שהשתנה הוא שאין יותר מכסה נפרדת לכל ערוץ.
--
-- ⚠️ העמודות הישנות נשמרות ואינן נמחקות במיגרציה זו: הן ראיה למה שהיה,
-- והיומן ההיסטורי מתייחס אליהן. הן פשוט מפסיקות להשתתף בשריון ובניכוי.
--
-- ⚠️ unlimited_stock ממשיך לגבור על הכל: ספר בלתי מוגבל אינו משתתף
-- בשריון ואינו נספר במלאי, בשני הערוצים.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1) העמודה המאוחדת ──

alter table public.book_fair_books
  add column if not exists stock_total integer not null default 0
    check (stock_total >= 0);

comment on column public.book_fair_books.stock_total is
  'המלאי הזמין למכירה — בריכה אחת לשני הערוצים (אתר + טלפון). כש-unlimited_stock=true אינו רלוונטי.';

comment on column public.book_fair_books.stock_web is
  'מיושן — המכסה הישנה של האתר. נשמרת כראיה היסטורית; המלאי בפועל הוא stock_total.';

comment on column public.book_fair_books.stock_phone is
  'מיושן — המכסה הישנה של הטלפון. נשמרת כראיה היסטורית; המלאי בפועל הוא stock_total.';

-- 🔴 איחוד חד-פעמי של הערכים הקיימים. הסכום ולא המקסימום: שתי המכסות
-- יחד הן המלאי הפיזי שנותר למכירה, וזו בדיוק ההגדרה של הבריכה החדשה.
--
-- ⚠️ רק כשהעמודה עדיין באפס, כדי שהרצה חוזרת של המיגרציה לא תכפיל
-- את המלאי.
update public.book_fair_books
   set stock_total = stock_web + stock_phone
 where stock_total = 0 and (stock_web > 0 or stock_phone > 0);

-- ── יישור היומן לבריכה החדשה ──
--
-- 🔴 בלי זה הביקורת הלילית מתריעה על *כל* הספרים המוגבלים: היומן
-- ההיסטורי מסכם תנועות שנעשו כנגד שתי העמודות הישנות, והוא אינו
-- מסתכם בהכרח ב-stock_total החדש. פער מדומה בכל ספר הופך את ההתראה
-- לרעש, ואז גם פער אמיתי לא ייראה.
--
-- ⚠️ reason='adjust' ולא 'import': זו אינה קבלת סחורה אלא יישור ספרים.
insert into public.book_fair_stock_ledger (book_id, channel, delta, reason, note)
select b.id, 'web', b.stock_total - coalesce(l.total, 0), 'adjust',
       'יישור יומן למלאי מאוחד'
  from public.book_fair_books b
  left join (
    select book_id, sum(delta)::integer as total
      from public.book_fair_stock_ledger group by book_id
  ) l on l.book_id = b.id
 where not b.unlimited_stock
   and b.stock_total <> coalesce(l.total, 0);

-- ⚠️ האינדקס הציבורי עובר לעמודה המאוחדת. שאילתת הזמינות בקטלוג בודקת
-- "unlimited_stock or stock_total > 0", ובלעדיו היא סורקת את כל הטבלה.
create index if not exists book_fair_books_available_total_idx
  on public.book_fair_books (is_active, unlimited_stock, stock_total);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) שריון מהבריכה המאוחדת
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 הניכוי נשאר אטומי ותנאי: ה-where דורש stock_total >= v_qty ולכן שני
-- קונים מקבילים על העותק האחרון — אחד באתר ואחד בטלפון — אינם יכולים
-- שניהם להצליח. זו כל ההגנה מפני מכירת יתר, והיא חייבת להישאר בתוך
-- ה-UPDATE ולא בבדיקה מוקדמת.
--
-- ⚠️ p_channel נשאר בחתימה ובשורת השריון: הוא קובע לאן המלאי *יוחזר*
-- ביומן ומי מכר, גם כשהמכסה משותפת.
create or replace function public.book_fair_reserve(
  p_items       jsonb,
  p_channel     text,
  p_cart_token  text,
  p_ttl_minutes integer default 20
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it      jsonb;
  v_book  uuid;
  v_qty   integer;
  v_left  integer;
  v_unlim boolean;
  v_exp   timestamptz := now() + make_interval(mins => p_ttl_minutes);
  v_ids   uuid[];
  v_n     integer := 0;
begin
  if p_channel not in ('web','phone') then
    raise exception 'bad_channel:%', p_channel using errcode = '22023';
  end if;
  if p_cart_token is null or length(p_cart_token) < 8 then
    raise exception 'bad_cart_token' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart' using errcode = '22023';
  end if;

  -- 🔴 ניקוי שריונים פקועים של הספרים שבבקשה, לפני הניסיון.
  -- בלי זה, עגלה נטושה חוסמת את העותק האחרון עד שה-cron מגיע — והקונה
  -- האמיתי רואה "אזל המלאי" בזמן שהספר על המדף.
  select array_agg(distinct (value->>'book_id')::uuid)
    into v_ids from jsonb_array_elements(p_items);
  perform public.book_fair_expire_reservations(v_ids);

  for it in select * from jsonb_array_elements(p_items) loop
    v_book := (it->>'book_id')::uuid;
    v_qty  := (it->>'quantity')::integer;

    if v_book is null or v_qty is null or v_qty <= 0 then
      raise exception 'bad_item' using errcode = '22023';
    end if;

    -- ── ספר בלתי מוגבל: זמין תמיד, בלי שריון ובלי יומן ──
    -- ⚠️ הבדיקה חייבת לקדום לניכוי: ספר unlimited עם stock_total = 0 היה
    -- נכשל ב-out_of_stock וחוסם את כל העגלה, כולל הספרים הרגילים שבה.
    select unlimited_stock into v_unlim
      from public.book_fair_books
     where id = v_book and is_active;

    if v_unlim is null then
      raise exception 'out_of_stock:%', v_book using errcode = 'P0001';
    end if;

    if v_unlim then
      continue;
    end if;

    update public.book_fair_books
       set stock_total = stock_total - v_qty
     where id = v_book and is_active and stock_total >= v_qty
    returning stock_total into v_left;

    -- ⚠️ v_left הוא null גם כשאין מלאי, גם כשהספר אינו פעיל וגם כשאינו
    -- קיים. שלושתם "אי אפשר להזמין" מבחינת הלקוח.
    if v_left is null then
      raise exception 'out_of_stock:%', v_book using errcode = 'P0001';
    end if;

    insert into public.book_fair_reservations
      (book_id, channel, quantity, cart_token, expires_at)
    values (v_book, p_channel, v_qty, p_cart_token, v_exp);

    insert into public.book_fair_stock_ledger (book_id, channel, delta, reason, note)
      values (v_book, p_channel, -v_qty, 'reserve', p_cart_token);

    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'cart_token', p_cart_token, 'expires_at', v_exp);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) שחרור ופקיעה — החזרה לבריכה המאוחדת
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 ההחזרה חייבת ללכת לאותה עמודה שממנה נוכה, אחרת כל שריון שפוקע
-- "מאבד" מלאי בשקט: הוא נגרע מ-stock_total ומוחזר ל-stock_web.

create or replace function public.book_fair_release(p_cart_token text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r       record;
begin
  for r in
    update public.book_fair_reservations
       set status = 'released'
     where cart_token = p_cart_token and status = 'held'
    returning book_id, channel, quantity
  loop
    update public.book_fair_books
       set stock_total = stock_total + r.quantity
     where id = r.book_id;

    insert into public.book_fair_stock_ledger (book_id, channel, delta, reason, note)
      values (r.book_id, r.channel, r.quantity, 'release', p_cart_token);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.book_fair_expire_reservations(
  p_book_ids uuid[] default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r       record;
begin
  for r in
    update public.book_fair_reservations
       set status = 'expired'
     where status = 'held'
       and expires_at < now()
       and (p_book_ids is null or book_id = any(p_book_ids))
    returning book_id, channel, quantity
  loop
    update public.book_fair_books
       set stock_total = stock_total + r.quantity
     where id = r.book_id;

    insert into public.book_fair_stock_ledger (book_id, channel, delta, reason, note)
      values (r.book_id, r.channel, r.quantity, 'release', 'פקיעת שריון');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) תיקון מלאי ידני — על הבריכה המאוחדת
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ p_channel נשאר בחתימה לשמירת תאימות הקוראים ולתיעוד ביומן, אך
-- אינו בוחר יותר עמודה. הסרתו הייתה שוברת את כל קריאות ה-RPC הקיימות.
create or replace function public.book_fair_adjust_stock(
  p_book_id uuid,
  p_channel text,
  p_delta   integer,
  p_reason  text default 'adjust',
  p_note    text default null,
  p_by      uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left integer;
begin
  if p_channel not in ('web','phone') then
    raise exception 'bad_channel' using errcode = '22023';
  end if;
  if p_delta = 0 then
    raise exception 'zero_delta' using errcode = '22023';
  end if;
  if p_reason not in ('import','restock','adjust','refund') then
    raise exception 'bad_reason' using errcode = '22023';
  end if;

  -- ⚠️ התנאי על הסכום מונע ירידה מתחת לאפס גם בהורדה ידנית: מנהל שמנסה
  -- להוריד 10 כשיש 3 יקבל שגיאה, ולא מלאי שלילי שישבור את החנות.
  update public.book_fair_books
     set stock_total = stock_total + p_delta
   where id = p_book_id and stock_total + p_delta >= 0
  returning stock_total into v_left;

  if v_left is null then
    raise exception 'insufficient_stock:%', p_book_id using errcode = 'P0001';
  end if;

  insert into public.book_fair_stock_ledger (book_id, channel, delta, reason, note, created_by)
    values (p_book_id, p_channel, p_delta, p_reason, p_note, p_by);

  return v_left;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) העברה בין ערוצים — מבוטלת
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 אין יותר מה להעביר: המלאי משותף. הפונקציה נשארת קיימת ומחזירה
-- שגיאה מפורשת, כדי שקורא שנשכח יקבל הודעה ברורה במקום להזיז בשקט
-- מלאי בין שתי עמודות שאיש אינו קורא עוד.
create or replace function public.book_fair_move_stock(
  p_book_id uuid,
  p_from    text,
  p_to      text,
  p_qty     integer,
  p_by      uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'stock_is_unified' using errcode = '22023',
    message = 'המלאי מאוחד — אין הפרדה בין מלאי האתר למלאי הטלפון';
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) ביקורת ההתאמה בין היומן למלאי
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 הביקורת השוותה יומן-לפי-ערוץ מול העמודה של אותו ערוץ. עם בריכה
-- מאוחדת ההפרדה הזו מייצרת פער מדומה בכל ספר: המכירה נרשמת ביומן על
-- ערוץ אחד בעוד הניכוי נעשה מעמודה משותפת. ההשוואה עוברת לסך היומן
-- מול stock_total, ולכן שורה אחת לספר במקום שתיים.
--
-- ⚠️ החתימה נשמרת (אותן עמודות החזרה, channel כלול): lib/bookFairCleanup
-- קורא ל-drift ול-channel, ושינוי צורת ההחזרה היה שובר את הניקוי הלילי.
-- channel מקבל 'all' — ערך שמסמן במפורש שהמכסה משותפת.
create or replace function public.book_fair_stock_audit()
returns table (
  book_id       uuid,
  title         text,
  sku           text,
  channel       text,
  stock_actual  integer,
  stock_ledger  integer,
  drift         integer,
  held_qty      integer
)
language sql
security definer
set search_path = public
as $$
  with ledger as (
    select l.book_id, sum(l.delta)::integer as total
      from public.book_fair_stock_ledger l
     group by l.book_id
  ),
  held as (
    select r.book_id, sum(r.quantity)::integer as qty
      from public.book_fair_reservations r
     where r.status = 'held' and r.expires_at > now()
     group by r.book_id
  )
  select b.id, b.title, b.sku, 'all'::text,
         b.stock_total,
         coalesce(l.total, 0),
         b.stock_total - coalesce(l.total, 0),
         coalesce(h.qty, 0)
    from public.book_fair_books b
    left join ledger l on l.book_id = b.id
    left join held   h on h.book_id = b.id
   where not b.unlimited_stock
     and b.stock_total <> coalesce(l.total, 0)
   order by abs(b.stock_total - coalesce(l.total, 0)) desc, b.title;
$$;

comment on function public.book_fair_stock_audit() is
  'ביקורת מלאי: סך היומן מול המלאי המאוחד (stock_total). drift <> 0 = אי-התאמה שדורשת בדיקה.';

revoke all on function public.book_fair_stock_audit() from public, anon, authenticated;
grant execute on function public.book_fair_stock_audit() to service_role;
