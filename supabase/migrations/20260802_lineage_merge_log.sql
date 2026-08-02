-- ─────────────────────────────────────────────────────────────────────────────
-- יומן מיזוגים בעץ הדורות — מה שמאפשר לבטל מיזוג.
--
-- ⚠️ מיזוג מוחק צומת ומעביר את ילדיו ואת המשפחות המשויכות אליו. בלי רישום של
-- המצב הקודם הפעולה בלתי הפיכה, וכל הכרעה על זוג שמות דומים הופכת להימור
-- שאי אפשר לתקן. עם אלפי מיזוגים לפנינו זה בלתי-אפשרי בפועל: המשתמש ישב על
-- כל החלטה בחשש במקום לעבוד.
--
-- הרישום שומר את שורת הצומת שנמחקה כפי שהייתה, ואת רשימות הילדים והמשפחות
-- שהועברו — כדי שהביטול יחזיר בדיוק את מה שהיה ולא ינחש.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.lineage_merge_log (
  id uuid primary key default gen_random_uuid(),
  -- כל מיזוג (כולל המפל שנגרר ממנו) חולק batch_id אחד, כדי שביטול יחזיר את
  -- כל השרשרת ולא חוליה בודדת שתשאיר את העץ במצב ביניים.
  batch_id uuid not null,
  keep_id uuid not null,
  merged_id uuid not null,
  merged_node jsonb not null,
  moved_children uuid[] not null default '{}',
  moved_beneficiaries uuid[] not null default '{}',
  -- 'manual' = בחירה מפורשת · 'cascade' = נגרר אוטומטית מהמפל
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  created_by uuid,
  undone_at timestamptz
);

create index if not exists lineage_merge_log_batch_idx on public.lineage_merge_log (batch_id);
create index if not exists lineage_merge_log_created_idx on public.lineage_merge_log (created_at desc);
create index if not exists lineage_merge_log_active_idx on public.lineage_merge_log (undone_at) where undone_at is null;

alter table public.lineage_merge_log enable row level security;

-- הגישה דרך service-role בלבד (נתיבי ה-API), בדיוק כמו שאר פעולות העץ.
drop policy if exists lineage_merge_log_service_only on public.lineage_merge_log;
create policy lineage_merge_log_service_only on public.lineage_merge_log
  for all using (false) with check (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- זוגות שסומנו במפורש "אינם אותו אדם".
--
-- ⚠️ בלי זה, כל סריקה תציע שוב את אותם זוגות שכבר נדחו. עם אלפי צמתים המסך
-- לעולם לא יתרוקן, והמשתמש יבזבז את זמנו על אותן הכרעות שוב ושוב.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.lineage_not_duplicates (
  -- שמור ממוין (a < b) כדי שהזוג יזוהה בלי תלות בסדר שבו נבחר
  node_a uuid not null,
  node_b uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (node_a, node_b)
);

alter table public.lineage_not_duplicates enable row level security;
drop policy if exists lineage_not_duplicates_service_only on public.lineage_not_duplicates;
create policy lineage_not_duplicates_service_only on public.lineage_not_duplicates
  for all using (false) with check (false);
