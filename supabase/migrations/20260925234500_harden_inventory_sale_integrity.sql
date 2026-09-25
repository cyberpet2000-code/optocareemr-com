-- Harden inventory sale integrity.
-- Prevent cross-clinic inventory references, invalid quantities, and post-sale mutation.

alter table public.inventory_sale_items
  drop constraint if exists inventory_sale_items_quantity_positive;
alter table public.inventory_sale_items
  add constraint inventory_sale_items_quantity_positive
  check (quantity > 0);

alter table public.inventory_sale_items
  drop constraint if exists inventory_sale_items_unit_price_nonnegative;
alter table public.inventory_sale_items
  add constraint inventory_sale_items_unit_price_nonnegative
  check (unit_price >= 0);

alter table public.inventory_sale_items
  drop constraint if exists inventory_sale_items_total_price_nonnegative;
alter table public.inventory_sale_items
  add constraint inventory_sale_items_total_price_nonnegative
  check (total_price >= 0);

create or replace function public.log_inventory_sale_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_before integer;
  v_after integer;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    public.is_super_admin(auth.uid())
    or exists (
      select 1
      from public.user_clinic_memberships m
      where m.user_id = auth.uid()
        and m.clinic_id = new.clinic_id
    )
  ) then
    raise exception 'Not authorized for this clinic';
  end if;

  select stock_quantity, name
    into v_before, v_name
  from public.inventory
  where id = new.inventory_id
    and clinic_id = new.clinic_id
  for update;

  if not found then
    raise exception 'Inventory item does not belong to the sale clinic';
  end if;

  if new.quantity <= 0 then
    raise exception 'Sale quantity must be greater than zero';
  end if;

  if v_before < new.quantity then
    raise exception 'Insufficient inventory stock';
  end if;

  v_after := v_before - new.quantity;

  update public.inventory
     set stock_quantity = v_after,
         updated_at = now()
   where id = new.inventory_id
     and clinic_id = new.clinic_id;

  insert into public.inventory_movements(
    clinic_id,
    inventory_id,
    product_name,
    quantity_before,
    quantity_delta,
    quantity_after,
    reason,
    staff_id,
    notes
  )
  values (
    new.clinic_id,
    new.inventory_id,
    v_name,
    v_before,
    -new.quantity,
    v_after,
    'sale',
    auth.uid(),
    'inventory_sale_item:' || new.id::text
  );

  return new;
end;
$function$;

drop policy if exists clinic_update_inventory_sale_items on public.inventory_sale_items;
create policy clinic_update_inventory_sale_items
on public.inventory_sale_items
for update to authenticated
using (
  public.is_super_admin(auth.uid())
  or (
    public.has_role(auth.uid(), 'admin')
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
)
with check (
  public.is_super_admin(auth.uid())
  or (
    public.has_role(auth.uid(), 'admin')
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
);

drop policy if exists clinic_update_inventory_sales on public.inventory_sales;
create policy clinic_update_inventory_sales
on public.inventory_sales
for update to authenticated
using (
  public.is_super_admin(auth.uid())
  or (
    public.has_role(auth.uid(), 'admin')
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
)
with check (
  public.is_super_admin(auth.uid())
  or (
    public.has_role(auth.uid(), 'admin')
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
);

drop policy if exists clinic_delete_inventory_sale_items on public.inventory_sale_items;
create policy clinic_delete_inventory_sale_items
on public.inventory_sale_items
for delete to authenticated
using (
  public.is_super_admin(auth.uid())
  or (
    public.has_role(auth.uid(), 'admin')
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
);

drop policy if exists clinic_delete_inventory_sales on public.inventory_sales;
create policy clinic_delete_inventory_sales
on public.inventory_sales
for delete to authenticated
using (
  public.is_super_admin(auth.uid())
  or (
    public.has_role(auth.uid(), 'admin')
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
);