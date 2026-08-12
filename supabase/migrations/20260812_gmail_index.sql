-- ═══════════════════════════════════════════════════════════════════════════
-- אינדקס Gmail — המעבר ל-Gmail כמקור אמת יחיד לדואר.
--
-- 🔴 ההחלטה שהטבלה הזו מגלמת: **אינדקס, לא עותק.**
--
-- היום אותה הודעה יושבת בשלושה מקומות: המקור בתיבת Gmail, עותק ב-Resend
-- (inbound_emails), ועוד עותק שמוחזר לגמייל ע"י maybeForwardToGmail. שלושה
-- עותקים, ושני מעבדים שמתחרים עליהם — זה מה שגרם ל-runAutoReply "לגנוב"
-- בקשות (ראו EMAIL-INTAKE-FIX.md).
--
-- הטבלה הזו שוברת את זה בכך שהיא *לא* מחזיקה את ההודעה. היא מחזיקה מצביע
-- (gmail_message_id) ואת מה שהמערכת מוסיפה — שיוך לכרטסת, ניתוב מחלקה,
-- סטטוס בקשה. גוף ההודעה נקרא מ-Gmail לפי דרישה, תמיד.
--
-- ⚠️ לכן אין כאן עמודת body/html במכוון. עמודה כזו הייתה הופכת את הטבלה
-- לעותק שלישי שיכול להתיישן ולסתור את Gmail — בדיוק הבעיה שאנחנו מסלקים.
-- מה שמותר להחזיק הוא מטא-דאטה לתצוגת רשימה וחיפוש, שנגזרת מ-Gmail ומתעדכנת
-- ממנו בכל סנכרון.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. סמן הסנכרון המצטבר ───────────────────────────────────────────────
-- ⚠️ historyId ולא חותמת זמן. last_sync_epoch הקיים מבוסס על שאילתת after:,
-- שיודעת רק "מה הגיע מאז" — היא אינה תופסת קריאה, שינוי תווית או מחיקה,
-- ולכן אינה יכולה לשמש לסנכרון דו-כיווני.
alter table public.gmail_accounts
  add column if not exists last_history_id text,
  -- מתי בוצעה לאחרונה התאמה מלאה (סריקה, ולא היסטוריה מצטברת).
  -- ⚠️ נדרש כי Gmail שומר היסטוריה לזמן מוגבל: historyId ישן מוחזר כ-404,
  -- ואז חייבים ליפול לסריקה מלאה. בלי לתעד מתי — אין דרך לדעת שזה קרה.
  add column if not exists last_full_sync_at timestamptz,
  -- מנוי ה-watch של Gmail פג אחרי 7 ימים וחייב חידוש. בלי חותמת התפוגה
  -- הסנכרון נדם בשקט בדיוק שבוע אחרי ההפעלה.
  add column if not exists watch_expires_at timestamptz;


-- ─── 2. האינדקס עצמו ─────────────────────────────────────────────────────
create table if not exists public.gmail_messages (
  id                uuid primary key default gen_random_uuid(),

  -- ── המצביע ל-Gmail. זה כל מה שבאמת מזהה את ההודעה. ──
  gmail_message_id  text not null unique,
  thread_id         text,
  account_id        uuid references public.gmail_accounts(id) on delete cascade,

  -- ── מטא-דאטה לתצוגה וחיפוש. נגזרת מ-Gmail ומתעדכנת ממנו. ──
  from_email        text,
  from_name         text,
  to_email          text,
  -- ⚠️ הכתובת שאליה נשלח במקור, מכותרת X-Gm-Original-To שכלל הניתוב מוסיף.
  -- זה מה שמאפשר לדעת לאיזו מחלקה המייל שייך כשהוא מגיע לתיבה משותפת —
  -- to_email לבדו אינו מספיק אחרי ניתוב.
  original_to       text,
  subject           text,
  snippet           text,
  sent_at           timestamptz,
  has_attachments   boolean not null default false,

  -- ── מצב מ-Gmail. זה הציר של הסנכרון הדו-כיווני. ──
  is_unread         boolean not null default true,
  labels            text[] not null default '{}',

  -- ── מה שהמערכת מוסיפה. זו הסיבה שהטבלה קיימת בכלל. ──
  department        text,
  beneficiary_id    uuid references public.beneficiaries(id) on delete set null,
  -- סטטוס עיבוד בקשה (לידה/הלוואה/סיוע) שנקלטה מהמייל הזה.
  request_status    text,
  request_ref       text,

  -- ⚠️ מחיקה רכה: הודעה שנמחקה ב-Gmail יורדת מהתצוגה, אבל השיוך לכרטסת
  -- והתיעוד שנבנו עליה נשארים. מחיקה קשה הייתה מוחקת עבודה אנושית בגלל
  -- לחיצה בטלפון.
  deleted_at        timestamptz,

  synced_at         timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- רשימת התיבה: החדש קודם, ורק מה שלא נמחק.
create index if not exists gmail_messages_inbox
  on public.gmail_messages (account_id, sent_at desc) where deleted_at is null;

-- שרשור שיחה.
create index if not exists gmail_messages_thread
  on public.gmail_messages (thread_id) where deleted_at is null;

-- "כל הדואר של המשפחה הזו" — הפעולה שבשבילה האינדקס נבנה.
create index if not exists gmail_messages_beneficiary
  on public.gmail_messages (beneficiary_id, sent_at desc) where beneficiary_id is not null;

-- מיון לפי מחלקה + לא-נקראים, לתצוגת התיבות.
create index if not exists gmail_messages_department
  on public.gmail_messages (department, is_unread, sent_at desc) where deleted_at is null;

alter table public.gmail_messages enable row level security;

-- ⚠️ ללא policies: service-role בלבד. הטבלה נושאת כתובות ותוכן פניות של
-- משפחות, והגישה אליה עוברת דרך ה-API עם אכיפת ההרשאות שם — כמו inbound_emails.
