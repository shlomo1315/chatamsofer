-- ניקוי משלים — 3 כתובות עם תו כיווניות *פותח בלבד* (U+202B בלי סוגר)
--
-- 🔴 למה הן פוספסו בסבב הראשון: הרשימה נבנתה מכתובות שנכשלות בבדיקת
-- התקינות, ואלה *עוברות* אותה — התו יושב לפני הכתובת ואינו שובר את
-- הפורמט. הוא עדיין בלתי נראה ועלול לשבור שליחה.
--
-- ⚠️ הלקח: הסינון הנכון הוא "מכיל תו בלתי נראה", לא "נכשל בבדיקת
-- תקינות". השאילתה בסוף סורקת לפי הקריטריון הזה.
--
-- הכתובות עצמן תקינות לחלוטין — רק התו יורד.

update beneficiaries set email = 'ht626279@gmail.com'
  where id = '7a2aff7c-b5f2-419c-9c09-a74f591e23c8'::uuid;
update beneficiaries set email = 'w0583250185@gmail.com'
  where id = 'd62c98a9-a83b-4920-872d-f2d893f43d41'::uuid;
update beneficiaries set email = 'a0583219970@gmail.com'
  where id = '1f365bf0-43c2-44b0-8f78-2490d74b6038'::uuid;

-- ── אימות: שתי השורות אמורות להחזיר 0 ו-10 ──
-- כתובות שנותר בהן תו בלתי נראה:
select count(*) as with_invisible from beneficiaries
where email ~ ('[' || chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238) || chr(65279) || ']');

-- שגיאות הקלדה אמיתיות שנותרו לטיפול ידני:
select count(*) as truly_invalid from beneficiaries
where email is not null and email <> ''
  and email !~ ('^[^@,' || chr(32) || ']+@[^@,' || chr(32) || ']+[.][A-Za-z]{2,}$');
