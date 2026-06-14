-- סכום שמומש עבור הלידה בבית ההחלמה — מוזן ע"י בית ההחלמה (רק כשסומן "הגיעה") ונשלח לאישור
alter table maternity_aids add column if not exists recovery_amount numeric(10,2);
alter table maternity_aids add column if not exists recovery_amount_status text; -- null | 'pending' | 'approved' | 'rejected'
alter table maternity_aids add column if not exists recovery_amount_at timestamptz;
