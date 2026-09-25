-- Harden daily front-desk report item financial/HMO relationships.
-- A report item may only reference a visit and HMO belonging to the report clinic.
create or replace function public.save_daily_front_desk_report_item(
  p_report_id uuid, p_patient_id uuid, p_visit_id uuid, p_hmo_id uuid default null,
  p_patient_type text default 'private', p_glasses_prescription_sent boolean default false,
  p_hmo_claim_status text default null, p_hmo_claim_remarks text default null,
  p_lens_order_required boolean default false, p_lens_order_status text default null,
  p_lens_order_remarks text default null, p_feedback_form_sent boolean default false,
  p_eye_drop_dispensed boolean default false, p_remarks text default null
) returns public.daily_front_desk_report_items
language plpgsql security definer set search_path=public as $$
declare
  v_report public.daily_front_desk_reports;
  v_patient public.patients;
  v_item public.daily_front_desk_report_items;
begin
  select * into v_report from public.daily_front_desk_reports where id=p_report_id;
  if not found then raise exception 'Daily report not found'; end if;

  if not (
    exists(select 1 from public.clinic_users cu
      where cu.user_id=auth.uid() and cu.clinic_id=v_report.clinic_id
        and cu.role in ('receptionist','admin'))
    or exists(select 1 from public.profiles p
      where p.id=auth.uid() and p.is_super_admin=true and p.is_active=true)
  ) then raise exception 'Daily report access required'; end if;

  if v_report.status<>'draft' then
    raise exception 'This daily report has already been submitted';
  end if;

  select * into v_patient from public.patients
  where id=p_patient_id and clinic_id=v_report.clinic_id;
  if not found then raise exception 'Patient not found in this clinic'; end if;

  if not exists(select 1 from public.visits v
    where v.id=p_visit_id and v.patient_id=p_patient_id
      and v.clinic_id=v_report.clinic_id) then
    raise exception 'Visit does not belong to this patient and clinic';
  end if;

  if p_hmo_id is not null and not exists(select 1 from public.hmos h
    where h.id=p_hmo_id and h.clinic_id=v_report.clinic_id) then
    raise exception 'HMO does not belong to this clinic';
  end if;

  insert into public.daily_front_desk_report_items(
    report_id,clinic_id,patient_id,visit_id,patient_name,patient_number,
    patient_type,hmo_id,hmo_name,glasses_prescription_sent,hmo_claim_status,
    hmo_claim_remarks,lens_order_required,lens_order_status,lens_order_remarks,
    feedback_form_sent,eye_drop_dispensed,remarks,updated_at
  ) values(
    p_report_id,v_report.clinic_id,p_patient_id,p_visit_id,v_patient.full_name,
    v_patient.patient_number,p_patient_type,p_hmo_id,
    (select h.name from public.hmos h
      where h.id=p_hmo_id and h.clinic_id=v_report.clinic_id),
    p_glasses_prescription_sent,p_hmo_claim_status,p_hmo_claim_remarks,
    p_lens_order_required,p_lens_order_status,p_lens_order_remarks,
    p_feedback_form_sent,p_eye_drop_dispensed,p_remarks,now()
  )
  on conflict(report_id,patient_id,visit_id) do update set
    patient_name=excluded.patient_name,patient_number=excluded.patient_number,
    patient_type=excluded.patient_type,hmo_id=excluded.hmo_id,hmo_name=excluded.hmo_name,
    glasses_prescription_sent=excluded.glasses_prescription_sent,
    hmo_claim_status=excluded.hmo_claim_status,hmo_claim_remarks=excluded.hmo_claim_remarks,
    lens_order_required=excluded.lens_order_required,lens_order_status=excluded.lens_order_status,
    lens_order_remarks=excluded.lens_order_remarks,feedback_form_sent=excluded.feedback_form_sent,
    eye_drop_dispensed=excluded.eye_drop_dispensed,remarks=excluded.remarks,updated_at=now()
  returning * into v_item;
  return v_item;
end;
$$;
