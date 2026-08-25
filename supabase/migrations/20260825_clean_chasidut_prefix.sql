-- ─────────────────────────────────────────────────────────────────────────────
-- ניקוי המילה "חסידות" מתחילת שם הקהילה.
--
-- 🔴 331 משפחות נרשמו כ"חסידות באיאן" / "חסידי גור" / "חסיד בעלזא" —
-- תיאור מיותר לפני שם החצר. התוצאה: 102 ערכים שונים שבפועל הם 64,
-- ו"גור" הופיעה כשלוש קהילות נפרדות ("חסידות גור", "חסידי גור",
-- "חסיד גור") שלא התאחדו בשום דוח.
--
-- ⚠️ רק כ*קידומת*, ולא בכל מקום בערך. "קהל חסידי ירושלים" (89 משפחות)
-- הוא שם הקהילה עצמה, ומחיקת המילה מתוכו הייתה משבשת אותו. כך גם
-- "כלל חסידי", "קהל חסידים" ו"מרכז חסידי ויזניץ".
--
-- ⚠️ ערך שכולו המילה ("חסידות" לבדה — 67 משפחות) הופך ל"כלל חסידי"
-- ולא מתרוקן: זה המידע היחיד שיש על המשפחות האלה בשדה, ומחיקה הייתה
-- מוחקת אותו. "כלל חסידי" הוא מונח מקובל וכבר היה קיים במאגר.
--
-- הרץ ב-25.08.2026 מול פרודקשן. 331 שורות עודכנו, 0 שדות התרוקנו.
-- גיבוי: community_affiliation_backup_20260825 (7,050 שורות).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── גיבוי ──
-- ⚠️ בלעדיו אין דרך לשחזר: הערך המקורי הוא לעתים כל מה שידוע על המשפחה.
create table if not exists community_affiliation_backup_20260825 (
  id uuid primary key,
  community_affiliation text,
  backed_up_at timestamptz not null default now()
);

insert into community_affiliation_backup_20260825 (id, community_affiliation)
select id, community_affiliation
from beneficiaries
where community_affiliation is not null and btrim(community_affiliation) <> ''
on conflict (id) do nothing;

-- ── הניקוי ──
update beneficiaries
set community_affiliation = case
  when btrim(regexp_replace(community_affiliation,
         '^\s*(חסידות|חסידים|חסידית|חסידןת|חסידי|חסיד)\s*[-–]?\s*', '')) = ''
    then 'כלל חסידי'
  else btrim(regexp_replace(community_affiliation,
         '^\s*(חסידות|חסידים|חסידית|חסידןת|חסידי|חסיד)\s*[-–]?\s*', ''))
end
where community_affiliation ~ '^\s*(חסידות|חסידים|חסידית|חסידןת|חסידי|חסיד)\s*[-–]?\s*'
  and community_affiliation is distinct from (case
    when btrim(regexp_replace(community_affiliation,
           '^\s*(חסידות|חסידים|חסידית|חסידןת|חסידי|חסיד)\s*[-–]?\s*', '')) = ''
      then 'כלל חסידי'
    else btrim(regexp_replace(community_affiliation,
           '^\s*(חסידות|חסידים|חסידית|חסידןת|חסידי|חסיד)\s*[-–]?\s*', ''))
  end);

-- ⚠️ ערך יחיד עם תו זבל לפני המילה, שהביטוי "מתחילת הערך" לא תפס.
-- מטופל נקודתית ולא בהרחבת הביטוי — הרחבה הייתה עלולה לגעת בערכים
-- שנשארים בכוונה.
update beneficiaries
set community_affiliation = 'גור'
where community_affiliation = '*חסידות גור';

-- ── אימות ──
-- אמור להחזיר 0, 0.
--   select count(*) from beneficiaries where community_affiliation like '%חסידות%';
--   select count(*) from beneficiaries
--     where community_affiliation is not null and btrim(community_affiliation) = '';
