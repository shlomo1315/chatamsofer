-- ── איחוד קהילות בדוח הנדיב ──
-- מיפוי שם קהילה מנורמל (בלי רווחים כפולים וגרשיים) לשם מאוחד.
-- לא משנה את נתוני היולדות; ביטול מיזוג = מחיקת השורות של השם המאוחד.
create table if not exists public.donor_community_merges (
  original_key text primary key,
  canonical    text not null,
  created_at   timestamptz not null default now(),
  created_by   text
);
create index if not exists donor_community_merges_canonical_idx on public.donor_community_merges (canonical);

alter table public.donor_community_merges enable row level security;
grant all on public.donor_community_merges to service_role;

notify pgrst, 'reload schema';
