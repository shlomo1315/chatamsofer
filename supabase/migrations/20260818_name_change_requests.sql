-- ─────────────────────────────────────────────────────────────────────────────
-- בקשות שינוי שם מהאזור האישי.
--
-- הרקע: עד כה שם ותעודת זהות היו חסומים לחלוטין בעדכון העצמי — הם מזהים את
-- האדם, ושינוי חופשי שלהם היה מאפשר להחליף זהות של רשומה מאושרת. אבל שגיאות
-- כתיב בשם קיימות, והדרך היחידה לתקן הייתה טלפון למשרד.
--
-- 🔴 הפתרון: הנרשם מבקש, ההנהלה מאשרת. הרשומה עצמה אינה משתנה עד האישור.
-- ⚠️ ת"ז נשארת חסומה לגמרי — היא המפתח לזיהוי, ולא שדה שמתקנים בו כתיב.
--
-- ⚠️ רק שם *פרטי* (בעל/אישה). שם משפחה משפיע על שיוך העץ והחלוקות, ולכן
-- נשאר במשרד.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.name_change_requests (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,

  -- ⚠️ מי מבני הזוג: 'self' = הרשומה הראשית (full_name), 'spouse' = בן/בת הזוג.
  target text not null check (target in ('self', 'spouse')),

  -- ⚠️ הערך הישן נשמר ברשומה עצמה ולא נגזר בזמן האישור: בין הבקשה לאישור
  -- המשרד עשוי לשנות את השם בעצמו, ואז "לפני" היה מוצג שגוי ביומן.
  old_name text,
  new_name text not null,

  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text,

  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,

  -- האם השינוי הוחל גם על צומת עץ הדורות (כשהיה צומת משויך).
  lineage_updated boolean not null default false
);

-- ⚠️ בקשה פתוחה אחת לכל שדה: שתי בקשות ממתינות על אותו שם היו מציגות
-- למנהל שתי חלוניות סותרות, והאישור השני היה דורס את הראשון בשקט.
create unique index if not exists name_change_one_open
  on public.name_change_requests (beneficiary_id, target)
  where status = 'pending';

create index if not exists name_change_pending_idx
  on public.name_change_requests (requested_at desc)
  where status = 'pending';

alter table public.name_change_requests enable row level security;

-- ⚠️ אין policy לציבור: הכתיבה והקריאה עוברות דרך service role בנתיבי ה-API
-- בלבד (אין middleware — כל נתיב מאמת בעצמו). הנרשם רואה את הסטטוס שלו
-- דרך נתיב הפורטל שמסנן לפי הסשן שלו.
drop policy if exists name_change_staff_read on public.name_change_requests;
create policy name_change_staff_read on public.name_change_requests
  for select to authenticated using (true);

comment on table public.name_change_requests is
  'בקשות שינוי שם פרטי מהאזור האישי — טעונות אישור הנהלה. ת"ז ושם משפחה חסומים.';
