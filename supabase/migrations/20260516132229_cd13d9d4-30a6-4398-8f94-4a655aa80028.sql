
-- Add is_active flag for staff activation/deactivation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Allow clinic members to read activity_logs for their clinic, and admins/super_admins to insert
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_select_clinic" ON public.activity_logs;
CREATE POLICY "activity_logs_select_clinic"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    clinic_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = activity_logs.clinic_id
        AND ur.role IN ('admin'::app_role, 'super_admin'::app_role)
    )
  )
);

DROP POLICY IF EXISTS "activity_logs_insert_clinic_admin" ON public.activity_logs;
CREATE POLICY "activity_logs_insert_clinic_admin"
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    clinic_id IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = activity_logs.clinic_id
        AND ur.role IN ('admin'::app_role, 'super_admin'::app_role)
    )
  )
);
