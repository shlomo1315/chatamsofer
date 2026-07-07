-- ============================================================================
-- Migration: אינדקסים לביצועים — הכנה לאלפי רשומות
-- ============================================================================
--
-- רקע (performance audit): המערכת מתוכננת לגדול לאלפי נתמכים. עמודות שמחפשים
-- בהן תדיר חסרות אינדקס, כך שכל חיפוש הופך ל-full table scan שמאט ליניארית עם
-- מספר הרשומות. ה-migration הזה מוסיף את האינדקסים החסרים.
--
-- 🔒 בטוח לחלוטין: אינדקסים בלבד (create index if not exists). לא משנה נתונים,
--    לא נוגע ב-RLS, אידמפוטנטי. אפשר להריץ מחדש.
-- ▶ הרצה: Supabase → SQL Editor → Run.
-- ============================================================================

-- ── 1. חיפוש טקסט חופשי (pg_trgm) — הכי חם ────────────────────────────────────
-- תיבת החיפוש בממשק ובשיחות IVR משתמשת ב-ILIKE '%טקסט%'. leading-wildcard לא
-- יכול להשתמש ב-btree רגיל, אז צריך GIN trigram. זה הופך חיפוש שם/טלפון ממאות
-- אלפי השוואות לחיפוש אינדקס מיידי.
create extension if not exists pg_trgm with schema extensions;

create index if not exists beneficiaries_full_name_trgm
  on public.beneficiaries using gin (full_name extensions.gin_trgm_ops);
create index if not exists beneficiaries_family_name_trgm
  on public.beneficiaries using gin (family_name extensions.gin_trgm_ops);
create index if not exists beneficiaries_phone_trgm
  on public.beneficiaries using gin (phone extensions.gin_trgm_ops);
create index if not exists beneficiaries_phone2_trgm
  on public.beneficiaries using gin (phone2 extensions.gin_trgm_ops);
create index if not exists beneficiaries_spouse_phone_trgm
  on public.beneficiaries using gin (spouse_phone extensions.gin_trgm_ops);

-- ── 2. spouse_id_number — חיפוש/בדיקת כפילות (btree, ערך מדויק) ────────────────
-- מחפשים לפי ת"ז בן/בת זוג ב-beneficiary-search, birth-request, update-details.
-- id_number כבר UNIQUE (מאונדקס), אבל spouse_id_number לא היה מאונדקס.
create index if not exists beneficiaries_spouse_id_number_idx
  on public.beneficiaries(spouse_id_number);

-- ── 3. activity_log — הטבלה הכי צומחת ─────────────────────────────────────────
-- בדיקת אידמפוטנטיות ב-webhook יולדות (yemot) ובהיסטוריית פעילות סורקת את כל
-- הלוג ההולך וגדל. אינדקס מורכב על (action, entity_id).
create index if not exists activity_log_action_entity_idx
  on public.activity_log(action, entity_id);
create index if not exists activity_log_entity_id_idx
  on public.activity_log(entity_id);

-- ============================================================================
-- בדיקת שפיות — אחרי ההרצה:
--   select indexname from pg_indexes
--   where schemaname='public' and tablename='beneficiaries'
--     and indexname like '%trgm%' or indexname like '%spouse%';
--   -- אמור להראות את האינדקסים החדשים.
--
-- אימות שהחיפוש משתמש באינדקס (אופציונלי):
--   explain analyze select id from beneficiaries where full_name ilike '%כהן%';
--   -- אמור להראות Bitmap Index Scan על *_trgm, לא Seq Scan.
-- ============================================================================
