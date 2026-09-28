-- Prevent false clinician attribution on new or reassigned visits.
-- Existing historical rows are left untouched; new/updated rows are validated.

CREATE OR REPLACE FUNCTION public.validate_visit_doctor_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
      AND lower(cu.role::text) = 'doctor'
  ) THEN
    RAISE EXCEPTION 'The assigned clinician is not an active doctor in this clinic';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_visit_doctor_attribution ON public.visits;

CREATE TRIGGER trg_validate_visit_doctor_attribution
BEFORE INSERT OR UPDATE OF doctor_id, clinic_id ON public.visits
FOR EACH ROW
EXECUTE FUNCTION public.validate_visit_doctor_attribution();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'visits_doctor_id_required'
      AND conrelid = 'public.visits'::regclass
  ) THEN
    ALTER TABLE public.visits
      ADD CONSTRAINT visits_doctor_id_required
      CHECK (doctor_id IS NOT NULL)
      NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_visits_clinic_doctor_created
  ON public.visits(clinic_id, doctor_id, created_at DESC);
