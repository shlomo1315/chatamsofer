-- ============ רשימת ההלוואות בצד השרת: דפדוף + מונים ============
--
-- הרקע: מסך ההלוואות משך את *כל* השורות לדפדפן וסינן בזיכרון. עם גידול
-- הטבלה זמן הטעינה הפך לחסם.
--
-- 🔴 הנקודה הקריטית: "חזר מבירור" אינו סטטוס בעמודה אלא נגזרת —
-- ההודעה *האחרונה* בשרשור היא מהמבקש (direction='applicant') והסטטוס
-- 'inquiry'. הלוגיקה הזו הייתה ב-JS בלבד (LoansTable.isReturned), ואם
-- נשכפל אותה כאן לא-נכון, מזכירה תפספס בקשות שממתינות לטיפול מיידי.
-- לכן היא מוגדרת כאן *פעם אחת* (last_dir) ומשמשת גם את הסינון וגם את
-- המונים — בדיוק כמו ש-matchesFilter וה-counts נגזרים ממקור אחד ב-JS.

-- ההודעה האחרונה בכל שרשור בירור. distinct on = הראשונה אחרי המיון היורד,
-- כלומר האחרונה בזמן. זהה ל-Map שב-getReplied (הראשון שנראה מנצח).
create or replace view public.loan_last_message_dir as
select distinct on (loan_id)
       loan_id,
       direction as last_dir
from public.loan_messages
order by loan_id, created_at desc;

comment on view public.loan_last_message_dir is
  'כיוון ההודעה האחרונה בכל שרשור בירור — הבסיס ל"חזר מבירור".';

-- ─────────────────────────────────────────────────────────────────────────────
-- מונים לכל הלשוניות במעבר יחיד.
--
-- ⚠️ הקטגוריות אינן זרות: todo = fresh + returned. הן מחושבות מאותם
-- ביטויים כדי שלא ייתכן פער בין המונה לרשימה.
-- ⚠️ p_q מסונן כאן *באותה* צורה כמו בשאילתת הנתונים — אחרת המונה היה
-- מציג את כל הרשומות בזמן שהרשימה מסוננת בחיפוש.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.loans_list_counts(p_q text default null)
returns table (
  all_count      bigint,
  todo_count     bigint,
  fresh_count    bigint,
  returned_count bigint,
  sent_count     bigint,
  approved_count bigint,
  rejected_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select l.id,
           l.status,
           coalesce(d.last_dir, '') as last_dir
    from public.loans l
    left join public.loan_last_message_dir d on d.loan_id = l.id
    left join public.beneficiaries b on b.id = l.beneficiary_id
    where p_q is null or p_q = '' or (
         coalesce(b.full_name, '')        ilike '%' || p_q || '%'
      or coalesce(b.family_name, '')      ilike '%' || p_q || '%'
      or coalesce(b.id_number, '')        ilike '%' || p_q || '%'
      or coalesce(b.spouse_id_number, '') ilike '%' || p_q || '%'
      or coalesce(l.purpose, '')          ilike '%' || p_q || '%'
    )
  ), flagged as (
    select
      -- ⚠️ ההגדרות זהות ל-lib/loansListFilter.ts. שינוי כאן מחייב שינוי שם.
      -- ⚠️ approved כולל active/completed ו-rejected כולל defaulted — הלוואה
      -- בביצוע/שהסתיימה אושרה בעבר. בדיקת 'approved' בלבד הייתה מעלימה אותן.
      (status = 'pending')                                     as is_fresh,
      (status = 'inquiry' and last_dir = 'applicant')          as is_returned,
      (status = 'inquiry' and last_dir is distinct from 'applicant') as is_sent,
      (status in ('approved', 'active', 'completed'))          as is_approved,
      (status in ('rejected', 'defaulted'))                    as is_rejected
    from base
  )
  select
    count(*)                                             as all_count,
    count(*) filter (where is_fresh or is_returned)      as todo_count,
    count(*) filter (where is_fresh)                     as fresh_count,
    count(*) filter (where is_returned)                  as returned_count,
    count(*) filter (where is_sent)                      as sent_count,
    count(*) filter (where is_approved)                  as approved_count,
    count(*) filter (where is_rejected)                  as rejected_count
  from flagged;
$$;

comment on function public.loans_list_counts is
  'מוני לשוניות ההלוואות במעבר יחיד — אותה לוגיקה בדיוק כמו הרשימה.';

grant execute on function public.loans_list_counts(text) to authenticated;
