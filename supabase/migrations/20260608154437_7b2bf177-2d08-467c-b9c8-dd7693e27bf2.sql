
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS hmo_verification_status text NOT NULL DEFAULT 'pending'
    CHECK (hmo_verification_status IN ('pending','verified','rejected','not_applicable')),
  ADD COLUMN IF NOT EXISTS hmo_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS hmo_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hmo_verification_notes text;

CREATE TABLE IF NOT EXISTS public.hmo_verification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hmo_id uuid REFERENCES public.hmos(id) ON DELETE SET NULL,
  enrollee_number text,
  status text NOT NULL CHECK (status IN ('pending','verified','rejected','not_applicable')),
  notes text,
  acted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.hmo_verification_log TO authenticated;
GRANT ALL ON public.hmo_verification_log TO service_role;

ALTER TABLE public.hmo_verification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic members can view HMO verification log"
  ON public.hmo_verification_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.clinic_id = hmo_verification_log.clinic_id
        AND cu.user_id = auth.uid()
    )
  );

CREATE POLICY "Clinic members can add HMO verification log entries"
  ON public.hmo_verification_log FOR INSERT
  TO authenticated
  WITH CHECK (
    acted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.clinic_id = hmo_verification_log.clinic_id
        AND cu.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_hmo_verification_log_patient ON public.hmo_verification_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_hmo_verification_status ON public.patients(hmo_verification_status);
