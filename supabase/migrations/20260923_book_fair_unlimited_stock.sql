-- ───────────────────────────────────────────────────────────────────────────
-- מלאי בלתי מוגבל + משלוח לפי כרכים
-- ───────────────────────────────────────────────────────────────────────────
--
-- ── 1) מלאי בלתי מוגבל ──
--
-- 🔴 רוב הספרים ביריד הם הזמנה מהמו"ל ולא מלאי פיזי במחסן: הם לעולם
-- אינם אוזלים. עד היום המודל הכיר רק במספר, ולכן הדרך היחידה לייצג
-- זאת הייתה מספר גדול שרירותי (999) — והוא משקר בשני כיוונים: הוא
-- *כן* יכול להיגמר, והוא מציג "נותרו 999 עותקים" שאינו נכון.
--
-- ⚠️ דגל ולא ערך קסם בעמודת המלאי (כגון -1): עמודת המלאי נושאת
-- check (>= 0), והניכוי האטומי מסתמך על כך שהיא מספר אמיתי. ערך קסם
-- היה מחייב לשנות כל שאילתה שנוגעת במלאי, ולשבור את רשת הביטחון.
--
-- המשמעות המעשית: ספר unlimited אינו משתתף בשריון ואינו נספר במלאי.
-- הוא תמיד זמין, בשני הערוצים.

alter table public.book_fair_books
  add column if not exists unlimited_stock boolean not null default false;

comment on column public.book_fair_books.unlimited_stock is
  'ספר שאינו מוגבל במלאי (הזמנה מהמו״ל). כשtrue — stock_web/stock_phone אינם רלוונטיים, הספר תמיד זמין, ואין שריון.';

-- ⚠️ האינדקס הציבורי כולל את הדגל: שאילתת הזמינות בקטלוג בודקת
-- "unlimited_stock or stock_web > 0", ובלעדיו היא סורקת את כל הטבלה.
create index if not exists book_fair_books_available_idx
  on public.book_fair_books (is_active, unlimited_stock, stock_web);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) השריון מדלג על ספרים בלתי מוגבלים
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 בלי זה, ספר unlimited עם stock_web = 0 היה נכשל ב-out_of_stock
-- וחוסם את כל העגלה — כולל את הספרים הרגילים שבה.
--
-- ⚠️ לא נרשמת שורה ביומן לספר בלתי מוגבל: היומן הוא ראיה למלאי,
-- ולספר שאין לו מלאי אין מה להוכיח. רישום delta שלילי היה מייצר
-- אי-התאמה קבועה ב-book_fair_stock_audit.
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

    -- ── ספר בלתי מוגבל: זמין תמיד, בלי ניכוי ובלי שריון ──
    select unlimited_stock into v_unlim
      from public.book_fair_books where id = v_book and is_active;

    if v_unlim is null then
      -- אינו קיים או אינו פעיל — אותה משמעות ללקוח.
      raise exception 'out_of_stock:%', v_book using errcode = 'P0001';
    end if;

    if v_unlim then
      continue;
    end if;

    if p_channel = 'web' then
      update public.book_fair_books
         set stock_web = stock_web - v_qty
       where id = v_book and is_active and stock_web >= v_qty
      returning stock_web into v_left;
    else
      update public.book_fair_books
         set stock_phone = stock_phone - v_qty
       where id = v_book and is_active and stock_phone >= v_qty
      returning stock_phone into v_left;
    end if;

    -- ⚠️ v_left הוא null גם כשאין מלאי, גם כשהספר אינו פעיל וגם כשאינו
    -- קיים. שלושתם "אי אפשר להזמין" מבחינת הלקוח; ההבחנה, אם תידרש,
    -- נעשית ב-caller.
    if v_left is null then
      raise exception 'out_of_stock:%', v_book using errcode = 'P0001';
    end if;

    insert into public.book_fair_reservations
      (book_id, channel, quantity, cart_token, expires_at)
    values (v_book, p_channel, v_qty, p_cart_token, v_exp);

    insert into public.book_fair_stock_ledger (book_id, channel, delta, reason, note)
      values (v_book, p_channel, -v_qty, 'reserve', p_cart_token);
  end loop;

  return jsonb_build_object('ok', true, 'cart_token', p_cart_token, 'expires_at', v_exp);
end;
$$;

