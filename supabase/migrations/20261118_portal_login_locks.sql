-- נעילת ניסיונות סיסמה בפורטלים המשותפים (/shared והלוואות), לפי כתובת IP.
-- המצב נשמר במסד כדי לשרוד פריסה ומספר מופעי שרת. גישה רק דרך service-role (RLS פעיל, בלי מדיניות).
create table if not exists public.portal_login_locks (
  scope text not null,
  ip text not null,
  fails int not null default 0,
  level int not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, ip)
);
alter table public.portal_login_locks enable row level security;
