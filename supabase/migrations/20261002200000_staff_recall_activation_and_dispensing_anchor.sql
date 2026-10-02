alter table public.patient_recalls
  add column if not exists start_basis text not null default 'dispensing';

update public.patient_recalls
set start_basis='dispensing'
where start_basis is null or start_basis not in ('activation','dispensing');

create or replace function public.schedule_patient_recall(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_visit_id uuid,
  p_interval_months integer default 18,
  p_start_basis text default 'dispensing'
)
returns public.patient_recalls
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.patient_recalls;
  v_due_date date;
  v_dispensed boolean := false;
  v_dispensed_at timestamptz;
  v_status text;
  v_notes text;
begin
  if not exists (
    select 1 from public.clinic_users cu
    where cu.clinic_id=p_clinic_id and cu.user_id=auth.uid()
  ) then raise exception 'Clinic access denied'; end if;

  if p_start_basis not in ('activation','dispensing') then
    raise exception 'Invalid recall start basis';
  end if;

  if p_interval_months is null or p_interval_months < 1 or p_interval_months > 60 then
    raise exception 'Recall interval must be between 1 and 60 months';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.id=p_patient_id and p.clinic_id=p_clinic_id
  ) then raise exception 'Patient does not belong to clinic'; end if;

  select coalesce(v.optical_dispensed,false),v.optical_dispensed_at
    into v_dispensed,v_dispensed_at
  from public.visits v
  where v.id=p_visit_id and v.clinic_id=p_clinic_id and v.patient_id=p_patient_id
    and v.status='completed';

  if not found then raise exception 'Completed visit not found'; end if;

  if p_start_basis='dispensing' and v_dispensed and v_dispensed_at is not null then
    v_due_date := (v_dispensed_at::date + make_interval(months=>p_interval_months))::date;
    v_status := 'active';
    v_notes := 'Recall clock anchored to optical dispensing date.';
  elsif p_start_basis='dispensing' then
    v_due_date := (current_date + make_interval(months=>p_interval_months))::date;
    v_status := 'scheduled';
    v_notes := 'Awaiting optical dispensing. Recall clock will start from actual dispensing date.';
  else
    v_due_date := (current_date + make_interval(months=>p_interval_months))::date;
    v_status := 'active';
    v_notes := 'Recall clock started from manual staff activation date.';
  end if;

  insert into public.patient_recalls (
    clinic_id,patient_id,source_visit_id,recall_interval_months,due_date,status,
    contact_status,contacted_at,contacted_by,notes,updated_at
  )
  values (
    p_clinic_id,p_patient_id,p_visit_id,p_interval_months,v_due_date,v_status,
    'pending',null,null,v_notes,now()
  )
  on conflict (clinic_id,patient_id)
  do update set
    source_visit_id=excluded.source_visit_id,
    recall_interval_months=excluded.recall_interval_months,
    due_date=excluded.due_date,
    status=excluded.status,
    start_basis=excluded.start_basis,
    contact_status='pending',
    contacted_at=null,
    contacted_by=null,
    notes=excluded.notes,
    updated_at=now();

  insert into public.patient_recall_events (
    clinic_id,patient_id,visit_id,action,prescription_event,
    interval_months,due_date,reason,created_by
  )
  values (
    p_clinic_id,p_patient_id,p_visit_id,'reset','new_prescription',
    p_interval_months,v_due_date,
    case
      when v_status='scheduled' then 'Staff scheduled recall; waiting for optical dispensing'
      when p_start_basis='activation' then 'Staff activated recall from today'
      else 'Recall activated from optical dispensing'
    end,
    auth.uid()
  );

  select * into v_row
  from public.patient_recalls pr
  where pr.clinic_id=p_clinic_id and pr.patient_id=p_patient_id;

  return v_row;
end;
$function$;

revoke execute on function public.schedule_patient_recall(uuid,uuid,uuid,integer,text) from public,anon;
grant execute on function public.schedule_patient_recall(uuid,uuid,uuid,integer,text) to authenticated;

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
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.patient_recalls;
  v_reference_date date := coalesce(p_reference_date,current_date);
  v_dispensed_at timestamptz;
  v_due_date date;
  v_status text := 'active';
  v_basis text := 'activation';
  v_notes text := null;
