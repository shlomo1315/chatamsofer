-- טבלת בתי החלמה — מאפשרת הוספת בתי החלמה חדשים שיופיעו בטופס לידה ובפורטל
-- הרץ פעם אחת ב-Supabase SQL Editor

create table if not exists recovery_homes (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz default now()
);

alter table recovery_homes enable row level security;

drop policy if exists "recovery_homes_read" on recovery_homes;
drop policy if exists "recovery_homes_insert" on recovery_homes;
drop policy if exists "recovery_homes_delete" on recovery_homes;

create policy "recovery_homes_read" on recovery_homes for select using (true);
create policy "recovery_homes_insert" on recovery_homes for insert to authenticated with check (true);
create policy "recovery_homes_delete" on recovery_homes for delete to authenticated using (true);

-- ברירת מחדל
insert into recovery_homes (name) values ('אם וילד'), ('טלזסטון'), ('ביכורים')
on conflict (name) do nothing;
