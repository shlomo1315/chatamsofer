-- אגף "סיוע כספי": בקשות סיוע עם זרימת אישור מבוססת-מייל.
-- המזכיר שולח מייל מעוצב לגורם מאשר; הוא משיב במספר (=סכום מאושר) או X (=נדחה);
-- המערכת שולפת את התשובה מהשרשור (gmail_thread_id) ומעדכנת סטטוס+סכום.

create table if not exists public.financial_aid_requests (
  id                  uuid primary key default gen_random_uuid(),
  beneficiary_id      uuid references public.beneficiaries(id) on delete cascade not null,
  reason              text,
  document_url        text,
  document_name       text,
  status              text not null default 'pending'
                        check (status in ('pending','awaiting_decision','approved','rejected')),
  amount              numeric(10,2),
  decision_email      text,
  gmail_thread_id     text,
  gmail_message_id    text,
  sent_to_decision_at timestamptz,
  decision_reply      text,
  decision_replied_at timestamptz,
  reviewed_by         uuid references public.profiles(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists financial_aid_beneficiary_idx on public.financial_aid_requests(beneficiary_id);
create index if not exists financial_aid_status_idx       on public.financial_aid_requests(status);
create index if not exists financial_aid_thread_idx       on public.financial_aid_requests(gmail_thread_id);

alter table public.financial_aid_requests enable row level security;
create policy "financial_aid_read"   on public.financial_aid_requests for select using (true);
create policy "financial_aid_insert" on public.financial_aid_requests for insert to authenticated with check (true);
create policy "financial_aid_update" on public.financial_aid_requests for update to authenticated using (true);
create policy "financial_aid_delete" on public.financial_aid_requests for delete to authenticated using (true);
