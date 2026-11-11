-- ── גיליונות: שליחה מתוזמנת ופירוט קליקים לפי קישור ──
-- סטטוס חדש 'scheduled': הגיליון נעול לעריכה וממתין לשעה. ה-worker (בדיקה כל דקה)
-- מעביר אותו ל-'sending' כשהגיע הזמן, ומשם זה אותו מסלול כמו שליחה ידנית.
alter table public.gilyonot_issues
  add column if not exists scheduled_at       timestamptz,
  add column if not exists scheduled_list_ids jsonb,
  add column if not exists schedule_error     text;

alter table public.gilyonot_issues drop constraint if exists gilyonot_issues_status_check;
alter table public.gilyonot_issues
  add constraint gilyonot_issues_status_check check (status in ('draft','scheduled','sending','sent'));

create index if not exists gilyonot_issues_scheduled_idx on public.gilyonot_issues (scheduled_at) where status = 'scheduled';

-- ── הקלקות לפי קישור: מאירועי Resend (email_events), מקובצות לפי כתובת ──
-- טוקנים אישיים בכתובת (הורדה, הסרה) מוחלפים ב-:token כדי שיתקבצו לשורה אחת.
create index if not exists email_events_type_resend on public.email_events (event_type, resend_id);

create or replace function public.gilyonot_link_clicks(p_issue uuid)
returns table (link text, clicks bigint, unique_clickers bigint)
language sql
stable
security definer
set search_path = public
as $$
  select regexp_replace(e.link_url, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':token', 'gi') as link,
         count(*) as clicks,
         count(distinct e.resend_id) as unique_clickers
  from public.email_events e
  join public.gilyonot_deliveries d on d.resend_id = e.resend_id
  where d.issue_id = p_issue and e.event_type = 'clicked' and e.link_url is not null
  group by 1
  order by 2 desc;
$$;

revoke all on function public.gilyonot_link_clicks(uuid) from public, anon, authenticated;
grant execute on function public.gilyonot_link_clicks(uuid) to service_role;

notify pgrst, 'reload schema';
