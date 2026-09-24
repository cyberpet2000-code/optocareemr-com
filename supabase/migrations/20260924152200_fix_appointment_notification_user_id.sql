-- Fix appointment notification recipient aliasing and match the current
-- emit_staff_notification(uuid, uuid, ...) signature.

create or replace function public.notify_appointment_event()
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
  p text;
begin
  if tg_op = 'INSERT' then
    t := 'appointment_created';
    ttl := 'New appointment';
    b := 'A new appointment has been scheduled.';
    p := 'information';
  elsif new.status = 'cancelled' and old.status is distinct from new.status then
    t := 'appointment_cancelled';
    ttl := 'Appointment cancelled';
    b := 'An appointment has been cancelled.';
    p := 'attention';
  elsif old.appointment_date is distinct from new.appointment_date
     or old.appointment_time is distinct from new.appointment_time
     or old.doctor_id is distinct from new.doctor_id
     or old.status is distinct from new.status then
    t := 'appointment_updated';
    ttl := 'Appointment updated';
    b := 'An appointment has been updated.';
    p := 'attention';
  else
    return new;
  end if;

  for r in
    select distinct recipient_user_id as user_id
    from (
      select new.doctor_id as recipient_user_id
      where new.doctor_id is not null
      union
      select cu.user_id as recipient_user_id
      from public.clinic_users cu
      where cu.clinic_id = new.clinic_id
        and cu.role::text in ('admin', 'receptionist')
      union
      select ur.user_id as recipient_user_id
      from public.user_roles ur
      where ur.clinic_id = new.clinic_id
        and ur.role::text in ('admin', 'receptionist')
    ) recipients
    where recipient_user_id is not null
  loop
    perform public.emit_staff_notification(
      new.clinic_id,
      r.user_id,
      t,
      'appointments',
      p,
      ttl,
      b,
      '/appointments',
      'appointment',
      new.id,
      'appointment:' || new.id::text || ':' || t,
      '{}'::jsonb,
      null
    );
  end loop;

  return new;
end
$function$;