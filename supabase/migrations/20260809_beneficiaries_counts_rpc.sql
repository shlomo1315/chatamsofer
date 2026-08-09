-- ─────────────────────────────────────────────────────────────────────────────
-- ספירות כרטיסי הסטטוס במסך הצאצאים — מעבר מ-8 שאילתות לשאילתה אחת.
--
-- ⚠️ הבעיה: מסך הצאצאים הריץ שמונה שאילתות count:'exact' נפרדות (all + 7
-- סטטוסים) בכל טעינת דף *ובכל לחיצה על פילטר*. count:'exact' ב-Postgres אינו
-- מונה שמור אלא סריקה בפועל, ולכן כל צפייה במסך סרקה את הטבלה הגדולה במערכת
-- שמונה פעמים — עם בדיוק אותם פילטרים, ורק ממד הסטטוס שונה ביניהן.
--
-- הפונקציה הזו עושה את אותה עבודה במעבר אחד: מסננת פעם אחת לפי כל הפילטרים
-- שאינם סטטוס, ומקבצת לפי eligibility_status. חוזרות לכל היותר ~8 שורות
-- זעירות במקום שמונה סריקות.
--
-- ⚠️ SECURITY INVOKER (ברירת המחדל — מצוין כאן במפורש כתיעוד): הפונקציה חייבת
-- לרוץ בהרשאות הקורא כדי ש-RLS של beneficiaries (is_staff) ימשיך לחול. עם
-- SECURITY DEFINER כל משתמש מאומת — גם כזה שאינו צוות — היה יכול לקרוא לה
-- ולקבל את התפלגות הסטטוסים של כל המאגר, כלומר דליפת מידע דרך הדלת האחורית.
-- אי-צוות מקבל כאן אפס שורות, בדיוק כמו בשאילתות ה-count שהיא מחליפה.
--
-- ⚠️ אידמפוטנטי. בטוח להריץ שוב.
-- ▶ הרצה: Supabase → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ⚠️ drop לפני create: אם החתימה תשתנה בעתיד, create or replace לבדו נכשל
-- ("cannot change return type of existing function") ומשאיר את הפונקציה הישנה.
drop function if exists public.beneficiaries_status_counts(boolean, text[], text);

create function public.beneficiaries_status_counts(
  p_special  boolean,              -- true = דף החריגים (is_special=true); false = הרשימה הראשית
  p_marital  text[] default null,  -- NULL/ריק = בלי סינון מצב משפחתי
  p_q        text   default null   -- NULL/ריק = בלי חיפוש חופשי
)
returns table (status text, cnt bigint)
language sql
stable
security invoker
set search_path = public
as $$
  -- ⚠️ NULL אמיתי מסומן בזקיף ולא ב-coalesce למחרוזת ריקה. הסיבה מהותית:
  -- ב-PENDING_OR רק eligibility_status.is.null נספר כהמתנה, ואילו סטטוס שהוא
  -- מחרוזת ריקה אינו נתפס לא ע"י is.null ולא ע"י in.(...) — כלומר אינו נספר
  -- באף כרטיס. coalesce היה מאחד את שני המקרים ומנפח את 'ממתין'.
  -- הזקיף אינו ערך חוקי של eligibility_status ולכן לא יתנגש בנתונים אמיתיים.
  select case when b.eligibility_status is null then '__null__'
              else b.eligibility_status end::text as status,
         count(*)::bigint as cnt
    from public.beneficiaries b
   where
     -- ── סינון חריגים — מראה בדיוק את applySpecial שבצד ה-JS ────────────────
     -- ⚠️ ברשימה הראשית נתפסים גם NULL: העמודה נוספה במיגרציה מאוחרת, ולרשומות
     -- שקדמו לה אין ערך. בלי ה-NULL כל המאגר הוותיק היה נעלם מהספירה.
     case when p_special then b.is_special is true
                         else (b.is_special is null or b.is_special is false) end
     -- ── מצב משפחתי — רב-ברירה. NULL או מערך ריק = בלי סינון ────────────────
     and (p_marital is null or cardinality(p_marital) = 0
          or b.marital_status = any(p_marital))
     -- ── חיפוש חופשי — אותן עמודות ואותה סמנטיקת ilike כמו SEARCH_COLUMNS ───
     -- ⚠️ הצבת הערך כפרמטר (ולא שרשור לטקסט השאילתה) מנטרלת הזרקה, ולכן כאן
     -- אין צורך בניקוי הפסיקים/סוגריים שנדרש בצד ה-JS — שם הוא נדרש רק מפני
     -- שב-.or() של PostgREST התווים האלה הם תוחמי תחביר.
     and (p_q is null or btrim(p_q) = '' or (
              b.full_name         ilike '%' || p_q || '%'
           or b.family_name       ilike '%' || p_q || '%'
           or b.id_number         ilike '%' || p_q || '%'
           or b.phone             ilike '%' || p_q || '%'
           or b.phone2            ilike '%' || p_q || '%'
           or b.email             ilike '%' || p_q || '%'
           or b.address           ilike '%' || p_q || '%'
           or b.city              ilike '%' || p_q || '%'
           or b.marital_status    ilike '%' || p_q || '%'
           or b.spouse_name       ilike '%' || p_q || '%'
           or b.spouse_id_number  ilike '%' || p_q || '%'
           or b.nedarim_id        ilike '%' || p_q || '%'
     ))
   group by 1
$$;

-- ⚠️ הפונקציה מחזירה ספירה *גולמית* לכל סטטוס, ולא את הכרטיסים המוצגים.
-- הקיבוץ ל"ממתין לאישור ראשוני" ול-all נעשה בצד ה-JS, מסיבה מהותית: הכרטיסים
-- אינם חלוקה זרה — 'ממתין' *כולל* את docs_pending/docs_returned/review, וכל
-- אחד מהם נספר גם בכרטיס שלו עצמו. group by פשוט היה מחזיר חלוקה זרה, כלומר
-- מספרים אחרים מאלה שהמסך מציג היום.
-- eligibility_status שהוא NULL (רשומות ותיקות) חוזר כזקיף '__null__' — הקורא
-- ממפה אותו להמתנה, בדיוק כמו eligibility_status.is.null בשאילתה שהוחלפה.
comment on function public.beneficiaries_status_counts(boolean, text[], text) is
  'ספירת מוטבים לפי eligibility_status במעבר אחד, עם פילטרי חריגים/מצב משפחתי/חיפוש. מחליפה 8 שאילתות count במסך הצאצאים. ספירה גולמית — הקיבוץ לכרטיסים בצד הקורא.';

revoke all on function public.beneficiaries_status_counts(boolean, text[], text) from public;
grant execute on function public.beneficiaries_status_counts(boolean, text[], text) to authenticated, service_role;

-- ── אינדקס תומך לחיפוש החופשי? לא כאן ──────────────────────────────────────
-- beneficiaries_list_main_idx (20260809_perf_indexes) על (eligibility_status,
-- created_at desc) כבר משרת את הקיבוץ הזה כ-index-only scan כשאין חיפוש, וזה
-- המקרה הנפוץ. חיפוש ilike על 12 עמודות דורש סריקה בכל מקרה — גם היום, בכל
-- אחת משמונה השאילתות בנפרד. אחרי השינוי הסריקה הזו מתרחשת פעם אחת.
