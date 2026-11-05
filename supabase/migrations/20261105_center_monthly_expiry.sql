-- תוקף הטעינה החודשית למוקדים (חודשיים מיום הטעינה)
alter table public.center_monthly_loads add column if not exists expires_at date;
