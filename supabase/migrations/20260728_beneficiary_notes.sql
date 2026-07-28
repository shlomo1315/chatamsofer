-- ─────────────────────────────────────────────────────────────────────────────
-- "צ'אט" תיעוד המשפחה — הערות פנימיות של הצוות על משפחה, כרונולוגית.
--
-- כל חבר צוות יכול לכתוב הערה על משפחה; ההערה נשמרת עם מזהה ושם הכותב
-- וחותמת זמן, כך שתמיד רואים מי כתב מה ומתי (כמו שרשור צ'אט).
--
-- 🔒 אידמפוטנטי. ▶ הרצה: Supabase → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.beneficiary_notes (
  id              uuid primary key default gen_random_uuid(),
  beneficiary_id  uuid not null references public.beneficiaries(id) on delete cascade,
  body            text not null,
  -- הכותב — מזהה הפרופיל + שם לנוחות התצוגה (לא תלוי ב-join)
  author_id       uuid references public.profiles(id) on delete set null,
  author_name     text,
  created_at      timestamptz not null default now()
);

-- שליפה כרונולוגית לכרטיס (הישנה ראשונה — סדר צ'אט טבעי)
create index if not exists beneficiary_notes_ben
  on public.beneficiary_notes (beneficiary_id, created_at asc);

alter table public.beneficiary_notes enable row level security;
-- ללא policies: גישה דרך service-role בלבד (עקבי עם docs_fix_requests).
-- הכתיבה והקריאה נעשות מ-endpoints server-side עם אימות הרשאות צוות.
