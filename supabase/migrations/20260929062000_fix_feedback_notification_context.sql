-- Feedback notifications: keep the inbox minimal and route directly to the patient record.
-- The Patient Record / Feedback Report remains the source of detailed feedback information.
create or replace function public.notify_feedback_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_priority text := case
    when coalesce(new.requires_follow_up, false) or coalesce(new.wants_follow_up, false) then 'urgent'
    else 'attention'
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
    'feedback_received',
    'feedback',
    v_priority,
    'New Patient Feedback',
    'New patient feedback has been received for your clinic.',
    '/patient/' || new.patient_id::text,
    'feedback',
    new.id,
    jsonb_build_object(
      'feedback_id', new.id,
      'visit_id', new.visit_id,
      'patient_id', new.patient_id
    ),
    'feedback:' || new.id::text
  );

  return new;
end;
$$;

revoke all on function public.notify_feedback_received() from public;
