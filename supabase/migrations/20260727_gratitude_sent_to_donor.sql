-- מעקב שליחת מכתב ברכה לנדיב: מתי נשלח, לאיזו כתובת.
-- מאפשר סימון בטבלת מכתבי הברכה אילו כבר נשלחו (למניעת שליחה כפולה בשליחה מרוכזת).

alter table public.gratitude_letters
  add column if not exists sent_to_donor_at    timestamptz,
  add column if not exists sent_to_donor_email text;
