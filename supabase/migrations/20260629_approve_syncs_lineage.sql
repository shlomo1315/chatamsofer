-- כשמשפחה מאושרת (eligibility_status → 'approved'), הנוד המקושר בעץ הדורות
-- הופך אוטומטית ל'verified'. טריגר אחד מכסה את כל מסלולי האישור:
-- כרטסת הצאצא, טופס עריכה, ואישור אוטומטי בעקבות אישור בקשה.

create or replace function public.sync_lineage_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.eligibility_status = 'approved' and new.lineage_node_id is not null then
    update public.lineage_nodes
       set status = 'verified',
           updated_at = now()
     where id = new.lineage_node_id
       and status is distinct from 'verified';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_lineage_on_approval on public.beneficiaries;

create trigger trg_sync_lineage_on_approval
after insert or update of eligibility_status, lineage_node_id on public.beneficiaries
for each row
execute function public.sync_lineage_on_approval();

-- יישור רטרואקטיבי: כל המשפחות שכבר מאושרות → הנודים שלהן ל'verified'
update public.lineage_nodes ln
   set status = 'verified', updated_at = now()
  from public.beneficiaries b
 where b.lineage_node_id = ln.id
   and b.eligibility_status = 'approved'
   and ln.status is distinct from 'verified';
