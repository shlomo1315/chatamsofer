-- מעגל תיקונים: סטטוס "הוחזר תיקון — לבדיקה" + בקשת תיקון עץ דורות
-- (אפיון: docs/superpowers/specs/2026-07-19-docs-fix-cycle-design.md)

-- 1) ערך סטטוס חדש docs_returned
alter table beneficiaries
  drop constraint if exists beneficiaries_eligibility_status_check;

alter table beneficiaries
  add constraint beneficiaries_eligibility_status_check
  check (eligibility_status in ('pending','approved','rejected','review','docs_pending','docs_returned'));

-- 2) שדות מעגל התיקון
alter table beneficiaries
  add column if not exists lineage_fix_required boolean not null default false;

alter table beneficiaries
  add column if not exists lineage_fix_note text;

alter table beneficiaries
  add column if not exists lineage_fixed_at timestamptz;

-- snapshot של השרשרת לפני תיקון הצאצא — להשוואה במסך האדמין
alter table beneficiaries
  add column if not exists lineage_chain_before_fix jsonb;

alter table beneficiaries
  add column if not exists docs_sent_at timestamptz;

alter table beneficiaries
  add column if not exists docs_returned_at timestamptz;
