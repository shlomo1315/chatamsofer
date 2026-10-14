-- ─────────────────────────────────────────────────────────────────────────────
-- גיליונות החתם סופר — רשימת תפוצה שבועית, ארכיון גיליונות ושליחה עם מעקב.
-- הליבה: lib/gilyonot.ts · מייל: lib/gilyonotMail.ts · שליחה: lib/gilyonotSender.ts
--
-- ⚠️ כל הטבלאות נגישות ל-service_role בלבד (RLS בלי מדיניות): הטופס הציבורי,
-- נקודות המעקב והמסך בודקים בעצמם, כמו בקוויטלאך.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── נרשמים — מייל אחד = שורה אחת, מכל הערוצים (אתר, נדרים, ידני, ייבוא) ──
create table if not exists public.gilyonot_subscribers (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique check (email = lower(email)),
  full_name        text,
  source           text not null check (source in ('web','nedarim','manual','import')),
  source_ref       text,
  status           text not null default 'active' check (status in ('active','unsubscribed')),
  consent_at       timestamptz,
  unsubscribed_at  timestamptz,
  -- טוקן אקראי לקישור ההסרה, כדי שאי אפשר יהיה להסיר כתובת של מישהו אחר
  token            uuid not null unique default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists gilyonot_subscribers_created_idx on public.gilyonot_subscribers (created_at desc);

-- ── גיליונות — כל שבוע: קובץ, פרשה ונוסח המייל ──
create table if not exists public.gilyonot_issues (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  parasha       text not null,
  subject       text not null,
  intro         text,
  file_path     text not null,
  file_name     text not null,
  file_size     integer,
  status        text not null default 'draft' check (status in ('draft','sending','sent')),
  total_count   integer not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);
create index if not exists gilyonot_issues_created_idx on public.gilyonot_issues (created_at desc);

-- ── משלוחים — שורה לכל נמען בכל גיליון: מצב השליחה, פתיחה והורדה ──
-- הרשימה מוקפאת ברגע השליחה. אם השליחה נפסקת באמצע, ממשיכים מהשורות ב-pending.
create table if not exists public.gilyonot_deliveries (
  id              uuid primary key default gen_random_uuid(),
  issue_id        uuid not null references public.gilyonot_issues(id) on delete cascade,
  subscriber_id   uuid references public.gilyonot_subscribers(id) on delete set null,
  email           text not null,
  token           uuid not null unique default gen_random_uuid(),
  status          text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts        integer not null default 0,
  error           text,
  resend_id       text,
  sent_at         timestamptz,
  opened_at       timestamptz,
  open_count      integer not null default 0,
  downloaded_at   timestamptz,
  download_count  integer not null default 0,
  unique (issue_id, email)
);
create index if not exists gilyonot_deliveries_pending_idx on public.gilyonot_deliveries (issue_id) where status = 'pending';

-- ── מונים לארכיון ──
create or replace view public.gilyonot_issue_stats with (security_invoker = true) as
select issue_id,
       count(*) filter (where status = 'sent')    as sent_count,
       count(*) filter (where status = 'failed')  as failed_count,
       count(*) filter (where status = 'pending') as pending_count,
       count(opened_at)                           as opened_count,
       count(downloaded_at)                       as downloaded_count
from public.gilyonot_deliveries
group by issue_id;

-- ── רישום פתיחה או הורדה, אטומי. הורדה נחשבת גם כפתיחה (יש תוכנות מייל שחוסמות תמונות). ──
create or replace function public.gilyonot_track(p_token uuid, p_kind text)
returns uuid
language sql
security definer
set search_path = public
as $$
  update public.gilyonot_deliveries set
    open_count     = open_count + case when p_kind = 'open' then 1 else 0 end,
    opened_at      = coalesce(opened_at, now()),
    download_count = download_count + case when p_kind = 'download' then 1 else 0 end,
    downloaded_at  = case when p_kind = 'download' then coalesce(downloaded_at, now()) else downloaded_at end
  where token = p_token
  returning issue_id;
$$;

alter table public.gilyonot_subscribers enable row level security;
alter table public.gilyonot_issues      enable row level security;
alter table public.gilyonot_deliveries  enable row level security;
revoke all on public.gilyonot_subscribers, public.gilyonot_issues, public.gilyonot_deliveries, public.gilyonot_issue_stats from anon, authenticated;
grant all on public.gilyonot_subscribers, public.gilyonot_issues, public.gilyonot_deliveries to service_role;
grant select on public.gilyonot_issue_stats to service_role;
revoke all on function public.gilyonot_track(uuid, text) from public, anon, authenticated;
grant execute on function public.gilyonot_track(uuid, text) to service_role;
