-- OptoCare canonical organization / branch architecture
-- Isolated implementation: do not apply to production until reviewed.

create table if not exists public.subscription_plan_catalog (
  plan_code text primary key,
  display_name text not null,
  monthly_amount_ngn bigint not null,
  annual_amount_ngn bigint not null,
  branch_limit integer not null default 0,
  staff_limit integer,
  provider_limit integer,
  hmo_enabled boolean not null default false,
  inventory_enabled boolean not null default true,
  billing_enabled boolean not null default true,
  offline_enabled boolean not null default true,
  optical_enabled boolean not null default false,
  analytics_level text not null default 'basic',
  ai_allowance text not null default 'limited',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plan_catalog_amounts_nonnegative
    check (monthly_amount_ngn >= 0 and annual_amount_ngn >= 0),
  constraint subscription_plan_catalog_branch_limit_valid
    check (branch_limit >= 0),
  constraint subscription_plan_catalog_staff_limit_valid
    check (staff_limit is null or staff_limit > 0),
  constraint subscription_plan_catalog_provider_limit_valid
    check (provider_limit is null or provider_limit > 0)
);

insert into public.subscription_plan_catalog
(plan_code,display_name,monthly_amount_ngn,annual_amount_ngn,branch_limit,staff_limit,provider_limit,hmo_enabled,inventory_enabled,billing_enabled,offline_enabled,optical_enabled,analytics_level,ai_allowance)
values
('starter','Starter',10000,100000,0,3,1,false,true,true,true,true,'basic','limited'),
('professional','Professional',18000,180000,0,10,5,true,true,true,true,true,'advanced','limited'),
('clinic','Clinic',30000,300000,2,25,null,true,true,true,true,true,'multi_clinic','limited'),
('network','Network',0,0,-1,null,null,true,true,true,true,true,'multi_clinic','custom')
on conflict (plan_code) do update set
  display_name=excluded.display_name,
  monthly_amount_ngn=excluded.monthly_amount_ngn,
  annual_amount_ngn=excluded.annual_amount_ngn,
  branch_limit=excluded.branch_limit,
  staff_limit=excluded.staff_limit,
  provider_limit=excluded.provider_limit,
  hmo_enabled=excluded.hmo_enabled,
  inventory_enabled=excluded.inventory_enabled,
  billing_enabled=excluded.billing_enabled,
  offline_enabled=excluded.offline_enabled,
  optical_enabled=excluded.optical_enabled,
  analytics_level=excluded.analytics_level,
  ai_allowance=excluded.ai_allowance,
  updated_at=now();

alter table public.subscription_plan_catalog enable row level security;
revoke all on public.subscription_plan_catalog from anon, authenticated;
grant select on public.subscription_plan_catalog to authenticated;

drop policy if exists subscription_plan_catalog_select_active on public.subscription_plan_catalog;
create policy subscription_plan_catalog_select_active
on public.subscription_plan_catalog
for select to authenticated
using (is_active = true or public.is_super_admin(auth.uid()));

-- The existing parent_clinic_id hierarchy is canonical.
-- A clinic is an HQ when it has no parent and type='organization'.
-- A branch is a child clinic with parent_clinic_id set.
create index if not exists idx_clinics_parent_clinic_id
  on public.clinics(parent_clinic_id);

create index if not exists idx_clinics_parent_active
  on public.clinics(parent_clinic_id,is_active);

-- Resolve the selected tenant, never merely the legacy profiles.clinic_id.
create or replace function public.current_clinic_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  candidate uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    return null;
  end if;

  select coalesce(p.active_clinic_id, p.clinic_id)
    into candidate
  from public.profiles p
  where p.id = uid
  limit 1;

  if candidate is null then
    return null;
  end if;

  if public.is_super_admin(uid) then
    return candidate;
  end if;

  if exists (
    select 1
    from public.user_clinic_memberships m
    where m.user_id = uid
      and m.clinic_id = candidate
      and coalesce(m.is_active,true) = true
  )
  or exists (
    select 1
    from public.clinic_user_roles r
    join public.clinics child on child.id=candidate
    where r.user_id=uid
      and r.clinic_id=coalesce(child.parent_clinic_id,child.id)
      and r.role='admin'::public.app_role
  )
  or exists (
    select 1
    from public.clinic_user_roles r
    where r.user_id = uid
      and r.clinic_id = candidate
  )
  or exists (
    select 1
    from public.clinic_users cu
    where cu.user_id = uid
      and cu.clinic_id = candidate
  )
  or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = uid
      and ur.clinic_id = candidate
  ) then
    return candidate;
  end if;

  select m.clinic_id
    into candidate
  from public.user_clinic_memberships m
  where m.user_id = uid
    and coalesce(m.is_active,true) = true
  order by m.created_at nulls last
  limit 1;

  return candidate;
