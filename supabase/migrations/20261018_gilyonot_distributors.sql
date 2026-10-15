-- ─────────────────────────────────────────────────────────────────────────────
-- גיליונות החתם סופר — מערך המפיצים.
-- מפיץ = אדם שמקבל כמות גיליונות מודפסים ומחלק אותם (בבית כנסת, בעיר).
-- הליבה: lib/gilyonotDistributors.ts · כניסת מפיץ: lib/gilyonotDistributorAuth.ts
-- מסך הניהול: app/admin/gilyonot (לשונית "מפיצים") · ממשק המפיץ: app/gilyonot/mefitz
--
-- ⚠️ כל הטבלאות נגישות ל-service_role בלבד (RLS בלי מדיניות), כמו שאר הגיליונות.
--
-- מתוכנן לשלבים הבאים, והמבנה כבר מתאים להם:
--   • ימות המשיח: אותן פעולות מהטלפון → אירוע עם channel='phone'.
--   • הרשמה מנדרים פלוס: source='nedarim', ובדיקה שאין מפיץ פעיל באותו בית כנסת.
--   • סעודת ההילולא: אירוע kind='hilula' עם הבקשה, וקדימות לפי status='active'.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.gilyonot_distributors (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  -- טלפון מנורמל (05XXXXXXXX), מייל באותיות קטנות, ת.ז. בספרות בלבד
  phone            text,
  phone2           text,
  email            text check (email is null or email = lower(email)),
  id_number        text,
  city             text,
  address          text,
  synagogue        text,
  -- כמה גיליונות המפיץ אמור לקבל בכל שבוע
  quantity         integer not null default 0 check (quantity >= 0 and quantity <= 100000),
  notes            text,
  status           text not null default 'active' check (status in ('active','removed')),
  source           text not null default 'manual' check (source in ('manual','import','nedarim','phone')),
  removed_at       timestamptz,
  removed_reason   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists gilyonot_distributors_city_idx on public.gilyonot_distributors (status, city);
create index if not exists gilyonot_distributors_phone_idx on public.gilyonot_distributors (phone) where phone is not null;
create index if not exists gilyonot_distributors_phone2_idx on public.gilyonot_distributors (phone2) where phone2 is not null;
create index if not exists gilyonot_distributors_email_idx on public.gilyonot_distributors (email) where email is not null;
create index if not exists gilyonot_distributors_idnum_idx on public.gilyonot_distributors (id_number) where id_number is not null;
create index if not exists gilyonot_distributors_syn_idx on public.gilyonot_distributors (status, city, synagogue);

-- ── יומן פניות ודיווחים: כל מה שהמפיץ (או המשרד) עשה ──
-- status: open = ממתין לטיפול במשרד · done = טופל/בוצע · rejected = נדחה
create table if not exists public.gilyonot_distributor_events (
  id               uuid primary key default gen_random_uuid(),
  distributor_id   uuid not null references public.gilyonot_distributors(id) on delete cascade,
  kind             text not null check (kind in ('issue','received','increase','decrease','note','address','leave','join','admin_edit','hilula')),
  channel          text not null default 'web' check (channel in ('web','phone','admin','nedarim')),
  -- כמות: שהתקבלה (received), או הכמות החדשה המבוקשת (increase/decrease)
  quantity         integer check (quantity is null or (quantity >= 0 and quantity <= 100000)),
  details          text,
  -- לפני/אחרי, למשל כתובת ישנה וחדשה
  old_value        jsonb,
  new_value        jsonb,
  status           text not null default 'open' check (status in ('open','done','rejected')),
  handled_by       uuid references public.profiles(id) on delete set null,
  handled_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists gilyonot_distributor_events_dist_idx on public.gilyonot_distributor_events (distributor_id, created_at desc);
create index if not exists gilyonot_distributor_events_open_idx on public.gilyonot_distributor_events (created_at desc) where status = 'open';

-- ── קודי כניסה חד-פעמיים לממשק המפיץ (נשמר רק hash) ──
-- הקוד קשור למזהה הכניסה ("phone:05..."), ולא לשורה: אדם אחד יכול להפיץ
-- בכמה בתי כנסת, והוא רואה את כולם בכניסה אחת.
create table if not exists public.gilyonot_distributor_codes (
  id               uuid primary key default gen_random_uuid(),
  login_key        text not null,
  code_hash        text not null,
  attempts         integer not null default 0,
  expires_at       timestamptz not null,
  used_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists gilyonot_distributor_codes_key_idx on public.gilyonot_distributor_codes (login_key, created_at desc);

-- ── הודעות שנשלחו למפיצים (לכולם או לפי עיר) ──
create table if not exists public.gilyonot_distributor_messages (
  id               uuid primary key default gen_random_uuid(),
  subject          text not null,
  body             text not null,
  city             text,             -- null = כל המפיצים
  recipients       integer not null default 0,
  sent_count       integer not null default 0,
  failed_count     integer not null default 0,
  skipped_count    integer not null default 0, -- מפיצים בלי מייל
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

-- ── הגדרות המערך: שורה אחת ──
-- agent_hours: [{ "day": 0-6 (0=ראשון), "from": "09:00", "to": "13:00" }, ...] לפי שעון ישראל
create table if not exists public.gilyonot_distributor_settings (
  id               integer primary key default 1 check (id = 1),
  courier_name     text,
  courier_email    text,
  agent_phone      text,
  agent_hours      jsonb not null default '[]'::jsonb,
  updated_at       timestamptz not null default now()
);
insert into public.gilyonot_distributor_settings (id) values (1) on conflict (id) do nothing;

alter table public.gilyonot_distributors           enable row level security;
alter table public.gilyonot_distributor_events     enable row level security;
alter table public.gilyonot_distributor_codes      enable row level security;
alter table public.gilyonot_distributor_messages   enable row level security;
alter table public.gilyonot_distributor_settings   enable row level security;
