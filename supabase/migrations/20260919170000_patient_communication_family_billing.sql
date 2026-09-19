-- Patient communication, family grouping, and general billing discounts.
alter table public.patients
  add column if not exists preferred_contact_method text not null default 'whatsapp',
  add column if not exists family_id uuid,
  add column if not exists family_relationship text;

alter table public.patients
  drop constraint if exists patients_preferred_contact_method_check;
alter table public.patients
  add constraint patients_preferred_contact_method_check
  check (preferred_contact_method in ('whatsapp','phone','sms','email','none'));

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  family_number text not null,
  family_name text not null,
  primary_patient_id uuid references public.patients(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, family_number)
);

alter table public.families enable row level security;
drop policy if exists families_select on public.families;
drop policy if exists families_insert on public.families;
drop policy if exists families_update on public.families;
drop policy if exists families_delete on public.families;

create policy families_select on public.families for select using
(is_super_admin(auth.uid()) or (clinic_id = current_clinic_id() and lifecycle_allows_access(clinic_id)));
create policy families_insert on public.families for insert with check
(is_super_admin(auth.uid()) or (clinic_id = current_clinic_id() and lifecycle_allows_access(clinic_id)));
create policy families_update on public.families for update using
(is_super_admin(auth.uid()) or (clinic_id = current_clinic_id() and lifecycle_allows_access(clinic_id)))
with check
(is_super_admin(auth.uid()) or (clinic_id = current_clinic_id() and lifecycle_allows_access(clinic_id)));
create policy families_delete on public.families for delete using
(is_super_admin(auth.uid()) or (clinic_id = current_clinic_id() and lifecycle_allows_access(clinic_id)));

alter table public.patients
  drop constraint if exists patients_family_id_fkey;
alter table public.patients
  add constraint patients_family_id_fkey
  foreign key (family_id) references public.families(id) on delete set null;

alter table public.billing
  add column if not exists family_id uuid,
  add column if not exists billing_scope text not null default 'individual',
  add column if not exists discount_amount numeric not null default 0,
  add column if not exists discount_reason text,
  add column if not exists discount_applied_by uuid;

alter table public.billing
  drop constraint if exists billing_billing_scope_check;
alter table public.billing
  add constraint billing_billing_scope_check check (billing_scope in ('individual','family'));
alter table public.billing
  drop constraint if exists billing_discount_nonnegative;
alter table public.billing
  add constraint billing_discount_nonnegative check (discount_amount >= 0);
alter table public.billing
  drop constraint if exists billing_family_id_fkey;
alter table public.billing
  add constraint billing_family_id_fkey foreign key (family_id) references public.families(id) on delete set null;
alter table public.billing
  drop constraint if exists billing_discount_applied_by_fkey;
alter table public.billing
  add constraint billing_discount_applied_by_fkey foreign key (discount_applied_by) references public.profiles(id) on delete set null;

create index if not exists idx_patients_family_id on public.patients(family_id);
create index if not exists idx_families_clinic_id on public.families(clinic_id);
create index if not exists idx_billing_family_id on public.billing(family_id);

create or replace function public.recalculate_billing_totals(p_billing_id uuid)
returns void language plpgsql security definer set search_path = public
as $function$
declare
  v_items numeric := 0;
  v_paid numeric := 0;
  v_consult numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
begin
  select coalesce(sum(total_price),0) into v_items from billing_items where billing_id = p_billing_id;
  select coalesce(sum(amount),0) into v_paid from payments where billing_id = p_billing_id;
  select coalesce(consultation_fee,0), coalesce(discount_amount,0)
    into v_consult, v_discount from billing where id = p_billing_id;

  v_discount := greatest(0, least(v_discount, v_consult + v_items));
  v_total := greatest(v_consult + v_items - v_discount, 0);

  update billing
    set items_total = v_items,
        discount_amount = v_discount,
        total_amount = v_total,
        amount_paid = v_paid,
        balance = greatest(v_total - v_paid,0),
        status = case
          when v_total = 0 then 'draft'
          when v_paid = 0 then 'pending'
          when v_paid >= v_total then 'paid'
          else 'partial'
        end
    where id = p_billing_id;
end;
$function$;

drop trigger if exists trg_billing_discount_recalc on public.billing;
create or replace function public.billing_discount_changed()
returns trigger language plpgsql security definer set search_path = public
as $function$
begin
  if pg_trigger_depth() = 1 then
    perform recalculate_billing_totals(new.id);
  end if;
  return new;
end;
$function$;

create trigger trg_billing_discount_recalc
after update of discount_amount on public.billing
for each row when (old.discount_amount is distinct from new.discount_amount)
execute function public.billing_discount_changed();

create or replace function public.set_family_updated_at()
returns trigger language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists trg_families_updated on public.families;
create trigger trg_families_updated before update on public.families
for each row execute function public.set_family_updated_at();
