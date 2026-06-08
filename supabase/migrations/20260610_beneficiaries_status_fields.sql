-- Add rejection_reason and docs_notes columns to beneficiaries
alter table beneficiaries
  add column if not exists rejection_reason text default '';

alter table beneficiaries
  add column if not exists docs_notes text default '';

-- Fix eligibility_status constraint to include docs_pending
alter table beneficiaries
  drop constraint if exists beneficiaries_eligibility_status_check;

alter table beneficiaries
  add constraint beneficiaries_eligibility_status_check
  check (eligibility_status in ('pending','approved','rejected','review','docs_pending'));
