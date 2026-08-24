-- כמה כסף נותר בכרטיס ברגע הפריקה וחזר לארנק.
--
-- 🔴 card_balance מתאפס ל-0 בפריקה, ולכן הסכום שחזר אבד לחלוטין: אי
-- אפשר היה לדעת אם חזרו 600 מלאים או 80 שנותרו. בפילוח הפריקות זו
-- השאלה המרכזית — כמה כסף באמת חוזר לקופה.
alter table public.maternity_aids
  add column if not exists card_unloaded_amount numeric;

comment on column public.maternity_aids.card_unloaded_amount is
  'היתרה שנותרה בכרטיס ברגע הפריקה וחזרה לארנק. NULL בפריקות היסטוריות שקדמו לעמודה.';
