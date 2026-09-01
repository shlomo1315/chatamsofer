-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 מנעול ה-worker נתקע ועצר את הניוזלטר לחלוטין.
--
-- pg_try_advisory_lock הוא מנעול ברמת *סשן*. כל קריאת RPC ל-Supabase
-- עוברת דרך pgBouncer ומקבלת סשן אחר, ולכן:
--   try_worker_lock  תפס מנעול בסשן א'
--   release_worker_lock רץ בסשן ב' — ולא שחרר דבר
-- המנעול נשאר תפוס לנצח, וכל ריצה עתידית קיבלה false ויצאה מיד.
--
-- ⚠️ הכישלון שקט לחלוטין: הקמפיין נשאר 'sending', attempts=0, בלי שום
-- שגיאה. במסך זה נראה כמו "שליחה בתהליך" שלא זזה לעולם.
--
-- 🔴 מנעול מבוסס-טבלה עם פקיעה: אינו תלוי בסשן, ומשחרר את עצמו אחרי
-- 15 דקות גם אם התהליך שהחזיק בו מת באמצע (deploy, קריסה, timeout).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.worker_locks (
  key         bigint primary key,
  locked_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  holder      text
);

alter table public.worker_locks enable row level security;
-- ⚠️ הפונקציות הן SECURITY DEFINER, ולכן אין צורך ב-policy לצוות.
-- הטבלה עצמה נשארת סגורה: היא מנגנון פנימי ולא נתון שמישהו קורא.

create or replace function public.try_worker_lock(p_key bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ok boolean;
begin
  -- מנקה מנעול שפקע — התהליך שהחזיק בו כבר לא חי.
  delete from public.worker_locks where key = p_key and expires_at < now();

  insert into public.worker_locks (key, locked_at, expires_at, holder)
  values (p_key, now(), now() + interval '15 minutes', current_setting('application_name', true))
  on conflict (key) do nothing;

  get diagnostics ok = row_count;
  return ok > 0;
end;
$$;

create or replace function public.release_worker_lock(p_key bigint)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  delete from public.worker_locks where key = p_key;
  select true;
$$;
