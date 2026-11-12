-- ── קישור מעקב אשראי לנדיב ──
-- קישור ציבורי לקריאה בלבד: יולדות שאושרו, לפי בית החלמה, תאריכים וסכומים.
-- הטוקן אקראי וארוך, ניתן לביטול, ואפשר לנעול אותו לבית החלמה אחד.
create table if not exists public.donor_report_links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,
  label        text not null,
  recovery_home text,
  created_at   timestamptz not null default now(),
  created_by   text,
  revoked_at   timestamptz,
  last_used_at timestamptz
);

-- גישה רק דרך service role: בלי מדיניות = אין גישה לאנונימי ולמשתמשים.
alter table public.donor_report_links enable row level security;

notify pgrst, 'reload schema';
