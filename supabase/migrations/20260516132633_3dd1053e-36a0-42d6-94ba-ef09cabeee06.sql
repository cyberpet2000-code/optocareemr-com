
DROP POLICY IF EXISTS "profiles_update_clinic_admin" ON public.profiles;
CREATE POLICY "profiles_update_clinic_admin"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur_admin
    JOIN public.user_roles ur_target
      ON ur_target.user_id = profiles.id
     AND ur_target.clinic_id = ur_admin.clinic_id
    WHERE ur_admin.user_id = auth.uid()
      AND ur_admin.role = 'admin'::app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur_admin
    JOIN public.user_roles ur_target
      ON ur_target.user_id = profiles.id
     AND ur_target.clinic_id = ur_admin.clinic_id
    WHERE ur_admin.user_id = auth.uid()
      AND ur_admin.role = 'admin'::app_role
  )
);

-- Also allow clinic admins to manage user_roles within their clinic
DROP POLICY IF EXISTS "user_roles_admin_manage_clinic" ON public.user_roles;
CREATE POLICY "user_roles_admin_manage_clinic"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    clinic_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur_admin
      WHERE ur_admin.user_id = auth.uid()
        AND ur_admin.clinic_id = user_roles.clinic_id
        AND ur_admin.role = 'admin'::app_role
    )
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    clinic_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur_admin
      WHERE ur_admin.user_id = auth.uid()
        AND ur_admin.clinic_id = user_roles.clinic_id
        AND ur_admin.role = 'admin'::app_role
    )
  )
);
