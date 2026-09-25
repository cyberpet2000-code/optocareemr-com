-- Enforce same-clinic patient relationships for family and HMO enrollment.

create unique index if not exists families_id_clinic_unique
  on public.families (id, clinic_id);

create unique index if not exists hmo_plans_id_hmo_clinic_unique
  on public.hmo_plans (id, hmo_id, clinic_id);

alter table public.patients
  drop constraint if exists patients_family_id_clinic_fkey;
alter table public.patients
  add constraint patients_family_id_clinic_fkey
  foreign key (family_id, clinic_id)
  references public.families (id, clinic_id);

alter table public.patients
  drop constraint if exists patients_active_hmo_id_clinic_fkey;
alter table public.patients
  add constraint patients_active_hmo_id_clinic_fkey
  foreign key (active_hmo_id, clinic_id)
  references public.hmos (id, clinic_id);

alter table public.patients
  drop constraint if exists patients_active_hmo_plan_same_hmo_clinic_fkey;
alter table public.patients
  add constraint patients_active_hmo_plan_same_hmo_clinic_fkey
  foreign key (active_hmo_plan_id, active_hmo_id, clinic_id)
  references public.hmo_plans (id, hmo_id, clinic_id);
