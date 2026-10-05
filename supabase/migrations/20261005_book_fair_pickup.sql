-- איסוף עצמי בדוכן היריד: מי מסר את ההזמנה ומתי.
--
-- 🔴 עמודות מפורשות ולא רק status='delivered': חיפוש חוזר של אותה
-- הזמנה חייב להראות "כבר נמסר — בשעה X על ידי Y", כדי שהזמנה לא
-- תימסר פעמיים לשני אנשים שונים.

alter table public.book_fair_orders
  add column if not exists picked_up_at timestamptz,
  add column if not exists picked_up_by text;

-- חיפוש לפי טלפון בדוכן — אינדקס חלקי על הזמנות לאיסוף בלבד.
create index if not exists book_fair_orders_pickup_phone_idx
  on public.book_fair_orders (customer_phone)
  where delivery_method = 'pickup';
