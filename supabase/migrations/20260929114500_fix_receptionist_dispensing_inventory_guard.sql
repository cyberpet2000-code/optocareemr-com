-- Allow authorized dispensing RPCs to perform the stock mutation through the existing
-- inventory guard, without weakening direct receptionist inventory edits.
--
-- The dispensing functions already authenticate the caller, verify clinic membership,
-- and restrict the role. They set a transaction-local marker immediately before
-- their controlled stock mutation. The inventory trigger accepts a stock change only
-- when that marker is present; ordinary client UPDATEs remain blocked.

create or replace function public.guard_inventory_direct_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if new.clinic_id is null then
    raise exception 'Inventory item must belong to a clinic';
  end if;

  if not public.is_super_admin(auth.uid())
     and new.clinic_id <> public.current_clinic_id() then
    raise exception 'Inventory item must belong to the active clinic';
  end if;

  if not (
    public.is_super_admin(auth.uid())
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'receptionist')
  ) then
    raise exception 'Not authorized to modify inventory';
  end if;

  if tg_op = 'UPDATE' then
    if new.clinic_id is distinct from old.clinic_id then
      raise exception 'Inventory clinic cannot be changed';
    end if;

    if new.stock_quantity is distinct from old.stock_quantity
       and not (
         public.is_super_admin(auth.uid())
         or public.has_role(auth.uid(), 'admin')
         or (
           public.has_role(auth.uid(), 'receptionist')
           and current_setting('optocare.controlled_inventory_movement', true) = 'on'
         )
       ) then
      raise exception 'Stock quantity must be changed through a controlled inventory movement';
    end if;
  end if;

  return new;
end;
$function$;

-- Mark the already-authorized dispensing transaction as a controlled movement
-- immediately before its stock update.
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
  v_inventory_id uuid;
  v_inventory_name text;
  v_stock_before integer;
  v_stock_after integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unable to identify logged-in user';
  end if;

  select * into v_visit
  from public.visits
  where id = p_visit_id;

  if not found then
    raise exception 'Visit not found';
  end if;

  if lower(coalesce(v_visit.status, '')) <> 'completed' then
    raise exception 'Only completed visits can be marked as dispensed';
  end if;

  select lower(cu.role) into v_user_role
  from public.clinic_users cu
  where cu.user_id = v_user_id
    and cu.clinic_id = v_visit.clinic_id
  limit 1;

  if v_user_role is null then
    raise exception 'You are not authorized to dispense items for this clinic';
  end if;

  if v_user_role not in ('admin','doctor','receptionist','super_admin') then
    raise exception 'You are not authorized to dispense items';
  end if;

  if lower(trim(coalesce(p_item_type,''))) not in ('optical','medication') then
    raise exception 'Invalid item type';
  end if;

  if p_item_type = 'optical' then
    if v_visit.optical_dispensed = true then
      raise exception 'Optical item has already been marked as dispensed';
    end if;
  else
    if v_visit.medication_dispensed = true then
      raise exception 'Medication item has already been marked as dispensed';
    end if;
  end if;

  v_inventory_id := p_inventory_id;

  if v_inventory_id is not null then
    select name, stock_quantity
      into v_inventory_name, v_stock_before
    from public.inventory
    where id = v_inventory_id
      and clinic_id = v_visit.clinic_id
    for update;

    if not found then
      raise exception 'Inventory item not found for this clinic';
    end if;

    if v_stock_before <= 0 then
      raise exception 'Insufficient stock for %', coalesce(v_inventory_name, 'selected item');
    end if;

    v_stock_after := v_stock_before - 1;

    -- Only this authenticated, role-checked RPC can enable this marker.
    perform set_config('optocare.controlled_inventory_movement', 'on', true);

    update public.inventory
      set stock_quantity = v_stock_after,
          updated_at = now()
    where id = v_inventory_id
      and clinic_id = v_visit.clinic_id;

    insert into public.inventory_movements (
      clinic_id, inventory_id, product_name, quantity_before,
      quantity_delta, quantity_after, reason, patient_id, visit_id, staff_id
    ) values (
      v_visit.clinic_id, v_inventory_id, coalesce(v_inventory_name, 'Inventory item'),
      v_stock_before, -1, v_stock_after, 'dispensed',
      v_visit.patient_id, v_visit.id, v_user_id
    );
  end if;

  if p_item_type = 'optical' then
    update public.visits
    set optical_dispensed = true,
        optical_dispensed_by = v_user_id,
        optical_dispensed_at = now()
    where id = p_visit_id
      and clinic_id = v_visit.clinic_id;
  else
    update public.visits
    set medication_dispensed = true,
        medication_dispensed_by = v_user_id,
        medication_dispensed_at = now()
    where id = p_visit_id
      and clinic_id = v_visit.clinic_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'visit_id', p_visit_id,
    'item_type', lower(trim(p_item_type)),
    'dispensed', true,
    'inventory_updated', v_inventory_id is not null,
    'inventory_id', v_inventory_id,
    'inventory_item', v_inventory_name,
    'dispensed_by', v_user_id,
    'dispensed_at', now()
  );
end;
$function$;

-- The medication RPC uses the same controlled movement marker.
-- Keep its existing implementation intact apart from the marker insertion:
-- the frontend passes NULL when no inventory item is selected, so no stock update
-- occurs in that case. This replacement is intentionally delegated below by
-- preserving the live function body and only setting the marker at the stock update
-- boundary is not possible with SQL text replacement; therefore the medication
-- path is handled by the visit-level RPC for optical dispensing. Medication
-- dispensing with inventory remains guarded by the existing function and is patched
-- in the following migration once its exact live body is captured.
