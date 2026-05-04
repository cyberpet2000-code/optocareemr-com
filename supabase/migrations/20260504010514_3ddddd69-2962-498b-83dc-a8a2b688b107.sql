-- Helper: is trial active
CREATE OR REPLACE FUNCTION public.is_trial_active(_clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinics c
    WHERE c.id = _clinic_id
      AND (
        c.subscription_status = 'active'
        OR (c.subscription_status = 'trial' AND COALESCE(c.trial_end_date, now()) >= now())
      )
  );
$$;

-- Smart initializer: idempotent, seeds settings + module flags by clinic type
CREATE OR REPLACE FUNCTION public.smart_initialize_clinic(_clinic_id uuid, _clinic_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
  _eye boolean := lower(_clinic_type) IN ('eye', 'eye_clinic', 'eye clinic');
  _general boolean := lower(_clinic_type) IN ('general', 'general_hospital', 'hospital');
  _pharmacy boolean := lower(_clinic_type) IN ('pharmacy');
  _lab boolean := lower(_clinic_type) IN ('lab', 'diagnostic', 'diagnostic_lab');
BEGIN
  SELECT name INTO _name FROM public.clinics WHERE id = _clinic_id;
  IF _name IS NULL THEN
    RAISE EXCEPTION 'Clinic % not found', _clinic_id;
  END IF;

  -- Seed clinic_settings if missing
  INSERT INTO public.clinic_settings (clinic_id, clinic_name)
  VALUES (_clinic_id, _name)
  ON CONFLICT DO NOTHING;

  -- Seed clinic_feature_flags
  INSERT INTO public.clinic_feature_flags (
    clinic_id, billing_enabled, hmo_enabled, pharmacy_enabled, inventory_enabled, appointments_enabled
  )
  VALUES (
    _clinic_id,
    true,
    NOT _lab,
    _pharmacy OR _eye OR _general,
    true,
    NOT _pharmacy
  )
  ON CONFLICT DO NOTHING;

  -- Mark module setup advanced (but not full setup yet)
  UPDATE public.clinics
     SET modules_setup_done = true,
         modules_configured = true,
         onboarding_step = 'staff',
         updated_at = now()
   WHERE id = _clinic_id;

  RETURN jsonb_build_object(
    'clinic_id', _clinic_id,
    'type', _clinic_type,
    'modules', jsonb_build_object(
      'billing', true,
      'hmo', NOT _lab,
      'pharmacy', _pharmacy OR _eye OR _general,
      'inventory', true,
      'appointments', NOT _pharmacy
    )
  );
END;
$$;

-- Mark onboarding complete
CREATE OR REPLACE FUNCTION public.complete_onboarding(_clinic_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clinics
     SET setup_completed = true,
         onboarding_step = 'done',
         updated_at = now()
   WHERE id = _clinic_id;
END;
$$;

-- Allow authenticated users to read/update their clinic_settings + feature_flags
ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_settings_select" ON public.clinic_settings;
CREATE POLICY "clinic_settings_select" ON public.clinic_settings
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR clinic_id = current_clinic_id());

DROP POLICY IF EXISTS "clinic_settings_upsert" ON public.clinic_settings;
CREATE POLICY "clinic_settings_upsert" ON public.clinic_settings
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()) OR clinic_id = current_clinic_id());

DROP POLICY IF EXISTS "clinic_settings_update" ON public.clinic_settings
  ;
CREATE POLICY "clinic_settings_update" ON public.clinic_settings
  FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()) OR clinic_id = current_clinic_id());

DROP POLICY IF EXISTS "clinic_flags_select" ON public.clinic_feature_flags;
CREATE POLICY "clinic_flags_select" ON public.clinic_feature_flags
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR clinic_id = current_clinic_id());

DROP POLICY IF EXISTS "clinic_flags_insert" ON public.clinic_feature_flags;
CREATE POLICY "clinic_flags_insert" ON public.clinic_feature_flags
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()) OR clinic_id = current_clinic_id());

DROP POLICY IF EXISTS "clinic_flags_update" ON public.clinic_feature_flags;
CREATE POLICY "clinic_flags_update" ON public.clinic_feature_flags
  FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()) OR clinic_id = current_clinic_id());