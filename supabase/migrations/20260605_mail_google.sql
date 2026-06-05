-- ===================================================
-- חיבור Gmail (Google Workspace) לתיבת הדואר
-- חשבון משותף יחיד שמחובר ב-OAuth. הטוקנים נגישים רק דרך service-role.
-- הרץ פעם אחת ב-Supabase SQL Editor
-- ===================================================

create table if not exists public.mail_google_account (
  id              boolean primary key default true,
  email           text,
  refresh_token   text,
  access_token    text,
  token_expiry    timestamptz,
  last_history_id text,
  connected_by    uuid references public.profiles(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  -- שורה אחת בלבד (חשבון משותף)
  constraint mail_google_single_row check (id)
);

-- RLS פעיל וללא policies — אף לקוח (כולל מנהל מחובר) אינו יכול לקרוא את הטוקנים.
-- כל הגישה נעשית בשרת דרך SUPABASE_SERVICE_ROLE_KEY שעוקף RLS.
alter table public.mail_google_account enable row level security;
