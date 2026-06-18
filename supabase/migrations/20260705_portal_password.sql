-- אבטחה: סיסמת כניסה לפורטל הציבורי.
-- עד כה כניסה לאזור האישי הסתמכה על ת"ז בלבד (חשיפת PII לפי ניחוש ת"ז).
-- כעת נדרשת סיסמה חזקה, עם זרימת "שכחתי סיסמה" באמצעות קוד חד-פעמי למייל.
alter table beneficiaries
  add column if not exists portal_password_hash  text,
  add column if not exists portal_reset_code_hash text,
  add column if not exists portal_reset_expires   timestamptz,
  add column if not exists portal_reset_attempts  int not null default 0;
