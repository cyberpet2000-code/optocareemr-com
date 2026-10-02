create or replace function public.update_daily_front_desk_expense(
  p_expense_id uuid,
  p_description text,
  p_amount numeric,
  p_payment_method text,
  p_paid_to text default null,
  p_remarks text default null
)
returns public.daily_front_desk_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.daily_front_desk_expenses;
  v_report public.daily_front_desk_reports;
begin
  select * into v_expense from public.daily_front_desk_expenses where id = p_expense_id;
  if not found then raise exception 'Expenditure not found'; end if;

  select * into v_report from public.daily_front_desk_reports where id = v_expense.report_id;
  if not found then raise exception 'Daily report not found'; end if;

  if not (
    exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_super_admin=true and p.is_active=true)
    or (
      public.lifecycle_allows_access(v_report.clinic_id)
      and exists (
        select 1 from public.profiles p
        join public.user_clinic_memberships m on m.user_id=p.id and m.clinic_id=v_report.clinic_id and m.is_active=true
        where p.id=auth.uid() and p.is_active=true and lower(p.role) in ('receptionist','admin')
      )
    )
  ) then raise exception 'Daily report access required'; end if;

  if v_report.status <> 'draft' then raise exception 'This daily report has already been submitted'; end if;
  if p_description is null or trim(p_description)='' then raise exception 'Expense description is required'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Expense amount must be greater than zero'; end if;
  if p_payment_method not in ('cash','transfer','pos','other') then raise exception 'Invalid payment method'; end if;

  update public.daily_front_desk_expenses
  set description=trim(p_description), amount=p_amount, payment_method=p_payment_method,
      paid_to=nullif(trim(p_paid_to),''), remarks=nullif(trim(p_remarks),'')
  where id=p_expense_id
  returning * into v_expense;

  return v_expense;
end;
$$;

revoke all on function public.update_daily_front_desk_expense(uuid,text,numeric,text,text,text) from public;
grant execute on function public.update_daily_front_desk_expense(uuid,text,numeric,text,text,text) to authenticated;