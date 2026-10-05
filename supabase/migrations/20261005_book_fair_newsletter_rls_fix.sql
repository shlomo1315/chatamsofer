-- 🔴 תיקון אבטחה (ביקורת 05.10): מדיניות הדיוור של היריד הייתה
-- using(true) לתפקיד authenticated — כלומר *כל* משתמש מחובר, לא רק צוות.
-- השם "_staff" העיד על הכוונה. כל שאר 66 הטבלאות משתמשות ב-is_staff().
--
-- ⚠️ אינו שובר דבר: הקוד ניגש לטבלאות רק דרך service role, שעוקף RLS.

drop policy if exists book_fair_newsletters_staff on public.book_fair_newsletters;
create policy book_fair_newsletters_staff on public.book_fair_newsletters
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists book_fair_newsletter_recipients_staff on public.book_fair_newsletter_recipients;
create policy book_fair_newsletter_recipients_staff on public.book_fair_newsletter_recipients
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
