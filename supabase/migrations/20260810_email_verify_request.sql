-- ─────────────────────────────────────────────────────────────────────────────
-- מעקב אחר בקשות אימות מייל שנשלחו לנרשמים.
--
-- מאז שאימות המייל ברישום הפך לאופציונלי יש נרשמים עם כתובת שלא אומתה. כדי
-- לבקש מהם לאמת נדרש מסך ניהול שיודע *למי כבר נשלחה בקשה ומתי* — בלעדיו כל
-- לחיצה על "שלח לכולם" הייתה שולחת שוב לכל מי שקיבל, והנרשמים היו מוצפים
-- באותה בקשה שוב ושוב.
--
-- email_verify_requested_at — מועד שליחת הבקשה האחרונה. NULL = טרם נשלחה.
-- ⚠️ אינו מעיד על אימות. האימות עצמו נרשם ב-email_verified_at.
-- ─────────────────────────────────────────────────────────────────────────────

alter table beneficiaries add column if not exists email_verify_requested_at timestamptz;

comment on column beneficiaries.email_verify_requested_at is
  'מועד שליחת הבקשה האחרונה לאמת את כתובת המייל. NULL = טרם נשלחה. אינו מעיד על אימות.';

-- אחזור מהיר של "למי טרם נשלחה בקשה" מתוך מי שטרם אימת
create index if not exists beneficiaries_email_verify_requested_idx
    on beneficiaries (email_verify_requested_at)
 where email_verified_at is null;
