-- ===================================================================
-- RLS hardening: replace "any authenticated user can do everything"
-- policies with staff-only policies.
--
-- Context:
--  * API routes use the service-role key (bypasses RLS) — unaffected.
--  * Admin pages query with the logged-in staff user's session
--    (anon key + session cookie) — must pass is_staff().
--  * The only non-staff-page session query in the app is the login
--    page reading the user's OWN profile row — covered by the
--    "profiles_select_own" policy below.
--  * Public/portal pages never query these tables with the anon
--    client (verified by code audit) — no anon policies needed.
-- ===================================================================

-- Helper: is the current user an active staff member?
-- SECURITY DEFINER so it can read profiles without recursive RLS.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role in ('admin', 'secretary', 'reviewer', 'collections')
  );
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated, anon, service_role;

-- -------------------------------------------------------------------
-- profiles: own row readable (login/role checks) + staff read all
-- -------------------------------------------------------------------
drop policy if exists "authenticated users can read all" on public.profiles;
create policy "profiles_select_own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles_select_staff" on public.profiles for select using (public.is_staff());

-- -------------------------------------------------------------------
-- families
-- -------------------------------------------------------------------
drop policy if exists "authenticated users can read all" on public.families;
drop policy if exists "authenticated users can insert"   on public.families;
drop policy if exists "authenticated users can update"   on public.families;
create policy "families_staff_select" on public.families for select using (public.is_staff());
create policy "families_staff_insert" on public.families for insert with check (public.is_staff());
create policy "families_staff_update" on public.families for update using (public.is_staff()) with check (public.is_staff());
create policy "families_staff_delete" on public.families for delete using (public.is_staff());

-- -------------------------------------------------------------------
-- beneficiaries
-- -------------------------------------------------------------------
drop policy if exists "authenticated users can read all" on public.beneficiaries;
drop policy if exists "authenticated users can insert"   on public.beneficiaries;
drop policy if exists "authenticated users can update"   on public.beneficiaries;
create policy "beneficiaries_staff_select" on public.beneficiaries for select using (public.is_staff());
create policy "beneficiaries_staff_insert" on public.beneficiaries for insert with check (public.is_staff());
create policy "beneficiaries_staff_update" on public.beneficiaries for update using (public.is_staff()) with check (public.is_staff());
create policy "beneficiaries_staff_delete" on public.beneficiaries for delete using (public.is_staff());

-- -------------------------------------------------------------------
-- family_relations
-- -------------------------------------------------------------------
drop policy if exists "authenticated users can read all" on public.family_relations;
create policy "family_relations_staff_all" on public.family_relations
  for all using (public.is_staff()) with check (public.is_staff());

-- -------------------------------------------------------------------
-- documents (also drops the permissive policy from storage_setup.sql)
-- -------------------------------------------------------------------
drop policy if exists "authenticated users can read all" on public.documents;
drop policy if exists "documents_table_all"              on public.documents;
create policy "documents_staff_all" on public.documents
  for all using (public.is_staff()) with check (public.is_staff());

-- -------------------------------------------------------------------
-- maternity_aids
-- -------------------------------------------------------------------
drop policy if exists "authenticated users can read all" on public.maternity_aids;
drop policy if exists "authenticated users can insert"   on public.maternity_aids;
drop policy if exists "authenticated users can update"   on public.maternity_aids;
create policy "maternity_aids_staff_select" on public.maternity_aids for select using (public.is_staff());
create policy "maternity_aids_staff_insert" on public.maternity_aids for insert with check (public.is_staff());
create policy "maternity_aids_staff_update" on public.maternity_aids for update using (public.is_staff()) with check (public.is_staff());
create policy "maternity_aids_staff_delete" on public.maternity_aids for delete using (public.is_staff());

-- -------------------------------------------------------------------
-- loans
-- -------------------------------------------------------------------
drop policy if exists "authenticated users can read all" on public.loans;
drop policy if exists "authenticated users can insert"   on public.loans;
drop policy if exists "authenticated users can update"   on public.loans;
create policy "loans_staff_select" on public.loans for select using (public.is_staff());
create policy "loans_staff_insert" on public.loans for insert with check (public.is_staff());
create policy "loans_staff_update" on public.loans for update using (public.is_staff()) with check (public.is_staff());
create policy "loans_staff_delete" on public.loans for delete using (public.is_staff());

-- -------------------------------------------------------------------
-- loan_payments
-- -------------------------------------------------------------------
drop policy if exists "authenticated users can read all" on public.loan_payments;
drop policy if exists "authenticated users can insert"   on public.loan_payments;
create policy "loan_payments_staff_all" on public.loan_payments
  for all using (public.is_staff()) with check (public.is_staff());

