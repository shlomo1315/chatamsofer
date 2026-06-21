-- אבטחה: הפיכת דלי המסמכים לפרטי.
-- מסמכים רגישים (סריקות ת"ז, אישורי לידה, מסמכים רפואיים) לא ייגשו עוד דרך
-- URL ציבורי קבוע. כל צפייה עוברת דרך פרוקסי מאומת (/api/files) שמפיק signed URL
-- קצר-מועד בצד השרת עם service-role.
--
-- ⚠️ הרץ זאת רק לאחר שווידאת שמסכי הצפייה במסמכים עובדים (הקוד כבר עודכן לעבור
--    דרך הפרוקסי). לאחר ההרצה, URLים ציבוריים ישנים יפסיקו לעבוד — אך הצפייה
--    באפליקציה ובמיילים (signed URL) תמשיך לעבוד.
update storage.buckets set public = false where id = 'documents';

-- הסרת מדיניות הקריאה הציבורית של האחסון. קריאה מעתה רק דרך service-role (הפרוקסי).
drop policy if exists "documents_read" on storage.objects;

-- חשוב: ה-policy הישן "documents_read" עשוי היה להיות מוגדר כ-FOR ALL, ולכן הסרתו
-- חוסמת גם העלאות. חלק ממסכי הניהול (אישור לידה, הלוואות, מסמכי מוטב) מעלים קבצים
-- ישירות מהדפדפן עם ה-JWT של איש הצוות, ולכן צריך policy מפורש שמתיר זאת לצוות בלבד.
-- (העלאות מהפורטל הציבורי נעשות דרך service-role ועוקפות RLS — לא מושפעות מכאן.)
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
