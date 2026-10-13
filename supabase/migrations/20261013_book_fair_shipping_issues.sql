-- תקלות משלוח ביריד (בקשת המשתמש 13.10).
--
-- 🔴 למה: משלוח שלא הגיע, ספר פגום, ספר שגוי או חסר — כל אלה דורשים
-- טיפול, והיו מתועדים בהערה חופשית או לא בכלל. טבלה עם סוג וסטטוס
-- מאפשרת לסנן "מה עוד פתוח".
--
-- ⚠️ order_id עם on delete cascade: תקלה בלי הזמנה אינה ניתנת לטיפול.

create table if not exists public.book_fair_shipping_issues (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.book_fair_orders(id) on delete cascade,
  issue_type       text not null
                     check (issue_type in ('not_arrived','damaged','wrong_book','missing','other')),
  status           text not null default 'open'
                     check (status in ('open','in_progress','resolved')),
  description      text not null check (char_length(description) between 1 and 2000),
  resolution_note  text check (resolution_note is null or char_length(resolution_note) <= 2000),
  reported_by      uuid references auth.users(id) on delete set null,
  resolved_by      uuid references auth.users(id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists book_fair_shipping_issues_order_idx   on public.book_fair_shipping_issues (order_id);
create index if not exists book_fair_shipping_issues_status_idx  on public.book_fair_shipping_issues (status);
create index if not exists book_fair_shipping_issues_created_idx on public.book_fair_shipping_issues (created_at desc);

-- ⚠️ כמו שאר טבלאות היריד: אנשי צוות בלבד, בלי גישה ציבורית.
-- ה-API עובד עם service role ובודק הרשאת book_fair בעצמו.
alter table public.book_fair_shipping_issues enable row level security;
drop policy if exists book_fair_shipping_issues_staff_all on public.book_fair_shipping_issues;
create policy book_fair_shipping_issues_staff_all on public.book_fair_shipping_issues
  for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.book_fair_shipping_issues from anon;
