-- תווית קבועה לכל תיבת Gmail: כל מייל שנמשך מהתיבה יקבל אותה אוטומטית.
-- מפנה ל-mail_label_defs[].id (מאוחסן ב-app_settings — אין FK, אימות בקוד).
alter table public.gmail_accounts
  add column if not exists label_id text;
