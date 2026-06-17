-- מאגר מקומי של ערים ורחובות ממשרד הפנים (data.gov.il).
-- נטען פעם בלילה (cron 00:00) ומוגש מיידית מהמערכת — בלי המתנה ל-API חיצוני.

create table if not exists public.gov_cities (
  name       text primary key,
  synced_at  timestamptz not null default now()
);

create table if not exists public.gov_streets (
  city       text not null,
  street     text not null,
  synced_at  timestamptz not null default now(),
  primary key (city, street)
);

create index if not exists gov_streets_city_idx on public.gov_streets (city);

alter table public.gov_cities  enable row level security;
alter table public.gov_streets enable row level security;

-- קריאה מותרת לכל מחובר; כתיבה רק דרך service-role (cron / שרת)
drop policy if exists gov_cities_read  on public.gov_cities;
drop policy if exists gov_streets_read on public.gov_streets;
create policy gov_cities_read  on public.gov_cities  for select to authenticated using (true);
create policy gov_streets_read on public.gov_streets for select to authenticated using (true);
