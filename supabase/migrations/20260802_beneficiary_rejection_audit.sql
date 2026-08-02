-- ─────────────────────────────────────────────────────────────────────────────
-- תיעוד דחיית צאצא: מי דחה ומתי.
--
-- rejection_reason כבר קיים. כאן מוסיפים את מי דחה (rejected_by → profiles) ומתי
-- (rejected_at), כדי שבממשק הניהול אפשר יהיה לראות בכל רגע — עבור צאצא שנדחה —
-- את הסיבה, שם המשתמש שדחה, והתאריך והשעה.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.beneficiaries
  add column if not exists rejected_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejected_at timestamptz;
