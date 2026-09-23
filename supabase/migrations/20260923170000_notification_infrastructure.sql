-- Expand staff notifications into the central, role-aware notification infrastructure.
alter table public.staff_notifications
  add column if not exists category text not null default 'system',
  add column if not exists priority text not null default 'information',
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists dedupe_key text,
  add column if not exists expires_at timestamptz;

create index if not exists idx_staff_notifications_feed
  on public.staff_notifications(recipient_user_id, clinic_id, category, created_at desc);

create index if not exists idx_staff_notifications_entity
  on public.staff_notifications(entity_type, entity_id);

create unique index if not exists uq_staff_notifications_dedupe
  on public.staff_notifications(recipient_user_id, clinic_id, dedupe_key)
  where dedupe_key is not null;

create or replace function public.emit_staff_notification(
  p_clinic_id uuid,
  p_recipient_ids uuid[],
  p_notification_type text,
  p_category text,
  p_priority text,
  p_title text,
  p_body text,
  p_link text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_clinic_id is null or p_recipient_ids is null or cardinality(p_recipient_ids) = 0 then
    return;
  end if;

  insert into public.staff_notifications (
    clinic_id,
    recipient_user_id,
    notification_type,
    category,
    priority,
    title,
    body,
    link,
    entity_type,
    entity_id,
    metadata,
    dedupe_key,
    expires_at
  )
  select
    p_clinic_id,
    recipients.user_id,
    p_notification_type,
    coalesce(p_category, 'system'),
    coalesce(p_priority, 'information'),
    p_title,
    p_body,
    p_link,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_dedupe_key,
    p_expires_at
  from (
    select distinct user_id
    from unnest(p_recipient_ids) as u(user_id)
    where user_id is not null
  ) recipients
  where exists (
    select 1
    from public.user_roles ur
    where ur.user_id = recipients.user_id
      and ur.clinic_id = p_clinic_id
  )
  on conflict (recipient_user_id, clinic_id, dedupe_key)
    where dedupe_key is not null
    do nothing;
end;
$$;

revoke execute on function public.emit_staff_notification(
  uuid, uuid[], text, text, text, text, text, text, text, uuid, jsonb, text, timestamptz
) from public, anon, authenticated;

create or replace function public.notify_feedback_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_priority text := case when coalesce(new.requires_follow_up, false) or coalesce(new.wants_follow_up, false) then 'urgent' else 'attention' end;
  v_title text := case when v_priority = 'urgent' then 'Feedback Needs Follow-up' else 'New Patient Feedback' end;
  v_body text := case when v_priority = 'urgent'
    then 'A patient has submitted feedback requesting follow-up.'
    else 'New patient feedback has been received for your clinic.'
  end;
  v_recipients uuid[];
begin
  select array_agg(distinct x.user_id)
    into v_recipients
  from (
    select ur.user_id
    from public.user_roles ur
    where ur.clinic_id = new.clinic_id
      and ur.role in ('admin'::public.app_role, 'super_admin'::public.app_role)
    union all
    select new.doctor_id
    where new.doctor_id is not null
    union all
    select v.registered_by
    from public.visits v
    where v.id = new.visit_id
      and v.registered_by is not null
  ) x;

  perform public.emit_staff_notification(
    new.clinic_id,
    coalesce(v_recipients, '{}'::uuid[]),
    case when v_priority = 'urgent' then 'feedback_follow_up' else 'feedback_received' end,
    'feedback',
    v_priority,
    v_title,
    v_body,
    '/dashboard',
    'feedback',
    new.id,
    jsonb_build_object('feedback_id', new.id, 'visit_id', new.visit_id, 'requires_follow_up', v_priority = 'urgent'),
    'feedback:' || new.id::text
  );

  return new;
end;
$$;

revoke execute on function public.notify_feedback_received() from public, anon, authenticated;

create or replace function public.notify_patient_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients uuid[];
begin
  select array_agg(distinct x.user_id) into v_recipients
  from (
    select ur.user_id
    from public.user_roles ur
    where ur.clinic_id = new.clinic_id
      and ur.role in ('admin'::public.app_role, 'receptionist'::public.app_role)
    union all
    select new.assigned_doctor
    where new.assigned_doctor is not null
  ) x;

  perform public.emit_staff_notification(
    new.clinic_id, coalesce(v_recipients, '{}'::uuid[]),
    'patient_registered', 'patient', 'information',
    'New Patient Registered',
    'A new patient has been registered in your clinic.',
    '/patient/' || new.id::text,
    'patient', new.id, '{}'::jsonb,
    'patient_registered:' || new.id::text
  );
  return new;
end;
$$;

create or replace function public.notify_visit_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients uuid[];
begin
  if not (new.status = 'completed' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'completed')) then
    return new;
  end if;

  select array_agg(distinct x.user_id) into v_recipients
  from (
    select ur.user_id
    from public.user_roles ur
    where ur.clinic_id = new.clinic_id
      and ur.role in ('admin'::public.app_role, 'receptionist'::public.app_role)
    union all select new.doctor_id where new.doctor_id is not null
    union all select new.registered_by where new.registered_by is not null
  ) x;

  perform public.emit_staff_notification(
    new.clinic_id, coalesce(v_recipients, '{}'::uuid[]),
    'visit_completed', 'patient', 'information',
    'Visit Completed',
    'A patient visit has been completed.',
    '/patient/' || new.patient_id::text,
    'visit', new.id, jsonb_build_object('patient_id', new.patient_id),
    'visit_completed:' || new.id::text
  );
  return new;
