-- הערת פורטל הביצוע על הלוואה (למשל "יש לו כבר הלוואה, לכן לא שולחים שטר").
-- ⚠️ עמודה נפרדת מ-office_notes (הערות המשרד בכרטסת) ומ-notes (הערות המבקש):
-- הפורטל משותף לגורם מבצע חיצוני, וההערה נכתבת ונקראת שם בלבד.
alter table public.loans
  add column if not exists portal_note text;

comment on column public.loans.portal_note is
  'הערה חופשית של הגורם המבצע בפורטל ביצוע ההלוואות. פנימית, אינה נחשפת למבקש.';
