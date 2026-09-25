-- Tenant-scope hardening for staff feedback ratings.
-- Patient and visit joins are explicitly constrained to the requested clinic.
create or replace function public.get_admin_staff_feedback_ratings(p_clinic_id uuid)
returns table(
  feedback_id uuid, staff_id uuid, staff_name text, staff_role text, rating integer,
  visit_id uuid, patient_id uuid, patient_name text, submitted_at timestamptz,
  positive_feedback text, improvement_feedback text, what_did_well text,
  what_can_improve text, anything_else text
)
language plpgsql security definer set search_path=public as $$
begin
  if not (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id=auth.uid()
        and ur.clinic_id=p_clinic_id
        and ur.role in ('admin','super_admin')
    )
    or exists (
      select 1 from public.profiles p
      where p.id=auth.uid() and p.is_super_admin=true and p.is_active=true
    )
  ) then raise exception 'Admin access required'; end if;

  return query
  select fr.id,fr.doctor_id,coalesce(p.full_name,'Unknown Doctor'),'doctor'::text,
    fr.doctor_professionalism_rating,fr.visit_id,fr.patient_id,
    coalesce(pt.full_name,'Unknown Patient'),fr.submitted_at,
    fr.positive_feedback,fr.improvement_feedback,fr.what_did_well,
    fr.what_can_improve,fr.anything_else
  from public.feedback_responses fr
  left join public.profiles p on p.id=fr.doctor_id
  left join public.patients pt on pt.id=fr.patient_id and pt.clinic_id=p_clinic_id
  left join public.visits v on v.id=fr.visit_id and v.clinic_id=p_clinic_id
  where fr.clinic_id=p_clinic_id
    and fr.doctor_id is not null
    and fr.doctor_professionalism_rating is not null
  union all
  select fr.id,v.registered_by,coalesce(p.full_name,'Front Desk Team'),
    'receptionist'::text,fr.front_desk_rating,fr.visit_id,fr.patient_id,
    coalesce(pt.full_name,'Unknown Patient'),fr.submitted_at,
    fr.positive_feedback,fr.improvement_feedback,fr.what_did_well,
    fr.what_can_improve,fr.anything_else
  from public.feedback_responses fr
  inner join public.visits v on v.id=fr.visit_id and v.clinic_id=p_clinic_id
  left join public.profiles p on p.id=v.registered_by
  left join public.patients pt on pt.id=fr.patient_id and pt.clinic_id=p_clinic_id
  where fr.clinic_id=p_clinic_id
    and fr.front_desk_rating is not null
    and (
      v.registered_by is not null
      or exists (
        select 1 from public.feedback_requests rq
        where rq.id=fr.feedback_request_id and rq.requested_by_user_id is not null
      )
    )
  order by submitted_at desc;
end;
$$;
