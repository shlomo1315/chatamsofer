-- בקשות תיקון מגולשים בארכיון הציבורי: נשמרות, מסוכמות ע"י הסוכן, ומחכות לאישור.
create table if not exists public.archive_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  body text not null check (char_length(body) between 5 and 2000),
  area text not null default '' check (char_length(area) <= 200),
  sender_name text not null default '' check (char_length(sender_name) <= 100),
  sender_contact text not null default '' check (char_length(sender_contact) <= 200),
  summary text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_at timestamptz,
  decided_by uuid
);
alter table public.archive_requests enable row level security;
-- בלי מדיניות: גישה רק ל-service_role (הגולש לא ניגש למסד ישירות)
create index if not exists archive_requests_status_idx on public.archive_requests (status, created_at desc);
