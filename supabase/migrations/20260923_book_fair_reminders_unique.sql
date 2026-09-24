-- 🔴 בלי האינדקס הזה כל הרשמה לתזכורת נכשלה: ה-upsert בנתיב
-- /api/yerid/remind-me מבקש onConflict:'email', ו-Postgres זורק 42P10
-- ("no unique or exclusion constraint matching the ON CONFLICT
-- specification"). הקוד ראה קוד שגיאה שאינו 23505 והחזיר 500 →
-- "הרישום נכשל, נסו שוב". הטבלה נשארה ריקה מאז שהוקמה.
--
-- ⚠️ הכתובות נשמרות תמיד ב-lower() בקוד, ולכן אינדקס רגיל מספיק;
-- אין צורך ב-lower(email) שהיה מונע שימוש ב-onConflict:'email'.
create unique index if not exists book_fair_reminders_email_key
  on public.book_fair_reminders (email);
