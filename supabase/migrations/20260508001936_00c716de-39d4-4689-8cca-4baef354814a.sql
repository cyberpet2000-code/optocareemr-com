
-- Add VA OU + Pinhole + Reading Add columns
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS va_unaided_ou text,
  ADD COLUMN IF NOT EXISTS va_aided_ou text,
  ADD COLUMN IF NOT EXISTS va_unaided_od_ph text,
  ADD COLUMN IF NOT EXISTS va_unaided_os_ph text,
  ADD COLUMN IF NOT EXISTS va_aided_od_ph text,
  ADD COLUMN IF NOT EXISTS va_aided_os_ph text,
  ADD COLUMN IF NOT EXISTS reading_add_unaided_ou text,
  ADD COLUMN IF NOT EXISTS reading_add_aided_ou text,
  -- Auto refraction
  ADD COLUMN IF NOT EXISTS auto_od_sphere text,
  ADD COLUMN IF NOT EXISTS auto_od_cyl text,
  ADD COLUMN IF NOT EXISTS auto_od_axis text,
  ADD COLUMN IF NOT EXISTS auto_os_sphere text,
  ADD COLUMN IF NOT EXISTS auto_os_cyl text,
  ADD COLUMN IF NOT EXISTS auto_os_axis text,
  -- Subjective refraction
  ADD COLUMN IF NOT EXISTS sub_od_sphere text,
  ADD COLUMN IF NOT EXISTS sub_od_cyl text,
  ADD COLUMN IF NOT EXISTS sub_od_axis text,
  ADD COLUMN IF NOT EXISTS sub_os_sphere text,
  ADD COLUMN IF NOT EXISTS sub_os_cyl text,
  ADD COLUMN IF NOT EXISTS sub_os_axis text,
  ADD COLUMN IF NOT EXISTS sub_reading_add text,
  ADD COLUMN IF NOT EXISTS sub_va_outcome text;

-- Patient number column
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS patient_number text;

CREATE UNIQUE INDEX IF NOT EXISTS patients_clinic_patient_number_uniq
  ON public.patients (clinic_id, patient_number)
  WHERE patient_number IS NOT NULL;

-- Per-clinic counter table
CREATE TABLE IF NOT EXISTS public.patient_number_counters (
  clinic_id uuid PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);
ALTER TABLE public.patient_number_counters ENABLE ROW LEVEL SECURITY;

-- Trigger to assign patient_number on insert
CREATE OR REPLACE FUNCTION public.assign_patient_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := NEW.clinic_id;
  v_clinic_name text;
  v_prefix text;
  v_next int;
BEGIN
  IF NEW.patient_number IS NOT NULL AND NEW.patient_number <> '' THEN
    RETURN NEW;
  END IF;
  IF v_clinic_id IS NULL THEN
    v_clinic_id := current_clinic_id();
    NEW.clinic_id := v_clinic_id;
  END IF;
  IF v_clinic_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v_clinic_id;
  v_prefix := upper(regexp_replace(coalesce(v_clinic_name, 'PAT'), '[^A-Za-z]', '', 'g'));
  v_prefix := lpad(left(v_prefix, 3), 3, 'X');

  INSERT INTO public.patient_number_counters (clinic_id, last_number)
  VALUES (v_clinic_id, 1)
  ON CONFLICT (clinic_id) DO UPDATE SET last_number = patient_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  NEW.patient_number := v_prefix || '-' || lpad(v_next::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_patient_number ON public.patients;
CREATE TRIGGER trg_assign_patient_number
  BEFORE INSERT ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_patient_number();
