-- אופן הגשת בקשת הלידה — 'portal' (האתר) / 'email' (מייל) / 'admin' (הזנה ידנית).
-- מאפשר להציג בטבלת היולדות איך כל בקשה הוגשה. ברירת מחדל null (בקשות ישנות).
alter table public.maternity_aids
  add column if not exists source text;
