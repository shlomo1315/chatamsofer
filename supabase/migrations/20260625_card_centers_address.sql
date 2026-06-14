-- כתובת למוקד כרטיסים (עיר + רחוב), לעריכה כמו בטופס הציבורי
alter table public.card_centers
  add column if not exists city text,
  add column if not exists address text;
