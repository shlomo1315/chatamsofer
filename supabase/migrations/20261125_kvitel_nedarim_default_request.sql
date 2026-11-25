-- קוויטלאך מנדרים: "ברכה והצלחה" שהוכנסה כברירת מחדל (עד 15.11) חוזרת ל"לא צוינה בקשה".
-- הטופס בנדרים לא שולח בקשה (רק שם, בן/בת ושם האם), כך ש-yeshua בשורות האלה לא היה תוכן של הפונה.
-- מתקנים רק שורה שסומנה כברירת מחדל ("סוג בקשה" / "הונח ישועה וברכה"), בלי פרטי בקשה,
-- בבקשה פתוחה (לבדיקה / ממתינה) שלא נערכה ידנית. ראו clearDefaultRequest ב-lib/kvitelNedarim.ts.
-- הערכים הישנים נשמרים ב-kvitel_lines_backup_20261125 לשחזור. הרצה חוזרת לא משנה כלום.

create table if not exists kvitel_lines_backup_20261125 (
  line_id uuid primary key,
  request_id uuid not null,
  request_type text,
  flagged boolean,
  flag_reason text,
  backed_up_at timestamptz not null default now()
);

create temp table kv_fix as
select l.id line_id, l.request_id, l.request_type, l.flagged, l.flag_reason,
  nullif(array_to_string(array(
    select p2 from (
      select regexp_replace(p, '(, )?סוג בקשה$', '') p2, o
      from unnest(string_to_array(l.flag_reason, ' · ')) with ordinality u(p, o)
    ) x
    where p2 !~ '^לא צוין סוג בקשה' and p2 !~ ':\s*$' order by o), ' · '), '') new_reason
from kvitel_requests r join kvitel_request_lines l on l.request_id = r.id
where r.channel = 'nedarim'
  and r.status in ('review', 'pending')
  and l.request_type = 'yeshua'
  and l.request_note is null
  and l.flag_reason ~ '(סוג בקשה|הונח "ישועה וברכה")'
  and r.id::text not in (
    select entity_id::text from activity_log
    where action in ('kvitel_lines_edit', 'kvitel_transcript') and entity_id is not null
  );

insert into kvitel_lines_backup_20261125 (line_id, request_id, request_type, flagged, flag_reason)
select line_id, request_id, request_type, flagged, flag_reason from kv_fix
on conflict (line_id) do nothing;

update kvitel_request_lines l
set request_type = '', flag_reason = f.new_reason, flagged = f.new_reason is not null
from kv_fix f where l.id = f.line_id;

select 'REPORT|fixed', count(distinct request_id), count(*) from kv_fix;
select 'REPORT|backup', count(*) from kvitel_lines_backup_20261125;
