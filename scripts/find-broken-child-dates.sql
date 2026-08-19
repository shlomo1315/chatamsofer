-- ═══════════════════════════════════════════════════════════════════════════
-- איתור ותיקון תאריכי לידה פגומים בעמודת children (JSONB)
--
-- 🔴 הרקע: children היא עמודת JSONB — אין למסד הנתונים שום אכיפת טיפוס על
-- birth_date שבתוכה. normalizeDateToISO החזיר ערך לא-מזוהה כמות שהוא
-- (`return v`), ולכן מחרוזות שאינן תאריך נכתבו למאגר. כשהערך חזר לטופס,
-- new HDate(InvalidDate) זרק RangeError בזמן render והפיל את *כל* הדף
-- למסך "אירעה תקלה זמנית". זה גם ההסבר לכך שאצל חלק מהמשפחות זה עבד
-- ואצל אחרות לא — הקריסה תלויה בנתונים.
--
-- הקוד תוקן בשני הכיוונים (קריאה + כתיבה), אבל הרשומות שכבר נכתבו
-- נשארו פגומות. הסקריפט הזה מטפל בהן.
--
-- ⚠️ להריץ בשלבים: קודם שלב 1 (איתור בלבד), לבדוק את הפלט, ורק אז שלב 2.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── שלב 1: איתור — קריאה בלבד, לא משנה כלום ────────────────────────────────
-- מציג כל ילד שה-birth_date שלו אינו YYYY-MM-DD תקין (ריק/null אינו פגום —
-- זו רשומה שממתינה להשלמה, לא רשומה שבורה).

select
  b.id                             as beneficiary_id,
  b.family_name || ' ' || b.full_name as family,
  b.phone,
  child ->> 'name'                 as child_name,
  child ->> 'id_number'            as child_id,
  child ->> 'birth_date'           as bad_birth_date
from beneficiaries b,
     lateral jsonb_array_elements(b.children) as child
where jsonb_typeof(b.children) = 'array'
  and coalesce(child ->> 'birth_date', '') <> ''
  and (
    -- לא בפורמט ISO בכלל
    child ->> 'birth_date' !~ '^\d{4}-\d{2}-\d{2}$'
    -- או בפורמט ISO אבל אינו תאריך אמיתי (למשל 2026-13-45)
    or to_date_safe(child ->> 'birth_date') is null
  )
order by b.family_name, b.full_name;


-- ── עזר: המרה בטוחה לתאריך (מחזיר null במקום לזרוק) ────────────────────────
-- ⚠️ להריץ *לפני* שלב 1 אם הפונקציה אינה קיימת.

create or replace function to_date_safe(txt text)
returns date language plpgsql immutable as $$
begin
  return txt::date;
exception when others then
  return null;
end $$;


-- ── שלב 2: תיקון — מרוקן רק את השדה הפגום ──────────────────────────────────
-- ⚠️ להריץ רק אחרי בדיקת פלט שלב 1.
--
-- הבחירה: **לרוקן** את התאריך הפגום ולא לנחש אותו. ערך כמו "לא ידוע" אינו
-- ניתן לשחזור, וניחוש יכניס נתון שגוי שנראה אמין. שדה ריק גורם לטופס לבקש
-- מההורה לבחור תאריך — וזה הנתון הנכון היחיד.
--
-- הסרת התגובה (/* */) מפעילה את התיקון:

/*
update beneficiaries b
set children = (
  select jsonb_agg(
    case
      when coalesce(child ->> 'birth_date', '') <> ''
       and (child ->> 'birth_date' !~ '^\d{4}-\d{2}-\d{2}$'
            or to_date_safe(child ->> 'birth_date') is null)
      then child || '{"birth_date": ""}'::jsonb
      else child
    end
    order by ord
  )
  from jsonb_array_elements(b.children) with ordinality as t(child, ord)
)
where jsonb_typeof(b.children) = 'array'
  and exists (
    select 1 from jsonb_array_elements(b.children) as child
    where coalesce(child ->> 'birth_date', '') <> ''
      and (child ->> 'birth_date' !~ '^\d{4}-\d{2}-\d{2}$'
           or to_date_safe(child ->> 'birth_date') is null)
  );
*/


-- ── שלב 3: אימות — אמור להחזיר 0 שורות ─────────────────────────────────────
-- להריץ את שאילתת שלב 1 שוב. אם חזרו 0 שורות — הושלם.
