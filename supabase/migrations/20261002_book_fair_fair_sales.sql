-- ───────────────────────────────────────────────────────────────────────────
-- יריד ספרים: מכירה ביריד הפיזי, איסוף עצמי, ומלאי היריד
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1) ערוץ מכירה שלישי: היריד הפיזי ──
--
-- 🔴 'fair' הוא ערוץ נפרד מ-'web' ומ-'phone': המוכר בדוכן מוכר מול
-- מאגר אחר (מלאי היריד), מקבל מזומן, ואין לו משלוח. בלי ערוץ משלו
-- אי אפשר לדעת כמה נמכר *ביריד עצמו* — וזה בדיוק הדיווח שנדרש.
alter table public.book_fair_orders drop constraint if exists book_fair_orders_channel_check;
alter table public.book_fair_orders
  add constraint book_fair_orders_channel_check
  check (channel in ('web','phone','fair'));

alter table public.book_fair_reservations drop constraint if exists book_fair_reservations_channel_check;
alter table public.book_fair_reservations
  add constraint book_fair_reservations_channel_check
  check (channel in ('web','phone','fair'));

alter table public.book_fair_stock_ledger drop constraint if exists book_fair_stock_ledger_channel_check;
alter table public.book_fair_stock_ledger
  add constraint book_fair_stock_ledger_channel_check
  check (channel in ('web','phone','fair'));

-- ── 2) אופן התשלום ──
--
-- 🔴 מזומן אינו "סליקה שהצליחה": אין לו אסמכתא חיצונית, והוא מסתמך
-- כולו על דיווח המוכר. הפרדה מפורשת מאפשרת לספור קופה בסוף היום
-- ולהשוות מול מה שנרשם.
--
-- ⚠️ ברירת המחדל 'card' — כל ההזמנות הקיימות נסלקו בכרטיס.
alter table public.book_fair_orders
  add column if not exists payment_method text not null default 'card'
    check (payment_method in ('card','cash'));

comment on column public.book_fair_orders.payment_method is
  'card = סליקה · cash = מזומן ביריד (נרשם ע"י המוכר, בלי אסמכתא חיצונית)';

-- ⚠️ מי מכר. nullable: באתר ובטלפון אין מוכר.
alter table public.book_fair_orders
  add column if not exists sold_by text;

comment on column public.book_fair_orders.sold_by is
  'שם/מזהה המוכר בדוכן היריד. ריק באתר ובטלפון.';

-- ── 3) מלאי היריד הפיזי ──
--
-- 🔴 מאגר *נפרד* מ-stock_total (החלטת המשתמש 02.10): הדוכן ביריד מנהל
-- ארגז משלו, והמכירה שם אינה מורידה מהמלאי של האתר ולהפך.
--
-- ⚠️ אינו חוסם מכירה. הוא קיים לשני דברים בלבד: דיווח כמה נמכר ביריד,
-- והתראה "הולך לאזול". מוכר שהמלאי אזל במסך עדיין יכול למכור — כי
-- הספר עשוי להיות בארגז ולא נספר.
alter table public.book_fair_books
  add column if not exists stock_fair integer not null default 0
    check (stock_fair >= 0);

comment on column public.book_fair_books.stock_fair is
  'מלאי הדוכן ביריד הפיזי. 🔴 מאגר נפרד מ-stock_total ואינו חוסם מכירה — לדיווח והתראות בלבד.';

-- ⚠️ רף ההתראה לכל ספר. null = ברירת המחדל הגלובלית.
alter table public.book_fair_books
  add column if not exists fair_low_threshold integer
    check (fair_low_threshold is null or fair_low_threshold >= 0);

comment on column public.book_fair_books.fair_low_threshold is
  'מתחת לכמה עותקים להתריע "הולך לאזול" בדוכן. null = ברירת המחדל במסך.';

