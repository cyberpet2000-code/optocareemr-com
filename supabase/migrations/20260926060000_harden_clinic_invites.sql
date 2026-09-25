-- Harden clinic invite table: invite creation is privileged; anonymous users may only validate
-- an unexpired pending token. Authenticated users can read their own/clinic invites via existing policies.
drop policy if exists "TEMP_ALLOW_AUTH" on public.clinic_invites;
drop policy if exists "invites_insert" on public.clinic_invites;
drop policy if exists "anon_can_verify_pending_invites" on public.clinic_invites;
revoke all on table public.clinic_invites from anon;
grant select on table public.clinic_invites to anon;
create policy anon_can_verify_pending_invites on public.clinic_invites
for select to anon
using (token is not null and status='pending' and expires_at>now());
create policy clinic_invites_insert_super_admin on public.clinic_invites
for insert to authenticated
with check (has_role(auth.uid(),'super_admin'));
revoke insert,update,delete on table public.clinic_invites from anon;
revoke insert on table public.clinic_invites from authenticated;
