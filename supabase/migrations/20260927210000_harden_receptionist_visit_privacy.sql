-- Keep the receptionist RPC contract stable for the frontend, but do not expose
-- medication/treatment details through a SECURITY DEFINER function.
-- Receptionists may see completed visit metadata and lens prescription type,
-- but clinical treatment details must remain unavailable at the database boundary.

CREATE OR REPLACE FUNCTION public.get_receptionist_patient_visits(p_patient_id uuid)
RETURNS TABLE(
  id uuid,
  patient_id uuid,
  clinic_id uuid,
  doctor_id uuid,
  registered_by uuid,
  created_at timestamptz,
  completed_at timestamptz,
  status text,
  lens_type text,
  medication text,
  optical_dispensed boolean,
  optical_dispensed_at timestamptz,
  medication_dispensed boolean,
  medication_dispensed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic_id uuid;
BEGIN
  SELECT p.clinic_id INTO v_clinic_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clinic_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.clinic_id = v_clinic_id
      AND lower(cu.role) = 'receptionist'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.clinic_id = v_clinic_id
      AND lower(ur.role::text) = 'receptionist'
  ) THEN
    RAISE EXCEPTION 'Receptionist access required';
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    v.patient_id,
    v.clinic_id,
    v.doctor_id,
    v.registered_by,
    v.created_at,
    v.completed_at,
    v.status,
    v.lens_type,
    NULL::text AS medication,
    v.optical_dispensed,
    v.optical_dispensed_at,
    NULL::boolean AS medication_dispensed,
    NULL::timestamptz AS medication_dispensed_at
  FROM public.visits v
  WHERE v.patient_id = p_patient_id
    AND v.clinic_id = v_clinic_id
    AND v.status = 'completed'
  ORDER BY v.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_receptionist_patient_visits_page(
  p_patient_id uuid,
  p_limit integer DEFAULT 51,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  patient_id uuid,
  clinic_id uuid,
  doctor_id uuid,
  registered_by uuid,
  created_at timestamptz,
  completed_at timestamptz,
  status text,
  lens_type text,
  medication text,
  optical_dispensed boolean,
  optical_dispensed_at timestamptz,
  medication_dispensed boolean,
  medication_dispensed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_clinic_id uuid;
BEGIN
  SELECT p.clinic_id INTO v_clinic_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clinic_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.clinic_id = v_clinic_id
      AND lower(cu.role) = 'receptionist'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.clinic_id = v_clinic_id
      AND lower(ur.role::text) = 'receptionist'
  ) THEN
    RAISE EXCEPTION 'Receptionist access required';
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    v.patient_id,
    v.clinic_id,
    v.doctor_id,
    v.registered_by,
    v.created_at,
    v.completed_at,
    v.status,
    v.lens_type,
    NULL::text AS medication,
    v.optical_dispensed,
    v.optical_dispensed_at,
    NULL::boolean AS medication_dispensed,
    NULL::timestamptz AS medication_dispensed_at
  FROM public.visits v
  WHERE v.patient_id = p_patient_id
    AND v.clinic_id = v_clinic_id
    AND v.status = 'completed'
  ORDER BY v.created_at DESC, v.id DESC
  LIMIT greatest(1, least(coalesce(p_limit, 51), 51))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$function$;
