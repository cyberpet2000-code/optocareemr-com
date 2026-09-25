-- Harden dashboard feedback follow-up access to current clinic membership,
-- lifecycle, and tenant-consistent patient linkage.
create or replace function public.get_dashboard_feedback_followups(p_clinic_id uuid)
returns table(
  id uuid,
  patient_id uuid,
  patient_name text,
  patient_number text,
  phone text,
  visit_id uuid,
  reason text,
  status text,
  created_at timestamptz,
  assigned_to uuid
)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    public.is_super_admin(auth.uid())
    or (
      public.lifecycle_allows_access(p_clinic_id)
      and exists (
        select 1 from public.user_clinic_memberships m
        where m.user_id = auth.uid()
          and m.clinic_id = p_clinic_id
          and lower(m.role::text) in ('admin','doctor','receptionist')
      )
    )
  ) then
    raise exception 'Access denied';
  end if;

  return query
    select ff.id, ff.patient_id, p.full_name, p.patient_number, p.phone,
           ff.visit_id, ff.reason, ff.status, ff.created_at, ff.assigned_to
    from public.feedback_followups ff
    join public.patients p on p.id = ff.patient_id and p.clinic_id = ff.clinic_id
    where ff.clinic_id = p_clinic_id
      and ff.status in ('pending','in_progress')
    order by ff.created_at desc;
end;
$function$;

revoke all on function public.get_dashboard_feedback_followups(uuid) from public, anon;
grant execute on function public.get_dashboard_feedback_followups(uuid) to authenticated, service_role;
