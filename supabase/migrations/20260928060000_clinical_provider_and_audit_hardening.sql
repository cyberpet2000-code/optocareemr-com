-- Distinguish a clinic user's administrative role from whether they are a clinical provider.
-- This allows an admin who is also a clinician to be correctly attributed without
-- granting every admin clinical-provider status.

ALTER TABLE public.clinic_users
  ADD COLUMN IF NOT EXISTS is_clinical_provider boolean NOT NULL DEFAULT false;

-- Existing doctor memberships are providers by definition.
UPDATE public.clinic_users
SET is_clinical_provider = true
WHERE lower(role) = 'doctor';

-- Existing Cedar Eye admin-clinician confirmed during reconciliation.
UPDATE public.clinic_users
SET is_clinical_provider = true
WHERE user_id = '0d23a432-204f-46d4-8edc-e60d1d22e4d8'
  AND clinic_id = 'e3ab54d0-35a7-4abb-a554-9767bd69c292';

-- Cedar Eye's confirmed clinician/admin account must remain a clinical provider
-- without changing its administrative role.
UPDATE public.clinic_users
SET is_clinical_provider = true
WHERE user_id = '0d23a432-204f-46d4-8edc-e60d1d22e4d8'
  AND clinic_id = 'e3ab54d0-35a7-4abb-a554-9767bd69c292';

CREATE INDEX IF NOT EXISTS idx_clinic_users_clinical_provider
  ON public.clinic_users(clinic_id, is_clinical_provider, user_id);

-- Visit attribution must use the clinical-provider flag, not the administrative role.
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
      AND cu.is_clinical_provider = true
  ) THEN
    RAISE EXCEPTION 'The assigned clinician is not registered as a clinical provider in this clinic';
  END IF;

  RETURN NEW;
END;
$function$;

-- The existing completion helper may set an admin-clinician as the provider.
CREATE OR REPLACE FUNCTION public.set_visit_doctor_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'completed' AND NEW.doctor_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.clinic_id = NEW.clinic_id
        AND cu.is_clinical_provider = true
    ) THEN
      NEW.doctor_id := auth.uid();
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Repair the existing generic audit logger so INSERT/UPDATE/DELETE events
-- preserve both sides of the change. Visits will now be audited as well.
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_clinic_id uuid;
  v_record_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_clinic_id := OLD.clinic_id;
    v_record_id := OLD.id;
  ELSE
    v_clinic_id := NEW.clinic_id;
    v_record_id := NEW.id;
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    clinic_id,
    action,
    table_name,
    record_id,
    new_data,
    old_data
  )
  VALUES (
    auth.uid(),
    v_clinic_id,
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS audit_patients ON public.patients;
CREATE TRIGGER audit_patients
AFTER INSERT OR UPDATE OR DELETE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_visits ON public.visits;
CREATE TRIGGER audit_visits
AFTER INSERT OR UPDATE OR DELETE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.log_audit();

COMMENT ON COLUMN public.clinic_users.is_clinical_provider IS
  'Whether this clinic membership represents a clinician who may be attributed as the provider of a clinical visit.';
