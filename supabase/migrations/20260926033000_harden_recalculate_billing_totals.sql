-- Harden the client-callable billing total recalculation RPC.
create or replace function public.recalculate_billing_totals(p_billing_id uuid)
returns void language plpgsql security definer set search_path = public
as $function$
declare
  v_items numeric := 0;
  v_paid numeric := 0;
  v_consult numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_clinic_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select clinic_id, coalesce(consultation_fee,0), coalesce(discount_amount,0)
    into v_clinic_id, v_consult, v_discount
  from public.billing
  where id = p_billing_id
  for update;

  if not found then
    raise exception 'Billing record not found';
  end if;

  if not (
    public.is_super_admin(auth.uid())
    or (
      (public.has_role(auth.uid(), 'admin')
       or public.has_role(auth.uid(), 'receptionist'))
      and v_clinic_id = public.current_clinic_id()
      and public.lifecycle_allows_access(v_clinic_id)
    )
  ) then
    raise exception 'Not authorized to recalculate this billing record';
  end if;

  select coalesce(sum(total_price),0)
    into v_items
  from public.billing_items
  where billing_id = p_billing_id
    and clinic_id = v_clinic_id;

  select coalesce(sum(amount),0)
    into v_paid
  from public.payments
  where billing_id = p_billing_id
    and clinic_id = v_clinic_id;

  v_discount := greatest(0, least(v_discount, v_consult + v_items));
  v_total := greatest(v_consult + v_items - v_discount, 0);

  update public.billing
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
    where id = p_billing_id
      and clinic_id = v_clinic_id;
end;
$function$;

revoke all on function public.recalculate_billing_totals(uuid) from public, anon;
grant execute on function public.recalculate_billing_totals(uuid) to authenticated, service_role;
