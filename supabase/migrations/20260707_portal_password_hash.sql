-- ============================================================================
-- Migration: hash לסיסמאות פורטל ההחלמה (recovery_portals)
-- ============================================================================
--
-- רקע הבעיה (code review):
--   recovery_portals.password נשמר ב-plaintext, ו-portal/login השווה אותו
--   ב-`!==` (plaintext, לא constant-time). דליפת DB/גיבוי חושפת את כל הסיסמאות.
--
-- הגישה (מעבר בטוח, ללא נעילת משתמשים):
--   1. מפעילים את pgcrypto.
--   2. מוסיפים עמודה password_hash.
--   3. ממלאים אותה מה-plaintext הקיים באמצעות crypt()+bcrypt.
--   העמודה הישנה password נשארת בינתיים — קוד ה-login החדש מעדיף password_hash
--   אם קיים, ונופל ל-plaintext אם לא (תמיכה דו-כיוונית בזמן המעבר). לאחר שווידאת
--   שהלוגין עובד מול ה-hash, אפשר להריץ את שלב 4 (מחיקת עמודת plaintext).
--
-- ▶ הרצה: Supabase → SQL Editor → Run. אחר כך פרוס את קוד ה-login המעודכן.
-- ============================================================================

-- ── 1. pgcrypto (ל-crypt/bcrypt) ─────────────────────────────────────────────
-- ב-Supabase pgcrypto יושב בסכמת extensions, לכן קוראים לפונקציות
-- כ-extensions.crypt / extensions.gen_salt ו-search_path כולל extensions.
create extension if not exists pgcrypto with schema extensions;

-- ── 2. עמודת hash + הסרת NOT NULL מ-plaintext ────────────────────────────────
alter table public.recovery_portals
  add column if not exists password_hash text;

-- מעתה כותבים רק ל-password_hash, אז password חייב להיות nullable כדי ש-upsert
-- חדש (בלי plaintext) לא ייכשל על NOT NULL.
alter table public.recovery_portals
  alter column password drop not null;

-- ── 3. מילוי מה-plaintext הקיים (bcrypt, cost 10) ────────────────────────────
-- רץ רק על שורות שעדיין אין להן hash ויש להן סיסמת plaintext.
update public.recovery_portals
set password_hash = extensions.crypt(password, extensions.gen_salt('bf', 10))
where password_hash is null
  and password is not null
  and password <> '';

-- ── פונקציית גיבוב (נקראת מ-portal/password דרך RPC בעת קביעת סיסמה) ──────────
create or replace function public.hash_portal_password(p_password text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select extensions.crypt(p_password, extensions.gen_salt('bf', 10));
$$;

revoke all on function public.hash_portal_password(text) from public;
-- service_role בלבד קורא לזה; לא anon/authenticated.

-- ── פונקציית אימות constant-time לשימוש עתידי מהשרת (אופציונלי) ───────────────
-- portal/login החדש משתמש ב-crypt() ישירות דרך ה-service_role, אבל אם תרצה
-- לאמת מתוך SQL: select (password_hash = crypt('<input>', password_hash)).
create or replace function public.verify_portal_password(p_home text, p_password text)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select exists (
    select 1 from public.recovery_portals
    where home_name = p_home
      and password_hash is not null
      and password_hash = extensions.crypt(p_password, password_hash)
  );
$$;

revoke all on function public.verify_portal_password(text, text) from public;
-- מוענק ל-service_role בלבד (הראוט קורא עם service key); לא ל-anon/authenticated.

-- ============================================================================
-- בדיקת שפיות — אחרי ההרצה:
--   select home_name,
--          (password_hash is not null) as has_hash,
--          (password_hash = crypt(password, password_hash)) as hash_matches_plain
--   from recovery_portals;
--   -- has_hash אמור להיות true, ו-hash_matches_plain אמור להיות true בכל שורה.
-- ============================================================================

-- ============================================================================
-- שלב 4 — הרץ רק אחרי שווידאת שהלוגין עובד מול ה-hash בפרודקשן (ימים אחדים):
--   alter table public.recovery_portals drop column password;
-- (אחרי המחיקה, עדכן את קוד ה-upsert של הסיסמה כך שיכתוב רק password_hash.)
-- ============================================================================
