-- ── סיסמה לקישור הנדיב ──
-- הסיסמה נשמרת כ-hash (bcrypt) בלבד. מונה ניסיונות כושלים ונעילה זמנית נשמרים במסד,
-- כדי שהמגבלה תחזיק גם בין מופעי שרת.
alter table public.donor_report_links
  add column if not exists password_hash    text,
  add column if not exists failed_attempts  integer not null default 0,
  add column if not exists locked_until     timestamptz;

notify pgrst, 'reload schema';
