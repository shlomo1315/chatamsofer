-- ── גיליונות: קליקים והסרות לכל משלוח, למסך הסטטיסטיקה ──
alter table public.gilyonot_deliveries
  add column if not exists clicked_at      timestamptz,
  add column if not exists click_count     integer not null default 0,
  add column if not exists unsubscribed_at timestamptz;

create or replace view public.gilyonot_issue_stats with (security_invoker = true) as
select issue_id,
       count(*) filter (where status = 'sent')    as sent_count,
       count(*) filter (where status = 'failed')  as failed_count,
       count(*) filter (where status = 'pending') as pending_count,
       count(opened_at)                           as opened_count,
       count(downloaded_at)                       as downloaded_count,
       count(delivered_at)                        as delivered_count,
       count(bounced_at)                          as bounced_count,
       count(complained_at)                       as complained_count,
       count(clicked_at)                          as clicked_count,
       count(unsubscribed_at)                     as unsubscribed_count
from public.gilyonot_deliveries
group by issue_id;

grant select on public.gilyonot_issue_stats to service_role;
