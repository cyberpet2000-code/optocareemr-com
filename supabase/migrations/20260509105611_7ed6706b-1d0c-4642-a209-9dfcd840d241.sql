
-- Add lifecycle columns to clinics
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivation_reason text;

-- auto_fix_logs
CREATE TABLE IF NOT EXISTS public.auto_fix_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  issue_detected text NOT NULL,
  action_taken text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auto_fix_logs_clinic ON public.auto_fix_logs(clinic_id, created_at DESC);
ALTER TABLE public.auto_fix_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_fix_logs_select_super_admin" ON public.auto_fix_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "auto_fix_logs_select_clinic_member" ON public.auto_fix_logs
  FOR SELECT TO authenticated
  USING (clinic_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.clinic_id = auto_fix_logs.clinic_id
  ));

-- clinic_success_scores
CREATE TABLE IF NOT EXISTS public.clinic_success_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE,
  score integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'critical',
  factors jsonb,
  insights text[],
  calculated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clinic_success_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "css_select_super_admin" ON public.clinic_success_scores
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "css_select_clinic_member" ON public.clinic_success_scores
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.clinic_id = clinic_success_scores.clinic_id
  ));

-- Calculate success score
CREATE OR REPLACE FUNCTION public.calculate_clinic_success_score(_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  patient_count int := 0;
  staff_count int := 0;
  email_total int := 0;
  email_failed int := 0;
  recent_logins int := 0;
  recent_errors int := 0;
  factors jsonb := '{}'::jsonb;
  insights text[] := ARRAY[]::text[];
  score int := 0;
  s_status text;
  v_onboarding int := 0;
  v_first_patient int := 0;
  v_staff int := 0;
  v_modules int := 0;
  v_billing int := 0;
  v_login int := 0;
  v_errors int := 0;
  v_invites int := 0;
BEGIN
  SELECT * INTO c FROM clinics WHERE id = _clinic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'clinic_not_found');
  END IF;

  SELECT COUNT(*) INTO patient_count FROM patients WHERE clinic_id = _clinic_id;
  SELECT COUNT(*) INTO staff_count FROM user_roles WHERE clinic_id = _clinic_id;
  SELECT COUNT(*) INTO email_total FROM email_logs WHERE clinic_id = _clinic_id;
  SELECT COUNT(*) INTO email_failed FROM email_logs WHERE clinic_id = _clinic_id AND status IN ('failed','bounced','complained');
  SELECT COUNT(*) INTO recent_errors FROM clinic_system_issues WHERE clinic_id = _clinic_id AND resolved = false;

  -- onboarding (30)
  IF COALESCE(c.setup_completed, false) THEN v_onboarding := 30;
  ELSE
    v_onboarding := (
      (CASE WHEN c.staff_setup_done THEN 8 ELSE 0 END) +
      (CASE WHEN c.modules_setup_done THEN 8 ELSE 0 END) +
      (CASE WHEN c.first_patient_done THEN 8 ELSE 0 END) +
      (CASE WHEN c.onboarding_step = 'welcome' THEN 0 ELSE 6 END)
    );
    insights := array_append(insights, 'Clinic is stuck at onboarding step: ' || COALESCE(c.onboarding_step,'welcome'));
  END IF;

  -- first patient (15)
  IF patient_count > 0 THEN v_first_patient := 15;
  ELSE insights := array_append(insights, 'No patient activity detected'); END IF;

  -- staff (10)
  IF staff_count >= 2 THEN v_staff := 10;
  ELSIF staff_count = 1 THEN v_staff := 5;
  ELSE insights := array_append(insights, 'Staff not added'); END IF;

  -- modules (10)
  IF COALESCE(c.modules_setup_done, false) THEN v_modules := 10; ELSE v_modules := 0; END IF;

  -- billing (10)
  IF COALESCE(c.billing_enabled, false) THEN v_billing := 10; ELSE v_billing := 0; END IF;

  -- login activity (10) -> use most recent activity in audit_logs in last 7d
  SELECT COUNT(*) INTO recent_logins FROM audit_logs WHERE clinic_id = _clinic_id AND timestamp > now() - interval '7 days';
  IF recent_logins >= 20 THEN v_login := 10;
  ELSIF recent_logins >= 5 THEN v_login := 6;
  ELSIF recent_logins > 0 THEN v_login := 3;
  ELSE v_login := 0; insights := array_append(insights, 'Low login activity (last 7 days)'); END IF;

  -- error rate (10)
  IF recent_errors = 0 THEN v_errors := 10;
  ELSIF recent_errors < 3 THEN v_errors := 6;
  ELSE v_errors := 0; insights := array_append(insights, 'Unresolved system issues detected'); END IF;

  -- email invite success (5)
  IF email_total = 0 THEN v_invites := 3;
  ELSIF email_failed::numeric / email_total < 0.1 THEN v_invites := 5;
  ELSIF email_failed::numeric / email_total < 0.3 THEN v_invites := 3;
  ELSE v_invites := 0; insights := array_append(insights, 'Email invites failing'); END IF;

  score := v_onboarding + v_first_patient + v_staff + v_modules + v_billing + v_login + v_errors + v_invites;
  IF score >= 80 THEN s_status := 'healthy';
  ELSIF score >= 50 THEN s_status := 'at_risk';
  ELSE s_status := 'critical';
  END IF;

  factors := jsonb_build_object(
    'onboarding', v_onboarding,
    'first_patient', v_first_patient,
    'staff', v_staff,
    'modules', v_modules,
    'billing', v_billing,
    'login_activity', v_login,
    'error_rate', v_errors,
    'email_invites', v_invites
  );

  INSERT INTO clinic_success_scores (clinic_id, score, status, factors, insights, calculated_at)
  VALUES (_clinic_id, score, s_status, factors, insights, now())
  ON CONFLICT (clinic_id) DO UPDATE
    SET score = EXCLUDED.score, status = EXCLUDED.status, factors = EXCLUDED.factors,
        insights = EXCLUDED.insights, calculated_at = now();

  RETURN jsonb_build_object('score', score, 'status', s_status, 'factors', factors, 'insights', to_jsonb(insights));
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_clinic_success_score(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_clinic_success_score(uuid) TO authenticated, service_role;

-- Run auto-fix engine
CREATE OR REPLACE FUNCTION public.run_auto_fix(_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  fixes int := 0;
  inv RECORD;
  pending_invite_count int;
BEGIN
  SELECT * INTO c FROM clinics WHERE id = _clinic_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','clinic_not_found'); END IF;

  -- Invite not accepted after 24h
  SELECT COUNT(*) INTO pending_invite_count
  FROM clinic_invites
  WHERE clinic_id = _clinic_id AND status = 'pending' AND created_at < now() - interval '24 hours';

  IF pending_invite_count > 0 THEN
    INSERT INTO auto_fix_logs(clinic_id, issue_detected, action_taken, status, details)
    VALUES (_clinic_id, 'invites_pending_24h', 'flag_for_resend', 'queued',
            jsonb_build_object('count', pending_invite_count));
    fixes := fixes + 1;
  END IF;

  -- Onboarding incomplete after 48h
  IF NOT COALESCE(c.setup_completed,false) AND c.created_at < now() - interval '48 hours' THEN
    UPDATE clinics SET onboarding_step = COALESCE(NULLIF(onboarding_step,''),'welcome') WHERE id = _clinic_id;
    INSERT INTO auto_fix_logs(clinic_id, issue_detected, action_taken, status, details)
    VALUES (_clinic_id, 'onboarding_incomplete_48h', 'reset_checklist_step', 'success',
            jsonb_build_object('current_step', c.onboarding_step));
    fixes := fixes + 1;
  END IF;

  -- Missing clinic_admin role
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE clinic_id = _clinic_id AND role = 'admin') THEN
    INSERT INTO auto_fix_logs(clinic_id, issue_detected, action_taken, status, details)
    VALUES (_clinic_id, 'missing_clinic_admin', 'manual_intervention_required', 'flagged', NULL);
    fixes := fixes + 1;
  END IF;

  -- Missing clinic_id relationships repair (patients)
  UPDATE patients SET clinic_id = _clinic_id
  WHERE clinic_id IS NULL AND created_by IN (SELECT user_id FROM user_roles WHERE clinic_id = _clinic_id);
  IF FOUND THEN
    INSERT INTO auto_fix_logs(clinic_id, issue_detected, action_taken, status, details)
    VALUES (_clinic_id, 'orphan_patient_records', 'reassigned_clinic_id', 'success', NULL);
    fixes := fixes + 1;
  END IF;

  -- Recompute score after fixes
  PERFORM calculate_clinic_success_score(_clinic_id);

  RETURN jsonb_build_object('fixes_applied', fixes);
END;
$$;

REVOKE ALL ON FUNCTION public.run_auto_fix(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_auto_fix(uuid) TO authenticated, service_role;

-- Activate clinic subscription (super-admin only)
CREATE OR REPLACE FUNCTION public.activate_clinic_subscription(_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins may activate clinics';
  END IF;
  UPDATE clinics
    SET subscription_status = 'active',
        is_active = true,
        deactivated_at = NULL,
        deactivation_reason = NULL,
        updated_at = now()
    WHERE id = _clinic_id;
  INSERT INTO auto_fix_logs(clinic_id, issue_detected, action_taken, status, details)
    VALUES (_clinic_id, 'manual_activation', 'subscription_activated', 'success',
            jsonb_build_object('actor', auth.uid()));
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.activate_clinic_subscription(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_clinic_subscription(uuid) TO authenticated;

-- Deactivate clinic (super-admin only)
CREATE OR REPLACE FUNCTION public.deactivate_clinic(_clinic_id uuid, _reason text DEFAULT 'manual')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins may deactivate clinics';
  END IF;
  UPDATE clinics
    SET is_active = false,
        subscription_status = 'inactive',
        deactivated_at = now(),
        deactivation_reason = _reason,
        updated_at = now()
    WHERE id = _clinic_id;
  INSERT INTO auto_fix_logs(clinic_id, issue_detected, action_taken, status, details)
    VALUES (_clinic_id, 'manual_deactivation', 'clinic_deactivated', 'success',
            jsonb_build_object('actor', auth.uid(), 'reason', _reason));
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_clinic(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_clinic(uuid, text) TO authenticated;

-- Trial expiration sweep
CREATE OR REPLACE FUNCTION public.check_trial_expiration()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  affected int := 0;
BEGIN
  FOR r IN
    SELECT id FROM clinics
    WHERE COALESCE(subscription_status,'trial') <> 'active'
      AND is_active = true
      AND trial_end_date IS NOT NULL
      AND trial_end_date < now()
  LOOP
    UPDATE clinics
      SET is_active = false,
          subscription_status = 'expired',
          deactivated_at = now(),
          deactivation_reason = 'trial_expired',
          updated_at = now()
      WHERE id = r.id;
    INSERT INTO alerts(clinic_id, alert_type, severity, message, status)
      VALUES (r.id, 'trial_expired', 'warning', 'Trial expired — clinic deactivated until subscription is activated', 'active');
    INSERT INTO auto_fix_logs(clinic_id, issue_detected, action_taken, status, details)
      VALUES (r.id, 'trial_expired', 'auto_deactivated', 'success', NULL);
    affected := affected + 1;
  END LOOP;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.check_trial_expiration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_trial_expiration() TO service_role;
