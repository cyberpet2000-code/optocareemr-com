-- HMO verification is an operational clinical/front-desk action.
-- Doctors and receptionists may record verification status/notes, while
-- tenant identity fields remain protected by guard_patient_sensitive_mutation.

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
