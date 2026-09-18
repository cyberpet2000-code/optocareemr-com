-- Harden patient registration attribution.
-- The database remains the source of truth for who created a patient.
-- Authenticated inserts cannot spoof another user's created_by value.

CREATE OR REPLACE FUNCTION public.set_patient_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- For normal authenticated app requests, always stamp the actual actor.
  -- Keep an explicitly supplied value only for trusted/service-role operations
  -- where auth.uid() is NULL (for example controlled imports/backfills).
  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_patient_created_by ON public.patients;

CREATE TRIGGER trg_set_patient_created_by
BEFORE INSERT ON public.patients
FOR EACH ROW
EXECUTE FUNCTION public.set_patient_created_by();

-- Fast reporting/filtering by the staff member who registered the patient.
CREATE INDEX IF NOT EXISTS idx_patients_created_by
ON public.patients(created_by);

-- Protect the audit reference from pointing at a non-existent auth user.
-- NOT VALID makes this safe for existing historical rows; new/updated rows
-- are enforced immediately. It can be validated later after any legacy
-- orphaned values have been reviewed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patients_created_by_fkey'
      AND conrelid = 'public.patients'::regclass
  ) THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_created_by_fkey
      FOREIGN KEY (created_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END
$$;
