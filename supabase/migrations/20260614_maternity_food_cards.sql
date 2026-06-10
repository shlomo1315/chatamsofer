-- אגף "כרטיסי מזון יולדות": מוקדים עם מלאי + מסלול אישור כרטיס נפרד מבית החלמה.
-- המלאי = כמה כרטיסים אושרו לטעינה במוקד. הנותר מחושב = stock פחות מספר הכרטיסים שאושרו לאותו מוקד.

create table if not exists public.card_centers (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  stock       integer not null default 0,
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.card_centers enable row level security;

create policy "card_centers_read"   on public.card_centers for select using (true);
create policy "card_centers_insert" on public.card_centers for insert to authenticated with check (true);
create policy "card_centers_update" on public.card_centers for update to authenticated using (true);
create policy "card_centers_delete" on public.card_centers for delete to authenticated using (true);

-- מסלול אישור כרטיס המזון — נפרד לחלוטין מ-status (בית החלמה)
alter table public.maternity_aids
  add column if not exists card_status    text default 'pending' check (card_status in ('pending','approved','rejected')),
  add column if not exists card_center_id uuid references public.card_centers(id) on delete set null;

create index if not exists maternity_aids_card_status_idx on public.maternity_aids(card_status);
create index if not exists maternity_aids_card_center_idx  on public.maternity_aids(card_center_id);
