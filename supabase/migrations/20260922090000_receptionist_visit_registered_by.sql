-- Include visit registrar attribution for receptionist visit history.
-- Receptionists see the staff member's name in the UI; the raw UUID remains internal.

drop function if exists public.get_receptionist_patient_visits(uuid);

create function public.get_receptionist_patient_visits(p_patient_id uuid)
returns table(
  id uuid,
  patient_id uuid,
  clinic_id uuid,
  doctor_id uuid,
  registered_by uuid,
  created_at timestamptz,
  completed_at timestamptz,
  status text,
  diagnosis text,
  sub_od_sphere text,
  sub_od_cyl text,
  sub_od_axis text,
  sub_os_sphere text,
  sub_os_cyl text,
  sub_os_axis text,
  sub_reading_add text,
  lens_type text,
  medication text,
  optical_dispensed boolean,
  optical_dispensed_at timestamptz,
  medication_dispensed boolean,
  medication_dispensed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
begin
  select p.clinic_id into v_clinic_id
  from public.patients p
  where p.id = p_patient_id;

  if v_clinic_id is null then
    raise exception 'Patient not found';
  end if;

  if not exists (
    select 1 from public.clinic_users cu
    where cu.user_id = auth.uid()
      and cu.clinic_id = v_clinic_id
      and lower(cu.role) = 'receptionist'
  )
  and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.clinic_id = v_clinic_id
      and lower(ur.role::text) = 'receptionist'
  ) then
    raise exception 'Receptionist access required';
  end if;

  return query
  select
    v.id, v.patient_id, v.clinic_id, v.doctor_id, v.registered_by,
    v.created_at, v.completed_at, v.status, v.diagnosis,
    v.sub_od_sphere, v.sub_od_cyl, v.sub_od_axis,
    v.sub_os_sphere, v.sub_os_cyl, v.sub_os_axis,
    v.sub_reading_add, v.lens_type, v.medication,
    v.optical_dispensed, v.optical_dispensed_at,
    v.medication_dispensed, v.medication_dispensed_at
  from public.visits v
  where v.patient_id = p_patient_id
    and v.clinic_id = v_clinic_id
    and v.status = 'completed'
  order by v.created_at desc;
end;
$$;
