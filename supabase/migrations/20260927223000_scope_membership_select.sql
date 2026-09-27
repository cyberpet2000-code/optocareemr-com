-- Membership rows are sensitive tenant topology.
-- Users can see their own membership; clinic admins can see their own clinic;
-- super admins can see all.
drop policy if exists allow_authenticated_select on public.user_clinic_memberships;
drop policy if exists memberships_select_own_or_admin on public.user_clinic_memberships;

create policy memberships_select_own_or_clinic_admin
on public.user_clinic_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_super_admin(auth.uid())
  or (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
);
