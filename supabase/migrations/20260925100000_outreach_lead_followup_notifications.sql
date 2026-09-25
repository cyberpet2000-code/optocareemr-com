-- Lead follow-up notifications for OptoCare Outreach.
-- Leads remain leads until an explicit clinic conversion to a patient.

create index if not exists idx_outreach_leads_followup
  on public.outreach_leads(clinic_id, next_follow_up_at)
  where next_follow_up_at is not null;

create or replace function public.create_due_outreach_followup_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  insert into public.staff_notifications (
    clinic_id,
    recipient_user_id,
    notification_type,
    title,
    body,
    link,
    metadata,
    category,
    priority,
    entity_type,
    entity_id,
    dedupe_key,
    expires_at
  )
  select
    l.clinic_id,
    ur.user_id,
    'outreach_lead_followup_due',
    'Lead follow-up due',
    coalesce(l.full_name, 'Unnamed lead') || ' is due for follow-up.',
    '/outreach',
    jsonb_build_object(
      'lead_id', l.id,
      'lead_name', l.full_name,
      'lead_phone', l.phone,
      'follow_up_at', l.next_follow_up_at
    ),
    'patient',
    'attention',
    'outreach_lead',
    l.id,
    'outreach_followup:' || l.id::text || ':' || to_char(l.next_follow_up_at at time zone 'Africa/Lagos', 'YYYY-MM-DD-HH24-MI'),
    now() + interval '2 days'
  from public.outreach_leads l
  join public.user_roles ur
    on ur.clinic_id = l.clinic_id
   and ur.role::text in ('admin', 'super_admin', 'doctor', 'receptionist')
  where l.next_follow_up_at is not null
    and l.next_follow_up_at <= now()
    and l.next_follow_up_at > now() - interval '7 days'
    and l.status not in ('converted', 'lost')
    and not exists (
      select 1
      from public.staff_notifications sn
      where sn.clinic_id = l.clinic_id
        and sn.recipient_user_id = ur.user_id
        and sn.dedupe_key =
          'outreach_followup:' || l.id::text || ':' ||
          to_char(l.next_follow_up_at at time zone 'Africa/Lagos', 'YYYY-MM-DD-HH24-MI')
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Run every 15 minutes so a due follow-up produces a notification without
-- requiring the clinic staff to have Outreach open.
select cron.schedule(
  'outreach-lead-followups',
  '*/15 * * * *',
  $$select public.create_due_outreach_followup_notifications();$$
)
where not exists (
  select 1 from cron.job where jobname = 'outreach-lead-followups'
);
