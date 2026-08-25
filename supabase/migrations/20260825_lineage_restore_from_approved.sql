-- ═══════════════════════════════════════════════════════════════════════════
-- שחזור מבנה עץ הדורות מהקובץ המאושר
-- הרצה: Supabase → SQL Editor → הדבק הכל → Run
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 מה נשבר: החתם סופר עצמו מעולם לא היה בטבלה. "רבי אברהם שמואל בנימין
-- בעל הכתב סופר" — שהוא *בנו* — נשאר כשורש, וכל אחיו נתלו עליו כ"ילדים":
-- 99 ילדים לצומת אחד, מהם 97 רשומים דור 6 בעוד הורם דור 1.
--
-- מקור האמת: LINEAGE_DATA שב-app/api/admin/lineage/import/route.ts —
-- 235 צמתים מהאקסל המאושר. הוא קובע: לחתם סופר 6 בנים ובנות.
--
-- ⚠️ אישוש עצמאי: 6,712 משפחות שמרו ב-lineage_chain שרשרת שמתחילה
-- ב"מרן החתם סופר", ובדור 2 מופיעים בדיוק אותם ששה. שני מקורות בלתי
-- תלויים מסכימים.
--
-- ⚠️ הקובץ אינו הרסני: אפשר להריץ אותו יותר מפעם אחת. שום שורה אינה
-- נמחקת — רק parent_id ו-generation מתעדכנים.
--
-- גיבויים קיימים: lineage_nodes_backup_20260825, lineage_nodes_backup2_20260825
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── שלב 1: החתם סופר כשורש היחיד ───────────────────────────────────────────
-- ⚠️ מזהה קבוע ולא אקראי — כדי שהרצה חוזרת לא תיצור כפילות.
insert into lineage_nodes (id, name, generation, parent_id, status, relation)
values ('00000000-0000-4000-8000-000000000001', 'מרן החתם סופר זי"ע', 1, null, 'verified', null)
on conflict (id) do update
  set generation = 1, parent_id = null, status = 'verified';


-- ── שלב 2: שלושת הבנים שנעלמו מהעץ ─────────────────────────────────────────
-- ⚠️ נוצרים רק אם אינם קיימים. הם מופיעים בקובץ המאושר ובשרשרות של
-- מאות משפחות, אך נעדרים מהטבלה.
insert into lineage_nodes (id, name, generation, parent_id, status, relation)
select gen_random_uuid(), r.name, 2, '00000000-0000-4000-8000-000000000001', 'verified', null
from lineage_approved_ref r
where r.generation = 2
  and not exists (select 1 from lineage_nodes n where n.name = r.name);


-- ── שלב 3: ששת הבנים תחת החתם סופר ─────────────────────────────────────────
-- ⚠️ לפי *שם* ולא לפי מזהה: המזהים השתנו במיזוגים, השמות לא.
update lineage_nodes n
set parent_id = '00000000-0000-4000-8000-000000000001', generation = 2
from lineage_approved_ref r
where r.generation = 2
  and n.name = r.name
  and n.id <> '00000000-0000-4000-8000-000000000001';


-- ── שלב 4: החזרת ההורות המאושרת לדורות 3-5 ─────────────────────────────────
-- ⚠️ רק כששני השמות חד-משמעיים בעץ. שם שמופיע פעמיים אינו נוגע —
-- שיוך שגוי גרוע מהשארת המצב הקיים.
update lineage_nodes n
set parent_id = p.id
from lineage_approved_ref r
join lineage_approved_ref pr on pr.key = r.parent_key
join lineage_nodes p on p.name = pr.name
where n.name = r.name
  and r.generation between 3 and 5
  and n.parent_id is distinct from p.id
  and n.id <> p.id
  and (select count(*) from lineage_nodes x where x.name = pr.name) = 1
  and (select count(*) from lineage_nodes y where y.name = r.name) = 1;


-- ── שלב 5: כל מי שנשאר ללא הורה — תחת החתם סופר ────────────────────────────
-- 🔴 97 האחים והדודים שנתלו על "הכתב סופר" חוזרים למקומם.
-- ⚠️ מוגבל למי שאין לו הורה כלל: צומת עם הורה תקין אינו זז.
update lineage_nodes
set parent_id = '00000000-0000-4000-8000-000000000001'
where parent_id is null
  and id <> '00000000-0000-4000-8000-000000000001';


-- ── שלב 6: חישוב מחדש של כל הדורות ─────────────────────────────────────────
-- 🔴 זה מה שמתקן את 1,402 הצמתים שישבו בדור שווה או גבוה מהורם — ואת
-- הצביעה האדומה שנבעה מהם.
--
-- ⚠️ הדור נגזר מהמבנה ולא מהערך השמור: אחרי שההורות תוקנה, המרחק
-- מהשורש הוא ההגדרה של "דור". ערך שסותר את המבנה הוא שריד ממיזוג ישן.
with recursive tree(id, depth) as (
  select id, 1 from lineage_nodes where parent_id is null
  union all
  select c.id, t.depth + 1
  from tree t join lineage_nodes c on c.parent_id = t.id
  where t.depth < 40
)
update lineage_nodes n
set generation = t.depth
from tree t
where t.id = n.id and n.generation <> t.depth;

commit;


-- ═══════════════════════════════════════════════════════════════════════════
-- אימות — הרץ אחרי ה-COMMIT
-- תוצאה תקינה: roots=1 · root_name='מרן החתם סופר זי"ע' · cycles=0 ·
--               orphans=0 · bad_gen=0 · sons_of_chatam_sofer=6
-- ═══════════════════════════════════════════════════════════════════════════
select
  (select count(*) from lineage_nodes where parent_id is null) as roots,
  (select name from lineage_nodes where parent_id is null) as root_name,
  (select count(*) from lineage_nodes n join lineage_nodes p on p.id = n.parent_id
     where p.parent_id = n.id) as cycles,
  (select count(*) from lineage_nodes n where n.parent_id is not null
     and not exists (select 1 from lineage_nodes p where p.id = n.parent_id)) as orphans,
  (select count(*) from lineage_nodes n join lineage_nodes p on p.id = n.parent_id
     where n.generation <> p.generation + 1) as bad_gen,
  (select count(*) from lineage_nodes
     where parent_id = '00000000-0000-4000-8000-000000000001') as sons_of_chatam_sofer,
  (select count(*) from lineage_nodes) as total_nodes;
