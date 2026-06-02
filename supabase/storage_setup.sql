-- ============================================
-- אחסון קבצים מצורפים (צילומי תעודת זהות וכו')
-- הרץ פעם אחת ב-Supabase SQL Editor
-- ============================================

-- 1) דלי אחסון ציבורי בשם documents
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do update set public = true;

-- 2) מדיניות גישה לאובייקטים בדלי
drop policy if exists "documents_read"   on storage.objects;
drop policy if exists "documents_insert" on storage.objects;
drop policy if exists "documents_delete" on storage.objects;

-- קריאה ציבורית (כדי להציג תמונות)
create policy "documents_read" on storage.objects
  for select using (bucket_id = 'documents');

-- העלאה למשתמשים מחוברים
create policy "documents_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents');

-- מחיקה למשתמשים מחוברים
create policy "documents_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents');

-- 3) מדיניות RLS לטבלת documents עצמה
alter table documents enable row level security;

drop policy if exists "documents_table_all" on documents;
create policy "documents_table_all" on documents
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
