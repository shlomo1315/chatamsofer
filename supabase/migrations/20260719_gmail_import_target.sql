-- כתובת יעד לייבוא ל-Gmail: לאיזו תיבת Gmail ב-Workspace להזריק את המיילים
-- של תיבה זו. ריק = ברירת מחדל לכתובת המחלקה (DEPARTMENTS[department].email).
alter table public.gmail_accounts
  add column if not exists import_target_email text;
