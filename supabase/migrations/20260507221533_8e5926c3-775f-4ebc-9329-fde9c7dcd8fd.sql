-- Allow super admins to view and update any clinic (needed for clinic switching)
DROP POLICY IF EXISTS "Super admins can view all clinics" ON public.clinics;
CREATE POLICY "Super admins can view all clinics"
ON public.clinics FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can update all clinics" ON public.clinics;
CREATE POLICY "Super admins can update all clinics"
ON public.clinics FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()));