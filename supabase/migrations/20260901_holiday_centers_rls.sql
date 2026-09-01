-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 מוקד שנבחר באתר הוצג כ"טרם נבחר" בטבלת הנרשמים.
--
-- השורש: ב-holiday_centers הופעל RLS בלי שנוספה ולו policy אחת. טבלה
-- כזו אינה זורקת שגיאה — היא פשוט ריקה לכל תפקיד שאינו service_role.
-- לכן center_id (עמודה רגילה על distribution_recipients, המוגנת
-- ב-is_staff) הגיע מלא, בעוד ה-join center:holiday_centers החזיר null.
--
-- ⚠️ כך בדיוק נראתה הסתירה במסך: עמודת "טעינה" הציגה כפתור "טען" פעיל
-- כי היא נשענת על center_id, ובאותה שורה עצמה עמודת "מוקד חלוקה" הציגה
-- "טרם נבחר" כי היא נשענת על שם מה-join. שני תאים, אותה שורה, שתי
-- תשובות סותרות — החתימה של join שנחסם ב-RLS ולא של נתון חסר.
--
-- ⚠️ נתיבי ה-API לא גילו זאת: הם עובדים עם getServiceClient (service
-- role, עוקף RLS) והציגו את המוקד כראוי. רק העמוד עצמו, שקורא במפתח
-- anon עם עוגיית הסשן, נפגע — והוא היחיד שהמשתמש רואה.
--
-- 🔴 אין כאן שינוי נתונים ואין הרפיית הגנה: זו בדיוק אותה policy
-- שמגנה על beneficiaries, approval_labels ו-card_centers.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.holiday_centers enable row level security;

drop policy if exists holiday_centers_staff_all on public.holiday_centers;
create policy holiday_centers_staff_all
  on public.holiday_centers for all
  using (is_staff()) with check (is_staff());

-- ⚠️ אותה תקלה בדיוק, באותה משפחת טבלאות: openings נשלפת ב-join
-- לבחירת המוקדים הפתוחים בחלוקה, והייתה ריקה מאותה סיבה.
alter table public.holiday_center_openings enable row level security;

drop policy if exists holiday_center_openings_staff_all on public.holiday_center_openings;
create policy holiday_center_openings_staff_all
  on public.holiday_center_openings for all
  using (is_staff()) with check (is_staff());
