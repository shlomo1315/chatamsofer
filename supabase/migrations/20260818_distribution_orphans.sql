-- ─────────────────────────────────────────────────────────────────────────────
-- רישומי חלוקה יתומים — ניקוי ומניעה.
--
-- 🔴 הבעיה: המפתח הזר beneficiary_id הוגדר ON DELETE SET NULL. כשמוטב
-- נמחק (או מוזג ככפילות בזמן הרישום המאסיבי, 04–10.08), השיוך התרוקן
-- אבל **שורת הרישום נשארה**. התוצאה: 14 רישומים לחלוקה בלי משפחה —
-- נספרים במונים, מנופחים בצפי התקציבי, ואי אפשר ליצור איתם קשר.
--
-- ⚠️ איך זה התגלה: בגרף הפילוח לפי עיר הופיעה קטגוריה "לא צוין" עם 14
-- רשומות. הן לא היו חסרות עיר — לא הייתה להן רשומת מוטב בכלל, והעיר
-- (שנשלפת דרך ה-join) נפלה ל-null. התסמין הצביע על השדה הלא נכון.
--
-- ⚠️ האינדקס הייחודי כבר כתוב `where beneficiary_id is not null` — כלומר
-- המבנה *ציפה* ל-null. זו הייתה עדות שהתנהגות המחיקה מכוונת, אבל בפועל
-- היא יוצרת רשומות שאין להן שום שימוש.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ניקוי הקיים ──
delete from public.distribution_recipients
where beneficiary_id is null;

-- ── מניעה: CASCADE במקום SET NULL ──
--
-- ⚠️ מחיקת מוטב תמחק מעכשיו גם את רישומיו לחלוקה. זו ההתנהגות הנכונה:
-- רישום לחלוקה של משפחה שאינה קיימת אינו נתון — הוא רעש.
alter table public.distribution_recipients
  drop constraint if exists distribution_recipients_beneficiary_id_fkey;

alter table public.distribution_recipients
  add constraint distribution_recipients_beneficiary_id_fkey
  foreign key (beneficiary_id) references public.beneficiaries(id)
  on delete cascade;

-- ⚠️ family_id נשאר SET NULL במכוון: הוא שדה משני (שיוך משפחתי) ואיבודו
-- אינו הופך את השורה לחסרת משמעות, בשונה מ-beneficiary_id.
