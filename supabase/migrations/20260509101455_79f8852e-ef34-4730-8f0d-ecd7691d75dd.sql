CREATE TABLE IF NOT EXISTS public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  recipient text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  notification_type text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'pending',
  provider text DEFAULT 'resend',
  provider_message_id text,
  error_message text,
  attempts integer DEFAULT 1,
  metadata jsonb,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_clinic_id ON public.notification_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at ON public.notification_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON public.notification_logs(notification_type);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_logs_select_super_admin"
  ON public.notification_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "notification_logs_select_clinic_member"
  ON public.notification_logs FOR SELECT
  TO authenticated
  USING (
    clinic_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.clinic_id = notification_logs.clinic_id
    )
  );