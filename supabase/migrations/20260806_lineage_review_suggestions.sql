-- ============================================================================
-- Migration: הצעות תיקון-ייחוס מצאצאים (lineage_review_suggestions)
-- ============================================================================
--
-- הרחבת מנגנון שיתוף העץ (lineage-review): עד כה הצאצא יכול היה רק לאשר/לדחות/
-- לתקן-שם של צמתים קיימים, וזה נכנס *ישירות* לעץ. עכשיו הוא יכול גם להציע
-- תיקון מבנה — להוסיף דור חסר, לתקן שיוך הורה, או לתקן שם — וההצעה *ממתינה
-- לאישור המנהל* לפני שהיא נכנסת לעץ. כך שינוי מבני של הצאצא לא משבש את העץ
-- בלי עין אנושית.
--
-- kind:
--   'rename'      — הצעת שם חדש לצומת קיים (node_id).
--   'add_child'   — הצעת דור/בן חדש תחת parent_id (name + relation).
--   'reparent'    — הצעה לשנות את ההורה של node_id ל-parent_id.
--   'note'        — הערה חופשית מהצאצא (payload.text), בלי שינוי מבני.
-- status: 'pending' (ממתין) / 'approved' (אושר והוחל) / 'rejected' (נדחה).
--
-- 🔒 אידמפוטנטי. ▶ הרצה: Supabase → SQL Editor → Run.
-- ============================================================================

create table if not exists public.lineage_review_suggestions (
  id           uuid primary key default gen_random_uuid(),
  token        text not null references public.lineage_share_invites(token) on delete cascade,
  root_node_id uuid references public.lineage_nodes(id) on delete set null,
  kind         text not null check (kind in ('rename', 'add_child', 'reparent', 'note')),
  node_id      uuid references public.lineage_nodes(id) on delete cascade,
  parent_id    uuid references public.lineage_nodes(id) on delete cascade,
  proposed_name text,
  relation     text check (relation in ('son', 'son_in_law')),
  payload      jsonb,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_name text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id) on delete set null
);

create index if not exists idx_lrs_status on public.lineage_review_suggestions(status);
create index if not exists idx_lrs_root on public.lineage_review_suggestions(root_node_id);

-- גישה רק דרך service-role ב-API (כמו lineage_share_invites) — אין policies.
alter table public.lineage_review_suggestions enable row level security;
