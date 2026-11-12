-- סיסמה חובה לקישור מעקב אשראי לנדיב.
-- קישור בלי סיסמה (password_hash ריק) לא מציג נתונים עד שתוגדר לו סיסמה.
alter table public.donor_report_links add column if not exists password_hash text;

notify pgrst, 'reload schema';
