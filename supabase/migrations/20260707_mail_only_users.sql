-- יוזרים "מייל בלבד": גישה רק ללשונית המייל, ורק לתיבות שהוקצו להם.
-- mail_only=true  → המשתמש רואה רק את לשונית המייל (כל שאר המערכת חסומה).
-- allowed_mailboxes → רשימת מפתחות תיבות (DepartmentKey) שהמשתמש מורשה אליהן.
--   ריק = נופלים לברירת המחדל (department אם הוגדר; אחרת ללא גישה לתיבות עבור mail_only).
alter table profiles
  add column if not exists mail_only        boolean not null default false,
  add column if not exists allowed_mailboxes text[]  not null default '{}';
