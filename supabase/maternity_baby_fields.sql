-- הוסף עמודות לפרטי התינוק בטבלת maternity_aids
-- הרץ פעם אחת ב-Supabase SQL Editor

alter table maternity_aids
  add column if not exists baby_id_type   text default 'id' check (baby_id_type in ('id','passport')),
  add column if not exists baby_id_number text,
  add column if not exists baby_gender    text check (baby_gender in ('male','female')),
  add column if not exists birth_certificate_url text,
  add column if not exists six_weeks_end  date;
