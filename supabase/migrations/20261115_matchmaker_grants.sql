-- ── מלגות לשדכנים ──
-- הגישה רק דרך service role מהשרת. RLS פעיל בלי מדיניות = אין גישה מהדפדפן.
-- ת"ז נשמרת מוצפנת (*_enc) ועם גיבוב חד-כיווני (*_hash) לבדיקת ייחודיות.

create table if not exists public.matchmakers (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text not null,
  id_enc        text not null,
  id_hash       text not null unique,
  phone         text not null,
  phone_norm    text not null unique,
  email         text not null,
  email_norm    text not null unique,
  email_verified_at timestamptz,
  address       text not null,
  city          text not null,
  birth_date    date not null,
  status        text not null default 'active' check (status in ('active','blocked')),
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.matchmaker_login_codes (
  id            uuid primary key default gen_random_uuid(),
  matchmaker_id uuid not null references public.matchmakers(id) on delete cascade,
  code_hash     text not null,
  expires_at    timestamptz not null,
  attempts      integer not null default 0,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists matchmaker_login_codes_mm_idx on public.matchmaker_login_codes (matchmaker_id, created_at desc);

create table if not exists public.matchmaker_claims (
  id            uuid primary key default gen_random_uuid(),
  matchmaker_id uuid not null references public.matchmakers(id) on delete cascade,
  match_date    date not null,
  groom_first_name text not null,
  groom_last_name  text not null,
  groom_id_enc  text not null,
  groom_id_hash text not null,
  groom_father_name text,
  groom_phone   text,
  bride_first_name text not null,
  bride_last_name  text not null,
  bride_id_enc  text not null,
  bride_id_hash text not null,
  bride_father_name text,
  bride_phone   text,
  is_grandchild boolean not null default false,
  grandchild_side text check (grandchild_side in ('groom','bride','both')),
  verification  jsonb,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  amount        numeric(12,2),
  reject_reason text,
  handled_by    text,
  handled_at    timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  -- שידוך זהה (אותו חתן ואותה כלה) לא מוגש פעמיים
  unique (groom_id_hash, bride_id_hash)
);
create index if not exists matchmaker_claims_mm_idx on public.matchmaker_claims (matchmaker_id, created_at desc);

create table if not exists public.matchmaker_settings (
  id              integer primary key default 1 check (id = 1),
  regular_amount  numeric(12,2),
  enlarged_amount numeric(12,2),
  max_claims_per_matchmaker integer,
  updated_at      timestamptz not null default now(),
  updated_by      text
);
insert into public.matchmaker_settings (id) values (1) on conflict do nothing;

-- יומן: פעולות מנהל וחשיפת ת"ז מלאה
create table if not exists public.matchmaker_audit (
  id         uuid primary key default gen_random_uuid(),
  claim_id   uuid references public.matchmaker_claims(id) on delete cascade,
  action     text not null,
  detail     text,
  actor      text,
  created_at timestamptz not null default now()
);
create index if not exists matchmaker_audit_claim_idx on public.matchmaker_audit (claim_id, created_at desc);

alter table public.matchmakers enable row level security;
alter table public.matchmaker_login_codes enable row level security;
alter table public.matchmaker_claims enable row level security;
alter table public.matchmaker_settings enable row level security;
alter table public.matchmaker_audit enable row level security;

notify pgrst, 'reload schema';