end;
$function$;

-- Only permit a user to switch to a clinic where they have an active membership/role.
create or replace function public.set_active_clinic(p_clinic_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  if p_clinic_id is null then
    raise exception 'Clinic is required';
  end if;

  if not public.is_super_admin(uid) and not (
    exists (
      select 1 from public.user_clinic_memberships m
      where m.user_id=uid and m.clinic_id=p_clinic_id and coalesce(m.is_active,true)=true
    )
    or exists (
      select 1
      from public.clinic_user_roles r
      join public.clinics child on child.id=p_clinic_id
      where r.user_id=uid
        and r.clinic_id=coalesce(child.parent_clinic_id,child.id)
        and r.role='admin'::public.app_role
    )
    or exists (
      select 1 from public.clinic_user_roles r
      where r.user_id=uid and r.clinic_id=p_clinic_id
    )
    or exists (
      select 1 from public.clinic_users cu
      where cu.user_id=uid and cu.clinic_id=p_clinic_id
    )
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id=uid and ur.clinic_id=p_clinic_id
    )
  ) then
    raise exception 'You do not have access to this clinic';
  end if;

  if not exists (
    select 1 from public.clinics c
    where c.id=p_clinic_id
      and (public.is_super_admin(uid) or coalesce(c.is_active,true)=true)
  ) then
    raise exception 'Clinic is not active';
  end if;

  -- Group/HQ administrators inherit access to their child locations.
  insert into public.user_clinic_memberships(user_id,clinic_id,is_active)
  select uid,p_clinic_id,true
  where exists (
    select 1
    from public.clinic_user_roles r
    join public.clinics child on child.id=p_clinic_id
    where r.user_id=uid
      and r.clinic_id=coalesce(child.parent_clinic_id,child.id)
      and r.role='admin'::public.app_role
  )
  on conflict do nothing;

  update public.profiles
  set active_clinic_id=p_clinic_id
  where id=uid;

  return p_clinic_id;
end;
$function$;

revoke all on function public.set_active_clinic(uuid) from public, anon;
grant execute on function public.set_active_clinic(uuid) to authenticated;


