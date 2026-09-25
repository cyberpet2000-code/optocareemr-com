-- Inventory movement records are an audit trail. Direct inserts must not be available
-- to ordinary clinic members; controlled SECURITY DEFINER workflows create them.

drop policy if exists inv_move_insert_members on public.inventory_movements;
drop policy if exists inv_move_insert_admin on public.inventory_movements;

create policy inv_move_insert_admin
on public.inventory_movements
for insert to authenticated
with check (
  public.is_super_admin(auth.uid())
  or (
    public.has_role(auth.uid(), 'admin')
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
);
