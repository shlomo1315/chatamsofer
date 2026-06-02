-- שדות נוספים לטבלת loans
-- הרץ פעם אחת ב-Supabase SQL Editor

alter table loans
  add column if not exists purpose_details text,
  add column if not exists document_urls jsonb,
  add column if not exists declaration text;
