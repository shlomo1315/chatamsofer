-- ניקוי כתובות מייל — הסרת תווי כיווניות בלתי נראים (U+202B/U+202C/U+200F…)
--
-- 🔴 אלה אינן שגיאות הקלדה: הכתובות תקינות לחלוטין ורובן כבר אומתו
-- בהצלחה, אך נעטפו בתווים בלתי נראים בהעתקה מוואטסאפ — וכל בדיקת
-- תקינות נכשלה עליהן. הכתובת שמתחת נשארת בדיוק כפי שהיא.
--
-- נוצר מ-lib/emailDomainFix.ts (stripInvisible) — אותה פונקציה שמכוסה
-- ב-24 טסטים. 26 עדכונים.
--
-- ⚠️ 10 כתובות אינן כאן: שגיאות הקלדה אמיתיות שאין דרך לנחש.
--     .@gmail.comb036506864
--     0504197002@gmail.com0541234
--     0527166134@gmail.com30005000
--     0533195278@30005000.,com
--     0583297761,r@gmail.com
--     a@w0548494514.c
--     a0527618765@g.k
--     f616500@gweil.com000
--     r0583239061@gmail.comא
--     v0533166411@,gnaij.cib

-- ── 1. גיבוי ──
create table if not exists beneficiaries_email_backup_20260820 as
  select id, email from beneficiaries where email is not null and email <> '';

-- ── 2. העדכון ──
update beneficiaries b set email = v.fixed
from (values
  ('dffd6a5b-4c2c-46b1-b8f9-805f41556d93'::uuid, '3207974@gmail.com'),
  ('4c3bff15-14c3-4218-8dcd-b755b3609c8d'::uuid, '3257833@gmail.com'),
  ('73d21148-0c7a-4960-89f4-d1ac86fca869'::uuid, '4129927@gmail.com'),
  ('7d6f43b6-d40a-4d36-afc8-fcd4ee2ad0eb'::uuid, '5071shosh@gmail.com'),
  ('a23a49c6-530f-4315-9ac6-47e40cdfb73b'::uuid, '6766073@gmail.com'),
  ('f4c40c21-cb62-4de6-b1ab-c88ef1cecf1c'::uuid, '9845954@gmail.com'),
  ('eee090da-0008-44c2-9561-89e8b37d88e1'::uuid, 'a0527691745@gmail.com'),
  ('d511cb6f-3b62-46ea-ace3-9cac95ae0c1a'::uuid, 'a0556742891@gmail.com'),
  ('1a5843dc-41b1-47b3-be9d-65800385baf6'::uuid, 'a086633290@gmail.com'),
  ('576f109e-95a9-447c-a001-b76855931f22'::uuid, 'a7183221@gmail.com'),
  ('0ac66b0c-0532-4e9e-8176-007889d029d9'::uuid, 'abc0504137354@gmail.com'),
  ('26e0417e-0f8c-4666-a0ad-4b9d955dd229'::uuid, 'abr932002@gmail.com'),
  ('90d3e690-724b-49cd-9010-c7feb6f7fd6b'::uuid, 'ax0527165923@gmail.com'),
  ('0b815334-bcec-4583-a89f-1e4204d83f34'::uuid, 'c0527680692@gmail.com'),
  ('bf6631c3-4692-489d-8d75-6a6a20b08d0f'::uuid, 'et4150671@gmail.com'),
  ('cf64d9f1-da6d-4a0c-8dae-bd992c17f73a'::uuid, 'g0533118000@gmail.com'),
  ('da961fbe-3266-42ca-8117-0db6c2ccf5ae'::uuid, 'ha0527102@gmail.com'),
  ('ae48f2e4-668b-4311-8800-35d2a5fe4efd'::uuid, 'l0556785873@gmail.com'),
  ('7224ed4f-8b1f-41e3-990a-09fecd732523'::uuid, 'mfd62462@gmail.com'),
  ('5455309e-4cd0-4b97-8f74-ba4ce9442235'::uuid, 'mshe0556772458@gmail.com'),
  ('d68c5522-bce5-4d87-b0c8-6a1aaaa7e136'::uuid, 'r0533197539@gmail.com'),
  ('a8cc988b-4ab5-42fd-aa2f-69e67b28d8c7'::uuid, 'ru6968@gmail.com'),
  ('4e8f4bcc-1196-4ed7-b434-485ccc964540'::uuid, 's0548464563@gmail.com'),
  ('eff67d39-f1c8-4388-9756-fdd1c0e044d3'::uuid, 's0548544969@gmail.com'),
  ('b01d912a-70c0-4cda-a8e3-def5e9d8cd4e'::uuid, 'sbwqspn@gmail.com'),
  ('1af38eca-d4ad-4a72-9b65-788e2e60aa87'::uuid, 'zcukuiauc@gmail.com')
) as v(id, fixed)
where b.id = v.id;

-- ── 3. אימות ──
--
-- ⚠️ הביטוי בנוי מ-chr() ולא מ-escapes. בגרסה הראשונה הלוכסנים אבדו
-- בכתיבת הקובץ: [^@,\s] הפך ל-[^@,s] ו-\. ל-"." (כלומר "כל תו"),
-- והשאילתה החזירה 1,259 במקום 10 — נראה ככשל בהרצה, בעוד ההרצה הצליחה
-- והשאילתה עצמה הייתה שבורה. chr(32) ו-[.] אינם תלויים בלוכסן.

-- (א) כתובות שנותר בהן תו בלתי נראה — אמור להחזיר 0.
--     ⚠️ זהו הסינון הנכון: "מכיל תו בלתי נראה", ולא "נכשל בבדיקת תקינות".
--     3 כתובות עם תו פותח בלבד עברו את בדיקת התקינות ולכן פוספסו בסבב 1
--     (ראו email-cleanup-round2.sql).
select count(*) as with_invisible from beneficiaries
where email ~ ('[' || chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238) || chr(65279) || ']');

-- (ב) שגיאות הקלדה אמיתיות שנותרו לטיפול ידני — אמור להחזיר 10.
select count(*) as truly_invalid from beneficiaries
where email is not null and email <> ''
  and email !~ ('^[^@,' || chr(32) || ']+@[^@,' || chr(32) || ']+[.][A-Za-z]{2,}$');

