-- נעילת רשומת ההחלמה לאחר שבית ההחלמה אישר בחלונית. עריכה חוזרת חסומה עד
-- שהמשרד פותח מחדש. recovery_edit_requested_at מתעדכן כשבית ההחלמה מבקש תיקון.
alter table public.maternity_aids
  add column if not exists recovery_locked boolean not null default false;
alter table public.maternity_aids
  add column if not exists recovery_edit_requested_at timestamptz;
