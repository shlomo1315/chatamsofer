-- טבלת סיסמאות לפורטל בתי החלמה
create table if not exists recovery_portals (
  home_name text primary key,
  password  text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: רק שירות-רול יכול לקרוא/לכתוב (הפורטל ב-API route)
alter table recovery_portals enable row level security;

-- מדיניות: מנהל מערכת בלבד (service role bypass RLS)
-- הפורטל הציבורי ניגש דרך API route עם service role key
