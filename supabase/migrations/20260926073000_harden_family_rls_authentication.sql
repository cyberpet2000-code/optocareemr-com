-- Families contain patient relationship data; remove legacy public-role RLS.
drop policy if exists families_delete on public.families;
drop policy if exists families_insert on public.families;
drop policy if exists families_select on public.families;
drop policy if exists families_update on public.families;

create policy families_select on public.families for select to authenticated
using (public.is_super_admin(auth.uid()) or (clinic_id=public.current_clinic_id() and public.lifecycle_allows_access(clinic_id)));

create policy families_insert on public.families for insert to authenticated
with check (public.is_super_admin(auth.uid()) or ((public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'doctor') or public.has_role(auth.uid(),'receptionist')) and clinic_id=public.current_clinic_id() and public.lifecycle_allows_access(clinic_id)));

create policy families_update on public.families for update to authenticated
using (public.is_super_admin(auth.uid()) or ((public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'doctor') or public.has_role(auth.uid(),'receptionist')) and clinic_id=public.current_clinic_id() and public.lifecycle_allows_access(clinic_id)))
with check (public.is_super_admin(auth.uid()) or ((public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'doctor') or public.has_role(auth.uid(),'receptionist')) and clinic_id=public.current_clinic_id() and public.lifecycle_allows_access(clinic_id)));

create policy families_delete on public.families for delete to authenticated
using (public.is_super_admin(auth.uid()) or (public.has_role(auth.uid(),'admin') and clinic_id=public.current_clinic_id() and public.lifecycle_allows_access(clinic_id)));

revoke all on table public.families from anon;
