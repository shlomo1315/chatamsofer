-- טעינה חודשית למוקדים בטלפון (ימות): כל מוקד מקבל מדי חודש כרטיס טעון אחד,
-- מנוכה מהמלאי הגלובלי. טלפון מורשה אחד לכל מוקד; השיוך של הכרטיס נעשה פעם אחת.

-- תנועת מלאי חדשה ביומן
alter table public.card_stock_ledger drop constraint if exists card_stock_ledger_reason_check;
alter table public.card_stock_ledger
  add constraint card_stock_ledger_reason_check
  check (reason in ('restock','birth_approval','manual_out','auto_assign','adjust','baseline','center_monthly'));

create table if not exists public.center_monthly_cards (
  center_id         uuid primary key references public.card_centers(id) on delete cascade,
  phone             text,            -- מספר מורשה, מנורמל (05XXXXXXXX)
  card_number       text,            -- הכרטיס המשויך (פעם אחת)
  nedarim_client_id text,
  card_linked_at    timestamptz,
  updated_at        timestamptz not null default now()
);
create unique index if not exists center_monthly_cards_phone_uidx
  on public.center_monthly_cards(phone) where phone is not null;

create table if not exists public.center_monthly_loads (
  id          uuid primary key default gen_random_uuid(),
  center_id   uuid not null references public.card_centers(id) on delete cascade,
  month       text not null,         -- YYYY-MM (שעון ישראל)
  amount      integer not null,
  status      text not null default 'pending' check (status in ('pending','loaded')),
  tlush_id    text,
  loaded_at   timestamptz,
  created_at  timestamptz not null default now(),
  -- הגנה סופית מטעינה כפולה, גם בשיחות מקבילות
  unique (center_id, month)
);


alter table public.center_monthly_loads enable row level security;
drop policy if exists "center_monthly_cards_staff" on public.center_monthly_cards;
drop policy if exists "center_monthly_loads_staff" on public.center_monthly_loads;
create policy "center_monthly_cards_staff" on public.center_monthly_cards
  for all using (public.is_staff()) with check (public.is_staff());
create policy "center_monthly_loads_staff" on public.center_monthly_loads
  for all using (public.is_staff()) with check (public.is_staff());

-- שריון אטומי: בודק שלא נטען החודש, בודק מלאי, מנכה כרטיס ורושם 'pending' — הכול תחת
-- אותה נעילה של consume_card_stock. מחזיר 'ok' | 'already' | 'busy' | 'no_stock'.
create or replace function public.reserve_center_monthly_load(
  p_center uuid, p_month text, p_amount integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cur integer;
  existing text;
begin
  perform pg_advisory_xact_lock(hashtext('card_stock_global'));
  select status into existing from public.center_monthly_loads
    where center_id = p_center and month = p_month;
  if existing = 'loaded' then return 'already'; end if;
  if existing = 'pending' then return 'busy'; end if;
  select coalesce(sum(delta), 0) into cur from public.card_stock_ledger;
  if cur <= 0 then return 'no_stock'; end if;
  insert into public.center_monthly_loads(center_id, month, amount) values (p_center, p_month, p_amount);
  insert into public.card_stock_ledger(delta, reason, note)
    values (-1, 'center_monthly', 'טעינה חודשית למוקד ' || p_center || ' · ' || p_month);
  return 'ok';
end;
$$;

-- ביטול שריון (הטעינה בנדרים נכשלה): מחזיר את הכרטיס למלאי ומשחרר את החודש.
create or replace function public.release_center_monthly_load(
  p_center uuid, p_month text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  perform pg_advisory_xact_lock(hashtext('card_stock_global'));
  delete from public.center_monthly_loads
    where center_id = p_center and month = p_month and status = 'pending';
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  insert into public.card_stock_ledger(delta, reason, note)
    values (1, 'adjust', 'החזרה אוטומטית — טעינה חודשית למוקד נכשלה · ' || p_center || ' · ' || p_month);
  return true;
end;
$$;

revoke all on function public.reserve_center_monthly_load(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.release_center_monthly_load(uuid, text) from public, anon, authenticated;
alter table public.center_monthly_cards add column if not exists id_number text;
