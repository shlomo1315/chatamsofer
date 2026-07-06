-- תיקון נגישות עץ הדורות: כל אב של צומת מאומת שעדיין "ממתין" → מאומת.
-- בורר סדר הדורות בטופס הרישום מנווט אך ורק דרך צמתים מאומתים, ולכן שם מאושר
-- שאחד מאבותיו נשאר "ממתין" אינו נגיש כלל לנרשמים הבאים. כאן מאמתים את כל
-- שרשראות האבות של הצמתים המאומתים, כך שכל שם מאושר יופיע לכולם.
with recursive anc as (
  select parent_id as id
    from public.lineage_nodes
   where status = 'verified' and parent_id is not null
  union
  select ln.parent_id
    from public.lineage_nodes ln
    join anc on ln.id = anc.id
   where ln.parent_id is not null
)
update public.lineage_nodes
   set status = 'verified'
 where id in (select id from anc where id is not null)
   and status is distinct from 'verified';
