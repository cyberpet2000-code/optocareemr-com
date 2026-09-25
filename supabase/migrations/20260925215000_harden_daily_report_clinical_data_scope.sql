-- Harden tenant boundaries for the daily front-desk clinical data RPC.
-- Only operational clinic roles may retrieve this report data.
-- HMO lookup is explicitly constrained to the requested clinic.
-- Patient join is explicitly constrained to the requested clinic.
create or replace function public.get_daily_front_desk_report_data(
  p_clinic_id uuid, p_report_date date
) returns table(
  visit_id uuid, patient_id uuid, patient_name text, patient_number text,
  patient_type text, hmo_id uuid, hmo_name text, claim_sent boolean,
  claim_replied boolean, prescription_available boolean, od_sphere text,
  od_cylinder text, od_axis text, os_sphere text, os_cylinder text,
  os_axis text, reading_add text, lens_type text,
  glasses_prescription_sent boolean, lens_order_required boolean,
  lens_order_details text, eye_drop_dispensed boolean, eye_drop_quantity integer,
  feedback_form_sent boolean
) language plpgsql security definer set search_path=public as $$
begin
  if not (
    exists (
      select 1 from public.clinic_users cu
      where cu.user_id=auth.uid()
        and cu.clinic_id=p_clinic_id
        and lower(cu.role) in ('receptionist','admin','doctor')
    )
    or exists (
      select 1 from public.profiles pr
      where pr.id=auth.uid() and pr.is_super_admin=true and pr.is_active=true
    )
  ) then raise exception 'Clinic access required'; end if;

  return query
  select v.id,p.id,p.full_name,p.patient_number,
    case when lower(coalesce(v.payment_type,''))='hmo'
              or lower(coalesce(p.payment_type,''))='hmo'
         then 'hmo' else 'private' end,
    coalesce(v.active_hmo_id,p.active_hmo_id),h.name,
    coalesce(ri.claim_sent,false),coalesce(ri.claim_replied,false),
    case when lower(coalesce(v.status,''))='completed' and
      (coalesce(v.sub_od_sphere,'')<>'' or coalesce(v.sub_od_cyl,'')<>'' or
       coalesce(v.sub_od_axis,'')<>'' or coalesce(v.sub_os_sphere,'')<>'' or
       coalesce(v.sub_os_cyl,'')<>'' or coalesce(v.sub_os_axis,'')<>'' or
       coalesce(v.sub_reading_add,'')<>'') then true else false end,
    case when lower(coalesce(v.status,''))='completed' then v.sub_od_sphere else null end,
    case when lower(coalesce(v.status,''))='completed' then v.sub_od_cyl else null end,
    case when lower(coalesce(v.status,''))='completed' then v.sub_od_axis else null end,
    case when lower(coalesce(v.status,''))='completed' then v.sub_os_sphere else null end,
    case when lower(coalesce(v.status,''))='completed' then v.sub_os_cyl else null end,
    case when lower(coalesce(v.status,''))='completed' then v.sub_os_axis else null end,
    case when lower(coalesce(v.status,''))='completed' then v.sub_reading_add else null end,
    case when lower(coalesce(v.status,''))='completed' then v.lens_type else null end,
    coalesce(ri.glasses_prescription_sent,false),coalesce(ri.lens_order_required,false),
    ri.lens_order_details,coalesce(ri.eye_drop_dispensed,false),
    coalesce(ri.eye_drop_quantity,0),coalesce(ri.feedback_form_sent,false)
  from public.visits v
  inner join public.patients p on p.id=v.patient_id and p.clinic_id=p_clinic_id
  left join public.hmos h on h.id=coalesce(v.active_hmo_id,p.active_hmo_id)
                             and h.clinic_id=p_clinic_id
  left join public.daily_front_desk_report_items ri
    on ri.visit_id=v.id and ri.clinic_id=p_clinic_id
   and ri.report_id=(select r.id from public.daily_front_desk_reports r
                     where r.clinic_id=p_clinic_id and r.report_date=p_report_date
                     order by r.created_at desc limit 1)
  where v.clinic_id=p_clinic_id
    and (v.created_at at time zone 'Africa/Lagos')::date=p_report_date
  order by v.created_at asc;
end; $$;
