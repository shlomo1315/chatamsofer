-- ─────────────────────────────────────────────────────────────────────────────
-- יריד: התחשבנות עם מחברים/מכונים/מו"לים + התאמה ידנית של "נמכר".
-- בקשת שלמה 14.10. החישוב עצמו: lib/bookFairSettlement.ts.
--
-- ⚠️ שלוש הטבלאות/הפונקציות נגישות ל-service_role בלבד: המסך והנתיבים
-- בודקים הרשאת book_fair בעצמם, כמו שאר פונקציות היריד.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) מכירות לפי ספר ──
--
-- 🔴 אותם סטטוסים כמו דיווח הדוכן (book_fair_fair_report): רק הזמנה ששולמה
-- היא מכירה. מבוטלת/נטושה/זוכתה במלואה אינה נספרת.
-- ⚠️ זוכתה חלקית נספרת במלואה — הזיכוי אינו נרשם ברמת השורה.
create or replace function public.book_fair_book_sales()
returns table (
  book_id          uuid,
  qty              integer,
  collected_agorot bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select i.book_id,
         sum(i.quantity)::integer,
         sum(i.line_total_agorot)::bigint
    from public.book_fair_order_items i
    join public.book_fair_orders o on o.id = i.order_id
   where i.book_id is not null
     and o.status in ('paid','picking','packed','shipped','delivered','partially_refunded')
   group by i.book_id;
$$;

revoke all on function public.book_fair_book_sales() from public, anon, authenticated;
grant execute on function public.book_fair_book_sales() to service_role;

-- ── 2) התאמת "נמכר" — יומן ──
--
-- 🔴 לא זיכוי ולא שינוי הזמנה: ההזמנות נשארות כפי שהן. ההתאמה מתקנת רק
-- את הסיכומים (קטלוג, דוח התחשבנות). דוגמה: בדוכן נרשמו 10 ונמכרו 9 → -1.
-- ⚠️ כל שורה היא רישום ביומן (מי, מתי, למה); ההתאמה לספר = סכום השורות.
-- amount_agorot = delta × מחיר הספר בעת הרישום, כדי שגם הסכום שנגבה יתוקן.
create table if not exists public.book_fair_sold_adjustments (
  id             uuid primary key default gen_random_uuid(),
  book_id        uuid not null references public.book_fair_books(id) on delete cascade,
  delta          integer not null check (delta <> 0),
  amount_agorot  integer not null,
  reason         text not null check (length(reason) between 1 and 300),
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists book_fair_sold_adj_book_idx on public.book_fair_sold_adjustments (book_id);
alter table public.book_fair_sold_adjustments enable row level security;

-- ── 3) תשלומים למחברים/מו"לים ──
--
-- ⚠️ payee הוא שם הגורם כפי שמופיע בקטלוג (מו"ל, ואם אין — מחבר).
-- ⚠️ ביטול ולא מחיקה: תשלום שנרשם בטעות מסומן cancelled_at, וההיסטוריה נשמרת.
create table if not exists public.book_fair_author_payments (
  id             uuid primary key default gen_random_uuid(),
  payee          text not null check (length(payee) between 1 and 200),
  amount_agorot  integer not null check (amount_agorot > 0),
  method         text not null check (method in ('transfer','check','cash','other')),
  paid_on        date not null,
  note           text check (note is null or length(note) <= 300),
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  cancelled_at   timestamptz,
  cancelled_by   uuid references public.profiles(id) on delete set null
);
create index if not exists book_fair_author_payments_payee_idx on public.book_fair_author_payments (payee);
alter table public.book_fair_author_payments enable row level security;