-- ── 4) ניכוי מלאי היריד ──
--
-- 🔴 פונקציה נפרדת ולא book_fair_adjust_stock: זו אינה אותה בריכה,
-- וערבוב ביניהן היה מוריד מהמלאי של האתר בכל מכירה בדוכן.
--
-- ⚠️ *אינה* נכשלת כשאין מלאי: היא מקרקעת באפס וממשיכה. מלאי הדוכן הוא
-- הערכה (ספר עשוי להיות בארגז ולא נספר), וחסימת מכירה אמיתית על סמך
-- מספר משוער הייתה הופכת כלי דיווח למכשול.
create or replace function public.book_fair_fair_sale(
  p_items jsonb,
  p_by    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it     jsonb;
  v_book uuid;
  v_qty  integer;
  v_n    integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart' using errcode = '22023';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_book := (it->>'book_id')::uuid;
    v_qty  := (it->>'quantity')::integer;
    if v_book is null or v_qty is null or v_qty <= 0 then
      raise exception 'bad_item' using errcode = '22023';
    end if;

    -- greatest(...,0): לא יורדים מתחת לאפס, אך גם לא נכשלים.
    update public.book_fair_books
       set stock_fair = greatest(stock_fair - v_qty, 0)
     where id = v_book;

    -- ⚠️ נרשם ביומן על ערוץ 'fair' — כך הדיווח "כמה נמכר ביריד" מגיע
    -- מאותו מקום שבו נמצא כל שאר תיעוד המלאי.
    insert into public.book_fair_stock_ledger (book_id, channel, delta, reason, note)
      values (v_book, 'fair', -v_qty, 'adjust',
              coalesce('מכירה ביריד · ' || p_by, 'מכירה ביריד'));

    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'lines', v_n);
end;
$$;

revoke all on function public.book_fair_fair_sale(jsonb, text) from public, anon, authenticated;
grant execute on function public.book_fair_fair_sale(jsonb, text) to service_role;

-- ── 5) דיווח מכירות הדוכן ──
--
-- ⚠️ נשען על ההזמנות ולא על היומן: היומן מתעד גם ספירות מלאי ידניות,
-- וערבובן במכירות היה מנפח את הדיווח.
create or replace function public.book_fair_fair_report(
  p_from timestamptz default null,
  p_to   timestamptz default null
) returns table (
  book_id        uuid,
  sku            text,
  title          text,
  qty_sold       integer,
  revenue_agorot bigint,
  cash_agorot    bigint,
  card_agorot    bigint,
  stock_fair     integer
)
language sql
security definer
set search_path = public
as $$
  select b.id, b.sku, b.title,
         coalesce(sum(i.quantity), 0)::integer,
         coalesce(sum(i.line_total_agorot), 0)::bigint,
         coalesce(sum(case when o.payment_method = 'cash' then i.line_total_agorot else 0 end), 0)::bigint,
         coalesce(sum(case when o.payment_method = 'card' then i.line_total_agorot else 0 end), 0)::bigint,
         b.stock_fair
    from public.book_fair_order_items i
    join public.book_fair_orders o on o.id = i.order_id
    join public.book_fair_books  b on b.id = i.book_id
   where o.channel = 'fair'
     -- 🔴 רק הזמנות ששולמו: הזמנה תקועה ב-pending_payment אינה מכירה.
     and o.status in ('paid','picking','packed','shipped','delivered','partially_refunded')
     and (p_from is null or o.created_at >= p_from)
     and (p_to   is null or o.created_at <= p_to)
   group by b.id, b.sku, b.title, b.stock_fair
   order by coalesce(sum(i.quantity), 0) desc, b.title;
$$;

revoke all on function public.book_fair_fair_report(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.book_fair_fair_report(timestamptz, timestamptz) to service_role;

-- ── 6) ספר הבדיקה — מוסתר מהקטלוג ──
--
-- 🔴 is_hidden ולא is_active=false: ספר לא-פעיל נדחה בצ'קאאוט ולכן
-- אי אפשר לבדוק בו סליקה. מוסתר = לא מופיע בקטלוג ובחיפוש, אך כן
-- ניתן להזמנה כשמגיעים אליו במק"ט מדויק.
alter table public.book_fair_books
  add column if not exists is_hidden boolean not null default false;

comment on column public.book_fair_books.is_hidden is
  'לא מוצג בקטלוג ובחיפוש, אך ניתן להזמנה במק"ט ישיר. לספרי בדיקת סליקה.';

-- ⚠️ האינדקס הציבורי כולל את הדגל, אחרת שאילתת הקטלוג סורקת הכל.
create index if not exists book_fair_books_visible_idx
  on public.book_fair_books (is_active, is_hidden, unlimited_stock, stock_total);

-- ── 7) חלון האיסוף העצמי ──
--
-- ⚠️ נשמר ב-app_settings ולא בקוד: הסגירה ביום שני ב-18:00 היא החלטה
-- תפעולית שתשתנה, ושינוי שלה אינו אמור לדרוש פריסה.
insert into public.app_settings (key, value, updated_at)
values (
  'book_fair_pickup',
  '{"enabled":true,"ready_hours":3,"closes_weekday":1,"closes_hour":18}',
  now()
)
on conflict (key) do nothing;
