-- זיכויים: מספר זהות של בעל החשבון, וסימון "הועבר בפועל בבנק".
alter table public.book_fair_credits
  add column if not exists bank_holder_id text,
  add column if not exists transferred_at timestamptz,
  add column if not exists transferred_by uuid;

-- הגדר על פרטי הבנק חל גם על מספר הזהות.
create or replace function public.book_fair_credits_bank_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.bank_holder, new.bank_holder_recording, new.bank_number, new.bank_branch, new.bank_account, new.bank_holder_id) is not null then
      raise exception 'book_fair_credits: אין לשמור פרטי בנק ביצירת זיכוי';
    end if;
  elsif (new.bank_holder, new.bank_holder_recording, new.bank_number, new.bank_branch, new.bank_account, new.bank_holder_id)
        is distinct from (old.bank_holder, old.bank_holder_recording, old.bank_number, old.bank_branch, old.bank_account, old.bank_holder_id)
        and old.status not in ('sent', 'answered') then
    raise exception 'book_fair_credits: פרטי בנק נשמרים רק בזיכוי בסטטוס sent או answered';
  end if;
  return new;
end $$;
