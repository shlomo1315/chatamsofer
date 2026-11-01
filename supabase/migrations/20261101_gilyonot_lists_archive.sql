-- רשימות תפוצה לגיליונות + ארכיון ציבורי.
--
-- 1. gilyonot_lists: אילו רשימות אפשר לבחור בשליחה (גיליונות, מפיצים, ורשימות חיצוניות).
-- 2. פרסום בארכיון: archive_published כבוי כברירת מחדל, ונדלק רק בידי מנהל.
-- 3. gilyonot_public_archive: התצוגה היחידה שהדף הציבורי קורא (anon), עם שדות בטוחים בלבד.
-- 4. דלי ציבורי gilyonot-public לקריאה בלבד, עם שמות אקראיים.
--
-- ⚠️ אין שום הרשאה ציבורית לטבלאות. ה-anon מקבל select על התצוגה בלבד.

create table if not exists public.gilyonot_lists (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  kind             text not null check (kind in ('subscribers','distributors','contact_list')),
  contact_list_id  uuid references public.contact_lists(id) on delete cascade,
  preselected      boolean not null default false,
  active           boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  check ((kind = 'contact_list') = (contact_list_id is not null))
);
create unique index if not exists gilyonot_lists_kind_uniq on public.gilyonot_lists (kind) where kind <> 'contact_list';
create unique index if not exists gilyonot_lists_cl_uniq on public.gilyonot_lists (contact_list_id) where contact_list_id is not null;

alter table public.gilyonot_lists enable row level security;
revoke all on public.gilyonot_lists from anon, authenticated;
grant all on public.gilyonot_lists to service_role;

insert into public.gilyonot_lists (name, kind, preselected, sort_order)
values ('גיליונות (הרשימה הראשית)', 'subscribers', true, 10), ('מפיצים', 'distributors', false, 20)
on conflict do nothing;

-- צאצאים ותורמים: אין להם מקור מייל במערכת, ולכן נוצרות רשימות חיצוניות ריקות (מעלים אליהן ב"ניוזלטר")
do $$
declare cl uuid; n text; ord int := 30;
begin
  foreach n in array array['צאצאים', 'תורמים'] loop
    if not exists (select 1 from public.gilyonot_lists l join public.contact_lists c on c.id = l.contact_list_id where c.name = n) then
      insert into public.contact_lists (name) values (n) returning id into cl;
      insert into public.gilyonot_lists (name, kind, contact_list_id, sort_order) values (n, 'contact_list', cl, ord);
    end if;
    ord := ord + 10;
  end loop;
end $$;

-- פרסום בארכיון
alter table public.gilyonot_issues
  add column if not exists archive_published boolean not null default false,
  add column if not exists archive_published_at timestamptz,
  add column if not exists archive_id uuid,
  add column if not exists archive_topic text,
  add column if not exists archive_date date;
create unique index if not exists gilyonot_issues_archive_id_uniq on public.gilyonot_issues (archive_id) where archive_id is not null;

-- התצוגה הציבורית: id אקראי נפרד (לא מזהה הגיליון הפנימי), בלי נתיבים, משלוחים, נמענים או קובץ מקור
create or replace view public.gilyonot_public_archive as
  select archive_id as id,
         title,
         parasha,
         extract(year from coalesce(archive_date, archive_published_at::date))::int as year,
         archive_topic as topic,
         coalesce(archive_date, archive_published_at::date) as issue_date,
         file_size
  from public.gilyonot_issues
  where archive_published = true and archive_id is not null;

revoke all on public.gilyonot_public_archive from public, anon, authenticated;
grant select on public.gilyonot_public_archive to anon, authenticated;
grant select on public.gilyonot_public_archive to service_role;

-- דלי ציבורי לקריאה בלבד. כתיבה רק דרך service_role (בפרסום מהניהול).
insert into storage.buckets (id, name, public, file_size_limit)
values ('gilyonot-public', 'gilyonot-public', true, 52428800)
on conflict (id) do update set public = true;
