-- Harden direct inventory CRUD while preserving receptionist product-management access.
-- Stock quantity changes must go through controlled inventory movement workflows.

alter table public.inventory
  drop constraint if exists inventory_stock_quantity_nonnegative;
alter table public.inventory
  add constraint inventory_stock_quantity_nonnegative
  check (stock_quantity >= 0);

alter table public.inventory
  drop constraint if exists inventory_price_nonnegative;
alter table public.inventory
  add constraint inventory_price_nonnegative
  check (price >= 0);

alter table public.inventory
  drop constraint if exists inventory_min_stock_nonnegative;
alter table public.inventory
  add constraint inventory_min_stock_nonnegative
  check (min_stock >= 0);

alter table public.inventory
  drop constraint if exists inventory_low_stock_threshold_nonnegative;
alter table public.inventory
  add constraint inventory_low_stock_threshold_nonnegative
  check (low_stock_threshold >= 0);

drop policy if exists clinic_insert_inventory on public.inventory;
create policy clinic_insert_inventory
on public.inventory
for insert to authenticated
with check (
  public.is_super_admin(auth.uid())
  or (
    (public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'receptionist'))
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
);

drop policy if exists clinic_update_inventory on public.inventory;
create policy clinic_update_inventory
on public.inventory
for update to authenticated
using (
  public.is_super_admin(auth.uid())
  or (
    (public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'receptionist'))
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
)
with check (
  public.is_super_admin(auth.uid())
  or (
    (public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'receptionist'))
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
);

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

    if not (public.is_super_admin(auth.uid()) or public.has_role(auth.uid(), 'admin'))
       and new.stock_quantity is distinct from old.stock_quantity then
      raise exception 'Stock quantity must be changed through a controlled inventory movement';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_inventory_direct_mutation on public.inventory;
create trigger trg_guard_inventory_direct_mutation
before insert or update on public.inventory
for each row
execute function public.guard_inventory_direct_mutation();
