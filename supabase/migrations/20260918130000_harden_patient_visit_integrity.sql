-- OptoCare patient/visit integrity hardening.
-- Safe for existing data: CHECK/FK constraints are added NOT VALID so legacy
-- rows are not blocked. New rows must satisfy the constraints immediately.

-- ============================================================
-- 1. Patient ownership/audit references
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patients_clinic_id_fkey'
      AND conrelid = 'public.patients'::regclass
  ) THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_clinic_id_fkey
      FOREIGN KEY (clinic_id)
      REFERENCES public.clinics(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

-- created_by is an audit field. It must reference a real authenticated user.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
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

-- New patient rows must have a clinic after BEFORE INSERT triggers run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patients_clinic_id_required'
      AND conrelid = 'public.patients'::regclass
  ) THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_clinic_id_required
      CHECK (clinic_id IS NOT NULL)
      NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_patients_clinic_created_by
  ON public.patients(clinic_id, created_by);

-- Prevent normal authenticated users from changing the original creator.
CREATE OR REPLACE FUNCTION public.protect_patient_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_patient_created_by ON public.patients;

CREATE TRIGGER trg_protect_patient_created_by
BEFORE UPDATE ON public.patients
FOR EACH ROW
EXECUTE FUNCTION public.protect_patient_created_by();

-- ============================================================
-- 2. Visit ownership and attribution references
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'visits_clinic_id_fkey'
      AND conrelid = 'public.visits'::regclass
  ) THEN
    ALTER TABLE public.visits
      ADD CONSTRAINT visits_clinic_id_fkey
      FOREIGN KEY (clinic_id)
      REFERENCES public.clinics(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

-- patient_id is already NOT NULL; add the explicit FK only if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.visits'::regclass
      AND array_to_string(conkey, ',') = (
        SELECT array_to_string(conkey, ',')
        FROM pg_constraint
        WHERE conrelid = 'public.visits'::regclass
          AND contype = 'f'
          AND conname LIKE 'visits_patient_id%'
        LIMIT 1
      )
  ) THEN
    -- Named existence check below is the normal path; this branch is kept
    -- intentionally conservative and does not create a duplicate FK.
    NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'visits_patient_id_fkey'
      AND conrelid = 'public.visits'::regclass
  ) THEN
    ALTER TABLE public.visits
      ADD CONSTRAINT visits_patient_id_fkey
      FOREIGN KEY (patient_id)
      REFERENCES public.patients(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

-- registered_by and doctor_id are staff/user references.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'visits_registered_by_auth_fkey'
      AND conrelid = 'public.visits'::regclass
  ) THEN
    ALTER TABLE public.visits
      ADD CONSTRAINT visits_registered_by_auth_fkey
      FOREIGN KEY (registered_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'visits_doctor_id_auth_fkey'
      AND conrelid = 'public.visits'::regclass
  ) THEN
    ALTER TABLE public.visits
      ADD CONSTRAINT visits_doctor_id_auth_fkey
      FOREIGN KEY (doctor_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END
$$;

-- New visits must have a clinic after BEFORE INSERT triggers run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'visits_clinic_id_required'
      AND conrelid = 'public.visits'::regclass
  ) THEN
    ALTER TABLE public.visits
      ADD CONSTRAINT visits_clinic_id_required
      CHECK (clinic_id IS NOT NULL)
      NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_visits_clinic_patient_created
  ON public.visits(clinic_id, patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_visits_registered_by
  ON public.visits(clinic_id, registered_by);

CREATE INDEX IF NOT EXISTS idx_visits_doctor_id
  ON public.visits(clinic_id, doctor_id);
