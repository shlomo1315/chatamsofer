-- תאריכי שהייה בפועל בבית ההחלמה — מאיזה יום עד איזה יום היולדת שהתה.
-- בית ההחלמה מסמן זאת בלוח בעת אישור ההגעה. משמש בכרטסת הלידה ובשובר דברי הברכה.

alter table public.maternity_aids
  add column if not exists recovery_stay_from date,
  add column if not exists recovery_stay_to   date;
