-- Fix visit notification trigger: all UNION branches must expose the same
-- user_id column. Without explicit aliases PostgreSQL can fail the visit
-- transaction after the visit/billing work has already run.

create or replace function public.notify_visit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r record;
  t text;
  ttl text;
  b text;
  d text;
begin
  if tg_op = 'INSERT' then
    t := 'visit_registered';
    ttl := 'New visit registered';
    b := 'A patient visit has been registered.';
    d := 'visit-registered:' || new.id::text;
  elsif new.status = 'completed' and old.status is distinct from new.status then
    t := 'visit_completed';
    ttl := 'Visit completed';
    b := 'A patient visit has been completed.';
    d := 'visit-completed:' || new.id::text;
  else
    return new;
  end if;

  for r in
    select distinct x.user_id
    from (
      select new.doctor_id as user_id
      where new.doctor_id is not null

      union

      select new.registered_by as user_id
      where new.registered_by is not null

      union

      select cu.user_id
      from public.clinic_users cu
      where cu.clinic_id = new.clinic_id
        and cu.role::text in ('admin', 'receptionist')

      union

      select ur.user_id
      from public.user_roles ur
      where ur.clinic_id = new.clinic_id
        and ur.role::text in ('admin', 'receptionist')
    ) x
  loop
    perform public.emit_staff_notification(
      new.clinic_id,
      r.user_id,
      t,
      'patient',
      'information',
      ttl,
      b,
      '/patients',
      'visit',
      new.id,
      d
    );
  end loop;

  return new;
end
$function$;
