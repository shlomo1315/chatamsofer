-- סנכרון מייל קודם: הרחבת inbound_emails למיילים היסטוריים מתיבת Gmail ישנה
alter table inbound_emails add column if not exists source text not null default 'resend';
alter table inbound_emails add column if not exists beneficiary_id uuid references beneficiaries(id) on delete set null;
alter table inbound_emails add column if not exists gmail_message_id text;
alter table inbound_emails add column if not exists email_date timestamptz;

-- מניעת ייבוא כפול מ-Gmail (message-id ייחודי כשקיים)
create unique index if not exists inbound_emails_gmail_message_id_idx
  on inbound_emails(gmail_message_id) where gmail_message_id is not null;

-- אינדקסים לשליפת "לא משויכים" ולפי לקוח
create index if not exists inbound_emails_beneficiary_id_idx on inbound_emails(beneficiary_id);
create index if not exists inbound_emails_source_idx on inbound_emails(source);
