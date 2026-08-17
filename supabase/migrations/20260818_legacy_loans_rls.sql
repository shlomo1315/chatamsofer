-- ─────────────────────────────────────────────────────────────────────────────
-- RLS ל-legacy_loans.
--
-- 🔴 הטבלה נוצרה בלי RLS ובלי מדיניות, וזה שבר אותה בשקט: הדף
-- app/admin/loans/page.tsx קורא דרך createClient השרתי — מפתח **anon**
-- עם עוגיית הסשן, כלומר כפוף ל-RLS. טבלה בלי מדיניות מחזירה **אפס שורות
-- בלי שגיאה**, ולכן לשונית "הלוואות קודמות" לא הופיעה כלל: היא מותנית
-- ב-legacy.length > 0. הנתונים היו במסד כל הזמן (1,148 שורות אומתו).
--
-- ⚠️ הכשל היה חמור פי כמה מ"לשונית חסרה": אותה שליפה עצמה מזינה גם את
-- ההיסטוריה בכרטסת המשפחה (lib/legacyLoans → summary/route). שם היא
-- עוברת דרך getServiceClient, שעוקף RLS — ולכן שם זה עבד. שני מסלולי
-- קריאה לאותם נתונים עם שני סוגי לקוח: אחד עבד והשני החזיר ריק.
--
-- ⚠️ אידמפוטנטי: drop לפני create. ה-SQL editor עוטף בטרנזקציה, ושגיאת
-- "policy already exists" הייתה מגלגלת אחורה את כל המיגרציה.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.legacy_loans enable row level security;

-- קריאה: אנשי צוות פעילים בלבד.
--
-- ⚠️ הרשאת ה*מחלקה* ('loans') אינה נאכפת כאן אלא בשכבת ה-API
-- (guardPage + requirePermission). RLS כאן היא רצפה — "לא כל אחד",
-- לא "בדיוק מי שמורשה הלוואות". אותו דפוס כמו בשאר הטבלאות.
drop policy if exists "legacy_loans_select_staff" on public.legacy_loans;
create policy "legacy_loans_select_staff" on public.legacy_loans
  for select using (public.is_staff());

-- כתיבה: דרך service role בלבד (מסלולי ה-API), לא מהדפדפן.
--
-- 🔴 אין כאן מדיניות insert/update/delete ל-authenticated במכוון:
-- העריכה והמחיקה עוברות ב-/api/admin/legacy-loans, שרץ עם service role
-- אחרי requirePermission('loans','edit'). מדיניות כתיבה ל-anon הייתה
-- מאפשרת לכל איש צוות לשנות רשומות ישירות מהקונסול, בעקיפת בדיקת
-- ההרשאה — בדיוק סוג הדלת הצדדית שסגרנו ב-related-records.
drop policy if exists "legacy_loans_service_all" on public.legacy_loans;
create policy "legacy_loans_service_all" on public.legacy_loans
  for all to service_role using (true) with check (true);
