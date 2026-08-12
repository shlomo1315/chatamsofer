-- ═══════════════════════════════════════════════════════════════════════════
-- לוג מענים אוטומטיים — בולם הלולאה.
--
-- 🔴 הרקע: לולאה אמיתית בייצור. care@make.com שלח מייל, המערכת ענתה
-- "קיבלנו את פנייתכם", Make ענה "כתובת זו אינה מקבלת הודעות", וזה נקלט
-- כפנייה חדשה — אינסוף. מאות מיילים תוך דקות, ושריפת מכסת השליחה.
--
-- ⚠️ כל הסינונים שהיו קיימים מזהים אוטומציה *לפי דפוס* (noreply, mailer-daemon
-- וכו'), ו-care@make.com לא תאם לאף אחד מהם. דפוס אפשר להחמיץ תמיד.
--
-- הטבלה הזו אינה מנחשת — היא סופרת. אחרי 2 מענים לאותה כתובת בשבוע, לא
-- נשלח עוד, ולא משנה מי היא ומה הדפוס שלה.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.auto_reply_log (
  id          uuid primary key default gen_random_uuid(),
  to_email    text not null,
  subject     text,
  created_at  timestamptz not null default now()
);

-- ⚠️ האינדקס הוא על (כתובת, זמן) בדיוק בסדר שבו הבדיקה שואלת: "כמה מענים
-- לכתובת הזו מאז תאריך X". בלעדיו הבדיקה סורקת את כל הטבלה בכל מייל נכנס.
create index if not exists auto_reply_log_email_time
  on public.auto_reply_log (to_email, created_at desc);

alter table public.auto_reply_log enable row level security;
-- ללא policies: service-role בלבד.
