-- הסתרת בקשות מלוח "ממתינים לטיפול" בדשבורד — בלי לגעת בנתונים עצמם.
-- כל שורה כאן = בקשה שמנהל מלא בחר להעלים מהרשימה. הנתמך/ההלוואה/הבקשה
-- נשארים ללא שינוי בכל שאר המערכת; ההסתרה הפיכה (מחיקת השורה מחזירה אותם).

create table if not exists public.dismissed_pending_tasks (
  entity_type  text not null,   -- 'beneficiary' | 'loan' | 'maternity' | 'widow' | 'financial_aid'
  entity_id    uuid not null,
  dismissed_by uuid references public.profiles(id),
  dismissed_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

alter table public.dismissed_pending_tasks enable row level security;
drop policy if exists dismissed_pending_tasks_staff_all on public.dismissed_pending_tasks;
create policy dismissed_pending_tasks_staff_all on public.dismissed_pending_tasks
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
