-- ת.ז/דרכון של הנולד בבקשת הבראה ליולדת — חובה, למניעת כפילויות.
alter table public.maternity_aids add column if not exists baby_id_number text;
alter table public.maternity_aids add column if not exists baby_id_type text default 'id';
create index if not exists maternity_baby_id_idx on public.maternity_aids(baby_id_number);
