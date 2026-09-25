-- Harden the legacy three-argument inventory stock-count RPC.
-- It is SECURITY DEFINER, so authorization must be enforced inside the function.

create or replace function public.finalize_inventory_stock_count(
  p_inventory_id uuid,
  p_physical_quantity integer,
  p_notes text default null
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_inventory public.inventory%rowtype;
  v_delta integer;
  v_movement public.inventory_movements;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_physical_quantity < 0 then
    raise exception 'Physical quantity cannot be negative';
  end if;

  select *
    into v_inventory
  from public.inventory
  where id = p_inventory_id
  for update;

  if not found then
    raise exception 'Inventory item not found';
  end if;

  if not (
    public.has_role(auth.uid(), 'super_admin')
    or (
      public.has_role(auth.uid(), 'admin')
      and exists (
        select 1
        from public.user_clinic_memberships m
        where m.user_id = auth.uid()
          and m.clinic_id = v_inventory.clinic_id
      )
    )
  ) then
    raise exception 'Not authorized to count this inventory item';
  end if;

  v_delta := p_physical_quantity - v_inventory.stock_quantity;

  update public.inventory
     set stock_quantity = p_physical_quantity,
         updated_at = now()
   where id = p_inventory_id
     and clinic_id = v_inventory.clinic_id;

  insert into public.inventory_movements(
    clinic_id, inventory_id, product_name,
    quantity_before, quantity_delta, quantity_after,
    reason, staff_id, notes
  )
  values (
    v_inventory.clinic_id, v_inventory.id, v_inventory.name,
    v_inventory.stock_quantity, v_delta, p_physical_quantity,
    'stock_count', auth.uid(), nullif(trim(p_notes), '')
  )
  returning * into v_movement;

  return v_movement;
end;
$function$;

grant execute on function public.finalize_inventory_stock_count(uuid, integer, text) to authenticated;
