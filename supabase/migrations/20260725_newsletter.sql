-- מערכת דיוור (ניוזלטר) — קמפיינים, תור נמענים, מעקב, והסרה מרשימת תפוצה.

-- ============ קמפיינים ============

create table if not exists public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  subject         text not null,                    -- תומך במשתני מיזוג
  preheader       text,
  from_department text not null default 'main',     -- מפתח מ-lib/departments.ts
  content         jsonb not null default '[]'::jsonb,  -- מערך בלוקים
  content_mode    text not null default 'blocks' check (content_mode in ('blocks','html')),
  raw_html        text,                             -- כש-content_mode='html'
  segment         jsonb not null default '{}'::jsonb,  -- הגדרת הקהל
  attachments     jsonb not null default '[]'::jsonb,
  status          text not null default 'draft'
                  check (status in ('draft','scheduled','sending','paused','sent','cancelled','failed')),
  scheduled_at    timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  total_count     int not null default 0,
  sent_count      int not null default 0,
  failed_count    int not null default 0,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists campaigns_status on public.campaigns (status);
create index if not exists campaigns_created on public.campaigns (created_at desc);

alter table public.campaigns enable row level security;
drop policy if exists campaigns_staff_all on public.campaigns;
create policy campaigns_staff_all on public.campaigns
  for all to authenticated using (public.is_staff()) with check (public.is_staff());


-- ============ נמענים (התור) ============
-- כשלוחצים "שלח", הסגמנט ממומש לשורות כאן, כל אחת עם סנאפשוט של
-- משתני המיזוג שלה. worker שולף batch ושולח דרך Resend Batch API.
-- אם השרת נופל באמצע — הוא ממשיך מהשורות שנשארו pending. אפס כפילויות.

create table if not exists public.campaign_recipients (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  email          text not null,
  merge_data     jsonb not null default '{}'::jsonb,  -- סנאפשוט המשתנים
  status         text not null default 'pending'
                 check (status in ('pending','sent','failed','skipped')),
  resend_id      text,                                -- המפתח לכל המעקב
  error          text,
  attempts       int not null default 0,
  sent_at        timestamptz,
  -- מעקב (מתעדכן מה-webhook)
  delivered_at   timestamptz,
  opened_at      timestamptz,
  open_count     int not null default 0,
  clicked_at     timestamptz,
  click_count    int not null default 0,
  bounced_at     timestamptz,
  complained_at  timestamptz
);

-- כתובת אחת פעם אחת בקמפיין
create unique index if not exists campaign_recipients_unique
  on public.campaign_recipients (campaign_id, email);

-- האינדקס שה-worker משתמש בו (partial — נשאר מהיר גם עם מיליון שורות)
create index if not exists campaign_recipients_queue
  on public.campaign_recipients (campaign_id) where status = 'pending';

create index if not exists campaign_recipients_resend
  on public.campaign_recipients (resend_id) where resend_id is not null;

alter table public.campaign_recipients enable row level security;
drop policy if exists campaign_recipients_staff_all on public.campaign_recipients;
create policy campaign_recipients_staff_all on public.campaign_recipients
  for all to authenticated using (public.is_staff()) with check (public.is_staff());


-- ============ אירועי מעקב ============

create table if not exists public.email_events (
  id           uuid primary key default gen_random_uuid(),
  resend_id    text not null,
  recipient_id uuid references public.campaign_recipients(id) on delete cascade,
  event_type   text not null,   -- delivered|opened|clicked|bounced|complained|delivery_delayed
  link_url     text,            -- ב-clicked: איזה קישור בדיוק
  user_agent   text,
  raw          jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists email_events_resend on public.email_events (resend_id);
create index if not exists email_events_recipient on public.email_events (recipient_id, created_at desc);

alter table public.email_events enable row level security;
drop policy if exists email_events_staff_all on public.email_events;
create policy email_events_staff_all on public.email_events
  for all to authenticated using (public.is_staff()) with check (public.is_staff());


-- ============ הסרה מרשימת תפוצה ============
-- חובה חוקית (חוק התקשורת תיקון 40) ותנאי של Gmail לשולחים מסיביים.
-- מי שכאן לא ייכלל בשום קמפיין עתידי — לא ניתן לעקוף.

create table if not exists public.unsubscribes (
  email          text primary key,
  beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  reason         text,      -- 'user' | 'bounce' | 'complaint' | 'manual'
  campaign_id    uuid references public.campaigns(id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.unsubscribes enable row level security;
drop policy if exists unsubscribes_staff_all on public.unsubscribes;
create policy unsubscribes_staff_all on public.unsubscribes
  for all to authenticated using (public.is_staff()) with check (public.is_staff());


-- ============ סגמנטים שמורים ============

create table if not exists public.segments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  definition jsonb not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.segments enable row level security;
drop policy if exists segments_staff_all on public.segments;
create policy segments_staff_all on public.segments
  for all to authenticated using (public.is_staff()) with check (public.is_staff());


-- ============ רשימות חיצוניות (העלאה מ-Excel) ============

create table if not exists public.contact_lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id      uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.contact_lists(id) on delete cascade,
  email   text not null,
  data    jsonb not null default '{}'::jsonb,  -- שדות נוספים למיזוג
  unique (list_id, email)
);

alter table public.contact_lists enable row level security;
drop policy if exists contact_lists_staff_all on public.contact_lists;
create policy contact_lists_staff_all on public.contact_lists
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

alter table public.contacts enable row level security;
drop policy if exists contacts_staff_all on public.contacts;
create policy contacts_staff_all on public.contacts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());


-- ============ resend_id בדואר היוצא ============
-- העמודה קיימת בסכימה אך מעולם לא נכתבה (lib/sendMail.ts זרק את data.id).
-- בלעדיה אין דרך לקשר אירועי מסירה/פתיחה/קליק למייל. תוקן בקוד.

create index if not exists sent_emails_resend_id
  on public.sent_emails (resend_id) where resend_id is not null;
