
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS clinic_id uuid,
  ADD COLUMN IF NOT EXISTS invite_id uuid,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'resend',
  ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_email_logs_clinic_id ON public.email_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_invite_id ON public.email_logs(invite_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_email ON public.email_logs(email);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_logs_select_super_admin" ON public.email_logs;
CREATE POLICY "email_logs_select_super_admin"
ON public.email_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "email_logs_select_clinic_member" ON public.email_logs;
CREATE POLICY "email_logs_select_clinic_member"
ON public.email_logs FOR SELECT
TO authenticated
USING (
  clinic_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.clinic_id = email_logs.clinic_id
  )
);
