-- ─────────────────────────────────────────────────────────────────────────────
-- סשנים לפורטלים המשותפים (הלוואות / חלוקות).
--
-- 🔴 הבעיה שזה פותר: הטוקן נגזר מ"יום + טביעת-סיסמה" בלבד — שני ערכים
-- שזהים לכל המשתמשים. כלומר **כל מי שנכנס באותו יום קיבל בדיוק אותה
-- מחרוזת**. שלוש תוצאות:
--   1. העתקת עוגייה מדפדפן אחד לאחר = גישה מלאה, בלי סיסמה.
--   2. אי אפשר לנתק אדם אחד — רק להחליף סיסמה לכולם.
--   3. אי אפשר לדעת מי נכנס, מתי, וכמה מכשירים פעילים.
--
-- עכשיו לכל כניסה מזהה אקראי משלה (32 בייטים), שנשמר כאן. הטוקן חותם על
-- המזהה הזה, ולכן שתי כניסות לעולם אינן מייצרות אותה מחרוזת.
--
-- ⚠️ המזהה נשמר כ-hash ולא כטקסט: דליפת קריאה מהטבלה לא תאפשר להתחזות.
-- אותו שיקול כמו בסיסמאות.
--
-- ⚠️ הטוקן עצמו נשאר חתום ב-HMAC ולא רק "מזהה במסד": כך טוקן מזויף נדחה
-- בלי שאילתה כלל, והמסד אינו נחשף לניחושים.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.portal_sessions (
  id uuid primary key default gen_random_uuid(),
  -- 'loans' | 'distributions' — פורטלים מבודדים זה מזה
  portal text not null,
  -- SHA-256 של מזהה הסשן. לעולם לא המזהה עצמו.
  token_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- מי נכנס, לזיהוי בעת ניתוק. לא מזהה ודאי — רק עזר תפעולי.
  user_agent text,
  ip text,
  -- ניתוק נקודתי: מסומן ולא נמחק, כדי שהניתוק יישאר מתועד.
  revoked_at timestamptz,
  revoked_by text
);

-- אימות טוקן — השאילתה החמה. רץ בכל בקשה לפורטל.
create unique index if not exists portal_sessions_hash_idx
  on public.portal_sessions (portal, token_hash);

-- רשימת הסשנים הפעילים למסך הניהול
create index if not exists portal_sessions_active_idx
  on public.portal_sessions (portal, expires_at desc)
  where revoked_at is null;

comment on table public.portal_sessions is
  'סשנים של הפורטלים המשותפים. כל כניסה = שורה, כדי שניתן יהיה לנתק אחד בלי להחליף סיסמה לכולם.';
comment on column public.portal_sessions.token_hash is
  'SHA-256 של מזהה הסשן. המזהה עצמו קיים רק בעוגייה של המשתמש.';
