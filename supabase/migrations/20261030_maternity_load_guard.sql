-- חסם בבסיס הנתונים נגד טעינה כפולה ללידה: שורה פעילה אחת לכל תיק.
-- שורה נוצרת לפני הפנייה לנדרים ומשתחררת (released_at) רק בכישלון ודאי או בפריקה.
create table if not exists maternity_load_guard (
  id          bigserial primary key,
  aid_id      uuid not null,
  tlush_id    text,
  created_at  timestamptz not null default now(),
  released_at timestamptz
);
create unique index if not exists maternity_load_guard_one_active
  on maternity_load_guard (aid_id) where released_at is null;
alter table maternity_load_guard enable row level security;
