-- ═══════════════════════════════════════════════════════════════════════════
-- טיוטות — סנכרון דו-כיווני מול Gmail.
--
-- 🔴 למה טבלה נפרדת מ-gmail_messages: טיוטה היא ישות אחרת ב-Gmail. יש לה
-- draftId קבוע שנשמר לאורך העריכות, ו-messageId שמתחלף בכל שמירה. מי שמזהה
-- טיוטה לפי messageId מאבד אותה בעריכה הראשונה.
--
-- ⚠️ 🔴 וכאן, בניגוד להודעות, **הגוף כן נשמר**. זו אינה סתירה לכלל "אינדקס
-- ולא עותק": טיוטה היא תוכן שהמשתמש כותב *עכשיו* ועדיין לא שלח — מצב עבודה,
-- לא דואר שהתקבל. טעינה מחדש מ-Gmail בכל הקלדה הייתה הופכת את העריכה לבלתי
-- אפשרית, והמשתמש היה מאבד את מה שהקליד ברגע שהרשת מגמגמת.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.gmail_drafts (
  id              uuid primary key default gen_random_uuid(),

  -- ── המזהה היציב. זה מה שמזהה טיוטה לאורך חייה. ──
  draft_id        text not null unique,
  -- ⚠️ מתחלף בכל שמירה ב-Gmail, ולכן משמש כ*חותמת גרסה* ולא כמזהה.
  message_id      text,
  thread_id       text,
  account_id      uuid references public.gmail_accounts(id) on delete cascade,

  -- ── התוכן ──
  to_email        text,
  subject         text,
  body            text,

  -- 🔴 הגרסה שממנה נגזרה העריכה הנוכחית. זה מה שמאפשר לזהות שהטיוטה נערכה
  -- גם במקום אחר מאז שהמשתמש פתח אותה — ולהזהיר, במקום לדרוס בשקט.
  --
  -- ⚠️ בלי העמודה הזו אין דרך להבחין בין "המשתמש שומר את מה שהוא כתב" לבין
  -- "המשתמש דורס גרסה חדשה יותר שנכתבה בטלפון". שני המצבים נראים זהים.
  base_revision   text,

  updated_at      timestamptz not null default now(),
  synced_at       timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- רשימת הטיוטות של התיבה — האחרונה שנערכה קודם.
create index if not exists gmail_drafts_account
  on public.gmail_drafts (account_id, updated_at desc);

-- טיוטה של שרשור מסוים (תשובה שלא נשלחה).
create index if not exists gmail_drafts_thread
  on public.gmail_drafts (thread_id) where thread_id is not null;

alter table public.gmail_drafts enable row level security;
-- ⚠️ ללא policies: service-role בלבד. הטבלה נושאת תוכן שנכתב למשפחות.
