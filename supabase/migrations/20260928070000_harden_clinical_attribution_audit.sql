-- Clinical attribution/audit hardening.
-- Do not rewrite historical clinical records. New and changed records gain
-- authenticated-account provenance and clinician validation.

CREATE OR REPLACE FUNCTION public.validate_visit_doctor_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.doctor_id IS NULL THEN
    RAISE EXCEPTION 'A visit must have an assigned clinician';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clinic_users cu
    WHERE cu.clinic_id = NEW.clinic_id
      AND cu.user_id = NEW.doctor_id
      AND lower(cu.role::text) IN ('doctor', 'admin')
  ) THEN
    RAISE EXCEPTION 'The assigned clinician is not an authorized clinical provider in this clinic';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_visit_doctor_attribution ON public.visits;
CREATE TRIGGER trg_validate_visit_doctor_attribution
BEFORE INSERT OR UPDATE OF doctor_id, clinic_id ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.validate_visit_doctor_attribution();

CREATE OR REPLACE FUNCTION public.log_visit_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (
    user_id, clinic_id, action, table_name, record_id, old_data, new_data
  ) VALUES (
    auth.uid(),
    COALESCE(NEW.clinic_id, OLD.clinic_id),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS audit_visits ON public.visits;
CREATE TRIGGER audit_visits
AFTER INSERT OR UPDATE OR DELETE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.log_visit_audit();

-- Preserve the authenticated account that actually submitted a visit.
-- Existing rows remain unchanged.
CREATE OR REPLACE FUNCTION public.set_visit_registered_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.registered_by IS NULL THEN
    NEW.registered_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_visit_registered_by ON public.visits;
CREATE TRIGGER trg_set_visit_registered_by
BEFORE INSERT ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.set_visit_registered_by();

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record_timestamp
  ON public.audit_logs(table_name, record_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_visits_registered_by_created
  ON public.visits(registered_by, created_at DESC);
