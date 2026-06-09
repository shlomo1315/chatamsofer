-- קשר הצומת להורה שלו בעץ: בן או חתן. מוגדר בצד הניהול.
-- בטופס הציבורי הקשר של צמתים מאומתים נקבע אוטומטית מכאן; הנרשם מסמן רק בדור שהוא מציע.
alter table public.lineage_nodes
  add column if not exists relation text check (relation in ('son', 'son_in_law'));
