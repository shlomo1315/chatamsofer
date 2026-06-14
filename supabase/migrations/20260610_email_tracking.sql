-- Email open tracking (tracking pixel)
create table if not exists email_tracking (
  id           uuid primary key default gen_random_uuid(),
  token        text unique not null,
  gmail_msg_id text default '',
  to_email     text not null,
  subject      text default '',
  sent_by      uuid references profiles(id) on delete set null,
  sent_at      timestamptz default now(),
  opened_at    timestamptz,
  open_count   int default 0
);

create index if not exists email_tracking_token   on email_tracking(token);
create index if not exists email_tracking_sent_at on email_tracking(sent_at desc);
create index if not exists email_tracking_msg_id  on email_tracking(gmail_msg_id);
