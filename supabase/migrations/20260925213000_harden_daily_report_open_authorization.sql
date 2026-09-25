-- Tighten the daily front-desk report opener to the same roles exposed by the UI.
-- Super admins remain allowed across clinics; normal users must be receptionist/admin
-- members of the requested clinic.
create or replace function public.open_daily_front_desk_report(
  p_clinic_id uuid,
  p_report_date date
) returns table(
  report_id uuid,
  clinic_id uuid,
  report_date date,
  status text,
  submitted_by uuid,
  submitted_at timestamptz,
  opening_cash numeric,
  report_notes text,
  email_sent_at timestamptz,
  email_sent_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid;
begin
  if not (
    exists (
      select 1
      from public.clinic_users cu
      where cu.user_id = auth.uid()
        and cu.clinic_id = p_clinic_id
        and cu.role in ('receptionist', 'admin')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_super_admin = true
        and p.is_active = true
    )
  ) then
    raise exception 'Daily report access required';
  end if;

  select r.id
  into v_report_id
  from public.daily_front_desk_reports r
  where r.clinic_id = p_clinic_id
    and r.report_date = p_report_date;

  if v_report_id is null then
    insert into public.daily_front_desk_reports (clinic_id, report_date, status)
    values (p_clinic_id, p_report_date, 'draft')
    returning id into v_report_id;
  end if;

  return query
  select r.id, r.clinic_id, r.report_date, r.status, r.submitted_by,
         r.submitted_at, r.opening_cash, r.report_notes,
         r.email_sent_at, r.email_sent_by
  from public.daily_front_desk_reports r
  where r.id = v_report_id;
end;
$$;
