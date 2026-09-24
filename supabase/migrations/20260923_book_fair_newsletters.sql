-- דיוור יריד הספרים: הודעה אחת + תיעוד נמען-נמען.
--
-- 🔴 בלי טבלת נמענים אין דרך לדעת מי קיבל ומי לא. שליחה לאלפי כתובות
-- נכשלת חלקית כעניין שבשגרה (תיבה מלאה, דומיין שנסגר), ובלי תיעוד
-- הכישלון שקט לגמרי — ומי שיריץ שוב ישלח כפול לכולם.

create table if not exists public.book_fair_newsletters (
  id          uuid primary key default gen_random_uuid(),
  subject     text        not null,
  body        text        not null,
  -- draft → sending → sent. ⚠️ 'sending' אינו קישוט: הוא המנעול שמונע
  -- שליחה כפולה של אותו דיוור משתי לחיצות או משתי לשוניות.
  status      text        not null default 'draft'
                check (status in ('draft', 'sending', 'sent', 'failed')),
  -- צילום מצב הקהל בעת השליחה, לתיעוד: 'all' / 'reminder' / 'customer'
  audience    text        not null default 'all',
  total       integer     not null default 0,
  sent_count  integer     not null default 0,
  failed_count integer    not null default 0,
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create table if not exists public.book_fair_newsletter_recipients (
  id            uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references public.book_fair_newsletters(id) on delete cascade,
  email         text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'sent', 'failed')),
  error         text,
  sent_at       timestamptz,
  -- 🔴 ייחודי לכל דיוור: המנגנון היחיד שמונע שליחה כפולה לאותו אדם
  -- כשריצה נקטעת באמצע וממשיכה. בלעדיו כל המשך מייצר כפילויות.
  unique (newsletter_id, email)
);

create index if not exists book_fair_newsletter_recipients_pending_idx
  on public.book_fair_newsletter_recipients (newsletter_id)
  where status = 'pending';

alter table public.book_fair_newsletters enable row level security;
alter table public.book_fair_newsletter_recipients enable row level security;

-- ⚠️ צוות בלבד, כמו שאר טבלאות היריד. הנתיבים הציבוריים אינם נוגעים
-- בטבלאות האלה כלל.
drop policy if exists book_fair_newsletters_staff on public.book_fair_newsletters;
create policy book_fair_newsletters_staff on public.book_fair_newsletters
  for all to authenticated using (true) with check (true);

drop policy if exists book_fair_newsletter_recipients_staff on public.book_fair_newsletter_recipients;
create policy book_fair_newsletter_recipients_staff on public.book_fair_newsletter_recipients
  for all to authenticated using (true) with check (true);

-- ── ביטול הרשמה ──
-- 🔴 חובה חוקית ומעשית: דיוור בלי דרך יציאה נחסם על ידי ספקי הדואר.
-- הכתובת נשארת בטבלה ומסומנת, ולא נמחקת: מחיקה הייתה מאפשרת לה לחזור
-- פנימה בהרשמה הבאה, והאדם היה מקבל דיוור אחרי שביקש לצאת.
alter table public.book_fair_reminders
  add column if not exists unsubscribed_at timestamptz;
