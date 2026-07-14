-- ─────────────────────────────────────────────────────────────────────────────
-- זיכרון העוזר — לומד מהשאלות של הצוות.
--
-- כל שאלה נרשמת עם התוצאה. משתי דרכים העוזר משתפר:
--   1. אוטומטית — המונחים והניסוחים החוזרים של הצוות נכנסים להנחיה שלו,
--      כך שהוא מבין את השפה שלכם ("תיק" = "בקשה", וכו').
--   2. ידנית — המנהל רואה אילו שאלות נכשלו, ומוסיף ידע שיעזור בפעם הבאה.
-- ─────────────────────────────────────────────────────────────────────────────

-- יומן השאלות
create table if not exists public.assistant_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  user_name   text,

  question    text not null,
  answer      text,

  -- אילו כלים הופעלו (למשל ['count_data','query_data'])
  tools_used  text[] default '{}',

  -- 'ok' = ענה · 'no_data' = לא מצא נתון · 'refused' = סירב · 'error' = כשל
  outcome     text not null default 'ok'
              check (outcome in ('ok', 'no_data', 'refused', 'error')),

  -- דירוג המשתמש (אופציונלי): true = עזר · false = לא עזר
  helpful     boolean,

  created_at  timestamptz not null default now()
);

create index if not exists assistant_log_created_idx on public.assistant_log(created_at desc);
create index if not exists assistant_log_outcome_idx on public.assistant_log(outcome)
  where outcome <> 'ok';

-- ידע שנוסף ידנית — נשלח להנחיה בכל שיחה
create table if not exists public.assistant_knowledge (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  -- מה גרם להוספה (למשל השאלה שנכשלה)
  source      text,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists assistant_knowledge_active_idx
  on public.assistant_knowledge(is_active) where is_active = true;

alter table public.assistant_log enable row level security;
alter table public.assistant_knowledge enable row level security;

drop policy if exists "assistant_log_service" on public.assistant_log;
create policy "assistant_log_service" on public.assistant_log
  for all using (auth.role() = 'service_role');

drop policy if exists "assistant_knowledge_service" on public.assistant_knowledge;
create policy "assistant_knowledge_service" on public.assistant_knowledge
  for all using (auth.role() = 'service_role');
