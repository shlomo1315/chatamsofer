-- בקשת סיוע ממי שלא רשום באיגוד: פרטים אישיים מלאים כמו ברישום (טלפון נוסף, תאריך לידה, מצב משפחתי, בן/בת זוג וכו').
alter table public.financial_aid_requests
  add column if not exists applicant_details jsonb;
