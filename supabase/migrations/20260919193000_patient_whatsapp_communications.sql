-- Patient WhatsApp communication log
-- Records when staff prepare a WhatsApp message and when they explicitly confirm it was sent.
create table if not exists public.patient_communications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id uuid null references public.visits(id) on delete set null,
  template_key text not null,
  template_label text not null,
  recipient_phone text not null,
  message_body text not null,
  status text not null default 'prepared' check (status in ('prepared','sent')),
  prepared_by uuid null references auth.users(id) on delete set null,
  sent_by uuid null references auth.users(id) on delete set null,
  prepared_at timestamptz not null default now(),
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patient_communications_clinic_date_idx
  on public.patient_communications (clinic_id, prepared_at desc);

create index if not exists patient_communications_patient_idx
  on public.patient_communications (patient_id, visit_id, prepared_at desc);

alter table public.patient_communications enable row level security;

drop policy if exists "patient communications select clinic members" on public.patient_communications;
create policy "patient communications select clinic members"
  on public.patient_communications
  for select
  to authenticated
  using (
    exists (
      select 1 from public.clinic_users cu
      where cu.clinic_id = patient_communications.clinic_id
        and cu.user_id = auth.uid()
    )
  );

drop policy if exists "patient communications insert clinic members" on public.patient_communications;
create policy "patient communications insert clinic members"
  on public.patient_communications
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.clinic_users cu
      where cu.clinic_id = patient_communications.clinic_id
        and cu.user_id = auth.uid()
    )
  );

drop policy if exists "patient communications update clinic members" on public.patient_communications;
create policy "patient communications update clinic members"
  on public.patient_communications
  for update
  to authenticated
  using (
    exists (
      select 1 from public.clinic_users cu
      where cu.clinic_id = patient_communications.clinic_id
        and cu.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.clinic_users cu
      where cu.clinic_id = patient_communications.clinic_id
        and cu.user_id = auth.uid()
    )
  );

create or replace function public.set_patient_communication_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists patient_communications_updated_at on public.patient_communications;
create trigger patient_communications_updated_at
before update on public.patient_communications
for each row execute function public.set_patient_communication_updated_at();
