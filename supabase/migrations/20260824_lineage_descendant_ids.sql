-- כל מזהי הצמתים בתת-העץ שמתחת לצומת נתון, כולל הצומת עצמו.
--
-- 🔴 נדרש לדוח "כל הצאצאים תחת X": סינון לפי מספר דור מחזיר את כל מי
-- שנמצא באותו דור בכל העץ, ולא את הענף של אדם מסוים. הדוח נשאל
-- "אברהם סופר מדור 2 — מי כל הצאצאים תחתיו", וזו התשובה.
--
-- ⚠️ הרקורסיה מוגבלת בעומק: מעגל ב-parent_id (שלא אמור לקרות אך קרה
-- בעבר במיזוגים) היה מייצר לולאה אינסופית שמקפיאה את השאילתה.
create or replace function public.lineage_descendant_ids(root uuid)
returns table (id uuid)
language sql
stable
as $$
  with recursive sub as (
    select n.id, 0 as depth
    from public.lineage_nodes n
    where n.id = root
    union all
    select n.id, s.depth + 1
    from public.lineage_nodes n
    join sub s on n.parent_id = s.id
    where s.depth < 20
  )
  select sub.id from sub;
$$;

comment on function public.lineage_descendant_ids(uuid) is
  'כל הצמתים בתת-העץ מתחת לצומת (כולל עצמו). משמש את דוח הצאצאים לפי ענף.';
