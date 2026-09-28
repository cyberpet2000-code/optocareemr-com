-- Admin is the full owner/operator of a clinic.
-- Super Admin remains a separate platform-level authority.
insert into public.role_capabilities (role, capability) values
  ('admin','clinical.read'),
  ('admin','clinical.write'),
  ('admin','clinical.assign'),
  ('admin','prescription.create')
on conflict (role, capability) do nothing;

-- Visit registration identity is always the authenticated creator.
create or replace function public.set_visit_registered_by()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    new.registered_by := auth.uid();
  end if;
  return new;
end;
$function$;
