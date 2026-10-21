-- ─────────────────────────────────────────────────────────────────────────────
-- גיליונות — מערך המפיצים: טופס הצטרפות ציבורי (/gilyonot/mefitz/join).
-- בקשה מהטופס נשמרת ב-gilyonot_distributor_applications עם reason='web'
-- וממתינה לאישור במסך הניהול (לשונית "בקשות הצטרפות"). באישור נוצר מפיץ
-- עם source='web' ונשלח לו מייל. המפיצים הקיימים (status='active') הם המאושרים.
-- הלוגיקה: lib/gilyonotDistributorJoin.ts
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.gilyonot_distributor_applications add column if not exists notes text;

alter table public.gilyonot_distributor_applications drop constraint if exists gilyonot_distributor_applications_reason_check;
alter table public.gilyonot_distributor_applications add constraint gilyonot_distributor_applications_reason_check
  check (reason in ('synagogue_taken','no_phone','no_synagogue','no_name','web'));

alter table public.gilyonot_distributors drop constraint if exists gilyonot_distributors_source_check;
alter table public.gilyonot_distributors add constraint gilyonot_distributors_source_check
  check (source in ('manual','import','nedarim','phone','web'));

-- בקשה ממתינה אחת מהטופס לכל טלפון (גם כששתי הגשות מגיעות באותו רגע)
create unique index if not exists gilyonot_distributor_applications_web_phone_uq
  on public.gilyonot_distributor_applications (phone) where reason = 'web' and status = 'pending';
