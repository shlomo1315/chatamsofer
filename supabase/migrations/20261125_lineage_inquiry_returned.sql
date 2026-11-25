-- בירור סדר הדורות: "נשלח לבירור" ו"חזר מבירור".
--
-- lineage_link_sent_at (קיים מ-20260809) = נשלח קישור לתיקון.
-- lineage_inquiry_returned_at (חדש) = המשפחה השיבה דרך הקישור (תיקון או הערה).
-- התווית מחושבת ב-lib/lineageInquiry.ts ומוצגת רק למי שעדיין בבדיקה מעמיקה.

alter table public.beneficiaries
  add column if not exists lineage_inquiry_returned_at timestamptz;

-- השלמה לאחור: מי שקיבל קישור אישי בעבר ולא סומן.
update public.beneficiaries b
   set lineage_link_sent_at = i.sent
  from (select beneficiary_id, max(created_at) as sent
          from public.lineage_share_invites
         where beneficiary_id is not null and mode = 'order'
         group by beneficiary_id) i
 where b.id = i.beneficiary_id
   and b.lineage_link_sent_at is null;

-- השלמה לאחור: מי שכבר השיב — תיקון שנשמר (activity_log) או הערה מהקישור.
update public.beneficiaries b
   set lineage_inquiry_returned_at = r.answered
  from (
    select entity_id::text::uuid as beneficiary_id, max(created_at) as answered
      from public.activity_log
     where action = 'lineage_review_applied' and entity_type = 'beneficiary'
       and entity_id::text ~ '^[0-9a-f-]{36}$'
     group by entity_id
    union all
    select i.beneficiary_id, max(s.created_at)
      from public.lineage_review_suggestions s
      join public.lineage_share_invites i on i.token = s.token
     where i.beneficiary_id is not null
     group by i.beneficiary_id
  ) r
 where b.id = r.beneficiary_id
   and (b.lineage_inquiry_returned_at is null or b.lineage_inquiry_returned_at < r.answered);

select 'REPORT|נשלח לבירור (בבדיקה מעמיקה): ' || count(*) filter (where lineage_link_sent_at is not null)
     || ' | חזרו מבירור: ' || count(*) filter (where lineage_inquiry_returned_at is not null)
     || ' | בבדיקה מעמיקה סה"כ: ' || count(*)
  from public.beneficiaries where eligibility_status = 'deep_review';
