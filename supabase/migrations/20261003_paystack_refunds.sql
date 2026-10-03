-- Isolated Paystack refund ledger.
-- Do not apply to production until the Paystack implementation is explicitly approved.

CREATE TABLE IF NOT EXISTS public.paystack_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  transaction_reference text NOT NULL,
  refund_reference text,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending',
  reason text,
  customer_note text,
  merchant_note text,
  initiated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_paystack_refunds_refund_reference
  ON public.paystack_refunds (refund_reference)
  WHERE refund_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paystack_refunds_clinic
  ON public.paystack_refunds (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paystack_refunds_transaction
  ON public.paystack_refunds (transaction_reference);

ALTER TABLE public.paystack_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.paystack_refunds FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.paystack_refunds FROM authenticated;

COMMENT ON TABLE public.paystack_refunds IS
  'Paystack refund ledger. Isolated project migration; apply only with explicit production approval.';
