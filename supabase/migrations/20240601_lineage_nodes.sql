-- טבלת צמתי עץ הדורות
-- כל שורה מייצגת אדם/ענף בשושלת

create table if not exists public.lineage_nodes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  generation  integer not null default 0,
  parent_id   uuid references public.lineage_nodes(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- אינדקסים לביצועים
create index if not exists lineage_nodes_parent_id_idx on public.lineage_nodes(parent_id);
create index if not exists lineage_nodes_generation_idx on public.lineage_nodes(generation);

-- עדכון אוטומטי של updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lineage_nodes_updated_at on public.lineage_nodes;
create trigger lineage_nodes_updated_at
  before update on public.lineage_nodes
  for each row execute function public.set_updated_at();

-- Row Level Security — service role בלבד (הפורטל משתמש ב-service role)
alter table public.lineage_nodes enable row level security;

-- מדיניות: service role יכול הכל (ה-API route רץ עם service role key)
create policy "service role full access" on public.lineage_nodes
  for all
  to service_role
  using (true)
  with check (true);
