-- ─────────────────────────────────────────────────────────────────────────────
-- שלב "נשלח שטר" בפורטל הביצוע.
--
-- הרקע: בין אישור ההלוואה לבין הפקדת הכסף יש שלב ביניים — שליחת השטר
-- לחתימת המבקש. עד היום לא היה לו ייצוג, ולכן מי שהסתכל בפורטל לא ידע
-- אם השטר כבר נשלח או שעדיין לא נגעו בבקשה.
--
-- ⚠️ אינו סטטוס נפרד ב-status אלא חותמת זמן משלו: השטר יכול להישלח
-- ולחזור, והבקשה נשארת 'approved' לכל אורך הדרך עד ההפקדה. סטטוס נפרד
-- היה מחייב כל שאילתה במערכת להכיר בו.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.loans
  add column if not exists note_sent_at timestamptz;

alter table public.loans
  add column if not exists note_sent_by text;

comment on column public.loans.note_sent_at is
  'מתי נשלח השטר לחתימת המבקש (פורטל הביצוע)';

-- ⚠️ אינדקס חלקי: פורטל הביצוע שואל רק על בקשות מאושרות שטרם הופקדו.
create index if not exists loans_awaiting_disbursement_idx
  on public.loans (created_at desc)
  where status = 'approved' and disbursed_at is null;
