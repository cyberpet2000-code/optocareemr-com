
DROP POLICY IF EXISTS clinic_select_clinic_feature_flags ON public.clinic_feature_flags;
DROP POLICY IF EXISTS clinic_insert_clinic_feature_flags ON public.clinic_feature_flags;
DROP POLICY IF EXISTS clinic_update_clinic_feature_flags ON public.clinic_feature_flags;
DROP POLICY IF EXISTS clinic_delete_clinic_feature_flags ON public.clinic_feature_flags;

CREATE POLICY clinic_select_clinic_feature_flags ON public.clinic_feature_flags
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.clinic_id = clinic_feature_flags.clinic_id
  )
);

CREATE POLICY clinic_insert_clinic_feature_flags ON public.clinic_feature_flags
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.clinic_id = clinic_feature_flags.clinic_id
      AND ur.role = 'admin'::app_role
  )
);

CREATE POLICY clinic_update_clinic_feature_flags ON public.clinic_feature_flags
FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.clinic_id = clinic_feature_flags.clinic_id
      AND ur.role = 'admin'::app_role
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.clinic_id = clinic_feature_flags.clinic_id
      AND ur.role = 'admin'::app_role
  )
);

CREATE POLICY clinic_delete_clinic_feature_flags ON public.clinic_feature_flags
FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.clinic_id = clinic_feature_flags.clinic_id
      AND ur.role = 'admin'::app_role
  )
);
