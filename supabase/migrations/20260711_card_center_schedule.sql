-- מוקדי חלוקה: שדות ימי ושעות איסוף + הזנת המוקדים בפועל.
alter table public.card_centers
  add column if not exists pickup_days  text,
  add column if not exists pickup_hours text;

-- הזנת/עדכון המוקדים (upsert לפי שם)
insert into public.card_centers (name, address, pickup_days, pickup_hours, is_active, stock) values
  ('מוקד ירושלים - אזור שמואל הנביא', 'משפחת שטרנבוך, רחוב יחזקאל 44 כניסה א'' קומה 3', 'ימי שני ושלישי', '19:30 - 21:00', true, 0),
  ('מוקד ירושלים - אזור נווה צבי', 'משפחת הלפרט, רחוב צפניה 23', 'ימי שני ורביעי', '20:00 - 22:00', true, 0),
  ('מוקד בני ברק - אזור חזון איש נחמיה', 'משפחת שמרלר, רחוב הרב לנדא 3 קומה 2', 'ימי שני ושלישי', '20:00 - 22:00', true, 0),
  ('מוקד בני ברק - רחוב יואל', 'משפחת שמרלר, רחוב יואל 6', 'ימי שני ושלישי', '19:00 - 22:00', true, 0),
  ('מוקד בית שמש רמה ב', 'משפחת אונגר, רחוב דובר שלום 11 קומה -2', 'ימי ראשון ושלישי', '19:00 - 21:00', true, 0),
  ('מוקד מודיעין עילית - גרין פארק', 'משפחת רבינוביץ, רחוב אשר לשלמה 3 דירה 19 קומה 4 (שימו לב לקומה!)', 'ימי ראשון ורביעי', '18:00 - 20:00', true, 0)
on conflict (name) do update set
  address      = excluded.address,
  pickup_days  = excluded.pickup_days,
  pickup_hours = excluded.pickup_hours;
