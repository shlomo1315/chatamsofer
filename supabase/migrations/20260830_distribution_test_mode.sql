-- מצב בדיקה לחלוקת חגים — מסלול מלא בלי כסף אמיתי.
--
-- 🔴 בלי זה הדרך היחידה לבדוק את הטעינה והשובר היא להטעין כסף אמיתי
-- לכרטיס של משפחה אמיתית ולשלוח לה מייל. משמעות טעות בשלב הזה היא
-- כסף שיצא ומייל שנשלח, בלי דרך חזרה.
--
-- ⚠️ שדה של *החלוקה* ולא הגדרה גלובלית: מתג גלובלי שנשכח דלוק היה הופך
-- חלוקה אמיתית לבדיקה בשקט — כלומר אלפי משפחות בלי כסף בכרטיס. כך
-- הבדיקה חיה ומתה עם החלוקה שנבדקת, בדיוק כמו card_expiry.
alter table public.distributions
  add column if not exists test_mode boolean not null default false;

-- לאן נשלחים המיילים במצב בדיקה. NULL = לא נשלח מייל כלל.
--
-- ⚠️ 🔴 המייל לעולם אינו נשלח למשפחה במצב בדיקה, גם אם הכתובת הזו ריקה.
-- ברירת המחדל הבטוחה היא לא לשלוח, ולא "לשלוח לנמען האמיתי".
alter table public.distributions
  add column if not exists test_email text;

comment on column public.distributions.test_mode is
  'מצב בדיקה: אין טעינה בנדרים, אין סימון load_status, והמייל נשלח רק ל-test_email.';

comment on column public.distributions.test_email is
  'כתובת לקבלת שוברי הבדיקה. NULL = לא נשלח מייל במצב בדיקה.';
