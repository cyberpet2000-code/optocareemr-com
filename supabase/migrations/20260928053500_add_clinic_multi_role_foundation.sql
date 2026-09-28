create table if not exists public.clinic_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint clinic_user_roles_no_super_admin
    check (role <> 'super_admin'::public.app_role),
  constraint clinic_user_roles_user_clinic_role_key
    unique (user_id, clinic_id, role)
);

create index if not exists idx_clinic_user_roles_clinic_user
  on public.clinic_user_roles (clinic_id, user_id);

create index if not exists idx_clinic_user_roles_user_clinic
  on public.clinic_user_roles (user_id, clinic_id);

alter table public.clinic_user_roles enable row level security;

grant select, insert, update, delete on public.clinic_user_roles to authenticated;

create policy clinic_user_roles_select_self_or_super
on public.clinic_user_roles
for select to authenticated
using (
  auth.uid() = user_id
  or is_super_admin(auth.uid())
  or (has_role(auth.uid(), 'admin'::public.app_role)
      and clinic_id = current_clinic_id())
);

create policy clinic_user_roles_admin_manage_clinic
on public.clinic_user_roles
for all to authenticated
using (
  is_super_admin(auth.uid())
  or (has_role(auth.uid(), 'admin'::public.app_role)
      and clinic_id = current_clinic_id())
)
with check (
  role <> 'super_admin'::public.app_role
  and (
    is_super_admin(auth.uid())
    or (has_role(auth.uid(), 'admin'::public.app_role)
        and clinic_id = current_clinic_id())
  )
);

insert into public.clinic_user_roles (user_id, clinic_id, role)
select ur.user_id, ur.clinic_id, ur.role
from public.user_roles ur
where ur.clinic_id is not null
  and ur.role <> 'super_admin'::public.app_role
on conflict (user_id, clinic_id, role) do nothing;

insert into public.clinic_user_roles (user_id, clinic_id, role)
select cu.user_id, cu.clinic_id, cu.role::public.app_role
from public.clinic_users cu
where cu.user_id is not null
  and cu.clinic_id is not null
  and lower(coalesce(cu.role, '')) in ('admin', 'doctor', 'receptionist')
on conflict (user_id, clinic_id, role) do nothing;