begin
  if not exists(select 1 from public.clinic_users cu where cu.clinic_id=p_clinic_id and cu.user_id=auth.uid()) then raise exception 'Clinic access denied'; end if;
  if not exists(select 1 from public.patients p where p.id=p_patient_id and p.clinic_id=p_clinic_id) then raise exception 'Patient does not belong to clinic'; end if;
  if p_action not in ('reset','preserve','none') then raise exception 'Invalid recall action'; end if;

  if p_action='reset' then
    if p_interval_months is null or p_interval_months<1 or p_interval_months>60 then raise exception 'Recall interval must be between 1 and 60 months'; end if;

    if p_prescription_event='new_prescription' then
      v_basis := 'dispensing';
      select optical_dispensed_at into v_dispensed_at
      from public.visits
      where id=p_visit_id and clinic_id=p_clinic_id and optical_dispensed=true;

      if v_dispensed_at is not null then
        v_reference_date := v_dispensed_at::date;
        v_notes := 'Recall clock anchored to optical dispensing date.';
      else
        v_status := 'scheduled';
        v_notes := 'Awaiting optical dispensing. Recall clock will start from actual dispensing date.';
      end if;
    end if;

    v_due_date := (v_reference_date + make_interval(months=>p_interval_months))::date;

    insert into public.patient_recalls(
      clinic_id,patient_id,source_visit_id,recall_interval_months,due_date,status,
      contact_status,contacted_at,contacted_by,start_basis,notes
    )
    values(
      p_clinic_id,p_patient_id,p_visit_id,p_interval_months,v_due_date,v_status,
      'pending',null,null,v_basis,v_notes
    )
    on conflict(clinic_id,patient_id) do update set
      source_visit_id=excluded.source_visit_id,
      recall_interval_months=excluded.recall_interval_months,
      due_date=excluded.due_date,
      status=excluded.status,
      start_basis=excluded.start_basis,
      contact_status='pending',
      contacted_at=null,
      contacted_by=null,
      notes=excluded.notes,
      updated_at=now();

  elsif p_action='none' then
    update public.patient_recalls
    set status='inactive',contact_status='pending',updated_at=now()
    where clinic_id=p_clinic_id and patient_id=p_patient_id;
  end if;

  insert into public.patient_recall_events(
    clinic_id,patient_id,visit_id,action,prescription_event,interval_months,due_date,reason,created_by
  )
  values(
    p_clinic_id,p_patient_id,p_visit_id,p_action,p_prescription_event,
    case when p_action='reset' then p_interval_months else null end,
    case when p_action='reset' then v_due_date else null end,
    case
      when p_action='reset' and p_prescription_event='new_prescription' and v_status='scheduled' then 'New prescription recall scheduled; awaiting dispensing'
      when p_action='reset' and p_prescription_event='new_prescription' then 'New prescription / clinical recall reset'
      when p_action='preserve' and p_prescription_event='previous_prescription_reused' then 'Previous prescription reused; existing recall preserved'
      when p_action='none' then 'No active recall requested'
      else 'Recall decision recorded'
    end,
    auth.uid()
  );

  select * into v_row
  from public.patient_recalls
  where clinic_id=p_clinic_id and patient_id=p_patient_id;

  return v_row;
end;
$function$;

