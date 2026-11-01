-- מחלקת סיוע: איחוד אלמנות ויתומים וסיוע רפואי. תוספתי בלבד, בלי מחיקת נתונים.

alter table public.financial_aid_requests
  add column if not exists aid_type text not null default 'medical',
  add column if not exists relation text,
  add column if not exists referrer text;

alter table public.financial_aid_requests drop constraint if exists financial_aid_requests_aid_type_check;
alter table public.financial_aid_requests add constraint financial_aid_requests_aid_type_check
  check (aid_type in ('medical','widow','orphans'));

-- סטטוס "בבירור" (ממתין למענה מהמבקש)
alter table public.financial_aid_requests drop constraint if exists financial_aid_requests_status_check;
alter table public.financial_aid_requests add constraint financial_aid_requests_status_check
  check (status in ('pending','inquiry','awaiting_decision','approved','rejected'));

-- התכתבות בכל כרטסת (בקשת סיוע או בקשת אלמנה קיימת)
create table if not exists public.aid_messages (
  id               uuid primary key default gen_random_uuid(),
  source_table     text not null check (source_table in ('financial_aid_requests','widow_requests')),
  request_id       uuid not null,
  direction        text not null check (direction in ('staff','applicant')),
  body             text not null,
  sender_id        uuid,
  sender_name      text,
  message_id       text,
  references_chain text,
  is_read          boolean not null default false,
  attachment_url   text,
  attachment_name  text,
  created_at       timestamptz not null default now()
);
create index if not exists aid_messages_req_idx on public.aid_messages(source_table, request_id, created_at);
create index if not exists aid_messages_unread_idx on public.aid_messages(is_read) where direction = 'applicant' and is_read = false;

alter table public.aid_messages enable row level security;
create policy "aid_messages_staff_all" on public.aid_messages
  for all using (public.is_staff()) with check (public.is_staff());
