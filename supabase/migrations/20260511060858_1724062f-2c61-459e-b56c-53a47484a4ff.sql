
-- 1. Drop the leaky policies that allowed clinic_id IS NULL rows to be visible everywhere,
--    and recreate them with strict clinic scoping.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'alerts','appointments','billing','billing_items','followups',
    'hmo_claims','hmo_history','hmo_plans','hmos',
    'inventory','inventory_sale_items','inventory_sales','patients','visits'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS clinic_select_%1$s ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS clinic_insert_%1$s ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS clinic_update_%1$s ON public.%1$s', t);

    EXECUTE format($f$
      CREATE POLICY clinic_select_%1$s ON public.%1$s
      FOR SELECT TO authenticated
      USING (is_super_admin(auth.uid()) OR clinic_id = current_clinic_id())
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY clinic_insert_%1$s ON public.%1$s
      FOR INSERT TO authenticated
      WITH CHECK (is_super_admin(auth.uid()) OR clinic_id = current_clinic_id())
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY clinic_update_%1$s ON public.%1$s
      FOR UPDATE TO authenticated
      USING (is_super_admin(auth.uid()) OR clinic_id = current_clinic_id())
      WITH CHECK (is_super_admin(auth.uid()) OR clinic_id = current_clinic_id())
    $f$, t);
  END LOOP;
END $$;

-- 2. Drop the redundant duplicate policy on patients that used a different helper (get_my_clinic_id())
--    and could short-circuit the strict policy via OR-combination.
DROP POLICY IF EXISTS tenant_isolation ON public.patients;

-- 3. Safety trigger: auto-stamp clinic_id from current_clinic_id() if NULL on insert,
--    so legacy code paths can't accidentally create orphan rows.
CREATE OR REPLACE FUNCTION public.set_clinic_id_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    NEW.clinic_id := public.current_clinic_id();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'patients','visits','appointments','billing','billing_items','followups',
    'hmo_claims','hmo_history','hmo_plans','hmos',
    'inventory','inventory_sale_items','inventory_sales','alerts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_clinic_id ON public.%1$s', t);
    EXECUTE format($f$
      CREATE TRIGGER trg_set_clinic_id
      BEFORE INSERT ON public.%1$s
      FOR EACH ROW
      EXECUTE FUNCTION public.set_clinic_id_default()
    $f$, t);
  END LOOP;
END $$;