end;
$$;

create or replace function public.notify_appointment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients uuid[];
  v_type text;
  v_title text;
  v_body text;
  v_key text;
begin
  if tg_op = 'INSERT' then
    v_type := 'appointment_created';
    v_title := 'New Appointment';
    v_body := 'A new appointment has been added to the clinic schedule.';
    v_key := 'appointment:created:' || new.id::text;
  else
    v_type := case when new.status = 'cancelled' then 'appointment_cancelled' else 'appointment_updated' end;
    v_title := case when new.status = 'cancelled' then 'Appointment Cancelled' else 'Appointment Updated' end;
    v_body := case when new.status = 'cancelled'
      then 'An appointment has been cancelled.'
      else 'An appointment schedule has been updated.'
    end;
    v_key := 'appointment:update:' || new.id::text || ':' ||
      coalesce(new.appointment_date::text, '') || ':' ||
      coalesce(new.appointment_time::text, '') || ':' ||
      coalesce(new.status, '');
  end if;

  select array_agg(distinct x.user_id) into v_recipients
  from (
    select ur.user_id
    from public.user_roles ur
    where ur.clinic_id = new.clinic_id
      and ur.role in ('admin'::public.app_role, 'receptionist'::public.app_role)
    union all select new.doctor_id where new.doctor_id is not null
  ) x;

  perform public.emit_staff_notification(
    new.clinic_id, coalesce(v_recipients, '{}'::uuid[]),
    v_type, 'appointments',
    case when new.status = 'cancelled' then 'urgent' else 'attention' end,
    v_title, v_body,
    '/appointments', 'appointment', new.id,
    jsonb_build_object('patient_id', new.patient_id, 'appointment_date', new.appointment_date, 'appointment_time', new.appointment_time, 'status', new.status),
    v_key
  );
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
  v_recipients uuid[];
  v_patient_id uuid;
  v_total numeric;
begin
  select b.patient_id, b.total_amount into v_patient_id, v_total
  from public.billing b where b.id = new.billing_id;

  select array_agg(distinct ur.user_id) into v_recipients
  from public.user_roles ur
  where ur.clinic_id = new.clinic_id
    and ur.role in ('admin'::public.app_role, 'receptionist'::public.app_role);

  perform public.emit_staff_notification(
    new.clinic_id, coalesce(v_recipients, '{}'::uuid[]),
    'payment_received', 'billing', 'information',
    'Payment Received',
    'A payment has been recorded in the clinic billing system.',
    '/billing', 'payment', new.id,
    jsonb_build_object('billing_id', new.billing_id, 'patient_id', v_patient_id, 'amount', new.amount, 'total_amount', v_total),
    'payment:' || new.id::text
  );
  return new;
end;
$$;

create or replace function public.notify_hmo_claim_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients uuid[];
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select array_agg(distinct ur.user_id) into v_recipients
  from public.user_roles ur
  where ur.clinic_id = new.clinic_id
    and ur.role in ('admin'::public.app_role, 'receptionist'::public.app_role);

  perform public.emit_staff_notification(
    new.clinic_id, coalesce(v_recipients, '{}'::uuid[]),
    case when new.status in ('rejected','denied') then 'hmo_claim_attention' else 'hmo_claim_update' end,
    'hmo',
    case when new.status in ('rejected','denied') then 'urgent' else 'attention' end,
    case when new.status in ('rejected','denied') then 'HMO Claim Requires Attention' else 'HMO Claim Updated' end,
    'An HMO claim has been updated to status: ' || coalesce(new.status, 'unknown') || '.',
    '/hmos', 'hmo_claim', new.id,
    jsonb_build_object('billing_id', new.billing_id, 'patient_id', new.patient_id, 'status', new.status, 'hmo_name', new.hmo_name),
    'hmo_claim:' || new.id::text || ':' || coalesce(new.status, 'unknown')
  );
  return new;
