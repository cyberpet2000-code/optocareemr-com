-- Replace legacy JWT clinic_id sync policies with authenticated clinic-membership checks.
-- This is important for multi-clinic users and prevents trusting a client-controlled JWT clinic claim.
drop policy if exists sync_queue_clinic_isolation on public.sync_queue;
drop policy if exists sync_state_clinic_isolation on public.sync_state;
drop policy if exists sync_status_clinic_isolation on public.sync_status;
drop policy if exists sync_logs_clinic_isolation on public.sync_logs;
drop policy if exists sync_metrics_clinic_isolation on public.sync_metrics;

revoke all on table public.sync_queue from anon;
revoke all on table public.sync_state from anon;
revoke all on table public.sync_status from anon;
revoke all on table public.sync_logs from anon;
revoke all on table public.sync_metrics from anon;

create policy sync_queue_clinic_members on public.sync_queue for all to authenticated
using (public.is_super_admin(auth.uid()) or exists (select 1 from public.user_clinic_memberships m where m.user_id=auth.uid() and m.clinic_id=sync_queue.clinic_id and coalesce(m.is_active,true)))
with check (public.is_super_admin(auth.uid()) or exists (select 1 from public.user_clinic_memberships m where m.user_id=auth.uid() and m.clinic_id=sync_queue.clinic_id and coalesce(m.is_active,true)));

create policy sync_state_clinic_members on public.sync_state for all to authenticated
using (public.is_super_admin(auth.uid()) or exists (select 1 from public.user_clinic_memberships m where m.user_id=auth.uid() and m.clinic_id=sync_state.clinic_id and coalesce(m.is_active,true)))
with check (public.is_super_admin(auth.uid()) or exists (select 1 from public.user_clinic_memberships m where m.user_id=auth.uid() and m.clinic_id=sync_state.clinic_id and coalesce(m.is_active,true)));

create policy sync_status_clinic_members on public.sync_status for all to authenticated
using (public.is_super_admin(auth.uid()) or exists (select 1 from public.user_clinic_memberships m where m.user_id=auth.uid() and m.clinic_id=sync_status.clinic_id and coalesce(m.is_active,true)))
with check (public.is_super_admin(auth.uid()) or exists (select 1 from public.user_clinic_memberships m where m.user_id=auth.uid() and m.clinic_id=sync_status.clinic_id and coalesce(m.is_active,true)));

create policy sync_logs_clinic_members on public.sync_logs for all to authenticated
using (public.is_super_admin(auth.uid()) or (clinic_id is not null and exists (select 1 from public.user_clinic_memberships m where m.user_id=auth.uid() and m.clinic_id=sync_logs.clinic_id and coalesce(m.is_active,true))))
with check (public.is_super_admin(auth.uid()) or (clinic_id is not null and exists (select 1 from public.user_clinic_memberships m where m.user_id=auth.uid() and m.clinic_id=sync_logs.clinic_id and coalesce(m.is_active,true))));

create policy sync_metrics_clinic_members on public.sync_metrics for all to authenticated
using (public.is_super_admin(auth.uid()) or exists (select 1 from public.user_clinic_memberships m where m.user_id=auth.uid() and m.clinic_id=sync_metrics.clinic_id and coalesce(m.is_active,true)))
with check (public.is_super_admin(auth.uid()) or exists (select 1 from public.user_clinic_memberships m where m.user_id=auth.uid() and m.clinic_id=sync_metrics.clinic_id and coalesce(m.is_active,true)));
