-- Actionable notification inbox:
-- exact patient context, direct destinations, and a real clear-all operation.

create or replace function public.notify_patient_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_name text := coalesce(new.full_name, 'New patient');
  v_body text;
begin
  v_body := v_name || ' has been registered as a new patient in your clinic.';

  for r in
    select distinct recipient_user_id as user_id
    from (
      select cu.user_id as recipient_user_id
      from public.clinic_users cu
      where cu.clinic_id = new.clinic_id
        and cu.role::text in ('admin','receptionist')
      union
      select ur.user_id as recipient_user_id
      from public.user_roles ur
      where ur.clinic_id = new.clinic_id
        and ur.role::text in ('admin','receptionist')
      union
      select new.assigned_doctor
      where new.assigned_doctor is not null
    ) recipients
    where recipient_user_id is not null
  loop
    perform public.emit_staff_notification(
      new.clinic_id, r.user_id,
      'patient_registered', 'patient', 'information',
      'New patient registered',
      v_body,
      '/patient/' || new.id::text,
      'patient', new.id,
      'patient_registered:' || new.id::text,
      jsonb_build_object('patient_id', new.id, 'patient_name', v_name),
      null
    );
  end loop;
  return new;
end;
$$;

create or replace function public.notify_visit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_patient_name text;
  v_registrar_name text;
  v_title text;
  v_body text;
  v_type text;
  v_priority text := 'information';
  v_dedupe text;
