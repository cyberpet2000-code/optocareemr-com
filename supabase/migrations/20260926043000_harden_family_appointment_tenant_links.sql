-- Enforce same-clinic ownership for families and appointments.

create unique index if not exists patients_id_clinic_unique
  on public.patients (id, clinic_id);

create unique index if not exists outreach_leads_id_clinic_unique
  on public.outreach_leads (id, clinic_id);

create unique index if not exists visits_id_clinic_unique
  on public.visits (id, clinic_id);

alter table public.families
  drop constraint if exists families_primary_patient_id_clinic_fkey;
alter table public.families
  add constraint families_primary_patient_id_clinic_fkey
  foreign key (primary_patient_id, clinic_id)
  references public.patients (id, clinic_id);

alter table public.appointments
  drop constraint if exists appointments_patient_id_clinic_fkey;
alter table public.appointments
  add constraint appointments_patient_id_clinic_fkey
  foreign key (patient_id, clinic_id)
  references public.patients (id, clinic_id);

alter table public.appointments
  drop constraint if exists appointments_visit_id_clinic_fkey;
alter table public.appointments
  add constraint appointments_visit_id_clinic_fkey
  foreign key (visit_id, clinic_id)
  references public.visits (id, clinic_id);

alter table public.appointments
  drop constraint if exists appointments_outreach_lead_id_clinic_fkey;
alter table public.appointments
  add constraint appointments_outreach_lead_id_clinic_fkey
  foreign key (outreach_lead_id, clinic_id)
  references public.outreach_leads (id, clinic_id);
