-- סימון הגעת היולדת לבית ההחלמה (מסומן ע"י צוות בית ההחלמה דרך הפורטל).
-- null = טרם סומן · true = הגיעה · false = לא הגיעה.
alter table public.maternity_aids
  add column if not exists recovery_arrived     boolean,
  add column if not exists recovery_arrived_at  timestamptz,
  add column if not exists recovery_arrived_by  text;