-- Rebuild the dispensing RPC from the hardened version, but make scheduled
-- dispensing-based recalls transition to active on the actual dispensing date.
create or replace function public.mark_visit_item_dispensed(
  p_visit_id uuid,
  p_item_type text,
  p_inventory_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_visit public.visits%rowtype;
  v_user_id uuid;
  v_user_role text;
  v_stock_before integer;
  v_stock_after integer;
  v_item_name text;
  v_inventory_id uuid;
  v_medication_name text;
  v_already_dispensed boolean;
  v_dispensed_at timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Unable to identify logged-in user'; end if;

  select * into v_visit from public.visits where id=p_visit_id;
  if not found then raise exception 'Visit not found'; end if;
  if lower(coalesce(v_visit.status,'')) <> 'completed' then
    raise exception 'Only completed visits can be marked as dispensed';
  end if;
  if v_visit.doctor_id is null then
    raise exception 'This visit has no assigned clinician. A doctor must be assigned before the prescription can be dispensed.';
  end if;
  if not exists (
    select 1 from public.clinic_users cu
    where cu.user_id=v_visit.doctor_id and cu.clinic_id=v_visit.clinic_id and cu.is_clinical_provider=true
  ) then
    raise exception 'This visit is assigned to a user who is not registered as a clinical provider.';
  end if;

  select lower(cu.role) into v_user_role
  from public.clinic_users cu
  where cu.user_id=v_user_id and cu.clinic_id=v_visit.clinic_id
  limit 1;

  if v_user_role is null or v_user_role not in ('admin','doctor','receptionist','super_admin') then
    raise exception 'You are not authorized to dispense items';
  end if;

  p_item_type := lower(trim(p_item_type));
  if p_item_type not in ('optical','medication') then
    raise exception 'Invalid item type. Use optical or medication';
  end if;

  if p_item_type='optical' then v_already_dispensed := v_visit.optical_dispensed;
  else v_already_dispensed := v_visit.medication_dispensed;
  end if;

  if v_already_dispensed then
    raise exception '% item has already been marked as dispensed', initcap(p_item_type);
  end if;

  if p_item_type='medication' and p_inventory_id is null then
    v_medication_name := trim(split_part(v_visit.medication,'—',1));
    select id,name into v_inventory_id,v_item_name
    from public.inventory
    where clinic_id=v_visit.clinic_id and lower(trim(name))=lower(v_medication_name)
      and category='Drugs'
    order by created_at asc limit 1;
    if v_inventory_id is null then
      raise exception 'No matching inventory item found for medication: %',v_medication_name;
    end if;
  else
    v_inventory_id := p_inventory_id;
  end if;

  if v_inventory_id is not null then
    select stock_quantity,name into v_stock_before,v_item_name
    from public.inventory
    where id=v_inventory_id and clinic_id=v_visit.clinic_id for update;

    if not found then raise exception 'Inventory item not found for this clinic'; end if;
    if v_stock_before < 1 then raise exception 'Insufficient stock for %',v_item_name; end if;

    v_stock_after := v_stock_before-1;
    perform set_config('optocare.controlled_inventory_movement','on',true);

    update public.inventory
    set stock_quantity=v_stock_after,updated_at=now()
    where id=v_inventory_id and clinic_id=v_visit.clinic_id;

    insert into public.inventory_movements(
      clinic_id,inventory_id,product_name,quantity_before,quantity_delta,
      quantity_after,reason,patient_id,visit_id,staff_id,notes
    )
    values(
      v_visit.clinic_id,v_inventory_id,v_item_name,v_stock_before,-1,
      v_stock_after,'dispensed',v_visit.patient_id,v_visit.id,v_user_id,
      case when p_item_type='optical' then 'Optical prescription dispensed' else 'Medication dispensed' end
    );
  end if;

  v_dispensed_at := now();

  if p_item_type='optical' then
    update public.visits
    set optical_dispensed=true,optical_dispensed_by=v_user_id,optical_dispensed_at=v_dispensed_at
    where id=p_visit_id and clinic_id=v_visit.clinic_id;

    update public.patient_recalls
    set due_date=(v_dispensed_at::date + make_interval(months=>recall_interval_months))::date,
        status='active',
        start_basis='dispensing',
        notes='Recall clock anchored to optical dispensing date.',
        updated_at=now()
    where clinic_id=v_visit.clinic_id
      and patient_id=v_visit.patient_id
      and source_visit_id=p_visit_id
      and status in ('scheduled','active')
      and start_basis='dispensing';
  else
    update public.visits
    set medication_dispensed=true,medication_dispensed_by=v_user_id,medication_dispensed_at=v_dispensed_at
    where id=p_visit_id and clinic_id=v_visit.clinic_id;
  end if;

  return jsonb_build_object(
    'success',true,'visit_id',p_visit_id,'item_type',p_item_type,'dispensed',true,
    'inventory_updated',v_inventory_id is not null,'inventory_id',v_inventory_id,
    'inventory_item',v_item_name,'dispensed_by',v_user_id,'dispensed_at',v_dispensed_at
  );
end;
$function$;

revoke execute on function public.mark_visit_item_dispensed(uuid,text,uuid) from public,anon;
grant execute on function public.mark_visit_item_dispensed(uuid,text,uuid) to authenticated;