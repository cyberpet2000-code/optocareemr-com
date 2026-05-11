
-- 1. Lifecycle enum
DO $$ BEGIN
  CREATE TYPE public.clinic_lifecycle AS ENUM ('trial','active','suspended','deactivated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Column + backfill
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS lifecycle_status public.clinic_lifecycle;

UPDATE public.clinics SET lifecycle_status = CASE
  WHEN is_active = false AND (deactivation_reason = 'trial_expired' OR subscription_status = 'expired') THEN 'deactivated'::public.clinic_lifecycle
  WHEN is_active = false THEN 'suspended'::public.clinic_lifecycle
  WHEN subscription_status = 'active' THEN 'active'::public.clinic_lifecycle
  ELSE 'trial'::public.clinic_lifecycle
END
WHERE lifecycle_status IS NULL;

ALTER TABLE public.clinics
  ALTER COLUMN lifecycle_status SET DEFAULT 'trial'::public.clinic_lifecycle,
  ALTER COLUMN lifecycle_status SET NOT NULL;

-- 3. Sync trigger keeps legacy columns aligned
CREATE OR REPLACE FUNCTION public.sync_clinic_lifecycle_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status OR TG_OP = 'INSERT' THEN
    NEW.is_active := NEW.lifecycle_status IN ('trial','active');
    NEW.subscription_status := CASE NEW.lifecycle_status
      WHEN 'active' THEN 'active'
      WHEN 'trial' THEN 'trial'
      WHEN 'suspended' THEN 'suspended'
      WHEN 'deactivated' THEN 'expired'
    END;
    IF NEW.lifecycle_status IN ('suspended','deactivated') AND NEW.deactivated_at IS NULL THEN
      NEW.deactivated_at := now();
    ELSIF NEW.lifecycle_status IN ('trial','active') THEN
      NEW.deactivated_at := NULL;
      NEW.deactivation_reason := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_clinic_lifecycle ON public.clinics;
CREATE TRIGGER trg_sync_clinic_lifecycle
  BEFORE INSERT OR UPDATE OF lifecycle_status ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.sync_clinic_lifecycle_columns();

-- 4. Lifecycle access helper
CREATE OR REPLACE FUNCTION public.lifecycle_allows_access(_clinic_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinics
    WHERE id = _clinic_id AND lifecycle_status IN ('trial','active')
  );
$$;

-- 5. Lifecycle transition RPC
CREATE OR REPLACE FUNCTION public.set_clinic_lifecycle(
  _clinic_id uuid,
  _next public.clinic_lifecycle,
  _reason text DEFAULT NULL
)
RETURNS public.clinic_lifecycle LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current public.clinic_lifecycle;
  v_allowed boolean := false;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can change clinic lifecycle';
  END IF;

  SELECT lifecycle_status INTO v_current FROM public.clinics WHERE id = _clinic_id FOR UPDATE;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Clinic % not found', _clinic_id;
  END IF;

  IF v_current = _next THEN
    RETURN v_current;
  END IF;

  v_allowed := (v_current = 'trial'     AND _next = 'active')
            OR (v_current = 'active'    AND _next IN ('suspended','deactivated'))
            OR (v_current = 'suspended' AND _next = 'active');

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid lifecycle transition % -> %', v_current, _next;
  END IF;

  UPDATE public.clinics
    SET lifecycle_status = _next,
        deactivation_reason = CASE WHEN _next IN ('suspended','deactivated') THEN _reason ELSE NULL END
    WHERE id = _clinic_id;

  INSERT INTO public.audit_logs (table_name, action, user_id, clinic_id, record_id, new_data, old_data)
  VALUES ('clinics', 'lifecycle_change', auth.uid(), _clinic_id, _clinic_id,
          jsonb_build_object('lifecycle_status', _next, 'reason', _reason),
          jsonb_build_object('lifecycle_status', v_current));

  RETURN _next;
END;
$$;

REVOKE ALL ON FUNCTION public.set_clinic_lifecycle(uuid, public.clinic_lifecycle, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_clinic_lifecycle(uuid, public.clinic_lifecycle, text) TO authenticated;

-- 6. Drop legacy loose policies on clinics + clinic_settings
DROP POLICY IF EXISTS "Users see only their clinic" ON public.clinics;
DROP POLICY IF EXISTS "clinic can update its branding" ON public.clinics;
DROP POLICY IF EXISTS "clinic settings access" ON public.clinic_settings;

-- Re-add tight clinic SELECT/UPDATE policies
CREATE POLICY "clinics_select_member"
  ON public.clinics FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.clinic_id = clinics.id)
  );

CREATE POLICY "clinics_update_admin"
  ON public.clinics FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (id = public.current_clinic_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (id = public.current_clinic_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  );

-- 7. Sweep tenant tables: enforce strict super-admin OR (clinic match AND lifecycle OK)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'patients','visits','appointments','billing','billing_items','followups',
    'hmos','hmo_plans','hmo_history','hmo_claims',
    'inventory','inventory_sale_items','inventory_sales','alerts',
    'clinic_settings','clinic_feature_flags'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "clinic_select_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "clinic_insert_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "clinic_update_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "clinic_delete_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "clinic_settings_select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "clinic_settings_update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "clinic_settings_upsert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "clinic_flags_select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "clinic_flags_insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "clinic_flags_update" ON public.%I', t);

    EXECUTE format($f$
      CREATE POLICY "clinic_select_%s" ON public.%I FOR SELECT TO authenticated
      USING (public.is_super_admin(auth.uid())
             OR (clinic_id = public.current_clinic_id() AND public.lifecycle_allows_access(clinic_id)))
    $f$, t, t);

    EXECUTE format($f$
      CREATE POLICY "clinic_insert_%s" ON public.%I FOR INSERT TO authenticated
      WITH CHECK (public.is_super_admin(auth.uid())
                  OR (clinic_id = public.current_clinic_id() AND public.lifecycle_allows_access(clinic_id)))
    $f$, t, t);

    EXECUTE format($f$
      CREATE POLICY "clinic_update_%s" ON public.%I FOR UPDATE TO authenticated
      USING (public.is_super_admin(auth.uid())
             OR (clinic_id = public.current_clinic_id() AND public.lifecycle_allows_access(clinic_id)))
      WITH CHECK (public.is_super_admin(auth.uid())
                  OR (clinic_id = public.current_clinic_id() AND public.lifecycle_allows_access(clinic_id)))
    $f$, t, t);

    EXECUTE format($f$
      CREATE POLICY "clinic_delete_%s" ON public.%I FOR DELETE TO authenticated
      USING (public.is_super_admin(auth.uid())
             OR (public.has_role(auth.uid(), 'admin'::app_role)
                 AND clinic_id = public.current_clinic_id()
                 AND public.lifecycle_allows_access(clinic_id)))
    $f$, t, t);
  END LOOP;
END $$;
