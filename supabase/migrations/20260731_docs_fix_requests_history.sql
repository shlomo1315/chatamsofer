-- ─────────────────────────────────────────────────────────────────────────────
-- היסטוריית בקשות תיקון/השלמת מסמכים.
--
-- כשהמזכירות מסמנת "השלמת מסמכים" ומבקשת תיקונים מהצאצא (מסמכים נדרשים,
-- הערות חופשיות, ובקשת תיקון עץ דורות), עד כה חלק מהמידע לא נשמר כלל:
--   • required_docs, lineage_fix_note — נשמרו בשדות ה-beneficiary (הבקשה האחרונה בלבד)
--   • docs_notes (ההערות החופשיות) — נשלחו רק במייל ונעלמו.
-- לכן לא הייתה דרך לדעת בדיעבד מה בדיוק ביקשנו מהצאצא.
--
-- כאן כל בקשת תיקון נשמרת כרשומה נפרדת עם חותמת זמן — היסטוריה מלאה.
--
-- 🔒 אידמפוטנטי. ▶ הרצה: Supabase → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.docs_fix_requests (
  id                  uuid primary key default gen_random_uuid(),
  beneficiary_id      uuid not null references public.beneficiaries(id) on delete cascade,
  -- מסמכים שנדרשו (רשימת מפתחות, כפי שנשמר ב-required_docs)
  required_docs       text,
  -- הערות חופשיות של המזכירות (מה שנשלח במייל ולא נשמר עד היום)
  docs_notes          text,
  -- בקשת תיקון עץ דורות + הערה
  lineage_fix_required boolean not null default false,
  lineage_fix_note    text,
  -- מי ביקש (לנוחות בלבד — שם הצוות; ה-id נשמר גם הוא)
  requested_by        uuid references public.profiles(id) on delete set null,
  requested_by_name   text,
  created_at          timestamptz not null default now()
);

-- שליפה כרונולוגית לכרטסת (החדשה ראשונה)
create index if not exists docs_fix_requests_ben
  on public.docs_fix_requests (beneficiary_id, created_at desc);

alter table public.docs_fix_requests enable row level security;
-- ללא policies: גישה דרך service-role בלבד (עקבי עם scheduled_emails / app_settings).
-- הכתיבה והקריאה נעשות מ-endpoints server-side.
