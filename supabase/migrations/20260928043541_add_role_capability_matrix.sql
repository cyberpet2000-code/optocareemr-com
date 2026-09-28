create table if not exists public.role_capabilities (
  role public.app_role not null,
  capability text not null,
  created_at timestamptz not null default now(),
  constraint role_capabilities_pkey primary key (role, capability),
  constraint role_capabilities_no_super_admin
    check (role <> 'super_admin'::public.app_role)
);

alter table public.role_capabilities enable row level security;
grant select on public.role_capabilities to authenticated;

create policy role_capabilities_authenticated_read
on public.role_capabilities
for select to authenticated
using (true);

create policy role_capabilities_super_admin_manage
on public.role_capabilities
for all to authenticated
using (is_super_admin(auth.uid()))
with check (is_super_admin(auth.uid()));

insert into public.role_capabilities (role, capability) values
('admin','patients.read'),('admin','patients.register'),
('admin','appointments.manage'),('admin','billing.read'),('admin','billing.manage'),
('admin','hmo.manage'),('admin','inventory.read'),('admin','inventory.manage'),
('admin','reports.read'),('admin','reports.manage'),('admin','staff.read'),
('admin','staff.manage'),('admin','settings.manage'),
('admin','clinical.read'),
('admin','clinical.write'),
('admin','clinical.assign'),
('admin','prescription.create'),
('admin','patients.read'),
('admin','patients.register'),
('admin','appointments.manage'),
('admin','billing.read'),
('admin','billing.manage'),
('admin','hmo.manage'),
('admin','inventory.read'),
('admin','inventory.manage'),
('admin','reports.read'),
('admin','reports.manage'),
('admin','staff.read'),
('admin','staff.manage'),
('admin','settings.manage'),
('doctor','patients.read'),('doctor','clinical.read'),('doctor','clinical.write'),
('doctor','clinical.assign'),('doctor','prescription.create'),
('doctor','appointments.manage'),('doctor','billing.read'),('doctor','hmo.manage'),
('receptionist','patients.read'),('receptionist','patients.register'),
('receptionist','appointments.manage'),('receptionist','billing.read'),
('receptionist','billing.manage'),('receptionist','hmo.manage'),
('receptionist','inventory.read')
on conflict (role, capability) do nothing;