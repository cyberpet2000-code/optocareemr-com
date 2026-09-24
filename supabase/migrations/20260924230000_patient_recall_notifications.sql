-- Patient recall engine: persistent 6/12/18/custom-month recall plans with role-aware notifications.
create table if not exists public.patient_recalls (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  source_visit_id uuid references public.visits(id) on delete set null,
  recall_interval_months integer not null default 18 check (recall_interval_months between 1 and 60),
  due_date date not null,
  status text not null default 'active' check (status in ('active','inactive')),
  contact_status text not null default 'pending' check (contact_status in ('pending','message_sent','called','appointment_booked','snoozed','declined')),
  contacted_at timestamptz,
  contacted_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, patient_id)
);

create table if not exists public.patient_recall_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,
  action text not null,
  prescription_event text not null,
  interval_months integer,
  due_date date,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_patient_recalls_due
  on public.patient_recalls(clinic_id, status, due_date);
create index if not exists idx_patient_recalls_patient
  on public.patient_recalls(patient_id, created_at desc);
create index if not exists idx_patient_recall_events_patient
  on public.patient_recall_events(clinic_id, patient_id, created_at desc);

alter table public.patient_recalls enable row level security;
alter table public.patient_recall_events enable row level security;

drop policy if exists "patient recalls clinic access" on public.patient_recalls;
create policy "patient recalls clinic access"
on public.patient_recalls
for select
to authenticated
using (
  exists (
    select 1 from public.clinic_users cu
    where cu.clinic_id = patient_recalls.clinic_id
      and cu.user_id = auth.uid()
  )
);

drop policy if exists "patient recall events clinic access" on public.patient_recall_events;
create policy "patient recall events clinic access"
on public.patient_recall_events
for select
to authenticated
using (
  exists (
    select 1 from public.clinic_users cu
    where cu.clinic_id = patient_recall_events.clinic_id
      and cu.user_id = auth.uid()
  )
);

create or replace function public.get_patient_recall(
  p_clinic_id uuid,
  p_patient_id uuid
)
returns public.patient_recalls
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.patient_recalls;
begin
  if not exists (
    select 1 from public.clinic_users cu
    where cu.clinic_id = p_clinic_id and cu.user_id = auth.uid()
  ) then
    raise exception 'Clinic access denied';
  end if;

  select * into v_row
  from public.patient_recalls pr
  where pr.clinic_id = p_clinic_id
    and pr.patient_id = p_patient_id;

  return v_row;
end;
$$;

create or replace function public.set_patient_recall(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_visit_id uuid,
  p_action text,
  p_prescription_event text,
  p_interval_months integer default 18,
  p_reference_date date default null
)
returns public.patient_recalls
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.patient_recalls;
  v_reference_date date := coalesce(p_reference_date, current_date);
  v_due_date date;
begin
  if not exists (
    select 1 from public.clinic_users cu
    where cu.clinic_id = p_clinic_id and cu.user_id = auth.uid()
  ) then
    raise exception 'Clinic access denied';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.clinic_id = p_clinic_id
  ) then
    raise exception 'Patient does not belong to clinic';
  end if;

  if p_action not in ('reset','preserve','none') then
    raise exception 'Invalid recall action';
  end if;

  if p_action = 'reset' then
    if p_interval_months is null or p_interval_months < 1 or p_interval_months > 60 then
      raise exception 'Recall interval must be between 1 and 60 months';
    end if;

    v_due_date := (v_reference_date + make_interval(months => p_interval_months))::date;

    insert into public.patient_recalls (
      clinic_id, patient_id, source_visit_id, recall_interval_months,
      due_date, status, contact_status, contacted_at, contacted_by
    )
    values (
      p_clinic_id, p_patient_id, p_visit_id, p_interval_months,
      v_due_date, 'active', 'pending', null, null
    )
    on conflict (clinic_id, patient_id)
    do update set
      source_visit_id = excluded.source_visit_id,
      recall_interval_months = excluded.recall_interval_months,
      due_date = excluded.due_date,
      status = 'active',
      contact_status = 'pending',
      contacted_at = null,
      contacted_by = null,
      updated_at = now();

  elsif p_action = 'none' then
    update public.patient_recalls
    set status = 'inactive',
        contact_status = 'pending',
        updated_at = now()
    where clinic_id = p_clinic_id and patient_id = p_patient_id;

  end if;

  insert into public.patient_recall_events (
    clinic_id, patient_id, visit_id, action, prescription_event,
    interval_months, due_date, reason, created_by
  )
  values (
    p_clinic_id, p_patient_id, p_visit_id, p_action, p_prescription_event,
    case when p_action = 'reset' then p_interval_months else null end,
    case when p_action = 'reset' then v_due_date else null end,
    case
      when p_action = 'reset' and p_prescription_event = 'new_prescription'
        then 'New prescription / clinical recall reset'
      when p_action = 'preserve' and p_prescription_event = 'previous_prescription_reused'
        then 'Previous prescription reused; existing recall preserved'
      when p_action = 'none'
        then 'No active recall requested'
      else 'Recall decision recorded'
    end,
    auth.uid()
  );

  select * into v_row
  from public.patient_recalls pr
  where pr.clinic_id = p_clinic_id
    and pr.patient_id = p_patient_id;

  return v_row;
