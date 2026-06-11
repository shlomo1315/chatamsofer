-- הטבות שהתקבלו בעבר מאיגוד הצאצאים (נשמר ברישום הציבורי ומוצג בכרטסת)
alter table public.beneficiaries add column if not exists past_benefits jsonb;
