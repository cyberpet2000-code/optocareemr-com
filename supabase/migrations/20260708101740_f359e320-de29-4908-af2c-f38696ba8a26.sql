
-- Storage RLS for expense-receipts
CREATE POLICY "expense_receipts_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'expense-receipts' AND (
    public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.user_clinic_memberships m
      WHERE m.user_id = auth.uid()
        AND m.clinic_id::text = (storage.foldername(name))[1]
    )
  )
);

CREATE POLICY "expense_receipts_write" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'expense-receipts' AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "expense_receipts_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'expense-receipts' AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  )
);

-- Storage RLS for monthly-reports (service_role writes; admins read via signed URLs)
CREATE POLICY "monthly_reports_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'monthly-reports' AND (
    public.has_role(auth.uid(), 'super_admin')
    OR (
      public.has_role(auth.uid(), 'admin')
      AND EXISTS (
        SELECT 1 FROM public.user_clinic_memberships m
        WHERE m.user_id = auth.uid()
          AND m.clinic_id::text = (storage.foldername(name))[1]
      )
    )
  )
);
