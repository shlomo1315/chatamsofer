-- קובץ הקבלה שהעלה בית ההחלמה (סריקה/צילום/PDF). נשמר בדלי documents.
alter table public.maternity_aids
  add column if not exists recovery_receipt_url text;
