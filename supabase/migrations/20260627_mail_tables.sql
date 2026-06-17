-- מערכת מיילים מבוססת Resend (החלפת Gmail):
-- inbound_emails  — מיילים נכנסים שמתקבלים דרך Resend Inbound webhook
-- sent_emails     — תיעוד מיילים יוצאים שנשלחו דרך Resend

create table if not exists inbound_emails (
  id uuid primary key default gen_random_uuid(),
  message_id text unique,
  from_email text not null,
  from_name text,
  to_email text not null,
  subject text,
  html text,
  plain_text text,
  headers jsonb,
  attachments jsonb default '[]',
  is_read boolean default false,
  received_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists inbound_emails_to_email_idx on inbound_emails(to_email);
create index if not exists inbound_emails_received_at_idx on inbound_emails(received_at desc);

create table if not exists sent_emails (
  id uuid primary key default gen_random_uuid(),
  resend_id text,
  from_name text,
  to_email text not null,
  subject text,
  html text,
  department text,
  reply_to text,
  sent_by text,
  attachments jsonb default '[]',
  sent_at timestamptz default now()
);

create index if not exists sent_emails_to_email_idx on sent_emails(to_email);
create index if not exists sent_emails_sent_at_idx on sent_emails(sent_at desc);
create index if not exists sent_emails_department_idx on sent_emails(department);
