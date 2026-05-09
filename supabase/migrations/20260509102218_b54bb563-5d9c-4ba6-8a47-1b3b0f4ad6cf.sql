-- Extend notification_logs
ALTER TABLE public.notification_logs
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'transactional',
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz,
  ADD COLUMN IF NOT EXISTS plain_text_included boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_notification_logs_category ON public.notification_logs(category);
CREATE INDEX IF NOT EXISTS idx_notification_logs_provider_message_id ON public.notification_logs(provider_message_id);

-- Suppression list
CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  reason text NOT NULL,
  source text DEFAULT 'webhook',
  clinic_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email)
);
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppr_select_super_admin"
  ON public.email_suppressions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "suppr_select_clinic_member"
  ON public.email_suppressions FOR SELECT TO authenticated
  USING (clinic_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.clinic_id = email_suppressions.clinic_id
  ));

-- Daily warmup quota
CREATE TABLE IF NOT EXISTS public.email_send_quota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  category text NOT NULL DEFAULT 'transactional',
  sent_count integer NOT NULL DEFAULT 0,
  daily_limit integer NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(day, category)
);
ALTER TABLE public.email_send_quota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quota_select_super_admin"
  ON public.email_send_quota FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Atomic increment + check (returns NULL if over limit, else new sent_count)
CREATE OR REPLACE FUNCTION public.try_consume_email_quota(_category text, _limit integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Lagos')::date;
  v_count integer;
BEGIN
  INSERT INTO email_send_quota(day, category, sent_count, daily_limit)
  VALUES (v_today, _category, 0, _limit)
  ON CONFLICT (day, category) DO NOTHING;

  UPDATE email_send_quota
    SET sent_count = sent_count + 1, updated_at = now(), daily_limit = GREATEST(daily_limit, _limit)
    WHERE day = v_today AND category = _category AND sent_count < _limit
    RETURNING sent_count INTO v_count;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.try_consume_email_quota(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_consume_email_quota(text, integer) TO service_role;