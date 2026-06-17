-- פורטל הלוואות: שדות ביצוע + טבלת הגדרות מערכת

-- שדות "בוצעה" על הלוואה
alter table public.loans
  add column if not exists disbursed_at  timestamptz,
  add column if not exists disbursed_by  text;

-- טבלת הגדרות מערכת (key/value) — לסיסמת הפורטל ועוד
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
-- כתיבה וקריאה: service-role בלבד (ערכים רגישים)

-- placeholder לסיסמת פורטל הלוואות (ריק = לא הוגדר עדיין)
insert into public.app_settings (key, value)
values ('loans_portal_password', '')
on conflict (key) do nothing;
