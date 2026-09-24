-- Fix feedback notifications: explicitly target the single-recipient
-- emit_staff_notification overload and backfill feedback that arrived before
-- the notification trigger was functioning.
create or replace function public.notify_feedback_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_priority text;
  v_title text;
  v_body text;
begin
  v_priority := case
    when coalesce(new.requires_follow_up, false) or coalesce(new.wants_follow_up, false)
      then 'attention'
    else 'information'
  end;

  v_title := case
    when v_priority = 'attention' then 'Feedback needs attention'
    else 'New patient feedback'
  end;

  v_body := case
    when v_priority = 'attention'
      then 'A patient feedback response requires follow-up.'
    else 'A new patient feedback response has been received.'
  end;

  for r in
    select distinct recipient_user_id
    from (
      select cu.user_id as recipient_user_id
      from public.clinic_users cu
      where cu.clinic_id = new.clinic_id
        and cu.role::text in ('admin', 'receptionist')
      union
      select ur.user_id
      from public.user_roles ur
      where ur.clinic_id = new.clinic_id
        and ur.role::text in ('admin', 'receptionist')
      union
      select new.doctor_id
      where new.doctor_id is not null
      union
      select v.registered_by
      from public.visits v
      where v.id = new.visit_id
        and v.registered_by is not null
    ) recipients
    where recipient_user_id is not null
  loop
    perform public.emit_staff_notification(
      p_clinic_id => new.clinic_id,
      p_recipient_user_id => r.recipient_user_id,
      p_notification_type => case when v_priority = 'attention' then 'feedback_follow_up' else 'feedback_received' end,
      p_category => 'feedback',
      p_priority => v_priority,
      p_title => v_title,
      p_body => v_body,
      p_link => '/dashboard',
      p_entity_type => 'feedback_response',
      p_entity_id => new.id,
      p_dedupe_key => 'feedback:' || new.id::text
    );
  end loop;

  return new;
end;
$$;

-- Backfill existing feedback responses that do not yet have a notification.
do $$
declare
  f record;
  r record;
  v_priority text;
  v_title text;
  v_body text;
begin
  for f in
    select fr.id, fr.clinic_id, fr.visit_id, fr.doctor_id,
           fr.requires_follow_up, fr.wants_follow_up
    from public.feedback_responses fr
    where not exists (
      select 1 from public.staff_notifications sn
      where sn.entity_type = 'feedback_response' and sn.entity_id = fr.id
    )
  loop
    v_priority := case when coalesce(f.requires_follow_up, false) or coalesce(f.wants_follow_up, false) then 'attention' else 'information' end;
    v_title := case when v_priority = 'attention' then 'Feedback needs attention' else 'New patient feedback' end;
    v_body := case when v_priority = 'attention' then 'A patient feedback response requires follow-up.' else 'A new patient feedback response has been received.' end;

    for r in
      select distinct recipient_user_id
      from (
        select cu.user_id as recipient_user_id
        from public.clinic_users cu
        where cu.clinic_id = f.clinic_id and cu.role::text in ('admin', 'receptionist')
        union
        select ur.user_id
        from public.user_roles ur
        where ur.clinic_id = f.clinic_id and ur.role::text in ('admin', 'receptionist')
        union
        select f.doctor_id
        where f.doctor_id is not null
        union
        select v.registered_by
        from public.visits v
        where v.id = f.visit_id and v.registered_by is not null
      ) recipients
      where recipient_user_id is not null
    loop
      perform public.emit_staff_notification(
        p_clinic_id => f.clinic_id,
        p_recipient_user_id => r.recipient_user_id,
        p_notification_type => case when v_priority = 'attention' then 'feedback_follow_up' else 'feedback_received' end,
        p_category => 'feedback',
        p_priority => v_priority,
        p_title => v_title,
        p_body => v_body,
        p_link => '/dashboard',
        p_entity_type => 'feedback_response',
        p_entity_id => f.id,
        p_dedupe_key => 'feedback:' || f.id::text
      );
    end loop;
  end loop;
end;
$$;