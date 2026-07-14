-- ─────────────────────────────────────────────────────────────────────────────
-- בירור בקשת הלוואה: התכתבות דו-כיוונית עם המבקש.
--
-- זרימה:
--   1. מנהל כותב הודעת בירור -> נשלח מייל למבקש, הבקשה עוברת ל-'inquiry'.
--   2. המבקש משיב במייל -> התשובה נכנסת לשרשור, והבקשה חוזרת ל-'pending'
--      (כלומר לרשימת ההמתנה לאישור).
--
-- זיהוי התשובה: reply-to ייחודי (office+l<token>@) — אותו מנגנון שכבר עובד
-- במכתבי הברכה, ולכן אמין גם כשלמוטב כמה בקשות פתוחות במקביל.
-- ─────────────────────────────────────────────────────────────────────────────

-- סטטוס חדש: 'inquiry' = בתהליך בירור.
-- העמודה היא text (לא enum), ולכן אין צורך ב-ALTER TYPE — רק בעדכון ה-constraint
-- אם קיים כזה.
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'loans' and column_name = 'status'
      and constraint_name like '%status%check%'
  ) then
    alter table public.loans drop constraint if exists loans_status_check;
  end if;
end $$;

alter table public.loans
  add constraint loans_status_check
  check (status in ('pending', 'inquiry', 'approved', 'active', 'completed', 'rejected', 'defaulted'));

-- שרשור ההתכתבות
create table if not exists public.loan_messages (
  id          uuid primary key default gen_random_uuid(),
  loan_id     uuid not null references public.loans(id) on delete cascade,

  -- 'staff' = נשלח מהמערכת למבקש · 'applicant' = תשובת המבקש שנקלטה במייל
  direction   text not null check (direction in ('staff', 'applicant')),
  body        text not null,

  -- מי שלח (בהודעת צוות). null בתשובת המבקש.
  sender_id   uuid references public.profiles(id) on delete set null,
  sender_name text,

  -- האם המנהל כבר ראה את תשובת המבקש (להתראות)
  is_read     boolean not null default false,

  created_at  timestamptz not null default now()
);

create index if not exists loan_messages_loan_id_idx on public.loan_messages(loan_id, created_at);
-- להתראות: כל תשובות המבקש שטרם נקראו
create index if not exists loan_messages_unread_idx
  on public.loan_messages(is_read)
  where direction = 'applicant' and is_read = false;

alter table public.loan_messages enable row level security;

-- גישה דרך service-role בלבד (ה-API אוכף הרשאות בעצמו)
drop policy if exists "loan_messages_service" on public.loan_messages;
create policy "loan_messages_service" on public.loan_messages
  for all using (auth.role() = 'service_role');
