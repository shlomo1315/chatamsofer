-- ─────────────────────────────────────────────────────────────────────────────
-- מצב "ממתין לטופס אישור רב" — טיוטה ששומרת את הבקשה עד שהטופס החתום עולה.
--
-- הרקע: הטופס דורש חתימה פיזית של רב. המבקש ממלא את הפרטים, מוריד את
-- הטופס, הולך להחתים — וזה יכול לקחת ימים. בלי מצב ביניים הוא היה חוזר
-- לטופס ריק וממלא הכל מחדש, או מוותר.
--
-- ⚠️ awaiting_rabbi_form אינו "בקשה שהוגשה": היא אינה מגיעה לטיפול המזכיר
-- ואינה נספרת כבקשה פתוחה לצורך חסימת כפילות (ראה lib/openLoanGuard.ts) —
-- אחרת המבקש היה ננעל מחוץ לטיוטה של עצמו.
-- ─────────────────────────────────────────────────────────────────────────────

-- הרחבת אילוץ הסטטוסים
do $$
begin
  alter table public.loans drop constraint if exists loans_status_check;
exception when others then null;
end $$;

alter table public.loans
  add constraint loans_status_check
  check (status in (
    'awaiting_rabbi_form',
    'pending', 'inquiry', 'approved', 'active', 'completed', 'rejected', 'defaulted'
  ));

-- כתובת הטופס החתום שהועלה בחזרה
alter table public.loans
  add column if not exists rabbi_form_url text;

-- מתי הטופס הורד — לתזכורות ולמעקב אחרי טיוטות שנתקעו
alter table public.loans
  add column if not exists rabbi_form_downloaded_at timestamptz;

-- מתי הטופס החתום הועלה
alter table public.loans
  add column if not exists rabbi_form_uploaded_at timestamptz;

-- ⚠️ אינדקס חלקי: השאילתה הנפוצה היא "האם למבקש הזה יש טיוטה ממתינה",
-- ורק שורות במצב הזה רלוונטיות. אינדקס מלא היה סורק את כל ההלוואות.
create index if not exists loans_awaiting_rabbi_form_idx
  on public.loans (beneficiary_id)
  where status = 'awaiting_rabbi_form';

comment on column public.loans.rabbi_form_url is
  'טופס אישור רב חתום שהועלה בחזרה על ידי המבקש';