grant execute on function public.book_fair_reserve(jsonb, text, text, integer) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) ביקורת המלאי מדלגת על ספרים בלתי מוגבלים
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ ספר unlimited אינו כותב ליומן ואינו מנכה, ולכן הוא תמיד "תואם"
-- בהגדרה. בלי הסינון הזה, ספר כזה שקיבל פעם תנועת import היה מופיע
-- כפער קבוע שאיש לא יכול לסגור — ורעש קבוע בדוח הופך אותו למיותר.
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
  with channels as (
    select b.id, b.title, b.sku, c.ch,
           case c.ch when 'web' then b.stock_web else b.stock_phone end as actual
      from public.book_fair_books b
      cross join (values ('web'), ('phone')) as c(ch)
     where not b.unlimited_stock
  ),
  ledger as (
    select l.book_id, l.channel, sum(l.delta)::integer as total
      from public.book_fair_stock_ledger l
     group by l.book_id, l.channel
  ),
  held as (
    select r.book_id, r.channel, sum(r.quantity)::integer as qty
      from public.book_fair_reservations r
     where r.status = 'held' and r.expires_at > now()
     group by r.book_id, r.channel
  )
  select c.id, c.title, c.sku, c.ch,
         c.actual,
         coalesce(l.total, 0),
         c.actual - coalesce(l.total, 0),
         coalesce(h.qty, 0)
    from channels c
    left join ledger l on l.book_id = c.id and l.channel = c.ch
    left join held   h on h.book_id = c.id and h.channel = c.ch
   where c.actual <> coalesce(l.total, 0)
   order by abs(c.actual - coalesce(l.total, 0)) desc, c.title;
$$;

revoke all on function public.book_fair_stock_audit() from public, anon, authenticated;
grant execute on function public.book_fair_stock_audit() to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) מדרגות המשלוח — לפי כרכים, עם מדרגה פתוחה מתמשכת
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 התעריף נגזר מכמות ה*כרכים* ולא מכמות הספרים: "שו״ת חתם סופר" הוא
-- פריט אחד בן 6 כרכים, ומשלוחו עולה כמו 6 ספרים ולא כמו אחד.
--
-- ⚠️ העמודות נשארות בשמן ההיסטורי (min_books/max_books) ומשמעותן כעת
-- כרכים. שינוי שם עמודה בטבלה חיה מחייב תיאום עם כל קורא, והשם אינו
-- שווה את הסיכון — התיעוד כאן הוא מקור האמת.
comment on column public.book_fair_shipping_tiers.min_books is
  'מספר הכרכים המינימלי במדרגה (לא מספר ספרים — פריט בן 6 כרכים נספר כ-6)';
comment on column public.book_fair_shipping_tiers.max_books is
  'מספר הכרכים המקסימלי. null = מדרגה פתוחה, ואז step_volumes/step_agorot קובעים את התוספת.';

-- ── מדרגה פתוחה מתמשכת ──
--
-- 🔴 עד היום המדרגה העליונה (max_books = null) הייתה מחיר אחד קבוע לכל
-- כמות מעליה — 14 כרכים ו-90 כרכים עלו אותו דבר. עבור יריד שבו יש
-- סדרות בנות עשרות כרכים, זו הפסד ודאי לעמותה.
--
-- שתי העמודות מגדירות תוספת מדורגת: כל step_volumes כרכים מעל
-- min_books מוסיפים step_agorot. שתיהן null = התנהגות ישנה (מחיר קבוע).
alter table public.book_fair_shipping_tiers
  add column if not exists step_volumes integer check (step_volumes is null or step_volumes > 0),
  add column if not exists step_agorot  integer check (step_agorot  is null or step_agorot >= 0);

comment on column public.book_fair_shipping_tiers.step_volumes is
  'במדרגה פתוחה: גודל הקפיצה בכרכים (למשל 3). null = מחיר קבוע לכל הכמויות מעל המינימום.';
comment on column public.book_fair_shipping_tiers.step_agorot is
  'במדרגה פתוחה: התוספת באגורות לכל קפיצה.';

-- ⚠️ שתי העמודות הן זוג — אחת בלי השנייה היא הגדרה חסרת משמעות
-- שתתפרש בשקט כמחיר קבוע.
alter table public.book_fair_shipping_tiers
  drop constraint if exists book_fair_tiers_step_pair_chk;
alter table public.book_fair_shipping_tiers
  add constraint book_fair_tiers_step_pair_chk check (
    (step_volumes is null and step_agorot is null)
    or (step_volumes is not null and step_agorot is not null)
  );
