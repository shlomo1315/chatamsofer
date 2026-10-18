-- 4 ספרות אחרונות של כרטיס האשראי בהזמנה, לצורך אימות רכישות
alter table book_fair_orders add column if not exists card_last4 text;
