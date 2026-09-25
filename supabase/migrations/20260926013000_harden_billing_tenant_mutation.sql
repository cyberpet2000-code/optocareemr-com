-- Enforce billing tenant ownership at the row level.
create or replace function public.guard_billing_tenant_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if public.is_super_admin(auth.uid()) then
    return new;
  end if;

  if new.clinic_id is null or new.clinic_id <> public.current_clinic_id() then
    raise exception 'Billing record must belong to the active clinic';
  end if;

  if tg_op = 'UPDATE' and old.clinic_id <> new.clinic_id then
    raise exception 'Billing clinic cannot be changed';
  end if;

  if not (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'receptionist')
  ) then
    raise exception 'Not authorized to modify billing';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_billing_tenant_mutation on public.billing;
create trigger trg_guard_billing_tenant_mutation
before insert or update on public.billing
for each row
execute function public.guard_billing_tenant_mutation();

create unique index if not exists billing_id_clinic_unique
  on public.billing (id, clinic_id);

create unique index if not exists patients_id_clinic_unique
  on public.patients (id, clinic_id);

create unique index if not exists visits_id_clinic_unique
  on public.visits (id, clinic_id);

create unique index if not exists hmos_id_clinic_unique
  on public.hmos (id, clinic_id);

alter table public.billing
  drop constraint if exists billing_patient_id_clinic_fkey;
alter table public.billing
  add constraint billing_patient_id_clinic_fkey
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id);

alter table public.billing
  drop constraint if exists billing_visit_id_clinic_fkey;
alter table public.billing
  add constraint billing_visit_id_clinic_fkey
  foreign key (visit_id, clinic_id) references public.visits(id, clinic_id);

alter table public.billing
  drop constraint if exists billing_hmo_id_clinic_fkey;
alter table public.billing
  add constraint billing_hmo_id_clinic_fkey
  foreign key (hmo_id, clinic_id) references public.hmos(id, clinic_id);
