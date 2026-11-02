-- תאריך אישור לידה: מתי הלידה אושרה ליולדת (מעבר לסטטוס 'active').
alter table public.maternity_aids add column if not exists approved_at timestamptz;
create index if not exists maternity_aids_approved_at_idx on public.maternity_aids (approved_at);

-- מילוי אחורה מיומן הפעולות: האישור האחרון של כל תיק מאושר.
update public.maternity_aids m
set approved_at = l.at
from (
  select entity_id, max(created_at) as at
  from public.activity_log
  where action = 'maternity_status_changed' and details->>'to' = 'active'
  group by entity_id
) l
where l.entity_id = m.id and m.status in ('active', 'completed') and m.approved_at is null;
