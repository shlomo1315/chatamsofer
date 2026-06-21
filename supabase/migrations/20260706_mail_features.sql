-- מייל: ספאם, סימון לטיפול, ותזמון שליחה.
-- תוויות נשמרות ב-app_settings (קיים) ולכן אינן כאן.

-- סימון ספאם וסימון לטיפול-בהמשך על מיילים נכנסים
alter table inbound_emails
  add column if not exists is_spam      boolean      not null default false,
  add column if not exists follow_up_at timestamptz;

-- זמן תזמון לשליחה (אם המייל תוזמן דרך Resend) — מוצג בתיקיית "מתוזמנים"
alter table sent_emails
  add column if not exists scheduled_at timestamptz;

create index if not exists inbound_emails_spam_idx     on inbound_emails(is_spam);
create index if not exists inbound_emails_followup_idx  on inbound_emails(follow_up_at) where follow_up_at is not null;
create index if not exists sent_emails_scheduled_idx    on sent_emails(scheduled_at) where scheduled_at is not null;
