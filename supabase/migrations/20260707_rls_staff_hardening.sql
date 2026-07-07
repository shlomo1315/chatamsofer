-- ============================================================================
-- Migration: הידוק RLS — מ"כל session מאומת" ל"רק צוות רשום ופעיל"
-- ============================================================================
--
-- רקע הבעיה (code review, קריטי):
--   כל ה-policies היו `using (auth.role() = 'authenticated')`. כלומר כל token
--   מאומת של Supabase (שאפשר ליצור ישירות מול ה-anon key הציבורי) קיבל קריאה
--   וכתיבה מלאה לכל ה-PII. בנוסף, ל-policies של UPDATE לא היה `with check`,
--   כך שמשתמש יכול היה לשנות כל שורה לכל ערך (למשל לאשר לעצמו הלוואה/זכאות).
--
-- מה ה-migration הזה עושה (גישה מדורגת ובטוחה):
--   1. יוצר helper `public.is_staff()` — SECURITY DEFINER — שבודק שקיימת שורת
--      profiles פעילה עבור auth.uid(). זה מהדק ל"צוות פעיל" בלבד.
--   2. מחליף את כל ה-SELECT/INSERT/UPDATE policies כך שיסתמכו על is_staff().
--   3. מוסיף `with check (public.is_staff())` לכל UPDATE (סתימת הפרצה של USING-only).
--
-- ⚠️ מה זה *לא* עושה: הידוק גרנולרי לפי role ספציפי (admin מול secretary וכו').
--   זה מכוון — הידוק כזה דורש מיפוי מדויק של איזה role עושה איזו פעולה, אחרת
--   הוא שובר מסכים למשתמשים לגיטימיים. הבסיס הזה בטוח ואינו שובר אף role קיים.
--
-- 🔒 בטיחות: ה-migration אידמפוטנטי (drop policy if exists לפני create). אפשר
--   להריץ מחדש. יש בסוף בלוק ROLLBACK מוער אם צריך לחזור אחורה.
--
-- ▶ הרצה: העתק את כל הקובץ ל-Supabase → SQL Editor → Run.
--   בדוק מיד אחרי (ראה "בדיקות שפיות" בתחתית) שהצוות עדיין רואה נתונים.
-- ============================================================================

-- ── 1. Helper: האם המשתמש הנוכחי הוא איש צוות פעיל ─────────────────────────────
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and coalesce(is_active, true) = true
  );
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

-- ── 2. SELECT policies ───────────────────────────────────────────────────────
-- (notifications נשאר על auth.uid()=user_id — הוא כבר נכון ואינו PII משותף)
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','families','beneficiaries','family_relations','documents',
    'maternity_aids','loans','loan_payments','distributions',
    'distribution_recipients','activity_log'
  ]
  loop
    execute format('drop policy if exists "authenticated users can read all" on public.%I', t);
    execute format('drop policy if exists "staff can read" on public.%I', t);
    execute format('create policy "staff can read" on public.%I for select using (public.is_staff())', t);
  end loop;
end $$;

-- profiles: משתמש תמיד יכול לקרוא את השורה של עצמו (נדרש ל-is_staff וללוגין)
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (id = auth.uid());

-- ── 3. INSERT policies ───────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'beneficiaries','families','maternity_aids','loans','loan_payments',
    'distributions','distribution_recipients','activity_log'
  ]
  loop
    execute format('drop policy if exists "authenticated users can insert" on public.%I', t);
    execute format('drop policy if exists "staff can insert" on public.%I', t);
    execute format('create policy "staff can insert" on public.%I for insert with check (public.is_staff())', t);
  end loop;
end $$;

-- ── 4. UPDATE policies — כולל WITH CHECK (הפרצה שנסתמה) ───────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'beneficiaries','families','maternity_aids','loans',
    'distributions','distribution_recipients'
  ]
  loop
    execute format('drop policy if exists "authenticated users can update" on public.%I', t);
    execute format('drop policy if exists "staff can update" on public.%I', t);
    execute format(
      'create policy "staff can update" on public.%I for update using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

-- ============================================================================
-- בדיקות שפיות — הרץ אחרי ה-migration (כמשתמש צוות מחובר, לא service_role):
--   select public.is_staff();                    -- אמור להחזיר true עבור צוות
--   select count(*) from beneficiaries;          -- אמור להחזיר את המספר הרגיל
--   select count(*) from maternity_aids;         -- אמור לעבוד
-- אם is_staff() מחזיר false לצוות אמיתי — ודא שיש לו שורה ב-profiles עם
-- is_active=true, אחרת הוא יחסם. במקרה חירום הרץ את בלוק ה-ROLLBACK למטה.
-- ============================================================================

-- ============================================================================
-- ROLLBACK (הרץ רק במקרה חירום — מחזיר להתנהגות הקודמת הפתוחה):
-- ----------------------------------------------------------------------------
-- do $$ declare t text; begin
--   foreach t in array array['profiles','families','beneficiaries','family_relations',
--     'documents','maternity_aids','loans','loan_payments','distributions',
--     'distribution_recipients','activity_log'] loop
--     execute format('drop policy if exists "staff can read" on public.%I', t);
--     execute format('create policy "authenticated users can read all" on public.%I for select using (auth.role() = ''authenticated'')', t);
--   end loop;
-- end $$;
-- (החזר גם insert/update באופן דומה אם צריך, ו- drop policy "read own profile")
-- ============================================================================
