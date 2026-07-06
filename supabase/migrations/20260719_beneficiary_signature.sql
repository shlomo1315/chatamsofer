-- חתימה דיגיטלית של הנרשם — נלכדת בעת סימון ההצהרה בטופס הרישום,
-- ונשמרת כ-data URL של תמונת PNG. מוצגת בכרטסת הצאצא בניהול.
alter table public.beneficiaries
  add column if not exists signature text;
