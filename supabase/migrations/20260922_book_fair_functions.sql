-- ═══════════════════════════════════════════════════════════════════════════
-- יריד ספרים — פונקציות המלאי.
--
-- 🔴 זה הקוד הקריטי ביותר במחלקה: הוא מה שמונע מכירת ספר שאינו במלאי.
--
-- ההכרעה המרכזית: הניכוי הוא UPDATE מותנה על שורת הספר, **בלי advisory lock**.
--
-- למה זה מספיק: ב-READ COMMITTED (ברירת המחדל), UPDATE עם תנאי נוטל נעילה
-- על השורה. טרנזקציה שנייה נחסמת עד ששחררה הראשונה, ואז Postgres מבצע
-- EvalPlanQual — קורא מחדש את הגרסה המעודכנת של השורה ומעריך מחדש את ה-WHERE.
-- כלומר השנייה רואה את המלאי *שאחרי* הניכוי הראשון. זו ערובה של המנוע, לא
-- תופעת לוואי.
--
-- ⚠️ למה לא כמו consume_card_stock (שם יש pg_advisory_xact_lock): שם המלאי
-- הוא SUM על כל היומן, ולכן חייבים לסריאליז. כאן המלאי הוא עמודה על השורה,
-- ומנעול גלובלי היה מסריאליז את *כל* הספרים לצורך שאין בו — שני קונים של
-- שני ספרים שונים היו ממתינים זה לזה.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- פקיעת שריונים
-- ───────────────────────────────────────────────────────────────────────────
--
-- משחררת שריונים שעבר זמנם ומחזירה את המלאי לערוץ שממנו נלקח.
-- p_book_ids = null → כל הספרים (מסלול ה-cron).
--
-- ⚠️ idempotent בכוונה: ה-UPDATE על השריונים הוא גם הבורר וגם הנעילה
-- (status='held' יורד ל-'expired' באותה פקודה), ולכן ריצה שנייה במקביל לא
-- תמצא דבר. 🔴 מה שאסור הוא select ואז update נפרד — שם החלון אמיתי
-- וההחזרה תהיה כפולה. Railway מריץ cron בחפיפה בזמן פריסה.
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
    if r.channel = 'web' then
      update public.book_fair_books
         set stock_web = stock_web + r.quantity
       where id = r.book_id;
    else
      update public.book_fair_books
         set stock_phone = stock_phone + r.quantity
       where id = r.book_id;
    end if;

    insert into public.book_fair_stock_ledger (book_id, channel, delta, reason, note)
      values (r.book_id, r.channel, r.quantity, 'release', 'פקיעת שריון');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- שריון מלאי — הלב
-- ───────────────────────────────────────────────────────────────────────────
--
-- p_items: [{"book_id":"…","quantity":2}, …]
--
-- 🔴 עגלה היא הכל-או-כלום: הפונקציה רצה בטרנזקציה אחת, ולכן exception על
-- הפריט השלישי מגלגל אוטומטית גם את הניכוי של הראשון והשני. זו בדיוק
-- ההתנהגות הרצויה — אסור שלקוח יקבל שני ספרים מתוך שלושה ויחויב על שלושה.
--
-- ⚠️ ה-exception נושא errcode ייעודי ('P0001') והודעה שמזהה את הספר, כדי
-- שה-caller ב-TypeScript יבדיל בין "אזל המלאי" (מצב תפעולי רגיל שצריך
-- להציג ללקוח בעברית) לבין תקלת מסד אמיתית.
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

