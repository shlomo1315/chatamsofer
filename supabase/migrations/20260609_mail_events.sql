-- Mail events tracking: read, handled, replied
create table if not exists mail_events (
  id           uuid primary key default gen_random_uuid(),
  message_id   text not null,
  thread_id    text not null default '',
  event_type   text not null check (event_type in ('read','handled','replied','auto_replied')),
  user_id      uuid references profiles(id) on delete set null,
  label_ids    text[] default '{}',
  from_email   text default '',
  subject      text default '',
  created_at   timestamptz default now()
);

create index if not exists mail_events_created_at  on mail_events(created_at desc);
create index if not exists mail_events_event_type  on mail_events(event_type);
create index if not exists mail_events_message_id  on mail_events(message_id);
create index if not exists mail_events_user_id     on mail_events(user_id);
