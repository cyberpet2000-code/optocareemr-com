-- Keep staff ratings tied to the clinician/front-desk staff who actually handled the visit.
create or replace function public.get_admin_staff_feedback_ratings(p_clinic_id uuid)
returns table(
  feedback_id uuid, staff_id uuid, staff_name text, staff_role text, rating integer,
  visit_id uuid, patient_id uuid, patient_name text, submitted_at timestamptz,
  positive_feedback text, improvement_feedback text, what_did_well text,
  what_can_improve text, anything_else text
)
language plpgsql security definer set search_path=public
as $function$
begin
  if not (
    exists (select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.clinic_id=p_clinic_id and ur.role in ('admin','super_admin'))
    or exists (select 1 from public.clinic_users cu where cu.user_id=auth.uid() and cu.clinic_id=p_clinic_id and cu.role in ('admin','super_admin'))
    or exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_super_admin=true and p.is_active=true)
  ) then raise exception 'Admin access required'; end if;

  return query
  select fr.id,coalesce(fr.doctor_id,v.doctor_id),coalesce(p.full_name,'Unknown Doctor'),'doctor'::text,
    fr.doctor_professionalism_rating,fr.visit_id,fr.patient_id,
    coalesce(pt.full_name,'Unknown Patient'),fr.submitted_at,
    fr.positive_feedback,fr.improvement_feedback,fr.what_did_well,
    fr.what_can_improve,fr.anything_else
  from public.feedback_responses fr
  left join public.visits v on v.id=fr.visit_id and v.clinic_id=p_clinic_id
  left join public.profiles p on p.id=coalesce(fr.doctor_id,v.doctor_id)
  left join public.patients pt on pt.id=fr.patient_id and pt.clinic_id=p_clinic_id
  where fr.clinic_id=p_clinic_id and coalesce(fr.doctor_id,v.doctor_id) is not null
    and fr.doctor_professionalism_rating is not null

  union all

  select fr.id,v.registered_by,coalesce(p.full_name,'Front Desk Team'),
    'receptionist'::text,fr.front_desk_rating,fr.visit_id,fr.patient_id,
    coalesce(pt.full_name,'Unknown Patient'),fr.submitted_at,
    fr.positive_feedback,fr.improvement_feedback,fr.what_did_well,
    fr.what_can_improve,fr.anything_else
  from public.feedback_responses fr
  inner join public.visits v on v.id=fr.visit_id and v.clinic_id=p_clinic_id
  left join public.profiles p on p.id=v.registered_by
  left join public.patients pt on pt.id=fr.patient_id and pt.clinic_id=p_clinic_id
  where fr.clinic_id=p_clinic_id and fr.front_desk_rating is not null
    and (v.registered_by is not null or exists (
      select 1 from public.feedback_requests rq
      where rq.id=fr.feedback_request_id and rq.requested_by_user_id is not null
    ))
  order by submitted_at desc;
end;
$function$;

