-- ============================================================================
-- Migration: תיקון check constraint על maternity_aids.status
-- ============================================================================
--
-- הבעיה: בפרודקשן קיים constraint בשם maternity_aids_status_check שאינו כולל
-- את הערך 'deep_review' (וייתכן גם 'completed'). כשמזכיר מעביר תיק ל"בדיקה
-- מעמיקה / אישור מנהל" נכתב status='deep_review', וה-INSERT/UPDATE נכשל עם:
--   new row for relation "maternity_aids" violates check constraint
--   "maternity_aids_status_check"
-- המיגרציה 20260727_maternity_deep_review הניחה שהעמודה חופשית מ-constraint,
-- אבל בפרודקשן קיים constraint ישן (נוסף ידנית / במיגרציה מוקדמת) שמכיר רק
-- pending/active/cancelled — ולכן deep_review נחסם.
--
-- התיקון: מסירים כל constraint ישן על status ומגדירים מחדש את מלוא הערכים
-- התואמים לטיפוס MaternityStatus ב-types/index.ts:
--   'pending' | 'active' | 'completed' | 'cancelled' | 'deep_review'
--
-- 🔒 אידמפוטנטי. ▶ הרצה: Supabase → SQL Editor → Run.
-- ============================================================================

alter table public.maternity_aids
  drop constraint if exists maternity_aids_status_check;

alter table public.maternity_aids
  add constraint maternity_aids_status_check
  check (status in ('pending', 'active', 'completed', 'cancelled', 'deep_review'));
