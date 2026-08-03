-- ─────────────────────────────────────────────────────────────────────────────
-- חלוקות חגים — שלב הרישום.
--
-- המטרה בשלב זה אינה החלוקה עצמה אלא *לדעת מראש*: כמה משפחות אמורות להירשם
-- וכמה כסף להיערך לו. לכן לכל חלוקה יש סכום למשפחה, מצב "רישום פעיל", וכל
-- רישום נושא את הערוץ שממנו הגיע (ממשק / טלפון / מייל / הזנה ידנית) — כדי
-- שהפילוח יהיה זמין בכל רגע, בלי לחשב כלום בדיעבד.
--
-- ⚠️ נשען על הטבלאות הקיימות (distributions / distribution_recipients) ולא
-- יוצר טבלאות חדשות: אותה חלוקה תמשיך לשרת גם את שלב החלוקה בפועל (מוקדים,
-- טעינה), ופיצול לטבלה נפרדת היה מכריח מיגרציה שנייה של אותם נתונים.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.distributions
  -- שנה חופשית ("תשפ״ו" / "2026") — נכתבת ידנית, כי כל ארגון סופר אחרת
  add column if not exists year text,
  -- הסכום המתוכנן לכל משפחה. ממנו נגזר הצפי הכולל = נרשמים × סכום.
  add column if not exists amount_per_family numeric(10,2),
  -- הרישום פתוח? רק חלוקה פעילה מקבלת רישומים — בכל שלושת הערוצים.
  add column if not exists registration_open boolean not null default false,
  add column if not exists registration_opened_at timestamptz,
  add column if not exists registration_closed_at timestamptz;

alter table public.distribution_recipients
  -- מאיפה הגיע הרישום: portal | phone | email | admin
  add column if not exists source text not null default 'admin',
  add column if not exists registered_at timestamptz not null default now(),
  -- הטלפון שממנו בוצע הרישום (בערוץ הטלפוני) — לתיעוד ולזיהוי חוזר
  add column if not exists phone text,
  -- הודעת האישור (מייל / צינתוק) שנשלחה לנרשם
  add column if not exists notified_at timestamptz,
  add column if not exists notify_error text;

-- ⚠️ משפחה נרשמת פעם אחת לכל חלוקה. בלי האינדקס הזה אותה משפחה נרשמת שוב בכל
-- ערוץ (וגם בלחיצה כפולה בטלפון), והצפי התקציבי מנופח.
create unique index if not exists distribution_recipients_uniq_beneficiary
  on public.distribution_recipients(distribution_id, beneficiary_id)
  where beneficiary_id is not null;

create index if not exists distribution_recipients_distribution_idx
  on public.distribution_recipients(distribution_id);

-- חלוקה פעילה אחת לרישום בכל רגע — הערוץ הטלפוני מקריא "החלוקה הפעילה", ושתי
-- חלוקות פתוחות בבת אחת היו הופכות את זה לדו-משמעי.
create unique index if not exists distributions_single_open_registration
  on public.distributions((registration_open))
  where registration_open = true;
