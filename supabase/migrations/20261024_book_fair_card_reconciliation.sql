-- סנכרון חיובי אשראי: כל חיוב באקסל של נדרים מול ההזמנה שהותאמה אליו.
-- charged_at: שעה מקומית כפי שמופיעה באקסל (בלי אזור זמן).
-- match_type: transaction = לפי מספר עסקה, amount_time = לפי סכום ושעה.
-- system_last4: הספרות ששמורות בתשלום במערכת, רק כשהן שונות מהאקסל.
create table if not exists book_fair_card_reconciliation (
  id bigserial primary key,
  order_number text not null,
  charged_at timestamp not null,
  amount_agorot integer not null,
  card_last4 text not null,
  transaction_id text not null unique,
  match_type text not null check (match_type in ('transaction', 'amount_time')),
  deviation_minutes numeric,
  system_last4 text
);
create index if not exists book_fair_card_reconciliation_order_idx on book_fair_card_reconciliation (order_number);
alter table book_fair_card_reconciliation enable row level security;
