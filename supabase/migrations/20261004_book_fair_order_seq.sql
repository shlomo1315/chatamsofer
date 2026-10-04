-- מספרי הזמנה מספריים רצים ליריד הספרים.
--
-- 🔴 למה: המספר הקודם היה BF-26-7TS6JA — בלתי אפשרי להקראה בטלפון.
-- המתקשר שומע "בי אף עשרים ושש שבע טי אס ג'יי איי" ואינו יכול לרשום
-- אותו או לחזור עליו. ששת הספרות נקראות ספרה-ספרה בבירור.
--
-- ⚠️ רצף במסד ולא מונה באפליקציה: שתי הזמנות שנוצרות באותה שנייה
-- (אתר + טלפון + דוכן פועלים במקביל) היו מקבלות אותו מספר, וה-unique
-- על order_number היה מפיל את השנייה אחרי שהלקוח כבר שילם.

create sequence if not exists book_fair_order_seq
  as bigint
  start with 121200
  increment by 1
  no cycle;

-- ⚠️ ההתחלה נאכפת גם כשהרצף כבר קיים מהרצה קודמת, אבל *לעולם לא
-- מוזזת אחורה*: setval נמוך ממה שכבר הונפק היה מייצר מספרים כפולים.
do $$
declare
  cur bigint;
begin
  select last_value into cur from book_fair_order_seq;
  if cur < 121200 then
    perform setval('book_fair_order_seq', 121200, false);
  end if;
end $$;

comment on sequence book_fair_order_seq is
  'מספרי הזמנה ליריד הספרים — 6 ספרות רצות מ-121200, להקראה בטלפון';

-- הנפקת המספר הבא.
--
-- 🔴 security definer: הרצף אינו חשוף ל-anon, אבל נתיב ההזמנה
-- הציבורי חייב להנפיק ממנו. ⚠️ search_path מקובע — בלעדיו אפשר
-- להטעות את הפונקציה לטבלה אחרת.
create or replace function next_book_fair_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  n := nextval('book_fair_order_seq');
  -- ⚠️ בלי ריפוד לאורך קבוע: אחרי 999999 המספר פשוט גדל לשבע ספרות
  -- במקום להתהפך לאפס ולהתנגש במה שכבר הונפק.
  return n::text;
end $$;

revoke all on function next_book_fair_order_number() from public;
grant execute on function next_book_fair_order_number() to anon, authenticated, service_role;
