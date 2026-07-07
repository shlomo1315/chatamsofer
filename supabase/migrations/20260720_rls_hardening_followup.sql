-- ============================================================================
-- Migration: הקשחת RLS המשך — טבלאות שנוצרו אחרי 20260611_rls_hardening
-- ============================================================================
--
-- רקע (security review):
--   ה-hardening מ-20260611 החליף policies פתוחות ב-is_staff(), אבל טבלאות
--   שנוצרו *אחריו* קיבלו policies `using (true)` — חלקן ללא `to authenticated`
--   (כלומר גם ה-anon role קורא). עם ה-anon key הציבורי, תוקף יכול לקרוא ישירות
--   מ-REST API את הנתונים. הטבלאות הבעייתיות:
--
--   🔴 financial_aid_requests — using(true) ל-anon — PII: בקשות סיוע כספי למשפחות
--   🔴 widow_support_payments  — using(true) ל-anon — PII: פנקס תמיכה לאלמנות/יתומים
--   🟡 card_centers            — using(true) ל-anon — לוגיסטיקה: מרכזים, כתובות, מלאי
--   🔵 gov_cities / gov_streets — to authenticated using(true) — נתוני כתובות (פחות רגיש)
--
--   בנוסף: policies של insert/update/delete על אלה היו `to authenticated with
--   check(true)` — כל משתמש מאומת (לא רק צוות) יכל לכתוב. מהודק ל-is_staff().
--
-- ⚠️ לא שובר את הפורטלים: הגישה שלהם לנתונים האלה עוברת דרך API routes עם
--   service_role key שעוקף RLS. staff-only RLS משפיע רק על גישה ישירה עם anon key.
--
-- 🔒 אידמפוטנטי (drop if exists לפני create). בטוח להריץ מחדש.
-- ▶ הרצה: Supabase → SQL Editor → Run. בדיקות שפיות בתחתית.
-- ============================================================================

-- ── financial_aid_requests (🔴 PII) ──────────────────────────────────────────
drop policy if exists "financial_aid_read"   on public.financial_aid_requests;
drop policy if exists "financial_aid_insert" on public.financial_aid_requests;
drop policy if exists "financial_aid_update" on public.financial_aid_requests;
drop policy if exists "financial_aid_delete" on public.financial_aid_requests;
drop policy if exists "financial_aid_staff_all" on public.financial_aid_requests;
create policy "financial_aid_staff_all" on public.financial_aid_requests
  for all using (public.is_staff()) with check (public.is_staff());

-- ── widow_support_payments (🔴 PII) ──────────────────────────────────────────
drop policy if exists "widow_payments_read"   on public.widow_support_payments;
drop policy if exists "widow_payments_insert" on public.widow_support_payments;
drop policy if exists "widow_payments_update" on public.widow_support_payments;
drop policy if exists "widow_payments_delete" on public.widow_support_payments;
drop policy if exists "widow_support_payments_staff_all" on public.widow_support_payments;
create policy "widow_support_payments_staff_all" on public.widow_support_payments
  for all using (public.is_staff()) with check (public.is_staff());

-- ── card_centers (🟡 לוגיסטיקה) ──────────────────────────────────────────────
drop policy if exists "card_centers_read"   on public.card_centers;
drop policy if exists "card_centers_insert" on public.card_centers;
drop policy if exists "card_centers_update" on public.card_centers;
drop policy if exists "card_centers_delete" on public.card_centers;
drop policy if exists "card_centers_staff_all" on public.card_centers;
create policy "card_centers_staff_all" on public.card_centers
  for all using (public.is_staff()) with check (public.is_staff());

-- ── gov_cities / gov_streets (🔵 נתוני כתובות ציבוריים) ───────────────────────
-- אלה טבלאות עזר לכתובות (ערים/רחובות). לא PII, אבל אין סיבה שיהיו פתוחות לכל
-- משתמש מאומת. מהדקים לצוות בלבד. אם הפורטל הציבורי צריך אותן ישירות (לא דרך
-- service_role) — יש להחזיר SELECT ל-authenticated; כרגע ההנחה היא גישה דרך API.
drop policy if exists gov_cities_read  on public.gov_cities;
drop policy if exists gov_streets_read on public.gov_streets;
drop policy if exists gov_cities_staff_read  on public.gov_cities;
drop policy if exists gov_streets_staff_read on public.gov_streets;
create policy gov_cities_staff_read  on public.gov_cities  for select using (public.is_staff());
create policy gov_streets_staff_read on public.gov_streets for select using (public.is_staff());

-- ============================================================================
-- בדיקות שפיות — אחרי ההרצה:
--   -- כמשתמש anon (לא צוות), הקריאות האלה צריכות להחזיר 0 שורות / להיחסם:
--   select count(*) from financial_aid_requests;  -- אמור: 0 (חסום ל-anon)
--   select count(*) from widow_support_payments;   -- אמור: 0
--   -- כמשתמש צוות מחובר דרך האתר — הפורטל והמסכים ממשיכים לעבוד (service_role).
--   -- ודא ש-is_staff() מוגדר (מ-20260611); אם לא — הרץ אותו קודם.
-- ============================================================================
