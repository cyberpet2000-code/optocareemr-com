ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS email_type text;

CREATE INDEX IF NOT EXISTS idx_email_logs_email_type ON public.email_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_clinic_created ON public.email_logs(clinic_id, created_at DESC);