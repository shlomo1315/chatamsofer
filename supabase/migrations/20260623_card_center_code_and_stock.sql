-- קוד מספרי קבוע למוקד (לבחירה בשלוחת הטלפון של ימות) + הורדת מלאי אטומית.
-- שלוחת ימות מקריאה את רשימת המוקדים; המתקשרת מקישה את הקוד של המוקד שבחרה,
-- והמערכת מורידה כרטיס אחד מהמלאי (stock) של אותו מוקד.

-- 1) עמודת קוד מספרי ייחודי למוקד
alter table public.card_centers
  add column if not exists code integer;

-- ייחודיות הקוד (מתעלם מ-NULL — מוקדים ללא קוד עדיין מותרים)
create unique index if not exists card_centers_code_uidx
  on public.card_centers(code) where code is not null;

-- 2) הקצאת קודים למוקדים הקיימים (לפי שם). מוקדים חדשים יקבלו קוד ידנית בהמשך.
update public.card_centers set code = 1 where name = 'מוקד ירושלים - אזור שמואל הנביא';
update public.card_centers set code = 2 where name = 'מוקד ירושלים - אזור נווה צבי';
update public.card_centers set code = 3 where name = 'מוקד בני ברק - אזור חזון איש נחמיה';
update public.card_centers set code = 4 where name = 'מוקד בני ברק - רחוב יואל';
update public.card_centers set code = 5 where name = 'מוקד בית שמש רמה ב';
update public.card_centers set code = 6 where name = 'מוקד מודיעין עילית - גרין פארק';

-- 3) הורדת מלאי אטומית: מוריד כרטיס אחד מהמוקד רק אם יש מלאי (stock > 0).
--    מחזיר את המלאי החדש, או NULL אם אין מלאי / המוקד לא קיים / לא פעיל.
--    אטומי — מונע מצב של הורדה כפולה בקריאות במקביל.
create or replace function public.decrement_card_center_stock(p_center_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.card_centers
     set stock = stock - 1,
         updated_at = now()
   where id = p_center_id
     and is_active = true
     and stock > 0
  returning stock;
$$;
