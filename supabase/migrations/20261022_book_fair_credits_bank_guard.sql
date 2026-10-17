-- פרטי בנק בזיכויים נשמרים רק כשהזיכוי נשלח ללקוח (status 'sent' או 'answered').
-- אכיפה במסד, כגיבוי לכל נתיבי הכתיבה באפליקציה (טופס המייל ושלוחת ימות).
create or replace function public.book_fair_credits_bank_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.bank_holder, new.bank_holder_recording, new.bank_number, new.bank_branch, new.bank_account) is not null then
      raise exception 'book_fair_credits: אין לשמור פרטי בנק ביצירת זיכוי';
    end if;
  elsif (new.bank_holder, new.bank_holder_recording, new.bank_number, new.bank_branch, new.bank_account)
        is distinct from (old.bank_holder, old.bank_holder_recording, old.bank_number, old.bank_branch, old.bank_account)
        and old.status not in ('sent', 'answered') then
    raise exception 'book_fair_credits: פרטי בנק נשמרים רק בזיכוי בסטטוס sent או answered';
  end if;
  return new;
end $$;

drop trigger if exists book_fair_credits_bank_guard on public.book_fair_credits;
create trigger book_fair_credits_bank_guard before insert or update on public.book_fair_credits
  for each row execute function public.book_fair_credits_bank_guard();
