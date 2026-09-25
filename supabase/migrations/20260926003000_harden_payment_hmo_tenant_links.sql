-- Enforce same-clinic ownership for financial records.
-- Existing data was checked first: no null clinic IDs or cross-clinic references.

create unique index if not exists billing_id_clinic_unique
  on public.billing (id, clinic_id);

create unique index if not exists hmos_id_clinic_unique
  on public.hmos (id, clinic_id);

create unique index if not exists patients_id_clinic_unique
  on public.patients (id, clinic_id);

alter table public.payments
  drop constraint if exists payments_billing_id_clinic_fkey;
alter table public.payments
  add constraint payments_billing_id_clinic_fkey
  foreign key (billing_id, clinic_id)
  references public.billing (id, clinic_id);

alter table public.hmo_claims
  drop constraint if exists hmo_claims_billing_id_clinic_fkey;
alter table public.hmo_claims
  add constraint hmo_claims_billing_id_clinic_fkey
  foreign key (billing_id, clinic_id)
  references public.billing (id, clinic_id);

alter table public.hmo_claims
  drop constraint if exists hmo_claims_hmo_id_clinic_fkey;
alter table public.hmo_claims
  add constraint hmo_claims_hmo_id_clinic_fkey
  foreign key (hmo_id, clinic_id)
  references public.hmos (id, clinic_id);

alter table public.hmo_claims
  drop constraint if exists hmo_claims_patient_id_clinic_fkey;
alter table public.hmo_claims
  add constraint hmo_claims_patient_id_clinic_fkey
  foreign key (patient_id, clinic_id)
  references public.patients (id, clinic_id);
