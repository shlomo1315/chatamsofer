-- Performance indexes for foreign keys and hot-filter columns.
-- Existing indexes (skipped here): widow_requests(beneficiary_id, status),
-- financial_aid_requests(beneficiary_id, status, gmail_thread_id),
-- maternity_aids(card_status, card_center_id, baby_id_number),
-- widow_support_payments(beneficiary_id), lineage_nodes(parent_id, generation),
-- mail_events(created_at, event_type, message_id, user_id),
-- email_tracking(token, sent_at, gmail_msg_id).

-- beneficiaries: FK + hot filters (dashboard counts, lists, lookups)
create index if not exists beneficiaries_family_id_idx          on public.beneficiaries(family_id);
create index if not exists beneficiaries_eligibility_status_idx on public.beneficiaries(eligibility_status);
create index if not exists beneficiaries_email_idx              on public.beneficiaries(email);
create index if not exists beneficiaries_created_at_idx         on public.beneficiaries(created_at);

-- documents
create index if not exists documents_beneficiary_id_idx on public.documents(beneficiary_id);

-- loans: FK + status filter (dashboard counts) + weekly window
create index if not exists loans_beneficiary_id_idx on public.loans(beneficiary_id);
create index if not exists loans_status_idx         on public.loans(status);
create index if not exists loans_created_at_idx     on public.loans(created_at);

-- loan_payments
create index if not exists loan_payments_loan_id_idx on public.loan_payments(loan_id);

-- maternity_aids: FK + status filter
create index if not exists maternity_aids_beneficiary_id_idx on public.maternity_aids(beneficiary_id);
create index if not exists maternity_aids_status_idx         on public.maternity_aids(status);

-- family_relations: both FK sides
create index if not exists family_relations_person_id_idx         on public.family_relations(person_id);
create index if not exists family_relations_related_person_id_idx on public.family_relations(related_person_id);

-- distributions: status filter (dashboard "planning/active" count)
create index if not exists distributions_status_idx on public.distributions(status);

-- distribution_recipients: FK columns
create index if not exists distribution_recipients_distribution_id_idx on public.distribution_recipients(distribution_id);
create index if not exists distribution_recipients_family_id_idx       on public.distribution_recipients(family_id);
create index if not exists distribution_recipients_beneficiary_id_idx  on public.distribution_recipients(beneficiary_id);

-- notifications
create index if not exists notifications_user_id_idx on public.notifications(user_id);

-- activity_log
create index if not exists activity_log_user_id_idx on public.activity_log(user_id);
