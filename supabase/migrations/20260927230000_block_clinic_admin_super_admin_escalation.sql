-- Clinic admins may manage ordinary staff roles only.
-- Platform-level super_admin assignments remain a super-admin-only operation.
drop policy if exists user_roles_admin_manage_clinic on public.user_roles;
create policy user_roles_admin_manage_clinic
on public.user_roles
for all to authenticated
using (
  public.is_super_admin(auth.uid())
  or (
    public.has_role(auth.uid(),'admin'::public.app_role)
    and clinic_id = public.current_clinic_id()
    and role <> 'super_admin'::public.app_role
  )
)
with check (
  public.is_super_admin(auth.uid())
  or (
    public.has_role(auth.uid(),'admin'::public.app_role)
    and clinic_id = public.current_clinic_id()
    and role <> 'super_admin'::public.app_role
  )
);

drop policy if exists clinic_users_admin_manage_clinic on public.clinic_users;
create policy clinic_users_admin_manage_clinic
on public.clinic_users
for all to authenticated
using (
  public.is_super_admin(auth.uid())
  or (
    public.has_role(auth.uid(),'admin'::public.app_role)
    and clinic_id = public.current_clinic_id()
    and lower(coalesce(role,'')) <> 'super_admin'
  )
)
with check (
  public.is_super_admin(auth.uid())
  or (
    public.has_role(auth.uid(),'admin'::public.app_role)
    and clinic_id = public.current_clinic_id()
    and lower(coalesce(role,'')) <> 'super_admin'
  )
);
