-- מלאי כרטיסי מזון גלובלי (לא לפי מוקד): יומן תנועות מלאי אחד לכל המערכת.
-- המלאי הנוכחי = SUM(delta) — תמיד מחושב, אף פעם לא "מספר שנשמר" (מונע חוסר-סנכרון).

create table if not exists public.card_stock_ledger (
  id          uuid primary key default gen_random_uuid(),
  delta       integer not null,                    -- +N הוספה, -1 אישור לידה / הורדה ידנית
  reason      text not null check (reason in ('restock','birth_approval','manual_out','auto_assign','adjust')),
  aid_id      uuid references public.maternity_aids(id) on delete set null,  -- קישור ליולדת (אופציונלי)
  note        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists card_stock_ledger_created_idx on public.card_stock_ledger(created_at desc);
create index if not exists card_stock_ledger_aid_idx      on public.card_stock_ledger(aid_id);

alter table public.card_stock_ledger enable row level security;
create policy "card_stock_ledger_read"   on public.card_stock_ledger for select to authenticated using (true);
create policy "card_stock_ledger_insert" on public.card_stock_ledger for insert to authenticated with check (true);

-- המלאי הנוכחי (סכום כל התנועות). VIEW נוח לתצוגה אונליין.
create or replace view public.card_stock_balance as
  select coalesce(sum(delta), 0)::integer as balance from public.card_stock_ledger;

-- ניכוי אטומי של כרטיס אחד מהמלאי הגלובלי: מוסיף שורת delta=-1 רק אם יש מלאי (balance > 0).
-- מחזיר את המלאי החדש שנותר, או NULL אם אין מלאי. אטומי — מונע ניכוי-יתר בקריאות מקבילות.
create or replace function public.consume_card_stock(
  p_reason text, p_aid_id uuid, p_note text, p_by uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cur integer;
begin
  -- נעילת היומן למניעת מרוץ (שתי לידות מאושרות בו-זמנית על הכרטיס האחרון)
  perform pg_advisory_xact_lock(hashtext('card_stock_global'));
  select coalesce(sum(delta), 0) into cur from public.card_stock_ledger;
  if cur <= 0 then
    return null; -- אין מלאי
  end if;
  insert into public.card_stock_ledger(delta, reason, aid_id, note, created_by)
    values (-1, p_reason, p_aid_id, p_note, p_by);
  return cur - 1;
end;
$$;

-- הגדרות סף התראה + רשימת מיילים נשמרות ב-app_settings תחת המפתח 'card_stock_alert':
-- { "threshold": 5, "emails": ["a@b.com", ...] }. ברירת מחדל threshold=5 מיושמת בקוד.
