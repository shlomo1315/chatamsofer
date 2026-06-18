-- אבטחה: הפעלת Row Level Security על טבלאות המייל.
-- ללא RLS, מחזיק ה-anon key (שנשלח לדפדפן בכל טעינה) יכול לקרוא ישירות את גוף
-- כל המיילים הנכנסים והיוצאים — PII, נימוקי סיוע רפואי, החלטות כספיות.
-- הגישה האפליקטיבית לטבלאות אלו היא אך ורק דרך service-role (שעוקף RLS),
-- ולכן ההפעלה אינה משנה את התנהגות המערכת — רק חוסמת קריאה ישירה לא-מורשית.
alter table public.inbound_emails enable row level security;
alter table public.sent_emails    enable row level security;

drop policy if exists inbound_emails_staff_all on public.inbound_emails;
drop policy if exists sent_emails_staff_all    on public.sent_emails;

create policy inbound_emails_staff_all on public.inbound_emails
  for all using (public.is_staff()) with check (public.is_staff());
create policy sent_emails_staff_all on public.sent_emails
  for all using (public.is_staff()) with check (public.is_staff());
