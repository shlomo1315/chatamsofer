-- טופס סיוע רפואי ציבורי (/medical): מבקש שאינו רשום כצאצא, מסמכים מרובים, סכום מבוקש.

alter table public.financial_aid_requests alter column beneficiary_id drop not null;

alter table public.financial_aid_requests
  add column if not exists source               text not null default 'admin',
  add column if not exists is_descendant        boolean not null default true,
  add column if not exists applicant_name       text,
  add column if not exists applicant_id_number  text,
  add column if not exists applicant_phone      text,
  add column if not exists applicant_email      text,
  add column if not exists applicant_address    text,
  add column if not exists applicant_city       text,
  add column if not exists requested_amount     numeric(10,2),
  add column if not exists final_message_sent_at timestamptz;

create index if not exists financial_aid_applicant_id_idx on public.financial_aid_requests(applicant_id_number);

create table if not exists public.financial_aid_documents (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.financial_aid_requests(id) on delete cascade,
  kind        text not null default 'medical' check (kind in ('id_card','medical')),
  file_url    text not null,
  file_name   text,
  created_at  timestamptz not null default now()
);
create index if not exists financial_aid_documents_req_idx on public.financial_aid_documents(request_id);

-- גישה לצוות בלבד (הטופס הציבורי כותב דרך service-role)
alter table public.financial_aid_documents enable row level security;
create policy "financial_aid_documents_staff_all" on public.financial_aid_documents
  for all using (public.is_staff()) with check (public.is_staff());