end;
$$;

create or replace function public.notify_inventory_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients uuid[];
  v_low boolean;
  v_out boolean;
  v_expiring boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  v_out := coalesce(new.stock_quantity, 0) <= 0 and coalesce(old.stock_quantity, 0) > 0;
  v_low := coalesce(new.stock_quantity, 0) <= coalesce(nullif(new.low_stock_threshold, 0), nullif(new.min_stock, 0), 1)
           and coalesce(old.stock_quantity, 0) > coalesce(nullif(old.low_stock_threshold, 0), nullif(old.min_stock, 0), 1);
  v_expiring := new.expiry_date is not null
    and new.expiry_date <= current_date + 30
    and (old.expiry_date is null or old.expiry_date > current_date + 30);

  if not (v_out or v_low or v_expiring) then
    return new;
  end if;

  select array_agg(distinct ur.user_id) into v_recipients
  from public.user_roles ur
  where ur.clinic_id = new.clinic_id
    and ur.role in ('admin'::public.app_role, 'receptionist'::public.app_role);

  if v_out then
    perform public.emit_staff_notification(
      new.clinic_id, coalesce(v_recipients, '{}'::uuid[]),
      'inventory_out_of_stock', 'inventory', 'urgent',
      'Item Out of Stock', new.name || ' is now out of stock.',
      '/inventory', 'inventory', new.id, '{}'::jsonb,
      'inventory:out:' || new.id::text || ':' || current_date::text
    );
  elsif v_low then
    perform public.emit_staff_notification(
      new.clinic_id, coalesce(v_recipients, '{}'::uuid[]),
      'inventory_low_stock', 'inventory', 'attention',
      'Low Stock Alert', new.name || ' is low in stock.',
      '/inventory', 'inventory', new.id, jsonb_build_object('stock_quantity', new.stock_quantity),
      'inventory:low:' || new.id::text || ':' || current_date::text
    );
  end if;

  if v_expiring then
    perform public.emit_staff_notification(
      new.clinic_id, coalesce(v_recipients, '{}'::uuid[]),
      'inventory_expiring', 'inventory', 'attention',
      'Inventory Expiring Soon', new.name || ' expires within 30 days.',
      '/inventory', 'inventory', new.id, jsonb_build_object('expiry_date', new.expiry_date),
      'inventory:expiry:' || new.id::text || ':' || current_date::text
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_daily_report_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients uuid[];
begin
  select array_agg(distinct ur.user_id) into v_recipients
  from public.user_roles ur
  where ur.clinic_id = new.clinic_id
    and ur.role in ('admin'::public.app_role, 'super_admin'::public.app_role);

  perform public.emit_staff_notification(
    new.clinic_id, coalesce(v_recipients, '{}'::uuid[]),
    case when new.status = 'submitted' then 'daily_report_submitted' else 'daily_report_updated' end,
    'staff', 'attention',
    case when new.status = 'submitted' then 'Daily Report Submitted' else 'Daily Report Updated' end,
    'The front desk daily report has been ' || coalesce(new.status, 'updated') || '.',
    '/reports/daily-front-desk', 'daily_front_desk_report', new.id,
    jsonb_build_object('report_date', new.report_date, 'status', new.status),
    'daily-report:' || new.id::text || ':' || coalesce(new.status, 'updated')
  );
  return new;
end;
$$;

create or replace function public.notify_system_incident_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients uuid[];
  v_priority text;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.occurrence_count is not distinct from old.occurrence_count
     and new.severity is not distinct from old.severity then
    return new;
  end if;

  select array_agg(distinct ur.user_id) into v_recipients
  from public.user_roles ur
  where ur.role = 'super_admin'::public.app_role;

  v_priority := case
    when new.severity = 'critical' then 'urgent'
    when new.severity = 'warning' then 'attention'
    else 'information'
  end;

  perform public.emit_staff_notification(
    new.clinic_id, coalesce(v_recipients, '{}'::uuid[]),
    'system_incident', 'system', v_priority,
    case when new.status = 'resolved' then 'System Issue Resolved' else 'System Issue Detected' end,
    case when new.status = 'resolved'
      then 'A system incident has been marked resolved.'
      else 'OptoCare detected a system issue that may require attention.'
    end,
    '/super-admin/system-health', 'system_incident', new.id,
    jsonb_build_object('severity', new.severity, 'status', new.status, 'occurrence_count', new.occurrence_count, 'page_name', new.page_name),
    'incident:' || new.id::text || ':' || current_date::text || ':' || coalesce(new.status, 'open')
  );
  return new;
end;
$$;

create or replace function public.notify_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients uuid[];
  v_type text;
  v_title text;
  v_body text;
begin
  if tg_op = 'DELETE' then
    v_type := 'access_revoked';
    v_title := 'Clinic Access Removed';
    v_body := 'Your access to a clinic workspace has been removed.';
  elsif tg_op = 'INSERT' then
    v_type := 'access_granted';
    v_title := 'Clinic Access Added';
    v_body := 'You have been granted access to a clinic workspace.';
  else
    v_type := 'role_changed';
    v_title := 'Clinic Role Updated';
    v_body := 'Your role in a clinic workspace has been updated.';
  end if;

  select array_agg(distinct x.user_id) into v_recipients
  from (
    select coalesce(new.user_id, old.user_id) as user_id
    union all
    select ur.user_id from public.user_roles ur
    where ur.clinic_id = coalesce(new.clinic_id, old.clinic_id)
      and ur.role = 'admin'::public.app_role
      and ur.user_id <> coalesce(new.user_id, old.user_id)
  ) x;

  perform public.emit_staff_notification(
    coalesce(new.clinic_id, old.clinic_id),
    coalesce(v_recipients, '{}'::uuid[]),
    v_type, 'staff', case when tg_op = 'DELETE' then 'urgent' else 'information' end,
    v_title, v_body,
    '/admin/roles', 'user_role', coalesce(new.id, old.id),
    jsonb_build_object('user_id', coalesce(new.user_id, old.user_id), 'role', coalesce(new.role::text, old.role::text)),
    'role:' || coalesce(new.id, old.id)::text || ':' || tg_op
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_patient_registered_notification on public.patients;
create trigger trg_patient_registered_notification
after insert on public.patients
for each row execute function public.notify_patient_registered();

drop trigger if exists trg_visit_completed_notification on public.visits;
create trigger trg_visit_completed_notification
after insert or update of status on public.visits
for each row execute function public.notify_visit_completed();

drop trigger if exists trg_appointment_notification on public.appointments;
create trigger trg_appointment_notification
after insert or update of appointment_date, appointment_time, doctor_id, status on public.appointments
for each row execute function public.notify_appointment_event();

drop trigger if exists trg_payment_received_notification on public.payments;
create trigger trg_payment_received_notification
after insert on public.payments
for each row execute function public.notify_payment_received();

drop trigger if exists trg_hmo_claim_notification on public.hmo_claims;
create trigger trg_hmo_claim_notification
after insert or update of status on public.hmo_claims
for each row execute function public.notify_hmo_claim_event();

drop trigger if exists trg_inventory_notification on public.inventory;
create trigger trg_inventory_notification
after update of stock_quantity, low_stock_threshold, min_stock, expiry_date on public.inventory
for each row execute function public.notify_inventory_event();

drop trigger if exists trg_daily_report_notification on public.daily_front_desk_reports;
create trigger trg_daily_report_notification
after insert or update of status on public.daily_front_desk_reports
for each row execute function public.notify_daily_report_event();

drop trigger if exists trg_system_incident_notification on public.system_incidents;
create trigger trg_system_incident_notification
after insert or update of status, severity, occurrence_count on public.system_incidents
for each row execute function public.notify_system_incident_event();

drop trigger if exists trg_role_change_notification on public.user_roles;
create trigger trg_role_change_notification
after insert or update or delete on public.user_roles
for each row execute function public.notify_role_change();

revoke execute on function public.notify_patient_registered() from public, anon, authenticated;
revoke execute on function public.notify_visit_completed() from public, anon, authenticated;
revoke execute on function public.notify_appointment_event() from public, anon, authenticated;
revoke execute on function public.notify_payment_received() from public, anon, authenticated;
revoke execute on function public.notify_hmo_claim_event() from public, anon, authenticated;
revoke execute on function public.notify_inventory_event() from public, anon, authenticated;
revoke execute on function public.notify_daily_report_event() from public, anon, authenticated;
revoke execute on function public.notify_system_incident_event() from public, anon, authenticated;
revoke execute on function public.notify_role_change() from public, anon, authenticated;
