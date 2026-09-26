-- Tighten patient mutations to operational roles.
drop policy if exists clinic_update_patients on public.patients;
create policy clinic_update_patients
on public.patients
for update to authenticated
using (
  public.is_super_admin(auth.uid())
  or (
    (public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'doctor')
     or public.has_role(auth.uid(), 'receptionist'))
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
)
with check (
  public.is_super_admin(auth.uid())
  or (
    (public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'doctor')
     or public.has_role(auth.uid(), 'receptionist'))
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
);

create or replace function public.guard_patient_sensitive_mutation()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if public.is_super_admin(auth.uid()) or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  if public.has_role(auth.uid(), 'receptionist')
     or public.has_role(auth.uid(), 'doctor') then
    if new.clinic_id is distinct from old.clinic_id
       or new.created_by is distinct from old.created_by
       or new.patient_number is distinct from old.patient_number then
      raise exception 'This patient field can only be changed by an administrator';
    end if;
    return new;
  end if;

  raise exception 'Not authorized to modify patient records';
end;
$function$;

drop trigger if exists trg_guard_patient_sensitive_mutation on public.patients;
create trigger trg_guard_patient_sensitive_mutation
before update on public.patients
for each row
execute function public.guard_patient_sensitive_mutation();

revoke all on function public.guard_patient_sensitive_mutation() from public, anon, authenticated;
grant execute on function public.guard_patient_sensitive_mutation() to service_role;
