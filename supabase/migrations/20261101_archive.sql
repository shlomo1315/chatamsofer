-- ─────────────────────────────────────────────────────────────────────────────
-- מחלקת ארכיון — אירועים וקבצים (תמונות וסרטונים).
-- הקבצים המקוריים נשמרים ב-Google Drive; כאן רק המטא-דאטה. התמונות המוקטנות
-- נשמרות בדיסק של השרת (ARCHIVE_THUMBS_DIR) ונוצרות מחדש מ-Drive אם חסרות.
-- ⚠️ service_role בלבד (RLS בלי מדיניות): ה-API בודק הרשאות בעצמו.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.archive_events (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  event_date      date not null,
  hebrew_date     text not null,
  hebrew_year     text not null,
  event_type      text not null,
  place           text,
  description     text,
  drive_folder_id text,
  photo_count     int not null default 0,
  video_count     int not null default 0,
  cover_file_ids  uuid[] not null default '{}',
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists archive_events_date_idx on public.archive_events (event_date desc);

create table if not exists public.archive_files (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.archive_events(id) on delete cascade,
  name          text not null,
  kind          text not null check (kind in ('image','video')),
  mime          text,
  size_bytes    bigint,
  width         int,
  height        int,
  duration_sec  int,
  drive_file_id text not null,
  has_thumb     boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists archive_files_event_idx on public.archive_files (event_id, created_at);

alter table public.archive_events enable row level security;
alter table public.archive_files enable row level security;
