-- יתרה שנותרה מכל טעינה חודשית למוקד (נמשכת מנדרים ונשמרת לפי חודש)
alter table public.center_monthly_loads add column if not exists balance numeric;
alter table public.center_monthly_loads add column if not exists balance_at timestamptz;
