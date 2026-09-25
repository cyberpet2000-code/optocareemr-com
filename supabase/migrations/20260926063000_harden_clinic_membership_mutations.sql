-- Users must not self-create or self-edit clinic memberships.
drop policy if exists memberships_insert_own on public.user_clinic_memberships;
drop policy if exists memberships_update_own on public.user_clinic_memberships;

create policy memberships_insert_admin_or_super on public.user_clinic_memberships
for insert to authenticated
with check (
  public.is_super_admin(auth.uid())
  or (public.has_role(auth.uid(),'admin') and clinic_id = public.current_clinic_id())
);

create policy memberships_update_admin_or_super on public.user_clinic_memberships
for update to authenticated
using (
  public.is_super_admin(auth.uid())
  or (public.has_role(auth.uid(),'admin') and clinic_id = public.current_clinic_id())
)
with check (
  public.is_super_admin(auth.uid())
  or (public.has_role(auth.uid(),'admin') and clinic_id = public.current_clinic_id())
);

create policy memberships_delete_admin_or_super on public.user_clinic_memberships
for delete to authenticated
using (
  public.is_super_admin(auth.uid())
  or (public.has_role(auth.uid(),'admin') and clinic_id = public.current_clinic_id())
);

revoke insert,update,delete on table public.user_clinic_memberships from anon;
