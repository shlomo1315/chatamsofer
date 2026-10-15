-- ─────────────────────────────────────────────────────────────────────────────
-- יולדות — בית החלמה חריג (אישור מנהל).
--
-- יולדת שקיבלה אישור חריג לבית החלמה / מלון שאינו ברשימה משלמת בעצמה ומביאה
-- קבלה, ואנחנו מחזירים לה. המנהל מסמן את החריגה בכרטסת ומעלה את הקבלה.
-- שם המקום עצמו נשמר ב-recovery_home (כמו כל בית החלמה), והעמודות כאן מסמנות
-- שזה אישור חריג ושומרות את הקבלה ואת מי שאישר.
-- הקבלה בדלי הפרטי documents תחת maternity-exception/<aid_id>/ — בלי מזהה
-- המוטב בנתיב, כך שהפורטל הציבורי לא יכול לגשת אליה (ראו lib/fileAccess).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.maternity_aids
  add column if not exists recovery_exception              boolean not null default false,
  add column if not exists recovery_exception_note         text,
  add column if not exists recovery_exception_receipt_path text,
  add column if not exists recovery_exception_receipt_name text,
  add column if not exists recovery_exception_by           uuid references public.profiles(id) on delete set null,
  add column if not exists recovery_exception_at           timestamptz;
