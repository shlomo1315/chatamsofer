-- ===================================================
-- מסד נתונים למערכת ניהול עמותה
-- ===================================================

-- פרופילי צוות (staff users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null,
  role text not null check (role in ('admin', 'secretary', 'reviewer', 'collections')),
  phone text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- משפחות
create table families (
  id uuid primary key default gen_random_uuid(),
  family_name text not null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- צאצאים
create table beneficiaries (
  id uuid primary key default gen_random_uuid(),
  id_number text unique not null,
  full_name text not null,
  phone text,
  phone2 text,
  email text,
  address text,
  city text,
  birth_date date,
  gender text check (gender in ('male', 'female')),
  family_id uuid references families(id) on delete set null,
  marital_status text,
  children_count integer default 0,
  eligibility_status text default 'pending' check (eligibility_status in ('pending', 'approved', 'rejected', 'review')),
  is_active boolean default true,
  notes text,
  nedarim_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- יחסי משפחה (יוחסין)
create table family_relations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references beneficiaries(id) on delete cascade not null,
  related_person_id uuid references beneficiaries(id) on delete cascade not null,
  relation_type text not null,
  document_verified boolean default false,
  verified_by uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz default now(),
  unique(person_id, related_person_id, relation_type)
);

-- מסמכים
create table documents (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade not null,
  doc_type text not null,
  file_url text,
  file_name text,
  verified boolean default false,
  verified_by uuid references profiles(id) on delete set null,
  uploaded_at timestamptz default now()
);

-- סיוע יולדות
create table maternity_aids (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade not null,
  birth_date date not null,
  baby_name text,
  card_number text,
  card_balance numeric(10,2) default 0,
  card_loaded_at timestamptz,
  card_expires_at timestamptz,
  weekly_amount numeric(10,2) default 0,
  total_weeks integer default 6,
  recovery_home text,
  recovery_from date,
  recovery_to date,
  status text default 'pending' check (status in ('pending', 'active', 'completed', 'cancelled')),
  approved_by uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- הלוואות
create table loans (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade not null,
  amount numeric(10,2) not null,
  installments integer not null,
  monthly_payment numeric(10,2) not null,
  purpose text,
  status text default 'pending' check (status in ('pending', 'approved', 'active', 'completed', 'rejected', 'defaulted')),
  approved_by uuid references profiles(id) on delete set null,
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- תשלומי הלוואות
create table loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid references loans(id) on delete cascade not null,
  amount numeric(10,2) not null,
  paid_at timestamptz default now(),
  payment_method text,
  is_late boolean default false,
  recorded_by uuid references profiles(id) on delete set null,
  notes text
);

-- חלוקות
create table distributions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  holiday text,
  description text,
  criteria jsonb,
  total_budget numeric(10,2),
  status text default 'planning' check (status in ('planning', 'active', 'completed', 'cancelled')),
  distribution_date date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- מקבלי חלוקות
create table distribution_recipients (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid references distributions(id) on delete cascade not null,
  family_id uuid references families(id) on delete set null,
  beneficiary_id uuid references beneficiaries(id) on delete set null,
  amount numeric(10,2),
  item_description text,
  received_at timestamptz,
  status text default 'pending' check (status in ('pending', 'received', 'not_received'))
);

-- לוג פעילות
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz default now()
);

-- התראות
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  message text,
  type text default 'info' check (type in ('info', 'warning', 'urgent', 'reminder')),
  is_read boolean default false,
  created_at timestamptz default now()
);

-- ===================================================
-- Row Level Security (RLS)
-- ===================================================

alter table profiles enable row level security;
alter table families enable row level security;
alter table beneficiaries enable row level security;
alter table family_relations enable row level security;
alter table documents enable row level security;
alter table maternity_aids enable row level security;
alter table loans enable row level security;
alter table loan_payments enable row level security;
alter table distributions enable row level security;
alter table distribution_recipients enable row level security;
alter table activity_log enable row level security;
alter table notifications enable row level security;

-- פוליסות גישה - כל משתמש מאומת יכול לראות הכל
create policy "authenticated users can read all" on profiles for select using (auth.role() = 'authenticated');
create policy "authenticated users can read all" on families for select using (auth.role() = 'authenticated');
create policy "authenticated users can read all" on beneficiaries for select using (auth.role() = 'authenticated');
create policy "authenticated users can read all" on family_relations for select using (auth.role() = 'authenticated');
create policy "authenticated users can read all" on documents for select using (auth.role() = 'authenticated');
create policy "authenticated users can read all" on maternity_aids for select using (auth.role() = 'authenticated');
create policy "authenticated users can read all" on loans for select using (auth.role() = 'authenticated');
create policy "authenticated users can read all" on loan_payments for select using (auth.role() = 'authenticated');
create policy "authenticated users can read all" on distributions for select using (auth.role() = 'authenticated');
create policy "authenticated users can read all" on distribution_recipients for select using (auth.role() = 'authenticated');
create policy "authenticated users can read all" on activity_log for select using (auth.role() = 'authenticated');
create policy "authenticated users can read own" on notifications for select using (auth.uid() = user_id);

-- פוליסות כתיבה
create policy "authenticated users can insert" on beneficiaries for insert with check (auth.role() = 'authenticated');
create policy "authenticated users can update" on beneficiaries for update using (auth.role() = 'authenticated');
create policy "authenticated users can insert" on families for insert with check (auth.role() = 'authenticated');
create policy "authenticated users can update" on families for update using (auth.role() = 'authenticated');
create policy "authenticated users can insert" on maternity_aids for insert with check (auth.role() = 'authenticated');
create policy "authenticated users can update" on maternity_aids for update using (auth.role() = 'authenticated');
create policy "authenticated users can insert" on loans for insert with check (auth.role() = 'authenticated');
create policy "authenticated users can update" on loans for update using (auth.role() = 'authenticated');
create policy "authenticated users can insert" on loan_payments for insert with check (auth.role() = 'authenticated');
create policy "authenticated users can insert" on distributions for insert with check (auth.role() = 'authenticated');
create policy "authenticated users can update" on distributions for update using (auth.role() = 'authenticated');
create policy "authenticated users can insert" on distribution_recipients for insert with check (auth.role() = 'authenticated');
create policy "authenticated users can update" on distribution_recipients for update using (auth.role() = 'authenticated');
create policy "authenticated users can insert" on activity_log for insert with check (auth.role() = 'authenticated');
create policy "users can update own notifications" on notifications for update using (auth.uid() = user_id);

-- ===================================================
-- פונקציות עזר
-- ===================================================

-- עדכון updated_at אוטומטי
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_families_updated_at before update on families for each row execute function update_updated_at_column();
create trigger update_beneficiaries_updated_at before update on beneficiaries for each row execute function update_updated_at_column();
create trigger update_maternity_aids_updated_at before update on maternity_aids for each row execute function update_updated_at_column();
create trigger update_loans_updated_at before update on loans for each row execute function update_updated_at_column();
create trigger update_distributions_updated_at before update on distributions for each row execute function update_updated_at_column();
