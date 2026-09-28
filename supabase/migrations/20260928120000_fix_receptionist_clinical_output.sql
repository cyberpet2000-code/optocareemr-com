-- Receptionists need completed optical and medical prescriptions plus diagnosis
-- for billing, dispensing and operational follow-up. Keep unrelated clinical
-- examination/history data out of the receptionist RPC boundary.
drop function if exists public.get_receptionist_patient_visits_page(uuid, integer, integer);
drop function if exists public.get_receptionist_patient_visits(uuid);

create function public.get_receptionist_patient_visits_page(
  p_patient_id uuid, p_limit integer default 51, p_offset integer default 0
)
returns table(
  id uuid, patient_id uuid, clinic_id uuid, doctor_id uuid, registered_by uuid,
  created_at timestamptz, completed_at timestamptz, status text, lens_type text,
  sub_od_sphere text, sub_od_cyl text, sub_od_axis text, sub_os_sphere text,
  sub_os_cyl text, sub_os_axis text, sub_reading_add text, sub_va_outcome text,
  old_lens_prescription text, medication text, diagnosis text,
  optical_dispensed boolean, optical_dispensed_at timestamptz,
  medication_dispensed boolean, medication_dispensed_at timestamptz
)
language plpgsql stable security definer set search_path to ''
as $function$
declare v_clinic_id uuid;
begin
  select p.clinic_id into v_clinic_id from public.patients p where p.id=p_patient_id;
  if v_clinic_id is null then raise exception 'Patient not found'; end if;
  if not exists(select 1 from public.clinic_users cu where cu.user_id=auth.uid() and cu.clinic_id=v_clinic_id and lower(cu.role)='receptionist')
     and not exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.clinic_id=v_clinic_id and lower(ur.role::text)='receptionist')
     and not exists(select 1 from public.clinic_user_roles cur where cur.user_id=auth.uid() and cur.clinic_id=v_clinic_id and lower(cur.role::text)='receptionist')
  then raise exception 'Receptionist access required'; end if;
  return query
  select v.id,v.patient_id,v.clinic_id,v.doctor_id,v.registered_by,v.created_at,v.completed_at,v.status,
    v.lens_type,v.sub_od_sphere,v.sub_od_cyl,v.sub_od_axis,v.sub_os_sphere,v.sub_os_cyl,v.sub_os_axis,
    v.sub_reading_add,v.sub_va_outcome,v.old_lens_prescription,
    regexp_replace(coalesce(v.medication,''), E'\\s+—.*$', '', 'g'), v.diagnosis,
    v.optical_dispensed,v.optical_dispensed_at,v.medication_dispensed,v.medication_dispensed_at
  from public.visits v where v.patient_id=p_patient_id and v.clinic_id=v_clinic_id and v.status='completed'
  order by v.created_at desc,v.id desc
  limit greatest(1,least(coalesce(p_limit,51),51)) offset greatest(0,coalesce(p_offset,0));
end;$function$;

create function public.get_receptionist_patient_visits(p_patient_id uuid)
returns table(
  id uuid, patient_id uuid, clinic_id uuid, doctor_id uuid, registered_by uuid,
  created_at timestamptz, completed_at timestamptz, status text, lens_type text,
  sub_od_sphere text, sub_od_cyl text, sub_od_axis text, sub_os_sphere text,
  sub_os_cyl text, sub_os_axis text, sub_reading_add text, sub_va_outcome text,
  old_lens_prescription text, medication text, diagnosis text,
  optical_dispensed boolean, optical_dispensed_at timestamptz,
  medication_dispensed boolean, medication_dispensed_at timestamptz
)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_clinic_id uuid;
begin
  select p.clinic_id into v_clinic_id from public.patients p where p.id=p_patient_id;
  if v_clinic_id is null then raise exception 'Patient not found'; end if;
  if not exists(select 1 from public.clinic_users cu where cu.user_id=auth.uid() and cu.clinic_id=v_clinic_id and lower(cu.role)='receptionist')
     and not exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.clinic_id=v_clinic_id and lower(ur.role::text)='receptionist')
     and not exists(select 1 from public.clinic_user_roles cur where cur.user_id=auth.uid() and cur.clinic_id=v_clinic_id and lower(cur.role::text)='receptionist')
  then raise exception 'Receptionist access required'; end if;
  return query
  select v.id,v.patient_id,v.clinic_id,v.doctor_id,v.registered_by,v.created_at,v.completed_at,v.status,
    v.lens_type,v.sub_od_sphere,v.sub_od_cyl,v.sub_od_axis,v.sub_os_sphere,v.sub_os_cyl,v.sub_os_axis,
    v.sub_reading_add,v.sub_va_outcome,v.old_lens_prescription,
    regexp_replace(coalesce(v.medication,''), E'\\s+—.*$', '', 'g'),v.diagnosis,
    v.optical_dispensed,v.optical_dispensed_at,v.medication_dispensed,v.medication_dispensed_at
  from public.visits v where v.patient_id=p_patient_id and v.clinic_id=v_clinic_id and v.status='completed'
  order by v.created_at desc,v.id desc;
end;$function$;

grant execute on function public.get_receptionist_patient_visits_page(uuid,integer,integer) to authenticated;
grant execute on function public.get_receptionist_patient_visits(uuid) to authenticated;