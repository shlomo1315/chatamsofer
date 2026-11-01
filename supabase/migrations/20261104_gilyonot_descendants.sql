-- גיליונות: מקור הרשמה חדש "descendants" (כל נרשם בצאצאים נכנס לרשימת הדיוור).
-- קוד: lib/gilyonotDescendants.ts
alter table public.gilyonot_subscribers drop constraint if exists gilyonot_subscribers_source_check;
alter table public.gilyonot_subscribers add constraint gilyonot_subscribers_source_check
  check (source in ('web','nedarim','manual','import','email','descendants'));

-- סנכרון חד-פעמי של הצאצאים הקיימים. כתובת שכבר ברשימה (כולל מי שהסיר את עצמו)
-- לא נוגעים בה: on conflict do nothing.
insert into public.gilyonot_subscribers (email, full_name, source, source_ref)
select distinct on (lower(trim(b.email))) lower(trim(b.email)), nullif(left(trim(b.full_name), 80), ''), 'descendants', b.id::text
from public.beneficiaries b
where b.email is not null
  and lower(trim(b.email)) ~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'
  and length(trim(b.email)) <= 254 and trim(b.email) not like '%..%'
order by lower(trim(b.email)), b.created_at
on conflict (email) do nothing;
