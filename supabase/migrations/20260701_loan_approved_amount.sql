-- סכום שאושר בפועל להלוואה (נפרד מהסכום המבוקש ב-amount).
-- בפורטל הביצוע מוצג רק הסכום המאושר.
alter table public.loans
  add column if not exists approved_amount numeric(10,2);

-- הלוואות שכבר מאושרות וללא סכום מאושר — אתחול לסכום המבוקש
update public.loans
   set approved_amount = amount
 where approved_amount is null
   and status in ('approved', 'active', 'completed');