-- -------------------------------------------------------------------
-- distributions
-- -------------------------------------------------------------------
drop policy if exists "authenticated users can read all" on public.distributions;
drop policy if exists "authenticated users can insert"   on public.distributions;
drop policy if exists "authenticated users can update"   on public.distributions;
create policy "distributions_staff_all" on public.distributions
  for all using (public.is_staff()) with check (public.is_staff());

-- -------------------------------------------------------------------
-- distribution_recipients
-- -------------------------------------------------------------------
drop policy if exists "authenticated users can read all" on public.distribution_recipients;
drop policy if exists "authenticated users can insert"   on public.distribution_recipients;
drop policy if exists "authenticated users can update"   on public.distribution_recipients;
create policy "distribution_recipients_staff_all" on public.distribution_recipients
  for all using (public.is_staff()) with check (public.is_staff());

-- -------------------------------------------------------------------
-- activity_log
-- -------------------------------------------------------------------
drop policy if exists "authenticated users can read all" on public.activity_log;
drop policy if exists "authenticated users can insert"   on public.activity_log;
create policy "activity_log_staff_select" on public.activity_log for select using (public.is_staff());
create policy "activity_log_staff_insert" on public.activity_log for insert with check (public.is_staff());

-- -------------------------------------------------------------------
-- notifications: keep user-scoped own-row access, add staff visibility
-- -------------------------------------------------------------------
-- (existing "authenticated users can read own" / "users can update own
--  notifications" policies are already correctly scoped — kept as-is)
create policy "notifications_staff_select" on public.notifications for select using (public.is_staff());

-- -------------------------------------------------------------------
-- widow_requests: drop the dangerous using(true) catch-all
-- (it applied to EVERY role, not just service_role; service_role
--  bypasses RLS anyway and needs no policy)
-- -------------------------------------------------------------------
drop policy if exists "service_role_all" on public.widow_requests;
create policy "widow_requests_staff_all" on public.widow_requests
  for all using (public.is_staff()) with check (public.is_staff());

-- -------------------------------------------------------------------
-- financial_aid_requests
-- -------------------------------------------------------------------
drop policy if exists "financial_aid_read"   on public.financial_aid_requests;
drop policy if exists "financial_aid_insert" on public.financial_aid_requests;
drop policy if exists "financial_aid_update" on public.financial_aid_requests;
drop policy if exists "financial_aid_delete" on public.financial_aid_requests;
create policy "financial_aid_staff_all" on public.financial_aid_requests
  for all using (public.is_staff()) with check (public.is_staff());

-- -------------------------------------------------------------------
-- widow_support_payments
-- -------------------------------------------------------------------
drop policy if exists "widow_payments_read"   on public.widow_support_payments;
drop policy if exists "widow_payments_insert" on public.widow_support_payments;
drop policy if exists "widow_payments_update" on public.widow_support_payments;
drop policy if exists "widow_payments_delete" on public.widow_support_payments;
create policy "widow_support_payments_staff_all" on public.widow_support_payments
  for all using (public.is_staff()) with check (public.is_staff());

-- -------------------------------------------------------------------
-- card_centers (previous select policy was using(true) => anon-readable)
-- -------------------------------------------------------------------
drop policy if exists "card_centers_read"   on public.card_centers;
drop policy if exists "card_centers_insert" on public.card_centers;
drop policy if exists "card_centers_update" on public.card_centers;
drop policy if exists "card_centers_delete" on public.card_centers;
create policy "card_centers_staff_all" on public.card_centers
  for all using (public.is_staff()) with check (public.is_staff());

-- -------------------------------------------------------------------
-- recovery_homes (previous select policy was using(true) => anon-readable;
-- the maternity portal reads it via service-role API routes only)
-- -------------------------------------------------------------------
drop policy if exists "recovery_homes_read"   on public.recovery_homes;
drop policy if exists "recovery_homes_insert" on public.recovery_homes;
drop policy if exists "recovery_homes_delete" on public.recovery_homes;
create policy "recovery_homes_staff_all" on public.recovery_homes
  for all using (public.is_staff()) with check (public.is_staff());

-- -------------------------------------------------------------------
-- lineage_nodes: was service_role-only, but admin pages read it with
-- the staff session — add staff access (service_role policy kept)
-- -------------------------------------------------------------------
create policy "lineage_nodes_staff_all" on public.lineage_nodes
  for all using (public.is_staff()) with check (public.is_staff());

-- -------------------------------------------------------------------
-- mail_events / email_tracking: created WITHOUT RLS — enable it.
-- Both are written/read exclusively via service-role API routes.
-- -------------------------------------------------------------------
alter table public.mail_events    enable row level security;
alter table public.email_tracking enable row level security;
create policy "mail_events_staff_all" on public.mail_events
  for all using (public.is_staff()) with check (public.is_staff());
create policy "email_tracking_staff_all" on public.email_tracking
  for all using (public.is_staff()) with check (public.is_staff());
