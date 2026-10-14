-- ─────────────────────────────────────────────────────────────────────────────
-- יריד: סיכום פריטי ההזמנות לפי הזמנה — למסך ההזמנות.
--
-- 🔴 14.10: מסך ההזמנות שלף את *כל* שורות הפריטים (אלפים) כדי לחשב בדפדפן
-- כמות וכרכים לכל הזמנה, וזו הייתה השליפה האיטית בלוג (~6 שנ').
-- כאן הסיכום נעשה במסד ומוחזרת שורה אחת להזמנה.
--
-- ⚠️ הכרכים מהקטלוג ולא מ-volumes_snapshot (בטלפון נשמר 1 לסט עד 13.10).
-- snapshot רק לספר שנמחק מהקטלוג. זהה ל-lib/bookFairOrderItems.ts.
--
-- ⚠️ service_role בלבד, כמו שאר פונקציות היריד: הדף מאמת הרשאה
-- (guardPage) לפני הקריאה. עד שהמיגרציה תרוץ, הדף נופל לשליפה הישנה.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.book_fair_order_item_totals()
returns table (
  order_id uuid,
  items    integer,
  volumes  integer,
  book_ids uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  select i.order_id,
         sum(i.quantity)::integer,
         sum(greatest(1, coalesce(b.volumes, i.volumes_snapshot, 1)) * i.quantity)::integer,
         coalesce(array_agg(distinct i.book_id) filter (where i.book_id is not null), '{}')
    from public.book_fair_order_items i
    left join public.book_fair_books b on b.id = i.book_id
   group by i.order_id;
$$;

revoke all on function public.book_fair_order_item_totals() from public, anon, authenticated;
grant execute on function public.book_fair_order_item_totals() to service_role;
