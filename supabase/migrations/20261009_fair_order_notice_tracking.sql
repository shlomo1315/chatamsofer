-- דיוור הודעה אישית למזמיני האתר + מעקב פתיחה/לחיצה (09.10).
--
-- ⚠️ מעקב משלנו ולא אירועי Resend: ה-webhook של resend-events אינו
-- נקרא מאז 16.08, ולכן "נפתח" משם לעולם לא היה מגיע.
alter table book_fair_newsletter_recipients
  add column if not exists customer_name text,
  add column if not exists order_numbers text,
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists open_count int not null default 0;
