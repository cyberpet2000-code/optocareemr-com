-- Keep Outreach lead progression aligned with appointment attendance.
-- Completing an appointment linked to an Outreach lead marks the lead as attended,
-- but never converts the lead into a patient automatically.

create or replace function public.sync_outreach_lead_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.outreach_lead_id is null then
    return new;
  end if;

  if new.status = 'completed'
     and (old.status is distinct from 'completed') then
    update public.outreach_leads
       set status = case when status = 'converted' then status else 'attended' end,
           next_follow_up_at = case when status = 'converted' then next_follow_up_at else null end,
           updated_at = now()
     where id = new.outreach_lead_id
       and clinic_id = new.clinic_id
       and status <> 'lost';
  elsif new.status in ('cancelled', 'missed')
        and old.status is distinct from new.status then
    update public.outreach_leads
       set status = case
         when status in ('converted', 'lost') then status
         else 'follow_up'
       end,
           next_follow_up_at = case
             when status in ('converted', 'lost') then next_follow_up_at
             else null
           end,
           updated_at = now()
     where id = new.outreach_lead_id
       and clinic_id = new.clinic_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_outreach_lead_from_appointment on public.appointments;
create trigger trg_sync_outreach_lead_from_appointment
after update of status on public.appointments
for each row
execute function public.sync_outreach_lead_from_appointment();

-- Also cover an appointment inserted already as completed.
drop trigger if exists trg_sync_outreach_lead_from_completed_appointment on public.appointments;
create trigger trg_sync_outreach_lead_from_completed_appointment
after insert on public.appointments
for each row
when (new.status = 'completed' and new.outreach_lead_id is not null)
execute function public.sync_outreach_lead_from_appointment();
