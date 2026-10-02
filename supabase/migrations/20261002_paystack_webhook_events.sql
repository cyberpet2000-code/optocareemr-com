-- Isolated Paystack project migration.
-- Do not apply to the production database until the Paystack implementation is approved.

CREATE TABLE IF NOT EXISTS public.paystack_webhook_events (
  id text PRIMARY KEY,
  event_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paystack_webhook_events_event_name
  ON public.paystack_webhook_events (event_name);

ALTER TABLE public.paystack_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.paystack_webhook_events FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.paystack_webhook_events FROM authenticated;

COMMENT ON TABLE public.paystack_webhook_events IS
  'Paystack webhook ledger for idempotency and audit. Isolated project migration; apply only with explicit production approval.';
