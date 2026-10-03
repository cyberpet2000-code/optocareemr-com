-- Isolated Paystack transaction/refund ledgers.
-- Do not apply to production until the Paystack implementation is explicitly approved.

CREATE TABLE IF NOT EXISTS public.paystack_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  reference text NOT NULL UNIQUE,
  paystack_transaction_id bigint,
  plan_code text,
  amount bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL,
  customer_code text,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paystack_transactions_clinic
  ON public.paystack_transactions (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paystack_transactions_status
  ON public.paystack_transactions (status);

ALTER TABLE public.paystack_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.paystack_transactions FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.paystack_transactions FROM authenticated;

CREATE TABLE IF NOT EXISTS public.paystack_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  transaction_reference text NOT NULL,
  refund_id bigint,
  refund_reference text,
  amount bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL,
  customer_note text,
  merchant_note text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paystack_refunds_refund_id
  ON public.paystack_refunds (refund_id)
  WHERE refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paystack_refunds_clinic
  ON public.paystack_refunds (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paystack_refunds_transaction
  ON public.paystack_refunds (transaction_reference);

ALTER TABLE public.paystack_refunds ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.paystack_refunds FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.paystack_refunds FROM authenticated;

COMMENT ON TABLE public.paystack_transactions IS
  'Authoritative Paystack transaction ledger. Isolated project migration; apply only with explicit production approval.';

COMMENT ON TABLE public.paystack_refunds IS
  'Paystack refund lifecycle ledger. Isolated project migration; apply only with explicit production approval.';
