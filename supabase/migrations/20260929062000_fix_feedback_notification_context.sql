-- Fix feedback notifications: route directly to the patient and include actionable context.
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
    'Patient feedback received for ' || coalesce((select p.full_name from public.patients p where p.id = new.patient_id), 'a patient') ||
      case when v_priority = 'urgent' then '. Follow-up has been requested.' else '.' end,
    '/patient/' || new.patient_id::text,
    'feedback',
    new.id,
    jsonb_build_object(
      'feedback_id', new.id,
      'visit_id', new.visit_id,
      'patient_id', new.patient_id,
      'doctor_id', new.doctor_id,
      'overall_rating', new.overall_rating,
      'doctor_rating', new.doctor_rating,
      'front_desk_rating', new.front_desk_rating,
      'eye_exam_rating', new.eye_exam_rating,
      'service_rating', new.service_rating,
      'requires_follow_up', v_priority = 'urgent',
      'positive_feedback', new.positive_feedback,
      'improvement_feedback', new.improvement_feedback,
      'follow_up_notes', new.follow_up_notes,
      'submitted_at', new.submitted_at
    ),
    'feedback:' || new.id::text
  );

  return new;
end;
$$;

