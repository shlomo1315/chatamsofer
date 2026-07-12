-- ─────────────────────────────────────────────────────────────────────────────
-- מכתבי ברכה לנדיב + משוב על בית ההחלמה.
--
-- הערה חשובה: מול היולדת לא משתמשים במילה "סקר". הניסוח בכל טקסט שהיא רואה:
-- "לצורך ייעול ושיפור השירות, נשמח לשמוע ממך על טיב השירות שקיבלת".
-- השמות הטכניים כאן (survey_*) נשארים כפי שהם.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── מכתבי ברכה ───────────────────────────────────────────────────────────────
create table if not exists public.gratitude_letters (
  id               uuid primary key default gen_random_uuid(),
  maternity_aid_id uuid not null references public.maternity_aids(id) on delete cascade,
  beneficiary_id   uuid references public.beneficiaries(id) on delete set null,
  source           text not null check (source in ('web','email','scan')),
  body             text,          -- הטקסט שנכתב
  signature        text,          -- שורת החתימה שהיולדת בחרה
  is_anonymous     boolean not null default true,
  scan_url         text,          -- תמונת שובר מודפס שנשלח בחזרה
  voucher_url      text,          -- ה-PDF המעוצב (אם נשמר)
  status           text not null default 'received'
                   check (status in ('received','approved','rejected')),
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

-- מכתב אחד לכל לידה
create unique index if not exists gratitude_letters_unique
  on public.gratitude_letters (maternity_aid_id);
create index if not exists gratitude_letters_date
  on public.gratitude_letters (created_at desc);

alter table public.gratitude_letters enable row level security;
drop policy if exists gratitude_letters_staff_all on public.gratitude_letters;
create policy gratitude_letters_staff_all on public.gratitude_letters
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── שאלות המשוב (ניתנות לעריכה מההגדרות, ללא שינוי קוד) ──────────────────────
create table if not exists public.survey_questions (
  id        uuid primary key default gen_random_uuid(),
  survey    text not null default 'recovery',
  position  int  not null,
  text      text not null,
  type      text not null default 'scale' check (type in ('scale','text')),
  is_active boolean not null default true
);

alter table public.survey_questions enable row level security;
drop policy if exists survey_questions_staff_all on public.survey_questions;
create policy survey_questions_staff_all on public.survey_questions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- זריעה ראשונית — אידמפוטנטית (רק אם אין עדיין שאלות)
insert into public.survey_questions (survey, position, text, type)
select * from (values
  ('recovery', 1, 'הקבלה והליווי בבית ההחלמה', 'scale'),
  ('recovery', 2, 'ניקיון החדר והמתקנים', 'scale'),
  ('recovery', 3, 'האוכל והכיבוד', 'scale'),
  ('recovery', 4, 'האם תמליצי לחברה על בית ההחלמה הזה?', 'scale'),
  ('recovery', 5, 'הערות — משהו שהיינו יכולים לשפר?', 'text')
) as v(survey, position, text, type)
where not exists (select 1 from public.survey_questions where survey = 'recovery');

-- ── תשובות המשוב ─────────────────────────────────────────────────────────────
create table if not exists public.survey_responses (
  id               uuid primary key default gen_random_uuid(),
  maternity_aid_id uuid not null references public.maternity_aids(id) on delete cascade,
  beneficiary_id   uuid references public.beneficiaries(id) on delete set null,
  recovery_home    text,          -- סנאפשוט (שם בית ההחלמה עשוי להשתנות)
  source           text not null check (source in ('web','email')),
  answers          jsonb not null default '{}'::jsonb,  -- { "<question_id>": 8, ... }
  free_text        text,
  created_at       timestamptz not null default now()
);

-- חד-פעמיות: תשובה אחת לכל לידה — נאכף ברמת ה-DB, לא רק בקוד
create unique index if not exists survey_responses_unique
  on public.survey_responses (maternity_aid_id);
create index if not exists survey_responses_home
  on public.survey_responses (recovery_home);

alter table public.survey_responses enable row level security;
drop policy if exists survey_responses_staff_all on public.survey_responses;
create policy survey_responses_staff_all on public.survey_responses
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
