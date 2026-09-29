-- Repair dispensing eligibility for completed historical visits whose clinician
-- attribution was lost before the clinical-provider hardening was introduced.
--
-- Do not guess when a clinic has multiple clinical providers. This migration only
-- repairs visits in clinics with exactly one active clinical provider, where the
-- provider attribution is unambiguous.

do $repair$
declare
  r record;
begin
  for r in
    select v.id, v.clinic_id, v.registered_by, cp.user_id as sole_clinical_provider
    from public.visits v
    join (
      select clinic_id, min(user_id) as user_id
      from public.clinic_users
      where is_clinical_provider=true
      group by clinic_id
      having count(distinct user_id)=1
    ) cp on cp.clinic_id=v.clinic_id
    where v.status='completed' and v.doctor_id is null
  loop
    update public.visits
    set doctor_id = r.sole_clinical_provider,
        registered_by = coalesce(r.registered_by, r.sole_clinical_provider)
    where id=r.id
      and clinic_id=r.clinic_id
      and doctor_id is null;
  end loop;
end
$repair$;

-- Make the dispensing RPC explicitly reject an orphaned completed visit with a
-- useful operational message instead of allowing the failure to surface later.
create or replace function public.mark_visit_item_dispensed(
  p_visit_id uuid,
  p_item_type text,
  p_inventory_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
    where cu.user_id=v_visit.doctor_id
      and cu.clinic_id=v_visit.clinic_id
      and cu.is_clinical_provider=true
  ) then
    raise exception 'This visit is assigned to a user who is not registered as a clinical provider.';
  end if;

  select lower(cu.role) into v_user_role
  from public.clinic_users cu
  where cu.user_id=v_user_id and cu.clinic_id=v_visit.clinic_id
  limit 1;

  if v_user_role is null then raise exception 'You are not authorized to dispense items for this clinic'; end if;
  if v_user_role not in ('admin','doctor','receptionist','super_admin') then
    raise exception 'You are not authorized to dispense items';
  end if;

  p_item_type := lower(trim(p_item_type));
  if p_item_type not in ('optical','medication') then
    raise exception 'Invalid item type. Use optical or medication';
  end if;

  if p_item_type='optical' then
    v_already_dispensed := v_visit.optical_dispensed;
  else
    v_already_dispensed := v_visit.medication_dispensed;
  end if;
  if v_already_dispensed then
    raise exception '% item has already been marked as dispensed', initcap(p_item_type);
  end if;

  if p_item_type='medication' and p_inventory_id is null then
    v_medication_name := trim(split_part(v_visit.medication,'—',1));
    select id,name into v_inventory_id,v_item_name
    from public.inventory
    where clinic_id=v_visit.clinic_id
      and lower(trim(name))=lower(v_medication_name)
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
    where id=v_inventory_id and clinic_id=v_visit.clinic_id
    for update;
    if not found then raise exception 'Inventory item not found for this clinic'; end if;
    if v_stock_before < 1 then raise exception 'Insufficient stock for %',v_item_name; end if;
    v_stock_after := v_stock_before-1;

    perform set_config('optocare.controlled_inventory_movement','on',true);

    update public.inventory
    set stock_quantity=v_stock_after, updated_at=now()
    where id=v_inventory_id and clinic_id=v_visit.clinic_id;

    insert into public.inventory_movements (
      clinic_id,inventory_id,product_name,quantity_before,quantity_delta,
      quantity_after,reason,patient_id,visit_id,staff_id,notes
    ) values (
      v_visit.clinic_id,v_inventory_id,v_item_name,v_stock_before,-1,
      v_stock_after,'dispensed',v_visit.patient_id,v_visit.id,v_user_id,
      case when p_item_type='optical'
        then 'Optical prescription dispensed'
        else 'Medication dispensed' end
    );
  end if;

  if p_item_type='optical' then
    update public.visits
    set optical_dispensed=true,optical_dispensed_by=v_user_id,optical_dispensed_at=now()
    where id=p_visit_id and clinic_id=v_visit.clinic_id;
  else
    update public.visits
    set medication_dispensed=true,medication_dispensed_by=v_user_id,medication_dispensed_at=now()
    where id=p_visit_id and clinic_id=v_visit.clinic_id;
  end if;

  return jsonb_build_object(
    'success',true,'visit_id',p_visit_id,'item_type',p_item_type,'dispensed',true,
    'inventory_updated',v_inventory_id is not null,'inventory_id',v_inventory_id,
    'inventory_item',v_item_name,'dispensed_by',v_user_id,'dispensed_at',now()
  );
end;
$function$;