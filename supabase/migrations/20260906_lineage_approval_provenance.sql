-- ─────────────────────────────────────────────────────────────────────────────
-- מקור האישור בעץ הדורות — מי אישר, מתי, ועל סמך מה.
--
-- 🔴 הבעיה שזה פותר: לצומת יש `status` בלבד. אין שום תיעוד של *מי* אישר,
-- *מתי*, ו*על סמך מה* — ולכן אי אפשר לענות על השאלה הבסיסית "מי מאושר
-- מלכתחילה ומי אושר תוך כדי עבודה". 306 מתוך 357 המאושרים נערכו אחרי
-- היצירה, אבל updated_at משתנה מכל עריכה (שם, הורה, מיזוג) ואינו מעיד
-- על אישור. הלוג מכיל 2,515 רשומות מיזוג ורק בודדות של אישור.
--
-- ⚠️ לא ניתן לשחזר למפרע מי אישר את 357 הקיימים — המידע פשוט לא נשמר.
-- הם מסומנים 'legacy' ("אושר לפני התיעוד"), וזו האמת: עדיף לומר "לא ידוע"
-- מאשר להמציא מקור. מכאן והלאה כל אישור מתועד.
-- ─────────────────────────────────────────────────────────────────────────────

-- מקור האישור:
--   legacy   — אושר לפני שהתיעוד הופעל (לא ידוע מי/מתי)
--   staff    — אושר ידנית ע"י איש צוות
--   bulk     — אושר באישור קבוצתי (דור/ענף)
--   family   — אושר בעקבות בקשת משפחה שאושרה
--   import   — הגיע מאושר מייבוא נתונים
alter table lineage_nodes
  add column if not exists approval_source text
    check (approval_source in ('legacy', 'staff', 'bulk', 'family', 'import'));

alter table lineage_nodes
  add column if not exists approved_at timestamptz;

alter table lineage_nodes
  add column if not exists approved_by uuid;

-- ⚠️ SET NULL ולא CASCADE: עזיבת עובד אינה מבטלת את האישור שנתן.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'lineage_nodes_approved_by_fkey'
  ) then
    alter table lineage_nodes
      add constraint lineage_nodes_approved_by_fkey
      foreign key (approved_by) references auth.users(id) on delete set null;
  end if;
end $$;

-- הערת אישור חופשית — "על סמך מה אושר" (מסמך, שיחה, מקור).
alter table lineage_nodes
  add column if not exists approval_note text;

-- ── סימון המאושרים הקיימים כ-legacy ──
-- 🔴 בכוונה *לא* מנחשים תאריך: approved_at נשאר NULL, והמסך יציג
-- "אושר לפני התיעוד" במקום תאריך שקרי.
update lineage_nodes
set approval_source = 'legacy'
where status = 'verified' and approval_source is null;

-- ── אינדקסים ──
-- המסך שואל "מי מאושר" ו"מה נשאר" על 10,505 צמתים.
create index if not exists lineage_nodes_status_idx
  on lineage_nodes (status);

create index if not exists lineage_nodes_status_gen_idx
  on lineage_nodes (status, generation);

-- שליפת ילדי אב — הבסיס למסך אישור דור-אחר-דור.
create index if not exists lineage_nodes_parent_status_idx
  on lineage_nodes (parent_id, status);

create index if not exists lineage_nodes_approved_at_idx
  on lineage_nodes (approved_at desc) where status = 'verified';