begin
  select p.full_name into v_patient_name
  from public.patients p
  where p.id = new.patient_id;

  select coalesce(pr.full_name, 'Clinic staff') into v_registrar_name
  from public.profiles pr
  where pr.id = new.registered_by;

  if tg_op = 'INSERT' then
    v_type := 'visit_registered';
    v_title := 'New visit registered';
    v_body := coalesce(v_patient_name, 'A patient') || ' has a new visit registered';
    if v_registrar_name is not null then
      v_body := v_body || ' by ' || v_registrar_name;
    end if;
    v_body := v_body || '.';
    v_dedupe := 'visit-registered:' || new.id::text;
  elsif new.status = 'completed' and old.status is distinct from new.status then
    v_type := 'visit_completed';
    v_title := 'Visit completed';
    v_body := coalesce(v_patient_name, 'A patient') || '''s visit has been completed';
    if new.doctor_id is not null then
      select coalesce(pr.full_name, 'the assigned clinician') into v_registrar_name
      from public.profiles pr
      where pr.id = new.doctor_id;
      if v_registrar_name is not null then
        v_body := v_body || ' by ' || v_registrar_name;
      end if;
    end if;
    v_body := v_body || '.';
    v_dedupe := 'visit-completed:' || new.id::text;
  else
    return new;
  end if;

  for r in
    select distinct recipient_user_id as user_id
    from (
      select new.doctor_id as recipient_user_id where new.doctor_id is not null
      union
      select new.registered_by where new.registered_by is not null
      union
      select cu.user_id
      from public.clinic_users cu
      where cu.clinic_id = new.clinic_id
        and cu.role::text in ('admin','receptionist')
      union
      select ur.user_id
      from public.user_roles ur
      where ur.clinic_id = new.clinic_id
        and ur.role::text in ('admin','receptionist')
    ) recipients
    where recipient_user_id is not null
  loop
    perform public.emit_staff_notification(
      new.clinic_id, r.user_id,
      v_type, 'patient', v_priority,
      v_title, v_body,
      '/patient/' || new.patient_id::text,
      'visit', new.id,
      v_dedupe,
      jsonb_build_object(
        'patient_id', new.patient_id,
        'patient_name', v_patient_name,
        'registered_by', new.registered_by,
        'doctor_id', new.doctor_id
      ),
      null
    );
  end loop;
  return new;
end;
$$;

-- There should be one visit notification event per visit transition.
drop trigger if exists trg_visit_completed_notification on public.visits;

create or replace function public.notify_appointment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_patient_name text;
  v_title text;
  v_body text;
  v_type text;
  v_priority text;
begin
  select p.full_name into v_patient_name
  from public.patients p
  where p.id = new.patient_id;

  if tg_op = 'INSERT' then
    v_type := 'appointment_created';
    v_title := 'New appointment';
    v_body := coalesce(v_patient_name, 'A patient') || ' has a new appointment on ' ||
      coalesce(to_char(new.appointment_date, 'DD Mon YYYY'), 'an upcoming date') ||
      case when new.appointment_time is not null then ' at ' || new.appointment_time::text else '' end || '.';
    v_priority := 'information';
  elsif new.status = 'cancelled' and old.status is distinct from new.status then
    v_type := 'appointment_cancelled';
    v_title := 'Appointment cancelled';
    v_body := coalesce(v_patient_name, 'A patient') || '''s appointment has been cancelled.';
    v_priority := 'attention';
  elsif old.appointment_date is distinct from new.appointment_date
     or old.appointment_time is distinct from new.appointment_time
     or old.doctor_id is distinct from new.doctor_id
     or old.status is distinct from new.status then
    v_type := 'appointment_updated';
    v_title := 'Appointment updated';
    v_body := coalesce(v_patient_name, 'A patient') || '''s appointment has been updated.';
    v_priority := 'attention';
  else
    return new;
  end if;

  for r in
    select distinct recipient_user_id as user_id
    from (
      select new.doctor_id as recipient_user_id where new.doctor_id is not null
      union
      select cu.user_id
      from public.clinic_users cu
      where cu.clinic_id = new.clinic_id
        and cu.role::text in ('admin','receptionist')
      union
      select ur.user_id
      from public.user_roles ur
      where ur.clinic_id = new.clinic_id
        and ur.role::text in ('admin','receptionist')
    ) recipients
    where recipient_user_id is not null
  loop
    perform public.emit_staff_notification(
      new.clinic_id, r.user_id,
      v_type, 'appointments', v_priority,
      v_title, v_body,
      '/appointments',
      'appointment', new.id,
      'appointment:' || new.id::text || ':' || v_type,
      jsonb_build_object(
        'patient_id', new.patient_id,
        'patient_name', v_patient_name,
        'appointment_date', new.appointment_date,
        'appointment_time', new.appointment_time,
        'status', new.status
      ),
      null
    );
  end loop;
  return new;
end;
$$;

create or replace function public.notify_payment_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_patient_id uuid;
  v_patient_name text;
  v_amount numeric;
  v_body text;
begin
  select b.patient_id into v_patient_id
  from public.billing b where b.id = new.billing_id;

  select p.full_name into v_patient_name
  from public.patients p where p.id = v_patient_id;

  v_amount := new.amount;
  v_body := 'Payment of ₦' || to_char(coalesce(v_amount,0), 'FM999G999G999G990D00') ||
    ' has been recorded for ' || coalesce(v_patient_name, 'a patient') || '.';

  for r in
    select distinct user_id
    from (
      select user_id from public.clinic_users
      where clinic_id = new.clinic_id and role::text in ('admin','receptionist')
      union
      select user_id from public.user_roles
      where clinic_id = new.clinic_id and role::text in ('admin','receptionist')
    ) x
  loop
    perform public.emit_staff_notification(
      new.clinic_id, r.user_id,
      'payment_received', 'billing', 'information',
      'Payment received', v_body,
      '/billing', 'payment', new.id,
      'payment:' || new.id::text,
      jsonb_build_object('billing_id', new.billing_id, 'patient_id', v_patient_id, 'patient_name', v_patient_name, 'amount', v_amount),
      null
    );
  end loop;
  return new;
end;
$$;

-- Allow users to remove their own clinic notifications.
drop policy if exists "staff_notifications_delete_own" on public.staff_notifications;
create policy "staff_notifications_delete_own"
  on public.staff_notifications for delete
  to authenticated
  using (recipient_user_id = auth.uid());
