-- Keep existing clinic staff aligned with the hardened tenant-membership table.
-- Security-sensitive database guards use user_clinic_memberships.
insert into public.user_clinic_memberships (user_id, clinic_id, is_active)
select p.id, p.clinic_id, true
from public.profiles p
where p.clinic_id is not null
  and not exists (
    select 1
    from public.user_clinic_memberships m
    where m.user_id = p.id
      and m.clinic_id = p.clinic_id
  );