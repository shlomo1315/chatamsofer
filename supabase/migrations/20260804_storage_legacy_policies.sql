-- ============================================================================
-- 🔴 אבטחה: הסרת policies ישנות על storage.objects שהעניקו גישה לכל משתמש מאומת
-- ============================================================================
--
-- מה נמצא בסקירה (בפרודקשן, לא בקוד):
--   documents_delete → to authenticated · using (bucket_id = 'documents')
--   documents_insert → to authenticated · ללא תנאי כלל
--
-- כלומר כל משתמש מאומת — לא רק צוות — יכול היה למחוק כל מסמך בדלי, ולהעלות
-- קבצים לכל דלי. סריקות ת"ז, אישורי לידה ומסמכים רפואיים היו חשופים למחיקה.
-- בשילוב עם הרשמה עצמית שהייתה פתוחה ב-Supabase Auth, המשמעות הייתה שכל אחד
-- יכול לפתוח חשבון ולמחוק את כל המסמכים במערכת.
--
-- מאיפה זה בא: המיגרציה 20260704_documents_bucket_private יצרה policies נכונות
-- (documents_staff_* עם is_staff()) אך לא הסירה את הישנות. ב-Postgres כל
-- ה-policies מצטברות ב-OR — ולכן החלשה שבהן היא זו שקובעת, וההקשחה לא נכנסה
-- לתוקף בפועל. זה הפער שהמיגרציה ההיא נועדה לסגור והחמיצה.
--
-- ⚠️ אידמפוטנטי ובטוח להריץ שוב. אינו נוגע ב-policies של דליים אחרים.
-- ▶ הרצה: Supabase → SQL Editor → Run. בדיקת שפיות בתחתית.
-- ============================================================================

-- ── 1. הסרת כל policy ישן של דלי המסמכים ────────────────────────────────────
-- נסרק דינמית ולא ברשימה קשיחה: השמות בפרודקשן נוצרו לפני שהמיגרציות היו
-- מסודרות, וייתכנו שמות שלא נראו בסקירה (documents_select / documents_update /
-- documents_read / "documents access" וכו'). כל מה שאינו documents_staff_* מוסר.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'documents%'
      and policyname not like 'documents\_staff\_%'
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
    raise notice 'הוסרה policy ישנה: %', pol.policyname;
  end loop;
end $$;

-- ── 2. יצירה מחדש של המדיניות התקינה (צוות בלבד) ────────────────────────────
-- זהה למיגרציה 20260704, כאן שוב כדי שהמצב הסופי יהיה ודאי גם אם היא לא רצה.
drop policy if exists "documents_staff_select" on storage.objects;
drop policy if exists "documents_staff_insert" on storage.objects;
drop policy if exists "documents_staff_update" on storage.objects;
drop policy if exists "documents_staff_delete" on storage.objects;

create policy "documents_staff_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.is_staff());

create policy "documents_staff_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_staff());

create policy "documents_staff_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and public.is_staff())
  with check (bucket_id = 'documents' and public.is_staff());

create policy "documents_staff_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.is_staff());

-- ── 3. card_stock_ledger — צוות בלבד ────────────────────────────────────────
-- 🔴 נמצא בסקירה: הטבלה נוצרה ב-20260730, כלומר *אחרי* מיגרציית ההקשחה
-- ההמשכית, וקיבלה policies של `to authenticated using (true)`. כלומר כל חשבון
-- מאומת יכול לקרוא את יומן מלאי הכרטיסים — וגם להוסיף לו תנועות, כלומר לנפח או
-- לרוקן את המלאי. זו בדיוק התקלה שההקשחה ההמשכית התריעה עליה: טבלה חדשה שנוצרת
-- אחרי ההקשחה ומקבלת policy פתוח.
-- הטבלה נכתבת אך ורק דרך service-role (lib/cardStock), ולכן אין השפעה על זרימה.
drop policy if exists "card_stock_ledger_read" on public.card_stock_ledger;
drop policy if exists "card_stock_ledger_insert" on public.card_stock_ledger;
drop policy if exists "card_stock_ledger_staff_all" on public.card_stock_ledger;
create policy "card_stock_ledger_staff_all" on public.card_stock_ledger
  for all using (public.is_staff()) with check (public.is_staff());

-- ── 4. הדלי חייב להישאר פרטי ─────────────────────────────────────────────────
update storage.buckets set public = false where id = 'documents' and public is distinct from false;

-- ============================================================================
-- בדיקת שפיות — להריץ אחרי, ולוודא שכל השורות הן documents_staff_* ושכולן
-- מכילות is_staff():
--
--   select policyname, roles::text, cmd,
--          coalesce(qual, with_check) as expr
--   from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--   order by policyname;
--
-- ⚠️ מה שאמור לעבוד אחרי ההרצה, ולוודא בפועל:
--   • צפייה במסמך בכרטסת (עוברת דרך /api/files עם service-role — לא מושפעת)
--   • העלאת מסמך ממסך ניהול (JWT של איש צוות → is_staff() מחזיר true)
--   • העלאת מסמך מהפורטל הציבורי (service-role, עוקף RLS — לא מושפעת)
-- אם העלאה ממסך ניהול נכשלת, סימן ש-is_staff() אינו מוגדר: הרץ קודם
-- 20260611_rls_hardening.sql.
-- ============================================================================
