-- Harden onboarding completion so arbitrary authenticated users cannot mark
-- another clinic as fully onboarded.
create or replace function public.complete_onboarding(_clinic_id uuid)
returns void
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
      public.has_role(auth.uid(), 'admin')
      and _clinic_id = public.current_clinic_id()
      and public.lifecycle_allows_access(_clinic_id)
    )
  ) then
    raise exception 'Not authorized to complete onboarding for this clinic';
  end if;

  update public.clinics
     set setup_completed = true,
         onboarding_step = 'done',
         updated_at = now()
   where id = _clinic_id;
end;
$function$;

revoke all on function public.complete_onboarding(uuid) from public, anon;
grant execute on function public.complete_onboarding(uuid) to authenticated, service_role;
