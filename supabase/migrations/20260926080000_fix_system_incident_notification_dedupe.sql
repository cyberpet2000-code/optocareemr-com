-- Prevent repeated browser spam from one incident's occurrence-count changes.
-- A system incident should notify once when it opens, and once when it resolves.
create or replace function public.notify_system_incident_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients uuid[];
  v_priority text;
  v_key text;
begin
  -- Do not notify again merely because occurrence_count changes.
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.severity is not distinct from old.severity then
    return new;
  end if;

  select array_agg(distinct ur.user_id) into v_recipients
  from public.user_roles ur
  where ur.role = 'super_admin'::public.app_role;

  v_priority := case
    when lower(coalesce(new.severity,'')) in ('critical','urgent') then 'urgent'
    when lower(coalesce(new.severity,'')) in ('warning','high','error') then 'attention'
    else 'information'
  end;

  v_key := 'incident:' || new.id::text || ':' || coalesce(new.status,'open');

  perform public.emit_staff_notification(
    new.clinic_id, coalesce(v_recipients, '{}'::uuid[]),
    case when new.status = 'resolved' then 'system_restored' else 'system_incident' end,
    'system', v_priority,
    case when new.status = 'resolved' then 'System Issue Resolved' else 'System Issue Detected' end,
    case when new.status = 'resolved'
      then 'A system incident has been marked resolved.'
      else 'OptoCare detected a system issue that may require attention.'
    end,
    '/super-admin/system-health', 'system_incident', new.id,
    jsonb_build_object(
      'severity', new.severity,
      'status', new.status,
      'occurrence_count', new.occurrence_count,
      'page_name', new.page_name
    ),
    v_key
  );
  return new;
end;
$$;
