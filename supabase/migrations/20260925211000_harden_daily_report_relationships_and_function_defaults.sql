-- Tenant-integrity hardening for daily front-desk report items.
--
-- The RPC already checks the report and patient clinic. These composite
-- foreign keys make the same relationship a database invariant, so a caller
-- cannot pair an HMO or visit from another clinic with this clinic's report.
--
-- Also stop new public-schema functions from automatically receiving
-- EXECUTE via PUBLIC/anon/authenticated. Existing function grants are not
-- changed by this default-privilege change; future RPCs must explicitly
-- grant the roles that need them.

create unique index if not exists hmos_id_clinic_unique
  on public.hmos (id, clinic_id);

create unique index if not exists visits_id_patient_clinic_unique
  on public.visits (id, patient_id, clinic_id);

alter table public.daily_front_desk_report_items
  drop constraint if exists daily_front_desk_report_items_hmo_clinic_fkey,
  drop constraint if exists daily_front_desk_report_items_visit_patient_clinic_fkey;

alter table public.daily_front_desk_report_items
  add constraint daily_front_desk_report_items_hmo_clinic_fkey
    foreign key (hmo_id, clinic_id)
    references public.hmos (id, clinic_id);

alter table public.daily_front_desk_report_items
  add constraint daily_front_desk_report_items_visit_patient_clinic_fkey
    foreign key (visit_id, patient_id, clinic_id)
    references public.visits (id, patient_id, clinic_id);

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
