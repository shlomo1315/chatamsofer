-- תיקון סנכרון ארכיון המייל + שיוך מחלקה לכל מייל נכנס.
--
-- הבאג: legacyMailSync עשה upsert עם onConflict: 'gmail_message_id',
-- אבל האינדקס היה PARTIAL (where gmail_message_id is not null).
-- Postgres לא יכול להשתמש ב-partial index כ-arbiter ל-ON CONFLICT,
-- ולכן כל מייל נכשל בשגיאה 42P10 והסנכרון ייבא 0 מיילים - בשקט.

-- ============ 1. תיקון האינדקס ============
-- מחליפים את ה-partial index ב-unique constraint מלא.
-- (NULL מותר ב-unique, ולכן אין צורך ב-partial)

drop index if exists public.inbound_emails_gmail_message_id_idx;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inbound_emails_gmail_message_id_key'
  ) then
    alter table public.inbound_emails
      add constraint inbound_emails_gmail_message_id_key unique (gmail_message_id);
  end if;
end $$;


-- ============ 2. שיוך מחלקה לדואר נכנס ============
-- עד היום "המחלקה" נגזרה מ-to_email בזמן ריצה. עכשיו היא נשמרת בשורה עצמה,
-- כדי שאפשר יהיה לסנן ארכיון לפי מחלקה ולדווח כמה מיילים יש בכל אחת.

alter table public.inbound_emails
  add column if not exists department text;

create index if not exists inbound_emails_department
  on public.inbound_emails (department);

create index if not exists inbound_emails_source
  on public.inbound_emails (source);


-- ============ 3. חשבונות Gmail מרובים ============
-- עד היום היו שני טוקנים בודדים ב-app_settings (ראשי + ארכיון אחד).
-- עכשיו: טבלה אמיתית, כל תיבה עם שיוך מחלקה ומעקב סנכרון משלה.

create table if not exists public.gmail_accounts (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  label           text,                    -- שם תצוגה, למשל "מייל הודעות ישן"
  department      text not null,           -- מפתח מ-lib/departments.ts
  refresh_token   text not null,
  is_active       boolean not null default true,
  -- מעקב סנכרון
  last_sync_at    timestamptz,
  last_sync_epoch bigint,                  -- חותמת לסנכרון אינקרמנטלי (after:)
  total_synced    int not null default 0,  -- סה"כ מיילים שנקלטו מהתיבה הזו
  last_sync_count int not null default 0,  -- כמה נקלטו בסנכרון האחרון
  last_error      text,
  created_at      timestamptz not null default now()
);

alter table public.gmail_accounts enable row level security;
-- ללא policies: service-role בלבד (מכיל refresh tokens)


-- ============ 4. לוג סנכרונים ============
-- היסטוריה מלאה - מתי, לאיזו תיבה, כמה נקלטו, כמה נכשלו.

create table if not exists public.gmail_sync_runs (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references public.gmail_accounts(id) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  scanned     int not null default 0,
  imported    int not null default 0,
  matched     int not null default 0,
  failed      int not null default 0,
  error       text
);

create index if not exists gmail_sync_runs_account
  on public.gmail_sync_runs (account_id, started_at desc);

alter table public.gmail_sync_runs enable row level security;
drop policy if exists gmail_sync_runs_staff_all on public.gmail_sync_runs;
create policy gmail_sync_runs_staff_all on public.gmail_sync_runs
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
