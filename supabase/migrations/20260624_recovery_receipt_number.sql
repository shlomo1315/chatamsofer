-- מספר קבלה שמזין בית ההחלמה עבור היולדת — נשמר בתיק הלידה
alter table maternity_aids
  add column if not exists recovery_receipt_number text;
