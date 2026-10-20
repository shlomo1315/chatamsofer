-- ─────────────────────────────────────────────────────────────────────────────
-- גיליונות: עורך מייל מתקדם, תבניות שמורות ומעקב מסירה וחזרות מ-Resend.
-- ניקוי ה-HTML: lib/gilyonotRichHtml.ts · מייל: lib/gilyonotMail.ts
-- ─────────────────────────────────────────────────────────────────────────────

-- גוף המייל מהעורך (HTML נקי) ועיצוב החלקים הקבועים (כותרת, כפתור, פוטר).
alter table public.gilyonot_issues
  add column if not exists body_html text,
  add column if not exists design    jsonb not null default '{}'::jsonb;

-- ── תבניות שמורות ──
create table if not exists public.gilyonot_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  subject    text,
  body_html  text,
  design     jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gilyonot_templates_created_idx on public.gilyonot_templates (created_at desc);

-- ── אירועי Resend לכל משלוח: נמסר, חזר, סומן כספאם ──
alter table public.gilyonot_deliveries
  add column if not exists delivered_at  timestamptz,
  add column if not exists bounced_at    timestamptz,
  add column if not exists bounce_type   text,
  add column if not exists complained_at timestamptz;
create index if not exists gilyonot_deliveries_resend_idx on public.gilyonot_deliveries (resend_id) where resend_id is not null;

create or replace view public.gilyonot_issue_stats with (security_invoker = true) as
select issue_id,
       count(*) filter (where status = 'sent')    as sent_count,
       count(*) filter (where status = 'failed')  as failed_count,
       count(*) filter (where status = 'pending') as pending_count,
       count(opened_at)                           as opened_count,
       count(downloaded_at)                       as downloaded_count,
       count(delivered_at)                        as delivered_count,
       count(bounced_at)                          as bounced_count,
       count(complained_at)                       as complained_count
from public.gilyonot_deliveries
group by issue_id;

alter table public.gilyonot_templates enable row level security;
revoke all on public.gilyonot_templates, public.gilyonot_issue_stats from anon, authenticated;
grant all on public.gilyonot_templates to service_role;
grant select on public.gilyonot_issue_stats to service_role;
