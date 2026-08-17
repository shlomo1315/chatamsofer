-- ─────────────────────────────────────────────────────────────────────────────
-- ערים שבורות במאגר הצאצאים — איתור ותיקון.
--
-- 🔴 הרקע: הרישום אכף שהרחוב יהיה מהמאגר הרשמי, אבל על העיר בדק רק
-- ש"השדה אינו ריק". לכן נשמרו הקלדות חלקיות ("יר", "ירו", "בית ש")
-- ומילוי אוטומטי באנגלית ("Jerusalem"). האכיפה נוספה בקוד — זה מנקה
-- את מה שכבר נכנס.
--
-- ⚠️ להריץ שלב 1 קודם ולהסתכל. שלב 2 מתקן רק את מה שחד-משמעי.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── שלב 1: מי הן? ──
-- ⚠️ מציג גם כתובת וטלפון — הכתובת היא שמכריעה במקרים דו-משמעיים
-- ("בית ש" = בית שמש או בית שאן?).
select
  b.id, b.family_name, b.full_name, b.city, b.address, b.phone, b.email
from public.beneficiaries b
left join (select distinct city from public.gov_streets) g
  on regexp_replace(replace(replace(trim(b.city), '"', ''), '''', ''), '\s+', ' ', 'g')
   = regexp_replace(replace(replace(trim(g.city), '"', ''), '''', ''), '\s+', ' ', 'g')
where b.city is not null
  and trim(b.city) <> ''
  and g.city is null
order by b.city;


-- ── שלב 2: תיקון החד-משמעיים ──
-- ⚠️ מורץ בנפרד, ורק אחרי שהסתכלת על שלב 1.
-- ⚠️ התיקון לפי **מזהה** ולא לפי שם העיר: כך אין סיכוי שעדכון יתפוס
-- רשומה שלא התכוונו אליה.
--
-- ⚠️ "בית ש" / "בית שמ" = **בית שמש** בוודאות (אישור המשתמש, 18.08).
-- הכתובות תומכות: נחל רביבים, תלמוד בבלי ורבי אלעזר — רמת בית שמש.

update public.beneficiaries set city = 'ירושלים', updated_at = now()
where id in (
  '0bee3908-e6f4-4a87-96bb-a1ef269b2399',  -- פנט · Jerusalem
  'e9a16d85-ec2b-4bee-bad4-a93c4c5f0e02',  -- גשטטנר · יר
  'fa161f3b-a7b5-426d-9688-d232c4c9a41f',  -- ריבלין · ירו
  '3b9453e7-5e7c-44ec-b4a3-719ab1d68411',  -- פפנהיים · ירו
  '34ea2c19-752d-4091-8d92-442c334cdc85',  -- מאיר · ירוש
  'c432232f-58ac-489f-adee-8ff1c76e525c'   -- ערלאנגער · ירושל
);

update public.beneficiaries set city = 'בית שמש', updated_at = now()
where id in (
  'e2adb047-2fb6-4feb-ba6e-bf1cd9a6c722',  -- קורניצר · בית ש
  'f932561e-bd5f-49aa-9266-65a3b30e82f9',  -- בלסבלג · בית שמ
  'c3be14de-ada2-40c3-9cfe-9f53654c79a2'   -- פרנקל · בית שמ
);

update public.beneficiaries set city = 'בני ברק', updated_at = now()
where id = 'f23803cb-0648-4a9a-b009-9ad304cc0c00';  -- פלמן · בני -ברק


-- ── שלב 3: אימות — ירושלים 6 · בית שמש 3 · בני ברק 1 ──
-- select city, count(*) from public.beneficiaries
-- where id in ('0bee3908-e6f4-4a87-96bb-a1ef269b2399','e2adb047-2fb6-4feb-ba6e-bf1cd9a6c722',
-- 'f932561e-bd5f-49aa-9266-65a3b30e82f9','c3be14de-ada2-40c3-9cfe-9f53654c79a2',
-- 'f23803cb-0648-4a9a-b009-9ad304cc0c00','e9a16d85-ec2b-4bee-bad4-a93c4c5f0e02',
-- 'fa161f3b-a7b5-426d-9688-d232c4c9a41f','3b9453e7-5e7c-44ec-b4a3-719ab1d68411',
-- '34ea2c19-752d-4091-8d92-442c334cdc85','c432232f-58ac-489f-adee-8ff1c76e525c')
-- group by city;
