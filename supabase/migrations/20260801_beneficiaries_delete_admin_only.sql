-- ─────────────────────────────────────────────────────────────────────────────
-- מחיקת צאצא — מנהל בלבד (הידוק ברמת מסד הנתונים).
--
-- המזכירות מקבלת מעתה עריכה מלאה של כרטסת הצאצא, אך לא מחיקה. האכיפה
-- קיימת כבר בממשק (הכפתור מוסתר) ובשרת (requireAdmin בנתיב המחיקה); כאן
-- סוגרים גם את השכבה האחרונה — מדיניות ה-RLS, שעד כה התירה מחיקה לכל
-- איש צוות ולכן אפשרה מחיקה ישירה בעקיפת הממשק.
--
-- ℹ️ נתיבי ה-API עובדים עם service-role שעוקף RLS — מחיקת מנהל דרך המערכת
--    ממשיכה לעבוד בדיוק כמו קודם. השינוי חוסם רק גישה ישירה מהדפדפן.
--
-- 🔒 אידמפוטנטי. ▶ הרצה: Supabase → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────────────────

-- האם המשתמש הנוכחי הוא מנהל פעיל?
-- SECURITY DEFINER — כדי לקרוא את profiles בלי RLS רקורסיבי (זהה ל-is_staff).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon, service_role;

-- החלפת מדיניות המחיקה: מכל איש צוות → מנהל בלבד.
drop policy if exists "beneficiaries_staff_delete" on public.beneficiaries;
drop policy if exists "beneficiaries_admin_delete" on public.beneficiaries;
create policy "beneficiaries_admin_delete" on public.beneficiaries
  for delete using (public.is_admin());
