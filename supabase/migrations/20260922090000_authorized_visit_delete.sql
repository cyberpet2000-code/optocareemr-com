-- Allow authorized clinical staff to remove an accidentally duplicated visit.
-- The UI verifies that a row was actually deleted instead of treating an RLS no-op as success.

DROP POLICY IF EXISTS "clinic_delete_visits_authorized_staff" ON public.visits;

CREATE POLICY "clinic_delete_visits_authorized_staff"
ON public.visits
FOR DELETE
TO authenticated
USING (
  clinic_id = public.current_clinic_id()
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'doctor')
  )
);
