-- ─────────────────────────────────────────────────────────────────────────────
-- קוויטלאך — הערוצים האוטומטיים (מייל, נדרים פלוס, טלפון) וסוכן האחידות.
--
-- 1. מילון שמות מאושרים: הסוכן (lib/kvitelReview) משווה אליו כל מילה בשם
--    ובשם האם, ומסמן כתיב שנראה כמו שגיאה של שם מוכר. הוא רק מסמן, לא מתקן.
-- 2. source_ref ייחודי לכל ערוץ: מייל שנקלט פעמיים (Resend שולח שוב, dual-delivery)
--    או הגשה מנדרים שנשלחה שוב לא ייצרו בקשה כפולה.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.kvitel_name_dictionary (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null
);

alter table public.kvitel_name_dictionary enable row level security;
revoke all on public.kvitel_name_dictionary from anon, authenticated;
grant all on public.kvitel_name_dictionary to service_role;

create unique index if not exists kvitel_requests_source_ref_uq
  on public.kvitel_requests (channel, source_ref) where source_ref is not null;

create index if not exists kvitel_request_lines_created_idx on public.kvitel_request_lines (created_at desc);
