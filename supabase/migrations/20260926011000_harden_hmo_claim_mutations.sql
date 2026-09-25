-- Tighten HMO claim mutation authority and financial integrity.

alter table public.hmo_claims
  drop constraint if exists hmo_claims_service_cost_nonnegative;
alter table public.hmo_claims
  add constraint hmo_claims_service_cost_nonnegative
  check (service_cost >= 0);

alter table public.hmo_claims
  drop constraint if exists hmo_claims_approved_amount_nonnegative;
alter table public.hmo_claims
  add constraint hmo_claims_approved_amount_nonnegative
  check (approved_amount >= 0);

alter table public.hmo_claims
  drop constraint if exists hmo_claims_co_payment_nonnegative;
alter table public.hmo_claims
  add constraint hmo_claims_co_payment_nonnegative
  check (co_payment >= 0);

alter table public.hmo_claims
  drop constraint if exists hmo_claims_approved_plus_copay_not_over_service;
alter table public.hmo_claims
  add constraint hmo_claims_approved_plus_copay_not_over_service
  check (approved_amount + co_payment <= service_cost);

alter table public.hmo_claims
  drop constraint if exists hmo_claims_request_status_check;
alter table public.hmo_claims
  add constraint hmo_claims_request_status_check
  check (hmo_request_status in ('Not sent','Sent','Pending Response','Response Received','Approved','Rejected','Resubmission Required'));

alter table public.hmo_claims
  drop constraint if exists hmo_claims_response_status_check;
alter table public.hmo_claims
  add constraint hmo_claims_response_status_check
  check (claim_response_status in ('Pending','Received','Approved','Rejected','Query','Other'));

alter table public.hmo_claims
  drop constraint if exists hmo_claims_status_check;
alter table public.hmo_claims
  add constraint hmo_claims_status_check
  check (status in ('Not sent','Sent','Pending Response','Response Received','Approved','Rejected','Resubmission Required','Pending'));

create or replace function public.guard_hmo_claim_financial_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if public.is_super_admin(auth.uid()) or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  if not (
    public.has_role(auth.uid(), 'receptionist')
    and new.clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(new.clinic_id)
  ) then
    raise exception 'Not authorized to manage HMO claims for this clinic';
  end if;

  if tg_op = 'INSERT' then
    if new.approved_amount <> 0 or new.co_payment <> 0 then
      raise exception 'Reception staff cannot set approved or co-payment amounts';
    end if;
    return new;
  end if;

  if new.clinic_id is distinct from old.clinic_id
     or new.billing_id is distinct from old.billing_id
     or new.hmo_id is distinct from old.hmo_id
     or new.patient_id is distinct from old.patient_id
     or new.hmo_name is distinct from old.hmo_name
     or new.service_cost is distinct from old.service_cost
     or new.approved_amount is distinct from old.approved_amount
     or new.co_payment is distinct from old.co_payment then
    raise exception 'Only administrators can change HMO claim financial or ownership fields';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_hmo_claim_financial_mutation on public.hmo_claims;
create trigger trg_guard_hmo_claim_financial_mutation
before insert or update on public.hmo_claims
for each row
execute function public.guard_hmo_claim_financial_mutation();

drop policy if exists clinic_insert_hmo_claims on public.hmo_claims;
create policy clinic_insert_hmo_claims
on public.hmo_claims
for insert to authenticated
with check (
  public.is_super_admin(auth.uid())
  or (
    (public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'receptionist'))
    and clinic_id = public.current_clinic_id()
    and public.lifecycle_allows_access(clinic_id)
  )
);