end;
$$;

create or replace function public.refresh_patient_recall_notifications(
  p_clinic_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_recipients uuid[];
  r record;
  v_stage text;
  v_title text;
  v_body text;
  v_priority text;
  v_dedupe text;
  v_expires timestamptz;
  v_days integer;
begin
  if not exists (
    select 1 from public.clinic_users cu
    where cu.clinic_id = p_clinic_id and cu.user_id = auth.uid()
  ) then
    raise exception 'Clinic access denied';
  end if;

  select array_agg(distinct ur.user_id)
    into v_recipients
  from public.user_roles ur
  where ur.clinic_id = p_clinic_id
    and ur.role::text in ('admin','receptionist','doctor','super_admin');

  if coalesce(cardinality(v_recipients), 0) = 0 then
    return 0;
  end if;

  for r in
    select pr.*, p.full_name
    from public.patient_recalls pr
    join public.patients p on p.id = pr.patient_id
    where pr.clinic_id = p_clinic_id
      and pr.status = 'active'
      and pr.due_date <= current_date + 30
      and not exists (
        select 1
        from public.appointments a
        where a.clinic_id = p_clinic_id
          and a.patient_id = pr.patient_id
          and a.appointment_date >= current_date
          and a.status::text not in ('cancelled','completed','no_show')
      )
  loop
    v_days := r.due_date - current_date;

    if v_days between 8 and 30 then
      v_stage := '30_day';
      v_title := 'Patient Recall Due Soon';
      v_body := r.full_name || ' will be due for an eye examination in ' || v_days::text || ' days (' || to_char(r.due_date, 'DD Mon YYYY') || ').';
      v_priority := 'information';
      v_expires := (r.due_date + 7)::timestamptz;
    elsif v_days between 1 and 7 then
      v_stage := '7_day';
      v_title := 'Patient Recall Coming Up';
      v_body := r.full_name || ' is due for an eye examination in ' || v_days::text || ' day' || case when v_days = 1 then '' else 's' end || ' (' || to_char(r.due_date, 'DD Mon YYYY') || ').';
      v_priority := 'attention';
      v_expires := (r.due_date + 7)::timestamptz;
    elsif v_days = 0 then
      v_stage := 'due';
      v_title := 'Patient Recall Due Today';
      v_body := r.full_name || ' is due for an eye examination today.';
      v_priority := 'attention';
      v_expires := (r.due_date + 14)::timestamptz;
    elsif v_days < 0 then
      v_stage := 'overdue_' || to_char(current_date, 'YYYY_MM');
      v_title := 'Patient Recall Overdue';
      v_body := r.full_name || ' is overdue for an eye examination. Recall date was ' || to_char(r.due_date, 'DD Mon YYYY') || '.';
      v_priority := 'urgent';
      v_expires := (current_date + 30)::timestamptz;
    else
      continue;
    end if;

    v_dedupe := 'patient-recall:' || r.id::text || ':' || r.due_date::text || ':' || v_stage;

    perform public.emit_staff_notification(
      p_clinic_id,
      v_recipients,
      'patient_recall',
      'patient',
      v_priority,
      v_title,
      v_body,
      '/patient/' || r.patient_id::text,
      'patient_recall',
      r.id,
      jsonb_build_object(
        'patient_id', r.patient_id,
        'due_date', r.due_date,
        'interval_months', r.recall_interval_months,
        'stage', v_stage,
        'days_until_due', v_days
      ),
      v_dedupe,
      v_expires
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.get_patient_recall(uuid, uuid) from public, anon;
revoke execute on function public.set_patient_recall(uuid, uuid, uuid, text, text, integer, date) from public, anon;
revoke execute on function public.refresh_patient_recall_notifications(uuid) from public, anon;

grant execute on function public.get_patient_recall(uuid, uuid) to authenticated;
grant execute on function public.set_patient_recall(uuid, uuid, uuid, text, text, integer, date) to authenticated;
grant execute on function public.refresh_patient_recall_notifications(uuid) to authenticated;