-- ───────────────────────────────────────────────────────────────────────────
-- שחרור שריון (ביטול יזום / ניתוק שיחה)
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ המלאי חוזר לערוץ שממנו נלקח ולעולם לא לערוץ האחר — ההפרדה הקשיחה
-- נשמרת גם בביטול. עגלה שננטשה באתר לא תגדיל את מכסת הטלפון.
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
    if r.channel = 'web' then
      update public.book_fair_books set stock_web = stock_web + r.quantity where id = r.book_id;
    else
      update public.book_fair_books set stock_phone = stock_phone + r.quantity where id = r.book_id;
    end if;

    insert into public.book_fair_stock_ledger (book_id, channel, delta, reason, note)
      values (r.book_id, r.channel, r.quantity, 'release', p_cart_token);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- מימוש שריון — ההזמנה שולמה
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 *אינה נוגעת במלאי*, ובכוונה: המלאי כבר נוכה בשלב השריון. כאן רק
-- מסומן שהשריון מומש וקושר להזמנה, כדי שהפקיעה לא תחזיר אותו בטעות.
--
-- ⚠️ עמידה בקריאה כפולה: התנאי status='held' מוודא ששריון שכבר מומש
-- אינו מעובד שוב. ספק סליקה ששולח את הדיווח פעמיים לא יגרום לכפילות.
create or replace function public.book_fair_consume(
  p_cart_token text,
  p_order_id   uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with done as (
    update public.book_fair_reservations
       set status = 'consumed', order_id = p_order_id
     where cart_token = p_cart_token and status = 'held'
    returning book_id, channel, quantity
  )
  insert into public.book_fair_stock_ledger (book_id, channel, delta, reason, order_id, note)
    select book_id, channel, 0, 'consume', p_order_id, p_cart_token from done;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- העברת מלאי בין הערוצים — ידנית בלבד
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ זו הדרך *היחידה* שבה מלאי עובר בין אתר לטלפון. ההפרדה קשיחה, ולכן
-- ההעברה היא החלטה אנושית מפורשת ולא גלישה אוטומטית.
--
-- אטומית ומותנית: אי אפשר להעביר מלאי שאינו קיים בערוץ המקור.
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
declare
  v_left integer;
begin
  if p_from = p_to or p_from not in ('web','phone') or p_to not in ('web','phone') then
    raise exception 'bad_channels' using errcode = '22023';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'bad_quantity' using errcode = '22023';
  end if;

  if p_from = 'web' then
    update public.book_fair_books
       set stock_web = stock_web - p_qty, stock_phone = stock_phone + p_qty
     where id = p_book_id and stock_web >= p_qty
    returning stock_web into v_left;
  else
    update public.book_fair_books
       set stock_phone = stock_phone - p_qty, stock_web = stock_web + p_qty
     where id = p_book_id and stock_phone >= p_qty
    returning stock_phone into v_left;
  end if;

  if v_left is null then
    raise exception 'insufficient_stock:%', p_book_id using errcode = 'P0001';
  end if;

  insert into public.book_fair_stock_ledger (book_id, channel, delta, reason, created_by)
    values (p_book_id, p_from, -p_qty, 'move_out', p_by),
           (p_book_id, p_to,    p_qty, 'move_in',  p_by);

  return jsonb_build_object('ok', true, 'from_left', v_left);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- תיקון מלאי ידני (קבלת סחורה / ספירת מלאי / ייבוא)
-- ───────────────────────────────────────────────────────────────────────────
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
  if p_channel = 'web' then
    update public.book_fair_books
       set stock_web = stock_web + p_delta
     where id = p_book_id and stock_web + p_delta >= 0
    returning stock_web into v_left;
  else
    update public.book_fair_books
       set stock_phone = stock_phone + p_delta
     where id = p_book_id and stock_phone + p_delta >= 0
    returning stock_phone into v_left;
  end if;

  if v_left is null then
    raise exception 'insufficient_stock:%', p_book_id using errcode = 'P0001';
  end if;

  insert into public.book_fair_stock_ledger (book_id, channel, delta, reason, note, created_by)
    values (p_book_id, p_channel, p_delta, p_reason, p_note, p_by);

  return v_left;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- הרשאות הרצה
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 service_role בלבד. כל הפונקציות כאן הן SECURITY DEFINER — הן עוקפות
-- RLS במכוון. מתן execute ל-anon היה נותן לכל גולש להריץ שחרור מלאי או
-- תיקון ידני בלולאה, כלומר לרוקן או לנפח את המלאי מהדפדפן.
do $$
declare f text;
begin
  foreach f in array array[
    'book_fair_expire_reservations(uuid[])',
    'book_fair_reserve(jsonb,text,text,integer)',
    'book_fair_release(text)',
    'book_fair_consume(text,uuid)',
    'book_fair_move_stock(uuid,text,text,integer,uuid)',
    'book_fair_adjust_stock(uuid,text,integer,text,text,uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
