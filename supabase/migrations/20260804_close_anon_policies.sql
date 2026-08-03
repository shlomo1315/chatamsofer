-- ============================================================================
-- 🔴🔴 קריטי: סגירת 124 policies שהעניקו גישה מלאה ל-anon (בלי התחברות בכלל)
-- ============================================================================
--
-- מה נמצא בפרודקשן:
--   124 policies בסכמה public שה-roles שלהן כולל anon, בשם "allow all".
--   דוגמאות שנראו: family_tree, maternity_requests, holiday_distributions.
--
-- מה זה אומר בפועל:
--   anon אינו "משתמש אנונימי מחובר" אלא **בלי שום התחברות**. המפתח הציבורי
--   (NEXT_PUBLIC_SUPABASE_ANON_KEY) מוטמע בקוד של כל דף באתר, ולכן כל אדם יכול
--   לקחת אותו ולפנות ישירות ל-REST API של Supabase. עם policy בשם "allow all"
--   פירוש הדבר קריאה *וכתיבה* לכל הטבלאות האלה — ללא סיסמה וללא חשבון.
--
-- מאיפה זה בא:
--   ה-policies האלה נוצרו בשלב הפיתוח המוקדם ("allow all" כדי שהכל יעבוד),
--   ומיגרציות ההקשחה (20260611, 20260720) הסירו policies לפי *שם מדויק* — ולכן
--   פספסו כל מה שנקרא אחרת. זו אותה תקלה שכבר תוקנה פעמיים בקטן, וכאן היא
--   בהיקף מלא.
--
-- מה עושה המיגרציה:
--   1. מסירה **כל** policy בסכמה public שה-roles שלה כוללים anon או public.
--      דינמית ולא לפי רשימת שמות — כדי שלא תישאר שורה שלא חשבנו עליה.
--   2. מוודאת שלכל טבלה שנפגעה יש policy של צוות (is_staff), כדי שמסכי הניהול
--      שקוראים מהדפדפן עם ה-JWT של איש הצוות ימשיכו לעבוד.
--
-- ⚠️ למה זה לא שובר כלום:
--   • כל הזרימות הציבוריות (פורטל, טופס נדרים, שלוחות ימות, webhooks) עוברות
--     דרך API routes עם service-role, שעוקף RLS לחלוטין.
--   • שלושת הקבצים הציבוריים שכן נוגעים ב-Supabase מהדפדפן עושים זאת לאימות
--     בלבד (signInWithPassword / signOut) ואינם קוראים טבלאות.
--   • מסכי הניהול קוראים כמשתמש מאומת → is_staff() מחזיר true.
--
-- ⚠️ אידמפוטנטי. בטוח להריץ שוב.
-- ▶ הרצה: Supabase → SQL Editor → Run. בדיקת שפיות בתחתית.
-- ============================================================================

do $$
declare
  pol record;
  tbl record;
  dropped int := 0;
  created int := 0;
begin
  -- ── 1. הסרת כל policy שמעניק גישה ל-anon / public ──────────────────────────
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and ('anon' = any(roles) or 'public' = any(roles))
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    dropped := dropped + 1;
    raise notice 'הוסרה policy פתוחה: %.% → %', pol.schemaname, pol.tablename, pol.policyname;
  end loop;

  -- ── 2. לכל טבלה בסכמה public שאין לה אף policy — policy של צוות ────────────
  -- ⚠️ טבלה עם RLS ובלי אף policy נגישה רק ל-service-role. זה מאובטח, אבל
  -- מסכי ניהול שקוראים ישירות מהדפדפן (עם ה-JWT של איש הצוות) היו נשברים.
  -- לכן מוסיפים policy של צוות לכל טבלה שנשארה בלי כלום.
  for tbl in
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and c.relrowsecurity
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
      )
  loop
    execute format(
      'create policy %I on public.%I for all using (public.is_staff()) with check (public.is_staff())',
      tbl.relname || '_staff_all', tbl.relname
    );
    created := created + 1;
    raise notice 'נוספה policy של צוות: public.%', tbl.relname;
  end loop;

  raise notice '── סיכום: הוסרו % policies פתוחות, נוספו % policies של צוות ──', dropped, created;
end $$;

-- ============================================================================
-- בדיקת שפיות — אחרי ההרצה שתי השאילתות האלה חייבות להחזיר 0 שורות:
--
--   -- א. אין policy פתוח ל-anon
--   select tablename, policyname, roles::text
--   from pg_policies
--   where schemaname = 'public' and ('anon' = any(roles) or 'public' = any(roles));
--
--   -- ב. אין טבלה עם RLS בלי policy (כלומר מסכי הניהול לא נשברו)
--   select c.relname from pg_class c
--   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
--     and not exists (select 1 from pg_policies p
--                     where p.schemaname='public' and p.tablename=c.relname);
--
-- ⚠️ ולוודא בפועל אחרי ההרצה: כרטסת צאצא נפתחת, רשימת יולדות נטענת, הפורטל
-- הציבורי מזהה ת"ז ומאפשר כניסה. אם משהו נשבר — סימן שהוא קרא כ-anon, וזה
-- בדיוק מה שהיה צריך להיסגר; נחזיר policy ממוקדת לאותה טבלה ולא את "allow all".
-- ============================================================================
