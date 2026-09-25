-- Harden billing line-item tenant integrity and mutation authority.

alter table public.billing_items
  drop constraint if exists billing_items_quantity_positive;
alter table public.billing_items
  add constraint billing_items_quantity_positive
  check (quantity > 0);

alter table public.billing_items
  drop constraint if exists billing_items_unit_price_nonnegative;
alter table public.billing_items
  add constraint billing_items_unit_price_nonnegative
  check (unit_price >= 0);

alter table public.billing_items
  drop constraint if exists billing_items_total_price_nonnegative;
alter table public.billing_items
  add constraint billing_items_total_price_nonnegative
  check (total_price >= 0);

alter table public.billing_items
  drop constraint if exists billing_items_total_math_check;
alter table public.billing_items
  add constraint billing_items_total_math_check
  check (abs(total_price - (quantity * unit_price)) <= 0.01);

create unique index if not exists inventory_id_clinic_unique
  on public.inventory (id, clinic_id);

alter table public.billing_items
  drop constraint if exists billing_items_billing_id_clinic_fkey;
alter table public.billing_items
  add constraint billing_items_billing_id_clinic_fkey
  foreign key (billing_id, clinic_id)
  references public.billing (id, clinic_id);

alter table public.billing_items
  drop constraint if exists billing_items_inventory_id_clinic_fkey;
alter table public.billing_items
  add constraint billing_items_inventory_id_clinic_fkey
  foreign key (inventory_id, clinic_id)
  references public.inventory (id, clinic_id);

create or replace function public.guard_billing_item_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    public.is_super_admin(auth.uid())
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'receptionist')
  ) then
    raise exception 'Not authorized to modify billing items';
  end if;

  if new.clinic_id is null or new.clinic_id <> public.current_clinic_id() then
    if not public.is_super_admin(auth.uid()) then
      raise exception 'Billing item must belong to the active clinic';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.clinic_id is distinct from old.clinic_id then
      raise exception 'Billing item clinic cannot be changed';
    end if;

    if new.billing_id is distinct from old.billing_id then
      raise exception 'Billing item cannot be moved to a different billing record';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_billing_item_mutation on public.billing_items;
create trigger trg_guard_billing_item_mutation
before insert or update on public.billing_items
for each row
execute function public.guard_billing_item_mutation();

drop policy if exists clinic_insert_billing_items on public.billing_items;
create policy clinic_insert_billing_items
on public.billing_items
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

drop policy if exists clinic_update_billing_items on public.billing_items;
create policy clinic_update_billing_items
on public.billing_items
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