-- HQ/branch management context for administrators. This avoids exposing child
-- clinic rows through broad table SELECT policies.
create or replace function public.get_clinic_group_context()
returns table (
  id uuid,
  name text,
  type text,
  parent_clinic_id uuid,
  is_active boolean,
  setup_completed boolean,
  phone text,
  email text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with ctx as (
    select coalesce(c.parent_clinic_id,c.id) as group_id
    from public.clinics c
    where c.id=public.current_clinic_id()
  )
  select c.id,c.name,c.type,c.parent_clinic_id,c.is_active,c.setup_completed,c.phone,c.email
  from public.clinics c
  join ctx on coalesce(c.parent_clinic_id,c.id)=ctx.group_id
  where public.is_super_admin(auth.uid())
     or public.has_role(auth.uid(),'admin'::public.app_role)
  order by (c.parent_clinic_id is null) desc,c.created_at asc;
$function$;

revoke all on function public.get_clinic_group_context() from public, anon;
grant execute on function public.get_clinic_group_context() to authenticated;

-- Return the HQ for a branch, or the clinic itself when it is already an HQ.
create or replace function public.get_clinic_group_id(p_clinic_id uuid default null)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(c.parent_clinic_id,c.id)
  from public.clinics c
  where c.id=coalesce(p_clinic_id,public.current_clinic_id())
    and (
      public.is_super_admin(auth.uid())
      or public.current_clinic_id()=c.id
      or public.current_clinic_id()=c.parent_clinic_id
    )
  limit 1;
$function$;

revoke all on function public.get_clinic_group_id(uuid) from public, anon;
grant execute on function public.get_clinic_group_id(uuid) to authenticated;

-- Canonical plan/entitlement lookup.
create or replace function public.get_clinic_entitlement(p_clinic_id uuid default null)
returns table (
  clinic_id uuid,
  group_id uuid,
  plan_code text,
  monthly_amount_ngn bigint,
  annual_amount_ngn bigint,
  branch_limit integer,
  staff_limit integer,
  provider_limit integer,
  hmo_enabled boolean,
  inventory_enabled boolean,
  billing_enabled boolean,
  offline_enabled boolean,
  optical_enabled boolean,
  analytics_level text,
  ai_allowance text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with target as (
    select coalesce(p_clinic_id,public.current_clinic_id()) as clinic_id
  ),
  grouped as (
    select t.clinic_id,
           coalesce(c.parent_clinic_id,c.id) as group_id
    from target t
    join public.clinics c on c.id=t.clinic_id
  ),
  sub as (
    select s.*,
           row_number() over (
             partition by s.clinic_id
             order by
               case when s.status in ('active','trialing') then 0 else 1 end,
               s.created_at desc
           ) as rn
    from public.clinic_subscriptions s
  )
  select
    g.clinic_id,
    g.group_id,
    coalesce(nullif(s.plan,''),'starter') as plan_code,
    pc.monthly_amount_ngn,
    pc.annual_amount_ngn,
    pc.branch_limit,
    pc.staff_limit,
    pc.provider_limit,
    pc.hmo_enabled,
    pc.inventory_enabled,
    pc.billing_enabled,
    pc.offline_enabled,
    pc.optical_enabled,
    pc.analytics_level,
    pc.ai_allowance
  from grouped g
  left join sub s on s.clinic_id=g.group_id and s.rn=1
  left join public.subscription_plan_catalog pc
    on pc.plan_code=coalesce(nullif(s.plan,''),'starter')
  where public.is_super_admin(auth.uid())
     or g.clinic_id=public.current_clinic_id()
     or g.group_id=public.current_clinic_id()
  limit 1;
$function$;

revoke all on function public.get_clinic_entitlement(uuid) from public, anon;
grant execute on function public.get_clinic_entitlement(uuid) to authenticated;

-- Branch creation is atomic and never accepts a client-selected subscription/limit.
create or replace function public.create_clinic_branch(
  p_name text,
  p_address text default null,
  p_phone text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  uid uuid := auth.uid();
  active_id uuid := public.current_clinic_id();
  group_id uuid;
  plan_limit integer;
  branch_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(c.parent_clinic_id,c.id)
    into group_id
  from public.clinics c
  where c.id=active_id;

  if group_id is null then raise exception 'No active clinic'; end if;

  if not (
    public.is_super_admin(uid)
    or public.has_role(uid,'admin'::public.app_role)
  ) then
    raise exception 'Only clinic administrators can create branches';
  end if;

  if not exists (
    select 1 from public.clinic_subscriptions s
    where s.clinic_id=group_id
      and s.status in ('active','trialing')
  ) then
    raise exception 'An active Clinic subscription is required';
  end if;

  select coalesce(pc.branch_limit,s.branch_limit,0)
    into plan_limit
  from public.clinic_subscriptions s
  left join public.subscription_plan_catalog pc on pc.plan_code=s.plan
  where s.clinic_id=group_id
  order by s.created_at desc
  limit 1;

  if plan_limit = 0 then
    raise exception 'Your current plan does not include additional clinics';
  end if;

  if plan_limit <> -1 and (
    select count(*) from public.clinics c where c.parent_clinic_id=group_id
  ) >= plan_limit then
    raise exception 'Clinic branch limit reached. Upgrade your plan to add another clinic.';
  end if;

  insert into public.clinics (
    name,type,parent_clinic_id,phone,email,is_active,subscription_status,setup_completed
  )
  values (
    trim(p_name),'branch',group_id,p_phone,p_email,true,'trial',false
  )
  returning id into branch_id;

  insert into public.user_clinic_memberships(user_id,clinic_id,is_active)
  values(uid,branch_id,true)
  on conflict do nothing;

  return branch_id;
end;
$function$;

revoke all on function public.create_clinic_branch(text,text,text,text) from public, anon;
grant execute on function public.create_clinic_branch(text,text,text,text) to authenticated;

-- Do not let direct clients create branch clinics by bypassing the branch-limit function.
drop trigger if exists branch_limit_enforcer on public.clinics;
create trigger branch_limit_enforcer
before insert on public.clinics
for each row
when (new.type = 'branch' and new.parent_clinic_id is not null)
execute function public.prevent_excess_branches();

-- Branch metadata must be tenant-visible only; the old branches table is no longer
-- part of the canonical architecture and remains unused for compatibility.
revoke all on public.branches from anon, authenticated;
revoke all on public.branch_feature_flags from anon, authenticated;

-- Keep legacy plan feature helper aligned with the new commercial plans.
create or replace function public.get_plan_features(plan text)
returns table(billing boolean,hmo boolean,pharmacy boolean,inventory boolean,appointments boolean)
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  return query
  select
    coalesce(pc.billing_enabled,true),
    coalesce(pc.hmo_enabled,false),
    true,
    coalesce(pc.inventory_enabled,true),
    true
  from public.subscription_plan_catalog pc
  where pc.plan_code=lower(plan)
  limit 1;

  if not found then
    return query select true,false,true,true,true;
  end if;
end;
$function$;
