-- כותרת תצוגה למשתמש (טקסט חופשי), נפרדת מההרשאות. לתצוגה בלבד.
alter table public.profiles add column if not exists display_title text;
