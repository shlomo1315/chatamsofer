-- ─────────────────────────────────────────────────────────────────────────────
-- מחלקת קוויטלאך — שלב 1 (לינק, מסך ניהול וקובץ Word).
-- ארבעה ערוצים (לינק, טלפון, מייל, נדרים פלוס) נכנסים לאותן טבלאות.
-- הליבה: lib/kvitel.ts · קליטה: lib/kvitelIngest.ts · Word: lib/kvitelDocx.ts
--
-- ⚠️ כל הטבלאות נגישות ל-service_role בלבד (RLS בלי מדיניות): הטופס הציבורי
-- והמסך בודקים הרשאות בעצמם, כמו שאר מסכי הניהול הכבדים.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── מגישים — מזוהים לפי טלפון (ובערוץ המייל, לפי מייל) ──
create table if not exists public.kvitel_requesters (
  id          uuid primary key default gen_random_uuid(),
  phone       text unique,
  email       text unique,
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint kvitel_requesters_contact check (phone is not null or email is not null)
);

-- ── שמות שמורים — מה שמוצע למגיש בפעם הבאה (בטלפון: "האם לשלוח שוב את השמות...") ──
create table if not exists public.kvitel_saved_names (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.kvitel_requesters(id) on delete cascade,
  person_key    text not null,
  name          text not null,
  relation      text not null check (relation in ('ben','bat')),
  parent_name   text not null,
  request_type  text not null,
  request_note  text,
  last_used_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (requester_id, person_key)
);

-- ── הגשות ──
create table if not exists public.kvitel_requests (
  id             uuid primary key default gen_random_uuid(),
  requester_id   uuid references public.kvitel_requesters(id) on delete set null,
  channel        text not null check (channel in ('web','phone','email','nedarim')),
  status         text not null default 'pending' check (status in ('review','pending','done','cancelled')),
  contact_name   text,
  contact_phone  text,
  contact_email  text,
  -- המקור הגולמי: תמלול השיחה / גוף המייל — כדי שתמיד אפשר יהיה לחזור אליו.
  raw_text       text,
  recording_url  text,
  source_ref     text,
  note           text,
  submitted_at   timestamptz not null default now(),
  done_at        timestamptz,
  done_by        uuid references public.profiles(id) on delete set null
);
create index if not exists kvitel_requests_submitted_idx on public.kvitel_requests (submitted_at desc);
create index if not exists kvitel_requests_status_idx on public.kvitel_requests (status);
create index if not exists kvitel_requests_requester_idx on public.kvitel_requests (requester_id);

-- ── שורות — כל שורה היא שורה אחת בקוויטל ──
create table if not exists public.kvitel_request_lines (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.kvitel_requests(id) on delete cascade,
  position      integer not null default 0,
  name          text not null,
  relation      text not null check (relation in ('ben','bat')),
  parent_name   text not null,
  request_type  text not null,
  request_note  text,
  -- סימון לבדיקה (בהמשך ע"י סוכן ה-AI: כפילות, בקשה חריגה, כתיב).
  flagged       boolean not null default false,
  flag_reason   text,
  created_at    timestamptz not null default now()
);
create index if not exists kvitel_request_lines_request_idx on public.kvitel_request_lines (request_id, position);
create index if not exists kvitel_request_lines_type_idx on public.kvitel_request_lines (request_type);

alter table public.kvitel_requesters    enable row level security;
alter table public.kvitel_saved_names   enable row level security;
alter table public.kvitel_requests      enable row level security;
alter table public.kvitel_request_lines enable row level security;

revoke all on public.kvitel_requesters, public.kvitel_saved_names, public.kvitel_requests, public.kvitel_request_lines
  from anon, authenticated;
grant all on public.kvitel_requesters, public.kvitel_saved_names, public.kvitel_requests, public.kvitel_request_lines
  to service_role;
