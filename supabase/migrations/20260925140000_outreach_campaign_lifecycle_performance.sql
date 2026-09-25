-- Outreach campaign lifecycle, attribution, and performance tracking
alter table public.appointments
  add column if not exists outreach_campaign_id uuid references public.outreach_campaigns(id);

alter table public.outreach_leads
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists converted_by uuid references auth.users(id);

create index if not exists idx_appointments_outreach_campaign
  on public.appointments(outreach_campaign_id)
  where outreach_campaign_id is not null;

create index if not exists idx_outreach_recipients_campaign_status
  on public.outreach_recipients(campaign_id, status);

create index if not exists idx_outreach_recipients_campaign_lead
  on public.outreach_recipients(campaign_id, lead_id)
  where lead_id is not null;

create index if not exists idx_outreach_leads_campaign_status
  on public.outreach_leads(campaign_id, status);
