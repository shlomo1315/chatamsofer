-- ─────────────────────────────────────────────────────────────────────────────
-- רכישות כרטיסי מזון — אירוע מתועד, לא ניחוש מיומן התנועות.
--
-- הרקע: "סך הכרטיסים שנקנו" נגזר עד כה מסכימת התנועות החיוביות ביומן,
-- והמספר יצא שגוי שוב ושוב (0, 295, 662) כי יומן התנועות אינו יומן
-- רכישות: יש בו גם החזרות של כרטיסים שנכשלו, תיקוני ספירה והתאמות מלאי.
-- אין בנתונים סימן ודאי שמבחין ביניהם, ולכן כל ניסיון לזהות רכישה
-- בדיעבד היה ניחוש — וזו הסיבה שהתקלה חזרה שלוש פעמים.
--
-- הפתרון: רכישה נרשמת כרשומה משלה, עם תאריך חובה. "נקנו" = סכום הטבלה
-- הזו, ותו לא. מספר שניתן להצביע על מקורו.
--
-- ⚠️ purchased_on הוא date ולא timestamptz: התאריך הקובע הוא יום הרכישה
--    כפי שהמנהל יודע אותו (חשבונית), לא רגע ההקלדה למערכת.
-- ⚠️ אינה נוגעת ב-card_stock_ledger ואינה משנה את המלאי: המלאי (148)
--    מחושב נכון מהיומן ונשאר כפי שהוא. הטבלה הזו עונה על "כמה נקנו",
--    שאלה נפרדת מ"כמה יש".
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.card_purchases (
  id           uuid primary key default gen_random_uuid(),
  quantity     integer not null check (quantity > 0),
  purchased_on date    not null,
  note         text,
  created_by   text,
  created_at   timestamptz not null default now()
);

comment on table public.card_purchases is
  'רכישות כרטיסי מזון. מקור האמת היחיד ל"סך הכרטיסים שנקנו" — אינו נגזר מיומן התנועות.';

create index if not exists card_purchases_date_idx
  on public.card_purchases (purchased_on desc);

alter table public.card_purchases enable row level security;

-- ⚠️ ללא policy ל-anon/authenticated בכוונה: הגישה נעשית דרך service client
-- בנתיבי ה-API בלבד, שאוכפים requirePermission('maternity_cards').
-- הפרויקט נוקט "נכשל סגור" — טבלה בלי policy אינה נגישה מהדפדפן.

-- ── הרכישה ההיסטורית ────────────────────────────────────────────────────────
-- המערכת החלה לפעול עם 300 כרטיסים שנרכשו ב-22.7.2026, ומהם חולקו
-- הכרטיסים ליולדות. זו הרכישה היחידה עד כה (אושר עם המנהל).
--
-- ⚠️ מותנה בכך שהטבלה ריקה — כדי שהרצה חוזרת לא תיצור כפילות של 300.
insert into public.card_purchases (quantity, purchased_on, note)
select 300, date '2026-07-22', 'רכישה ראשונה — מלאי הפתיחה של המערכת'
where not exists (select 1 from public.card_purchases);
