create or replace function public.get_own_staff_feedback_rating(p_clinic_id uuid)
returns table(rating numeric, rating_count integer)
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_rating_count integer := 0;
  v_rating numeric := null;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select lower(coalesce(cu.role::text,'')) into v_role
  from public.clinic_users cu
  where cu.user_id=v_uid and cu.clinic_id=p_clinic_id
  limit 1;

  if v_role is null then raise exception 'Clinic access required'; end if;

  if v_role = 'doctor' then
    select count(*)::integer, round(avg(fr.doctor_professionalism_rating)::numeric,1)
      into v_rating_count, v_rating
    from public.feedback_responses fr
    join public.visits v on v.id=fr.visit_id and v.clinic_id=p_clinic_id
    where fr.clinic_id=p_clinic_id
      and v.doctor_id=v_uid
      and fr.doctor_professionalism_rating is not null;
  elsif v_role = 'receptionist' then
    select count(*)::integer, round(avg(fr.front_desk_rating)::numeric,1)
      into v_rating_count, v_rating
    from public.feedback_responses fr
    join public.visits v on v.id=fr.visit_id and v.clinic_id=p_clinic_id
    where fr.clinic_id=p_clinic_id
      and v.registered_by=v_uid
      and fr.front_desk_rating is not null;
  else
    v_rating_count := 0;
    v_rating := null;
  end if;

  return query select v_rating, v_rating_count;
end;
$function$;

revoke execute on function public.get_own_staff_feedback_rating(uuid) from public, anon;
grant execute on function public.get_own_staff_feedback_rating(uuid) to authenticated;
