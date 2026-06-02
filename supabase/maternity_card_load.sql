-- שדות הטענת/פריקת כרטיס נדרים בתיק היולדת
-- הרץ פעם אחת ב-Supabase SQL Editor

alter table maternity_aids
  add column if not exists card_load_status text default 'idle'
    check (card_load_status in ('idle','pending','loaded','failed','unloaded')),
  add column if not exists card_load_amount numeric(10,2),
  add column if not exists card_tlush_id     text,        -- מזהה הטעינה (TlushId) שמחזיר נדרים, נדרש לפריקה
  add column if not exists card_load_error    text,
  add column if not exists card_unloaded_at   timestamptz;
