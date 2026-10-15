-- ─────────────────────────────────────────────────────────────────────────────
-- יריד ספרים — זיכויים ללקוחות שלא קיבלו ספרים.
-- לקוח אחד בשורה: ספרים חסרים, סכום זיכוי, ערוץ (שיחת ימות / מייל) ופרטי חשבון בנק.
-- הליבה: lib/bookFairCredits.ts · מסך: /admin/book-fair/credits
-- טופס ציבורי: /credit/<token> · שלוחת ימות: /api/webhooks/yemot-credits
--
-- ⚠️ פרטי בנק: RLS בלי מדיניות והסרת הרשאות מ-anon ו-authenticated, כלומר service_role בלבד.
-- ⚠️ אין להדפיס את עמודות bank_* ללוגים.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.book_fair_credits (
  id               uuid primary key default gen_random_uuid(),
  customer_name    text,
  phone            text,
  email            text check (email is null or email = lower(email)),
  channel          text not null check (channel in ('phone','email')),
  books            text not null,
  amount_agorot    integer not null check (amount_agorot > 0),
  -- קישור אישי לטופס במייל (24 בתים אקראיים)
  token            text not null unique,
  status           text not null default 'pending'
                     check (status in ('pending','sent','send_failed','answered','details_entered')),
  send_error       text,
  sent_at          timestamptz,
  answered_at      timestamptz,
  details_at       timestamptz,
  -- שם בעל החשבון: טקסט מהטופס, או נתיב הקלטה מהטלפון (אי אפשר להקליד שם במקשים)
  bank_holder      text,
  bank_holder_recording text,
  bank_number      text,
  bank_branch      text,
  bank_account     text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((channel = 'phone' and phone is not null) or (channel = 'email' and email is not null))
);

create index if not exists book_fair_credits_status_idx on public.book_fair_credits (status);
create index if not exists book_fair_credits_phone_idx  on public.book_fair_credits (phone) where phone is not null;
create index if not exists book_fair_credits_email_idx  on public.book_fair_credits (email) where email is not null;

alter table public.book_fair_credits enable row level security;
revoke all on public.book_fair_credits from anon, authenticated;
