-- אגף אלמנות ויתומים — מודל תיקי משפחות:
-- כל אלמן/אלמנה = תיק משפחה. תמיכה חודשית קבועה (שהמזכירות מגדירה) + לוג תמיכות לסך הכללי.

-- קצבה חודשית קבועה לכל תיק (נקבעת ע"י המזכירות)
alter table public.beneficiaries add column if not exists monthly_support numeric(12,2) default 0;

-- לוג תמיכות/תשלומים שניתנו למשפחה (מרכיב את "סך התמיכות הכללי")
create table if not exists public.widow_support_payments (
  id             uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references public.beneficiaries(id) on delete cascade not null,
  amount         numeric(12,2) not null,
  paid_at        date not null default current_date,
  type           text not null default 'one_time'
                   check (type in ('one_time','monthly','holiday','medical','food','other')),
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists widow_payments_beneficiary_idx on public.widow_support_payments(beneficiary_id);

alter table public.widow_support_payments enable row level security;
create policy "widow_payments_read"   on public.widow_support_payments for select using (true);
create policy "widow_payments_insert" on public.widow_support_payments for insert to authenticated with check (true);
create policy "widow_payments_update" on public.widow_support_payments for update to authenticated using (true);
create policy "widow_payments_delete" on public.widow_support_payments for delete to authenticated using (true);
