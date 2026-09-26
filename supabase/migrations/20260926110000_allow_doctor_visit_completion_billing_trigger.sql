-- Allow the secured visit-completion trigger to create the automatic billing shell
-- when a doctor completes a visit, without granting doctors direct billing mutation rights.
--
-- Direct billing INSERT/UPDATE remains restricted to admin/receptionist.
-- A billing mutation originating from the visits completion trigger is allowed
-- for an authorized clinical doctor because pg_trigger_depth() is > 1.

create or replace function public.guard_billing_tenant_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if public.is_super_admin(auth.uid()) then
    return new;
  end if;

  if new.clinic_id is null or new.clinic_id <> public.current_clinic_id() then
    raise exception 'Billing record must belong to the active clinic';
  end if;

  if tg_op = 'UPDATE' and old.clinic_id <> new.clinic_id then
    raise exception 'Billing clinic cannot be changed';
  end if;

  -- Admins and receptionists may mutate billing directly.
  if public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'receptionist') then
    return new;
  end if;

  -- Doctors may not mutate billing directly. They may only reach this guard
  -- through the trusted visit-completion trigger that creates the billing shell.
  if public.has_role(auth.uid(), 'doctor')
     and pg_trigger_depth() > 1 then
    return new;
  end if;

  raise exception 'Not authorized to modify billing';
end;
$function$;
