-- השתייכות קהילתית (טקסט פתוח) — נלכד בטופס הרישום הציבורי בפרטי הבעל
alter table beneficiaries
  add column if not exists community_affiliation text;
