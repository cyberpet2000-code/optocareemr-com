-- Harden inventory stock-count RPC authorization without changing existing
-- function signatures/defaults.
create or replace function public.finalize_inventory_stock_count(
 p_inventory_id uuid,
 p_physical_quantity integer,
 p_notes text default null
)
returns public.inventory_movements
language plpgsql security definer set search_path=public
as $function$
declare
 v_inventory public.inventory%rowtype;
 v_delta integer;
 v_movement public.inventory_movements;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_physical_quantity < 0 then raise exception 'Physical quantity cannot be negative'; end if;
 select * into v_inventory from public.inventory where id=p_inventory_id for update;
 if not found then raise exception 'Inventory item not found'; end if;
 if not (
   public.is_super_admin(auth.uid())
   or (
     public.has_role(auth.uid(),'admin'::public.app_role)
     and exists (
       select 1 from public.user_clinic_memberships m
       where m.user_id=auth.uid()
         and m.clinic_id=v_inventory.clinic_id
         and lower(m.role::text)='admin'
     )
     and public.lifecycle_allows_access(v_inventory.clinic_id)
   )
 ) then raise exception 'Not authorized to count this inventory item'; end if;
 v_delta:=p_physical_quantity-v_inventory.stock_quantity;
 update public.inventory set stock_quantity=p_physical_quantity,updated_at=now()
  where id=p_inventory_id and clinic_id=v_inventory.clinic_id;
 insert into public.inventory_movements
 (clinic_id,inventory_id,product_name,quantity_before,quantity_delta,quantity_after,reason,staff_id,notes)
 values(v_inventory.clinic_id,v_inventory.id,v_inventory.name,v_inventory.stock_quantity,v_delta,p_physical_quantity,'stock_count',auth.uid(),nullif(trim(p_notes),''))
 returning * into v_movement;
 return v_movement;
end;
$function$;

-- Preserve the existing JSONB return shape exactly.
create or replace function public.finalize_inventory_stock_count(
 p_clinic_id uuid,
 p_counts jsonb
)
returns table(
 inventory_id uuid,
 product_name text,
 quantity_before integer,
 physical_quantity integer,
 quantity_delta integer,
 quantity_after integer
)
language plpgsql security definer set search_path=public
as $function$
declare r record; v_before integer; v_after integer; v_delta integer; v_product_name text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not (
   public.is_super_admin(auth.uid())
   or (
     public.has_role(auth.uid(),'admin'::public.app_role)
     and public.current_clinic_id()=p_clinic_id
     and public.lifecycle_allows_access(p_clinic_id)
   )
 ) then raise exception 'Not authorized to finalize stock counts for this clinic'; end if;
 for r in
   select (x->>'inventory_id')::uuid inventory_id,
          greatest(0,(x->>'physical_quantity')::integer) physical_quantity
   from jsonb_array_elements(coalesce(p_counts,'[]'::jsonb)) x
   where x ? 'inventory_id' and x ? 'physical_quantity'
 loop
   select stock_quantity,name into v_before,v_product_name
   from public.inventory
   where id=r.inventory_id and clinic_id=p_clinic_id for update;
   if not found then continue; end if;
   v_delta:=r.physical_quantity-v_before; v_after:=r.physical_quantity;
   if v_delta<>0 then
     update public.inventory set stock_quantity=v_after,updated_at=now()
     where id=r.inventory_id and clinic_id=p_clinic_id;
     insert into public.inventory_movements
     (clinic_id,inventory_id,product_name,quantity_before,quantity_delta,quantity_after,reason,staff_id,notes)
     values(p_clinic_id,r.inventory_id,v_product_name,v_before,v_delta,v_after,'stock_count',auth.uid(),'Physical stock count adjustment');
   end if;
   inventory_id:=r.inventory_id; product_name:=v_product_name; quantity_before:=v_before;
   physical_quantity:=r.physical_quantity; quantity_delta:=v_delta; quantity_after:=v_after;
   return next;
 end loop;
end;
$function$;