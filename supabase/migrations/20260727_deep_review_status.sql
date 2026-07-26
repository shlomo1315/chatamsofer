-- ============================================================================
-- Migration: סטטוס "בדיקה מעמיקה" (deep_review) למוטבים
-- ============================================================================
--
-- רקע: כשנרשם בוחר את סדר הדורות, יש שתי רמות בדיקה:
--   • בדיקה רגילה (review/pending) — בחר את הנתיב המאומת של 5 הדורות הראשונים
--     כמו שהוא, והוסיף דורות חדשים *מעבר* להם. תקין וסטנדרטי.
--   • בדיקה מעמיקה (deep_review — חדש) — סטה מהנתיב המאומת *בתוך* 5 הדורות
--     הראשונים (הוסיף/שינה צומת שאינו קיים במאגר בדור רדוד). דורש תשומת לב.
--
-- כאן רק מרחיבים את ה-check constraint של eligibility_status כדי לאפשר את
-- הערך החדש. הלוגיקה שקובעת מתי מציבים אותו נמצאת ב-public-register.
--
-- 🔒 אידמפוטנטי. ▶ הרצה: Supabase → SQL Editor → Run.
-- ============================================================================

alter table public.beneficiaries
  drop constraint if exists beneficiaries_eligibility_status_check;

alter table public.beneficiaries
  add constraint beneficiaries_eligibility_status_check
  check (eligibility_status in (
    'pending', 'approved', 'rejected', 'review',
    'docs_pending', 'docs_returned', 'deep_review'
  ));