-- When an optical prescription is dispensed, anchor an existing recall to that
-- actual dispensing date. This prevents the recall clock starting at visit completion.
create or replace function public.mark_visit_item_dispensed(
  p_visit_id uuid,
  p_item_type text,
  p_inventory_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path=public
as $function$
declare
  v_visit public.visits%rowtype;
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_stock_before integer;
  v_stock_after integer;
  v_item_name text;
  v_inventory_id uuid;
  v_medication_name text;
  v_already_dispensed boolean;
  v_dispensed_at timestamptz;
begin
  if v_user_id is null then raise exception 'Unable to identify logged-in user'; end if;
  select * into v_visit from public.visits where id=p_visit_id;
  if not found then raise exception 'Visit not found'; end if;
  if lower(coalesce(v_visit.status,'')) <> 'completed' then raise exception 'Only completed visits can be marked as dispensed'; end if;
  if v_visit.doctor_id is null then raise exception 'This visit has no assigned clinician. A doctor must be assigned before the prescription can be dispensed.'; end if;
  if not exists (select 1 from public.clinic_users cu where cu.user_id=v_visit.doctor_id and cu.clinic_id=v_visit.clinic_id and cu.is_clinical_provider=true) then
    raise exception 'This visit is assigned to a user who is not registered as a clinical provider.';
  end if;
  select lower(cu.role) into v_user_role from public.clinic_users cu where cu.user_id=v_user_id and cu.clinic_id=v_visit.clinic_id limit 1;
  if v_user_role is null or v_user_role not in ('admin','doctor','receptionist','super_admin') then raise exception 'You are not authorized to dispense items'; end if;
  p_item_type := lower(trim(p_item_type));
  if p_item_type not in ('optical','medication') then raise exception 'Invalid item type. Use optical or medication'; end if;

  if p_item_type='optical' then v_already_dispensed := v_visit.optical_dispensed; else v_already_dispensed := v_visit.medication_dispensed; end if;
  if v_already_dispensed then raise exception '% item has already been marked as dispensed', initcap(p_item_type); end if;

  if p_item_type='medication' and p_inventory_id is null then
    v_medication_name := trim(split_part(v_visit.medication,'—',1));
    select id,name into v_inventory_id,v_item_name from public.inventory
    where clinic_id=v_visit.clinic_id and lower(trim(name))=lower(v_medication_name) and category='Drugs'
    order by created_at asc limit 1;
    if v_inventory_id is null then raise exception 'No matching inventory item found for medication: %',v_medication_name; end if;
  else v_inventory_id := p_inventory_id; end if;

  if v_inventory_id is not null then
    select stock_quantity,name into v_stock_before,v_item_name from public.inventory
    where id=v_inventory_id and clinic_id=v_visit.clinic_id for update;
    if not found then raise exception 'Inventory item not found for this clinic'; end if;
    if v_stock_before < 1 then raise exception 'Insufficient stock for %',v_item_name; end if;
    v_stock_after := v_stock_before-1;
    perform set_config('optocare.controlled_inventory_movement','on',true);
    update public.inventory set stock_quantity=v_stock_after,updated_at=now() where id=v_inventory_id and clinic_id=v_visit.clinic_id;
    insert into public.inventory_movements (
      clinic_id,inventory_id,product_name,quantity_before,quantity_delta,quantity_after,reason,patient_id,visit_id,staff_id,notes
    ) values (
      v_visit.clinic_id,v_inventory_id,v_item_name,v_stock_before,-1,v_stock_after,'dispensed',v_visit.patient_id,v_visit.id,v_user_id,
      case when p_item_type='optical' then 'Optical prescription dispensed' else 'Medication dispensed' end
    );
  end if;

  v_dispensed_at := now();
  if p_item_type='optical' then
    update public.visits set optical_dispensed=true,optical_dispensed_by=v_user_id,optical_dispensed_at=v_dispensed_at
    where id=p_visit_id and clinic_id=v_visit.clinic_id;

    update public.patient_recalls
    set due_date=(v_dispensed_at::date + make_interval(months => recall_interval_months))::date,
        updated_at=now()
    where clinic_id=v_visit.clinic_id and patient_id=v_visit.patient_id
      and source_visit_id=p_visit_id and status='active';
  else
    update public.visits set medication_dispensed=true,medication_dispensed_by=v_user_id,medication_dispensed_at=v_dispensed_at
    where id=p_visit_id and clinic_id=v_visit.clinic_id;
  end if;

  return jsonb_build_object('success',true,'visit_id',p_visit_id,'item_type',p_item_type,'dispensed',true,
    'inventory_updated',v_inventory_id is not null,'inventory_id',v_inventory_id,'inventory_item',v_item_name,
    'dispensed_by',v_user_id,'dispensed_at',v_dispensed_at);
end;
$function$;

-- If recall is created after dispensing, use the actual optical dispensing date.
create or replace function public.set_patient_recall(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_visit_id uuid,
  p_action text,
  p_prescription_event text,
  p_interval_months integer default 18,
  p_reference_date date default null
)
returns public.patient_recalls
language plpgsql security definer set search_path=''
as $function$
declare
  v_row public.patient_recalls;
  v_reference_date date := coalesce(p_reference_date,current_date);
  v_dispensed_at timestamptz;
  v_due_date date;
begin
  if not exists (select 1 from public.clinic_users cu where cu.clinic_id=p_clinic_id and cu.user_id=auth.uid()) then raise exception 'Clinic access denied'; end if;
  if not exists (select 1 from public.patients p where p.id=p_patient_id and p.clinic_id=p_clinic_id) then raise exception 'Patient does not belong to clinic'; end if;
  if p_action not in ('reset','preserve','none') then raise exception 'Invalid recall action'; end if;

  if p_action='reset' then
    if p_interval_months is null or p_interval_months<1 or p_interval_months>60 then raise exception 'Recall interval must be between 1 and 60 months'; end if;

    if p_prescription_event='new_prescription' then
      select optical_dispensed_at into v_dispensed_at from public.visits
      where id=p_visit_id and clinic_id=p_clinic_id and optical_dispensed=true;
      if v_dispensed_at is not null then v_reference_date := v_dispensed_at::date; end if;
    end if;

    v_due_date := (v_reference_date + make_interval(months=>p_interval_months))::date;
    insert into public.patient_recalls (
      clinic_id,patient_id,source_visit_id,recall_interval_months,due_date,status,contact_status,contacted_at,contacted_by
    ) values (
      p_clinic_id,p_patient_id,p_visit_id,p_interval_months,v_due_date,'active','pending',null,null
    )
    on conflict (clinic_id,patient_id) do update set
      source_visit_id=excluded.source_visit_id,recall_interval_months=excluded.recall_interval_months,due_date=excluded.due_date,
      status='active',contact_status='pending',contacted_at=null,contacted_by=null,updated_at=now();
  elsif p_action='none' then
    update public.patient_recalls set status='inactive',contact_status='pending',updated_at=now()
    where clinic_id=p_clinic_id and patient_id=p_patient_id;
  end if;

  insert into public.patient_recall_events (
    clinic_id,patient_id,visit_id,action,prescription_event,interval_months,due_date,reason,created_by
  ) values (
    p_clinic_id,p_patient_id,p_visit_id,p_action,p_prescription_event,
    case when p_action='reset' then p_interval_months else null end,
    case when p_action='reset' then v_due_date else null end,
    case when p_action='reset' and p_prescription_event='new_prescription' then 'New prescription / clinical recall reset'
      when p_action='preserve' and p_prescription_event='previous_prescription_reused' then 'Previous prescription reused; existing recall preserved'
      when p_action='none' then 'No active recall requested' else 'Recall decision recorded' end,
    auth.uid()
  );

  select * into v_row from public.patient_recalls where clinic_id=p_clinic_id and patient_id=p_patient_id;
  return v_row;
end;
$function$;
