-- תקלות משלוח ביריד (בקשת המשתמש 13.10, אפיון: docs/book-fair-shipping-issues.md).
--
-- 🔴 למה: משלוח שלא הגיע, ספר פגום, ספר לא נכון או חסר — כל אלה דורשים
-- טיפול, והיו מתועדים בהערה חופשית או לא בכלל. טבלה עם סוג וסטטוס
-- מאפשרת לסנן "מה עוד פתוח", והיומן שומר מי עשה מה ומתי.
--
-- ⚠️ אין מחיקה: דיווח שנפתח בטעות עובר ל-cancelled ונשאר בתיעוד.
-- ⚠️ תקלה אינה משנה את סטטוס ההזמנה ואינה נוגעת במלאי.

create table if not exists public.book_fair_shipping_issues (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.book_fair_orders(id) on delete cascade,
  issue_type       text not null
                     check (issue_type in ('not_arrived','damaged','wrong_item','missing_item','other')),
  status           text not null default 'open'
                     check (status in ('open','in_progress','resolved','cancelled')),
  -- ⚠️ חובה בסגירה: "טופל" בלי לומר איך — אי אפשר לדעת אם הלקוח קיבל משהו.
  resolution       text check (resolution in ('resent','replaced','refunded','arrived_late','no_action')),
  description      text not null check (char_length(description) between 1 and 2000),
  reported_via     text check (reported_via in ('phone','email','whatsapp','other')),
  -- [{ item_id, title, quantity }] — העתק של שם הספר, כמו title_snapshot בהזמנה.
  affected_items   jsonb not null default '[]'::jsonb check (jsonb_typeof(affected_items) = 'array'),
  created_by       uuid references auth.users(id) on delete set null,
  resolved_by      uuid references auth.users(id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint book_fair_shipping_issues_resolution_chk
    check (status <> 'resolved' or resolution is not null)
);

create index if not exists book_fair_shipping_issues_order_idx   on public.book_fair_shipping_issues (order_id);
create index if not exists book_fair_shipping_issues_status_idx  on public.book_fair_shipping_issues (status);
create index if not exists book_fair_shipping_issues_created_idx on public.book_fair_shipping_issues (created_at desc);

-- יומן הטיפול: הערות ושינויי סטטוס. נכתב בלבד — הערה אינה נדרסת.
create table if not exists public.book_fair_shipping_issue_events (
  id           uuid primary key default gen_random_uuid(),
  issue_id     uuid not null references public.book_fair_shipping_issues(id) on delete cascade,
  kind         text not null check (kind in ('note','status','edit')),
  body         text check (body is null or char_length(body) <= 2000),
  from_status  text,
  to_status    text,
  resolution   text,
  created_by   uuid references auth.users(id) on delete set null,
  author_name  text,
  created_at   timestamptz not null default now()
);

create index if not exists book_fair_shipping_issue_events_issue_idx
  on public.book_fair_shipping_issue_events (issue_id, created_at);

-- ⚠️ כמו שאר טבלאות היריד: אנשי צוות בלבד, בלי גישה ציבורית.
-- ה-API עובד עם service role ובודק הרשאת book_fair בעצמו.
do $$
declare t text;
begin
  foreach t in array array['book_fair_shipping_issues', 'book_fair_shipping_issue_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_select', t);
    -- ⚠️ קריאה בלבד לאנשי צוות: כל כתיבה עוברת דרך ה-API (service role) שבודק הרשאת book_fair,
    -- והיומן נשאר להוספה בלבד.
    execute format(
      'create policy %I on public.%I for select using (public.is_staff())',
      t || '_staff_select', t
    );
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end $$;
