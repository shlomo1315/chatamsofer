-- קביעת מלאי פתיחה ("baseline") ליומן כרטיסי המזון.
--
-- ⚠️ הצורך: היומן צבר תנועות מתקופת הבדיקות (מאות הוספות וניכויים על תיקי טסט
-- שנמחקו מאז). המלאי עצמו נכון — הוא סכום היומן — אבל ההתאמה מול המציאות
-- ("קניתי 300 כרטיסים, אישרתי 48 לידות") הייתה בלתי אפשרית, כי הסכום כלל גם
-- את הבדיקות. תנועת baseline קובעת נקודת אפס: מכאן והלאה ההתאמה נמדדת מול
-- הספירה הפיזית שהמנהל הזין, וכל מה שקדם לה נשאר ביומן לתיעוד בלבד.
--
-- ⚠️ delta של baseline הוא ההפרש בין המלאי הרצוי למלאי המחושב (יכול להיות
-- שלילי). כך המלאי נשאר תמיד SUM(delta) ולא נוצר "מספר שמור" שיכול להיפרד
-- מהיומן.

alter table public.card_stock_ledger drop constraint if exists card_stock_ledger_reason_check;

alter table public.card_stock_ledger
  add constraint card_stock_ledger_reason_check
  check (reason in ('restock','birth_approval','manual_out','auto_assign','adjust','baseline'));
