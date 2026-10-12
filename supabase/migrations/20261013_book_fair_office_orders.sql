-- הזמנות משרד — משלוח בלי תשלום (בקשת המשתמש 13.10).
--
-- 🔴 למה: חבילות שכבר נארזו ידנית צריכות מספר הזמנה כדי לצאת למשלוח
-- (תעודה, רשימת כתובות למשלוחן, מעקב), בלי לעבור בסליקה.
--
-- ⚠️ ערוץ נפרד ולא 'web': הזמנת אתר בסכום 0 נראית כתקלה בסליקה, והייתה
-- נספרת בסטטיסטיקת המכירות.

alter table public.book_fair_orders drop constraint if exists book_fair_orders_channel_check;
alter table public.book_fair_orders
  add constraint book_fair_orders_channel_check
  check (channel in ('web','phone','fair','office'));
