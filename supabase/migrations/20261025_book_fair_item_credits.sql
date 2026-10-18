-- סימון ספרים שזוכו בהזמנה, ברמת מערכת ההזמנות בלבד (בלי זיכוי כספי ובלי מלאי).
-- שורה אחת לכל שורת הזמנה; quantity = כמה עותקים זוכו. נכנס לחישוב "נמכר בפועל".
create table if not exists book_fair_item_credits (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references book_fair_orders(id) on delete cascade,
  item_id uuid not null unique references book_fair_order_items(id) on delete cascade,
  order_number text not null,
  book_id uuid references book_fair_books(id) on delete set null,
  quantity integer not null check (quantity > 0),
  source text not null default 'manual' check (source in ('manual', 'excel')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists book_fair_item_credits_order_idx on book_fair_item_credits (order_id);
alter table book_fair_item_credits enable row level security;
