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
-- ⚠️ "בית ש" / "בית שמ" **אינם כאן במכוון** — הם דו-משמעיים
-- (בית שמש / בית שאן) ודורשים הכרעה לפי הכתובת. תקן אותם ידנית בכרטסת.

-- update public.beneficiaries
-- set city = 'ירושלים', updated_at = now()
-- where trim(city) in ('יר', 'ירו', 'ירוש', 'ירושל', 'Jerusalem', 'jerusalem');

-- update public.beneficiaries
-- set city = 'בני ברק', updated_at = now()
-- where trim(city) in ('בני -ברק', 'בני-ברק', 'ב"ב', 'בב');


-- ── שלב 3: אימות ──
-- select city, count(*) from public.beneficiaries
-- where city is not null and trim(city) <> ''
-- group by city order by count(*) desc;
