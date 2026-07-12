-- תגובות לניוזלטר.
--
-- כשנמען משיב לקמפיין, הכתובת שאליה הוא משיב היא
-- office+c<8-תווים-ראשונים-של-מזהה-הקמפיין>@chasamsofer.info
-- ה-webhook מזהה את התבנית ומקשר את התגובה לקמפיין.

alter table public.inbound_emails
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

create index if not exists inbound_emails_campaign
  on public.inbound_emails (campaign_id) where campaign_id is not null;
