-- Appointment scheduling/rescheduling is an operational workflow for admin, doctor, and receptionist.
-- Do not permit an arbitrary authenticated clinic user to mutate appointment rows.
drop policy if exists clinic_insert_appointments on public.appointments;
drop policy if exists clinic_update_appointments on public.appointments;

create policy clinic_insert_appointments on public.appointments for insert to authenticated
with check (
  public.is_super_admin(auth.uid())
  or ((public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'doctor') or public.has_role(auth.uid(),'receptionist'))
      and clinic_id=public.current_clinic_id()
      and public.lifecycle_allows_access(clinic_id))
);

create policy clinic_update_appointments on public.appointments for update to authenticated
using (
  public.is_super_admin(auth.uid())
  or ((public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'doctor') or public.has_role(auth.uid(),'receptionist'))
      and clinic_id=public.current_clinic_id()
      and public.lifecycle_allows_access(clinic_id))
)
with check (
  public.is_super_admin(auth.uid())
  or ((public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'doctor') or public.has_role(auth.uid(),'receptionist'))
      and clinic_id=public.current_clinic_id()
      and public.lifecycle_allows_access(clinic_id))
);
