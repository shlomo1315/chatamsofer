-- רשימת מי שנמחקו מהאיגוד בבקשתם: אין אפשרות להירשם מחדש באותה ת"ז.
-- לא הרסני: טבלה חדשה בלבד. נגישה רק דרך מפתח השירות.
create table if not exists public.removed_members (
  id_number text primary key,
  removed_at timestamptz not null default now()
);

alter table public.removed_members enable row level security;
