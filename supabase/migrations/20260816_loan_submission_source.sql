-- ─────────────────────────────────────────────────────────────────────────────
-- מקור הגשת בקשת ההלוואה — אתר או מייל.
--
-- ⚠️ נשמר כדי לענות על שאלה תפעולית: כמה בקשות מגיעות בכל מסלול. שני
-- המסלולים אינם שקולים — בהגשה דרך האתר טופס אישור הרב מגיע מלא מהמערכת
-- (שם, ת"ז וסדר הדורות מודפסים), ובמייל הפונה ממלא הכול ביד ועלול לטעות.
-- הפילוח הוא שמראה אם ההעדפה לאתר אכן עובדת.
--
-- ⚠️ ללא ברירת מחדל ו-nullable: בקשות שקדמו לשדה אינן יודעות מאיפה הגיעו,
-- וקביעת 'portal' עבורן הייתה ממציאה נתון. null נקרא "לא ידוע" בתצוגה.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.loans
  add column if not exists submission_source text;

comment on column public.loans.submission_source is
  'מאיפה הוגשה הבקשה: portal (האתר) או email (הגשה במייל). null = בקשות שקדמו לשדה.';

do $$ begin
  alter table public.loans drop constraint if exists loans_submission_source_check;
exception when others then null; end $$;

alter table public.loans add constraint loans_submission_source_check
  check (submission_source is null or submission_source in ('portal', 'email'));

-- לפילוח לפי מקור בדוחות
create index if not exists loans_submission_source_idx
  on public.loans (submission_source, created_at desc)
  where submission_source is not null;
