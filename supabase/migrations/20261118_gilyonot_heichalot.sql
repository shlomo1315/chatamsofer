-- גיליון "היכלות": מספר גיליון רץ, וסימון קובץ היכלות חדש.
-- הטבלה gilyonot_settings שומרת את מספר הגיליון הבא (key = 'next_issue_number').
create table if not exists gilyonot_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table gilyonot_settings enable row level security;

alter table gilyonot_issues
  add column if not exists issue_number integer,
  add column if not exists heichalot_new boolean not null default false,
  -- true אחרי שהמונה קודם בגלל הגיליון הזה (מבטיח קידום פעם אחת בלבד)
  add column if not exists number_counted boolean not null default false;
