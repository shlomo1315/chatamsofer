-- קובץ שני לגיליון ("היכלות"), לא חובה. מצורף למייל אחרי קובץ הגיליון.
alter table public.gilyonot_issues add column if not exists file2_path text;
alter table public.gilyonot_issues add column if not exists file2_name text;
alter table public.gilyonot_issues add column if not exists file2_size integer;

notify pgrst, 'reload schema';
