-- Feedback follow-up tasks should represent an explicit request for contact.
-- Ratings/comments remain feedback signals, but do not create a staff follow-up task by themselves.

create or replace function public.create_feedback_followup(p_feedback_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_feedback public.feedback_responses%rowtype;
  v_followup_id uuid;
  v_reason text;
begin
  select * into v_feedback
  from public.feedback_responses
  where id = p_feedback_response_id;

  if not found then
    raise exception 'Feedback response not found';
  end if;

  if coalesce(v_feedback.wants_follow_up, false) = false then
    return null;
  end if;

  v_reason := 'Patient requested follow-up.';
  if v_feedback.follow_up_notes is not null
     and length(trim(v_feedback.follow_up_notes)) > 0 then
    v_reason := v_reason || ' ' || trim(v_feedback.follow_up_notes);
  end if;
  if v_feedback.what_can_improve is not null
     and length(trim(v_feedback.what_can_improve)) > 0 then
    v_reason := v_reason || ' Patient provided improvement feedback.';
  end if;

  select id into v_followup_id
  from public.feedback_followups
  where feedback_response_id = p_feedback_response_id
  limit 1;

  if v_followup_id is not null then
    return v_followup_id;
  end if;

  insert into public.feedback_followups (
    clinic_id, patient_id, visit_id, feedback_request_id,
    feedback_response_id, reason, status
  )
  values (
    v_feedback.clinic_id, v_feedback.patient_id, v_feedback.visit_id,
    v_feedback.feedback_request_id, p_feedback_response_id,
    trim(v_reason), 'pending'
  )
  returning id into v_followup_id;

  return v_followup_id;
end;
$function$;

create or replace function public.trigger_create_feedback_followup()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if coalesce(new.wants_follow_up, false) = true then
    perform public.create_feedback_followup(new.id);
  end if;
  return new;
end;
$function$;

update public.feedback_followups ff
set status = 'cancelled',
    notes = case
      when nullif(trim(coalesce(ff.notes, '')), '') is null
        then 'Automatically closed: patient did not request follow-up.'
      else ff.notes || E'\nAutomatically closed: patient did not request follow-up.'
    end,
    completed_at = coalesce(ff.completed_at, now())
from public.feedback_responses fr
where fr.id = ff.feedback_response_id
  and coalesce(fr.wants_follow_up, false) = false
  and ff.status in ('pending', 'in_progress');