-- ─────────────────────────────────────────────────────────────────────────────
-- מחלקת "אישורים חריגים" — דגל is_special על beneficiaries.
--
-- אנשים שאינם צאצאים (נכדים), שהמנהל מכניס ומאשר להם להגיש בקשות. הם עובדים
-- בדיוק כמו מוטב רגיל (אותם טפסים/בקשות/פורטל/ניהול) — ההבדל היחיד שאין להם
-- סדר דורות (הם לא צאצאים), ולכן מדלגים על כל מה שקשור לייחוס.
--
-- גישה מפושטת (החלטת המשתמש): דגל על הרשומה הקיימת, לא טבלה נפרדת.
-- אדם חריג = רשומת beneficiaries רגילה עם is_special=true, בלי lineage_*.
--
-- default false → כל הרשומות הקיימות נשארות רגילות. כלום לא נשבר.
--
-- 🔒 אידמפוטנטי. ▶ הרצה: Supabase → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.beneficiaries
  add column if not exists is_special boolean not null default false;

-- אינדקס חלקי — רק על החריגים (רשומה מעטה), לשליפת דף החריגים המסונן.
create index if not exists beneficiaries_special
  on public.beneficiaries (is_special) where is_special = true;
