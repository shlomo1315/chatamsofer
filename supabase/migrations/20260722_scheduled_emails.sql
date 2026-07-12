-- ─────────────────────────────────────────────────────────────────────────────
-- תור מיילים מתוזמנים (גנרי).
--
-- כל פיצ'ר שצריך "שלח מייל בעוד N ימים" רושם כאן שורה, ו-worker אחד
-- (lib/scheduledMail.ts, נקרא כל שעה מ-instrumentation.ts) שולח כשמגיע הזמן.
--
-- מועד השליחה (send_after) כבר מותאם לשבת/חג בעת הקביעה, ע"י
-- lib/jewishCalendar.ts. ה-worker בודק שוב לפני השליחה — הגנה כפולה.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.scheduled_emails (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,             -- 'gratitude_letter' | 'recovery_survey'
  entity_table text not null,             -- 'maternity_aids'
  entity_id    uuid not null,
  to_email     text not null,
  send_after   timestamptz not null,
  status       text not null default 'pending'
               check (status in ('pending','sent','cancelled','failed')),
  attempts     int  not null default 0,
  last_error   text,
  payload      jsonb not null default '{}'::jsonb,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ההגנה המרכזית מפני שליחה כפולה: מייל אחד מכל סוג לכל ישות.
create unique index if not exists scheduled_emails_unique
  on public.scheduled_emails (kind, entity_table, entity_id);

-- האינדקס שה-worker משתמש בו (partial — נשאר קטן ומהיר)
create index if not exists scheduled_emails_due
  on public.scheduled_emails (send_after) where status = 'pending';

alter table public.scheduled_emails enable row level security;
-- ללא policies: גישה דרך service-role בלבד (עקבי עם app_settings)

-- ─────────────────────────────────────────────────────────────────────────────
-- עטיפות ל-advisory lock, כדי שה-worker יוכל לנעול דרך RPC.
-- מונע ריצה כפולה ושליחה כפולה כשרצות שתי מכונות (Railway).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.try_worker_lock(p_key bigint)
returns boolean language sql security definer as $$
  select pg_try_advisory_lock(p_key);
$$;

create or replace function public.release_worker_lock(p_key bigint)
returns boolean language sql security definer as $$
  select pg_advisory_unlock(p_key);
$$;

revoke all on function public.try_worker_lock(bigint)     from public, anon, authenticated;
revoke all on function public.release_worker_lock(bigint) from public, anon, authenticated;
