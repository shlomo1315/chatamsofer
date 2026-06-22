-- שער הרשמה ציבורית: סגירת/פתיחת הרשמה + קוד עוקף סודי לטסטים.
-- ברירת מחדל: ההרשמה סגורה (false). קוד עוקף אקראי נוצר אוטומטית.
insert into public.app_settings (key, value)
values ('public_registration_open', 'false')
on conflict (key) do nothing;

insert into public.app_settings (key, value)
values ('registration_bypass_code', substr(md5(random()::text || clock_timestamp()::text), 1, 12))
on conflict (key) do nothing;
