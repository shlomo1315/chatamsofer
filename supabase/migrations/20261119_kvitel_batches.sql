-- מנות קוויטל: כל סגירת שבוע נרשמת עם השורות שנכנסו לקובץ, כדי שאפשר יהיה להוריד אותו שוב בדיוק כפי שנשלח.
-- הבקשות עצמן מסומנות "נשלח לציון" (done) באותה פעולה.

create table if not exists public.kvitel_batches (
  id             uuid primary key default gen_random_uuid(),
  closed_at      timestamptz not null default now(),
  closed_by      uuid references public.profiles(id) on delete set null,
  closed_by_name text,
  parsha         text,
  request_ids    uuid[] not null,
  lines          text[] not null,
  request_count  int not null,
  name_count     int not null
);

create index if not exists kvitel_batches_closed_idx on public.kvitel_batches (closed_at desc);

alter table public.kvitel_batches enable row level security;
grant all on public.kvitel_batches to service_role;
