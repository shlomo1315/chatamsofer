-- ─────────────────────────────────────────────────────────────────────────────
-- הקהילות הנפוצות — לצ'יפס הלחיצה בסינון המתקדם של מסך הצאצאים.
--
-- 🔴 למה רק הנפוצות: community_affiliation הוא שדה טקסט חופשי. נכון להיום יש
-- בו 1,838 ערכים שונים ל-7,196 רשומות, ומתוכם 1,478 מופיעים *פעם אחת בלבד*
-- ("ויזניץ מרכז", "קהילת ויזניץ", "ויזניץ שיכון" — כולן אותה קהילה).
-- רשימת בחירה מלאה הייתה בלתי שמישה, ובחירה מדויקת בערך אחד הייתה מחמיצה
-- את כל הוואריאציות שלו. לכן:
--   • הצ'יפס = קיצור ל-39 הקהילות שמעל 20 רשומות (מכסות 4,470 רשומות)
--   • החיפוש עצמו = ilike '%…%', שתופס גם את הוואריאציות
--
-- ⚠️ RPC ולא distinct מהקוד: שאילתת distinct על הטבלה הגדולה במערכת בכל
-- טעינת דף היא סריקה מלאה. כאן היא מקובצת במעבר יחיד.
--
-- ⚠️ SECURITY DEFINER + search_path מקובע — אותה תבנית כמו
-- beneficiaries_filter_options. הפונקציה מחזירה *שמות קהילות ומונים בלבד*,
-- בלי שום נתון מזהה.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.beneficiaries_community_options(
  only_special boolean default false,
  min_count int default 20,
  max_rows int default 24
)
returns table(value text, cnt bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select trim(community_affiliation) as value, count(*) as cnt
  from beneficiaries
  where case
      when only_special then is_special is true
      else (is_special is null or is_special is false)
    end
    -- ⚠️ ריק אינו קהילה — צ'יפס "(ריק)" אינו מוסיף דבר כאן.
    and nullif(trim(coalesce(community_affiliation, '')), '') is not null
  group by 1
  having count(*) >= greatest(min_count, 1)
  order by cnt desc, value
  -- ⚠️ תקרה קשיחה: גם אם min_count יורד, הצ'יפס לא יתפח לרשימה בלתי קריאה.
  limit least(greatest(max_rows, 1), 60);
$$;

-- ⚠️ הרשאה מפורשת: בלעדיה PostgREST מחזיר 404 על ה-RPC.
grant execute on function public.beneficiaries_community_options(boolean, int, int)
  to anon, authenticated, service_role;

-- ── אינדקס לסינון הקהילה ──
-- 🔴 הסינון הוא ilike '%X%' — חיפוש תת-מחרוזת שאינו יכול להשתמש ב-btree.
-- אינדקס trigram הוא היחיד שמשרת אותו, ובלעדיו כל סינון קהילה סורק את כל
-- 7,196 השורות.
create extension if not exists pg_trgm;
create index if not exists beneficiaries_community_trgm_idx
  on beneficiaries using gin (community_affiliation gin_trgm_ops);

-- ── אינדקס לסינון הגיל ──
-- הגיל מתורגם לטווח על birth_date (ראו ageToBirthRange), כדי שהסינון יישאר
-- sargable. אינדקס רגיל מספיק לטווח.
create index if not exists beneficiaries_birth_date_idx
  on beneficiaries (birth_date);
