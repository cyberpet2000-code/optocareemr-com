CREATE OR REPLACE FUNCTION public.get_receptionist_clinic_visits(
  p_clinic_id uuid,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  id uuid, patient_id uuid, clinic_id uuid, doctor_id uuid,
  created_at timestamptz, completed_at timestamptz, status text,
  sub_od_sphere text, sub_od_cyl text, sub_od_axis text,
  sub_os_sphere text, sub_os_cyl text, sub_os_axis text,
  sub_reading_add text, lens_type text, medication text,
  optical_dispensed boolean, optical_dispensed_at timestamptz,
  medication_dispensed boolean, medication_dispensed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.user_id=auth.uid() AND cu.clinic_id=p_clinic_id
      AND lower(cu.role)='receptionist'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=auth.uid() AND ur.clinic_id=p_clinic_id
      AND lower(ur.role::text)='receptionist'
  )
  AND NOT public.is_super_admin(auth.uid())
  THEN RAISE EXCEPTION 'Receptionist access required'; END IF;

  RETURN QUERY
  SELECT v.id,v.patient_id,v.clinic_id,v.doctor_id,v.created_at,v.completed_at,v.status,
         v.sub_od_sphere,v.sub_od_cyl,v.sub_od_axis,v.sub_os_sphere,v.sub_os_cyl,
         v.sub_os_axis,v.sub_reading_add,v.lens_type,v.medication,
         v.optical_dispensed,v.optical_dispensed_at,
         v.medication_dispensed,v.medication_dispensed_at
  FROM public.visits v
  WHERE v.clinic_id=p_clinic_id
    AND (p_from IS NULL OR v.created_at >= p_from)
    AND (p_to IS NULL OR v.created_at < p_to)
  ORDER BY v.created_at DESC
  LIMIT greatest(1,least(coalesce(p_limit,500),500))
  OFFSET greatest(0,coalesce(p_offset,0));
END;
$function$;
