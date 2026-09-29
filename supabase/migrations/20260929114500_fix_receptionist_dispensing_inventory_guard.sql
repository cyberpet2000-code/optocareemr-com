-- Fix receptionist dispensing after inventory direct-mutation hardening.
-- Authorized dispensing RPCs are already SECURITY DEFINER and validate the
-- authenticated caller, clinic membership, completed visit, and allowed role.
-- A transaction-local marker lets the inventory guard distinguish that
-- controlled stock movement from an ordinary client UPDATE.

create or replace function public.guard_inventory_direct_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if new.clinic_id is null then raise exception 'Inventory item must belong to a clinic'; end if;

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

do $patch$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='mark_visit_item_dispensed'
    and pg_get_function_identity_arguments(p.oid)='p_visit_id uuid, p_item_type text, p_inventory_id uuid';

  if v_def is null then raise exception 'mark_visit_item_dispensed not found'; end if;

  if position('optocare.controlled_inventory_movement' in v_def)=0 then
    v_def := replace(
      v_def,
      'UPDATE public.inventory',
      'PERFORM set_config(''optocare.controlled_inventory_movement'', ''on'', true);' || E'\n' || 'UPDATE public.inventory'
    );
    execute v_def;
  end if;
end
$patch$;

do $patch$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='mark_medication_item_dispensed'
    and pg_get_function_identity_arguments(p.oid)='p_visit_id uuid, p_medication_name text, p_inventory_id uuid';

  if v_def is null then raise exception 'mark_medication_item_dispensed not found'; end if;

  if position('optocare.controlled_inventory_movement' in v_def)=0 then
    v_def := replace(
      v_def,
      'UPDATE public.inventory',
      'PERFORM set_config(''optocare.controlled_inventory_movement'', ''on'', true);' || E'\n' || 'UPDATE public.inventory'
    );
    execute v_def;
  end if;
end
$patch$;
