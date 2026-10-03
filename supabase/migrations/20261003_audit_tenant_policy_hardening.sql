-- Main-product audit hardening: keep finance/inventory history tenant-scoped.
-- This migration is isolated on project/main-product-audit-fixes and is NOT applied to production.

drop policy if exists expenses_delete_admin on public.expenses;
drop policy if exists expenses_insert_admin on public.expenses;
drop policy if exists expenses_update_admin on public.expenses;

create policy expenses_delete_admin
on public.expenses
for delete
to authenticated
using (
  is_super_admin(auth.uid())
  or (
    has_role(auth.uid(), 'admin'::app_role)
    and clinic_id = current_clinic_id()
    and lifecycle_allows_access(clinic_id)
  )
);

create policy expenses_insert_admin
on public.expenses
for insert
to authenticated
with check (
  is_super_admin(auth.uid())
  or (
    has_role(auth.uid(), 'admin'::app_role)
    and clinic_id = current_clinic_id()
    and lifecycle_allows_access(clinic_id)
  )
);

create policy expenses_update_admin
on public.expenses
for update
to authenticated
using (
  is_super_admin(auth.uid())
  or (
    has_role(auth.uid(), 'admin'::app_role)
    and clinic_id = current_clinic_id()
    and lifecycle_allows_access(clinic_id)
  )
)
with check (
  is_super_admin(auth.uid())
  or (
    has_role(auth.uid(), 'admin'::app_role)
    and clinic_id = current_clinic_id()
    and lifecycle_allows_access(clinic_id)
  )
);

drop policy if exists clinic_delete_restock_history on public.restock_history;

create policy clinic_delete_restock_history
on public.restock_history
for delete
to authenticated
using (
  is_super_admin(auth.uid())
  or (
    has_role(auth.uid(), 'admin'::app_role)
    and clinic_id = current_clinic_id()
    and lifecycle_allows_access(clinic_id)
  )
);
