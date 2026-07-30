-- Add RPC to compute patient stats used by dashboard and monthly reports

CREATE OR REPLACE FUNCTION public.get_dashboard_patient_stats(
  p_clinic_id uuid,
  p_year integer,
  p_month integer
)
RETURNS TABLE(
  patients_seen integer,
  new_patients_seen integer,
  returning_patients integer
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  from_ts timestamptz := (make_date(p_year, p_month, 1))::timestamptz;
  to_ts timestamptz := (make_date(p_year, p_month, 1) + INTERVAL '1 month')::timestamptz;
BEGIN
  -- distinct patients who had at least one visit during the month
  SELECT COUNT(DISTINCT v.patient_id)
  INTO patients_seen
  FROM public.visits v
  WHERE v.clinic_id = p_clinic_id
    AND v.created_at >= from_ts
    AND v.created_at < to_ts;

  -- patients who were created/registered during the month AND had at least one visit during the month
  SELECT COUNT(DISTINCT v.patient_id)
  INTO new_patients_seen
  FROM public.visits v
  JOIN public.patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.created_at >= from_ts
    AND v.created_at < to_ts
    AND p.created_at >= from_ts
    AND p.created_at < to_ts;

  returning_patients := COALESCE(patients_seen, 0) - COALESCE(new_patients_seen, 0);

  RETURN NEXT;
END;
$$;

-- Allow authenticated users to execute the RPC (service_role already has rights)
GRANT EXECUTE ON FUNCTION public.get_dashboard_patient_stats(uuid, integer, integer) TO authenticated;
