-- ─────────────────────────────────────────────────────────────────────────────
-- גיליונות — מערך המפיצים, שלב 2: סעודת ההילולא והרשמה מנדרים פלוס.
-- השלוחה בימות המשיח: app/api/webhooks/yemot-gilyonot (lib/gilyonotDistributorPhone.ts)
-- הקליטה מנדרים: lib/gilyonotDistributorNedarim.ts (ההגדרות ב-app_settings)
--
-- ⚠️ service_role בלבד (RLS בלי מדיניות), כמו שאר הגיליונות.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── בקשות להשתתף בסעודת ההילולא ──
-- priority = המבקש מפיץ פעיל בזמן הבקשה (קדימות). מי שאינו מפיץ נרשם בלי קדימות.
create table if not exists public.gilyonot_hilula_requests (
  id               uuid primary key default gen_random_uuid(),
  distributor_id   uuid references public.gilyonot_distributors(id) on delete set null,
  full_name        text,
  phone            text,
  city             text,
  synagogue        text,
  guests           integer not null default 1 check (guests >= 1 and guests <= 50),
  channel          text not null default 'phone' check (channel in ('web','phone','admin')),
  priority         boolean not null default false,
  details          text,
  status           text not null default 'pending' check (status in ('pending','approved','rejected')),
  handled_by       uuid references public.profiles(id) on delete set null,
  handled_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists gilyonot_hilula_requests_list_idx on public.gilyonot_hilula_requests (status, priority desc, created_at);
-- בקשה ממתינה אחת לכל טלפון: בקשה חוזרת מעדכנת את מספר המשתתפים
create unique index if not exists gilyonot_hilula_requests_phone_uq on public.gilyonot_hilula_requests (phone) where phone is not null and status = 'pending';

-- ── נרשמים מנדרים פלוס שלא נכנסו אוטומטית (בית הכנסת תפוס, חסר טלפון או בית כנסת) ──
-- status: pending = ממתין לבדיקה ידנית · approved = נוסף כמפיץ · dismissed = נדחה
create table if not exists public.gilyonot_distributor_applications (
  id               uuid primary key default gen_random_uuid(),
  full_name        text,
  phone            text,
  email            text,
  city             text,
  synagogue        text,
  address          text,
  quantity         integer check (quantity is null or (quantity >= 0 and quantity <= 100000)),
  reason           text not null check (reason in ('synagogue_taken','no_phone','no_synagogue','no_name')),
  conflict_id      uuid references public.gilyonot_distributors(id) on delete set null,
  source_ref       text unique,
  status           text not null default 'pending' check (status in ('pending','approved','dismissed')),
  distributor_id   uuid references public.gilyonot_distributors(id) on delete set null,
  handled_by       uuid references public.profiles(id) on delete set null,
  handled_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists gilyonot_distributor_applications_open_idx on public.gilyonot_distributor_applications (created_at desc) where status = 'pending';

alter table public.gilyonot_hilula_requests          enable row level security;
alter table public.gilyonot_distributor_applications enable row level security;
