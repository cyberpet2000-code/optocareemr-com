-- Restrict clinical visit mutation to the assigned clinician or clinic admin.
-- Admin remains full clinic authority. Super-admin remains platform authority.
drop policy if exists clinic_update_visits on public.visits;

create policy clinic_update_visits
on public.visits
for update to authenticated
using (
  public.is_super_admin(auth.uid())
  or (
    clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
    and (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or (
        public.has_role(auth.uid(), 'doctor'::public.app_role)
        and doctor_id = auth.uid()
      )
    )
  )
)
with check (
  public.is_super_admin(auth.uid())
  or (
    clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
    and (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or (
        public.has_role(auth.uid(), 'doctor'::public.app_role)
        and doctor_id = auth.uid()
      )
    )
  )
);

-- A doctor should not be able to delete another clinician's visit either.
-- Admin remains able to delete any visit in the clinic.
drop policy if exists clinic_delete_visits_authorized_staff on public.visits;

create policy clinic_delete_visits_authorized_staff
on public.visits
for delete to authenticated
using (
  public.is_super_admin(auth.uid())
  or (
    clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
    and (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or (
        public.has_role(auth.uid(), 'doctor'::public.app_role)
        and doctor_id = auth.uid()
      )
    )
  )
);
