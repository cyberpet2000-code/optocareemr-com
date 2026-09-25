-- Harden direct payment mutations.
-- Billing UI exposes payment entry to admin/receptionist; ordinary clinical roles
-- should not be able to create, edit, or delete financial transactions directly.

alter table public.payments
  drop constraint if exists payments_amount_positive;
alter table public.payments
  add constraint payments_amount_positive
  check (amount > 0);

drop policy if exists clinic_insert_payments on public.payments;
create policy clinic_insert_payments
on public.payments
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

drop policy if exists clinic_update_payments on public.payments;
create policy clinic_update_payments
on public.payments
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

drop policy if exists clinic_delete_payments on public.payments;
create policy clinic_delete_payments
on public.payments
for delete to authenticated
using (
  public.is_super_admin(auth.uid())
  or (
    public.has_role(auth.uid(), 'admin')
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
);
