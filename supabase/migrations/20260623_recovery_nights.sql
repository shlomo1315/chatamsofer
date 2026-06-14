-- מספר הלילות שהיולדת שהתה בבית ההחלמה (מסומן ע"י בית ההחלמה יחד עם הסכום)
alter table maternity_aids add column if not exists recovery_nights integer;
