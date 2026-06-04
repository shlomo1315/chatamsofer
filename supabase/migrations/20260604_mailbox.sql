-- ===================================================
-- תיבת דואר (Mailbox) — מודול מייל למנהל בלבד
-- שליחה וקבלה של מיילים אמיתיים (דרך Resend) עם לוג מלא
-- הרץ פעם אחת ב-Supabase SQL Editor
-- ===================================================

-- 1) טבלת הודעות (נכנסות ויוצאות)
create table if not exists public.mail_messages (
  id            uuid primary key default gen_random_uuid(),
  direction     text not null check (direction in ('inbound', 'outbound')),
  from_email    text not null,
  from_name     text,
  to_emails     jsonb not null default '[]'::jsonb,
  cc_emails     jsonb not null default '[]'::jsonb,
  subject       text,
  body_text     text,
  body_html     text,
  status        text not null default 'received' check (status in ('received', 'sent', 'failed', 'draft')),
  is_read       boolean not null default false,
  thread_id     text,
  in_reply_to   text,
  provider_id   text,
  has_attachments boolean not null default false,
  error         text,
  sent_by       uuid references public.profiles(id) on delete set null,
  created_at    timestamptz default now(),
  sent_at       timestamptz
);

create index if not exists mail_messages_direction_idx on public.mail_messages (direction, created_at desc);
create index if not exists mail_messages_thread_idx    on public.mail_messages (thread_id);
create index if not exists mail_messages_unread_idx    on public.mail_messages (is_read) where is_read = false;
-- מניעת כפילות של מייל נכנס לפי מזהה הספק
create unique index if not exists mail_messages_provider_id_uniq on public.mail_messages (provider_id) where provider_id is not null;

-- 2) טבלת קבצים מצורפים
create table if not exists public.mail_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.mail_messages(id) on delete cascade,
  file_url     text not null,
  file_name    text,
  content_type text,
  size         integer,
  created_at   timestamptz default now()
);

create index if not exists mail_attachments_message_idx on public.mail_attachments (message_id);

-- 3) RLS — מנהל בלבד
alter table public.mail_messages    enable row level security;
alter table public.mail_attachments enable row level security;

-- פונקציית עזר: האם המשתמש המחובר הוא מנהל
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "mail_messages_admin_all" on public.mail_messages;
create policy "mail_messages_admin_all" on public.mail_messages
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "mail_attachments_admin_all" on public.mail_attachments;
create policy "mail_attachments_admin_all" on public.mail_attachments
  for all
  using (public.is_admin())
  with check (public.is_admin());
-- הערה: קבלת מייל נכנס מתבצעת ב-webhook עם SUPABASE_SERVICE_ROLE_KEY שעוקף RLS.

-- 4) דלי אחסון לקבצים מצורפים
insert into storage.buckets (id, name, public)
values ('mail-attachments', 'mail-attachments', true)
on conflict (id) do update set public = true;

drop policy if exists "mail_attach_read"   on storage.objects;
drop policy if exists "mail_attach_insert" on storage.objects;
drop policy if exists "mail_attach_delete" on storage.objects;

create policy "mail_attach_read" on storage.objects
  for select using (bucket_id = 'mail-attachments');

create policy "mail_attach_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mail-attachments');

create policy "mail_attach_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'mail-attachments');
