-- HMO operational claim/request tracking for front-desk workflows.
-- Keeps external HMO payment handling separate from OptoCare's patient-payment records.
ALTER TABLE public.hmo_claims
  ADD COLUMN IF NOT EXISTS claim_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claim_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_response_status text NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS claim_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_response_remarks text;

ALTER TABLE public.daily_front_desk_report_items
  ADD COLUMN IF NOT EXISTS hmo_claim_id uuid REFERENCES public.hmo_claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hmo_amount_to_claim numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hmo_claim_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hmo_claim_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS hmo_claim_response_status text NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS hmo_claim_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS hmo_claim_response_remarks text;

CREATE INDEX IF NOT EXISTS idx_hmo_claims_clinic_patient_created
  ON public.hmo_claims(clinic_id, patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_front_desk_items_hmo_claim
  ON public.daily_front_desk_report_items(hmo_claim_id);

-- Backfill operational sent/response state from the existing claim status where possible.
UPDATE public.hmo_claims
SET
  claim_sent = CASE
    WHEN lower(coalesce(status, '')) IN ('sent','submitted','pending','approved','rejected','query','queried','response received','resubmission required')
      THEN true ELSE claim_sent END,
  claim_response_status = CASE
    WHEN lower(coalesce(status, '')) IN ('approved') THEN 'Approved'
    WHEN lower(coalesce(status, 'rejected')) THEN 'Rejected'
    WHEN lower(coalesce(status, 'query','queried')) THEN 'Query'
    WHEN lower(coalesce(status, 'response received')) THEN 'Received'
    ELSE claim_response_status
  END;
