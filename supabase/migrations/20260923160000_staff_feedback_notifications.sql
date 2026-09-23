-- Central staff notification inbox for clinic events such as patient feedback.
create table if not exists public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  recipient_user_id uuid not null,
  notification_type text not null,
  title text not null,
  body text not null,
  link text,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_notifications_recipient
  on public.staff_notifications(recipient_user_id, clinic_id, created_at desc);

create index if not exists idx_staff_notifications_unread
  on public.staff_notifications(recipient_user_id, clinic_id, read_at, created_at desc);

alter table public.staff_notifications enable row level security;

drop policy if exists "staff_notifications_select_own" on public.staff_notifications;
create policy "staff_notifications_select_own"
  on public.staff_notifications for select
  to authenticated
  using (recipient_user_id = auth.uid());

drop policy if exists "staff_notifications_update_own" on public.staff_notifications;
create policy "staff_notifications_update_own"
  on public.staff_notifications for update
  to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create or replace function public.notify_feedback_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := 'New Patient Feedback';
  v_body text := 'New patient feedback has been received for your clinic.';
  v_link text := '/dashboard';
begin
  -- Notify clinic admins.
  insert into public.staff_notifications (
    clinic_id, recipient_user_id, notification_type, title, body, link, metadata
  )
  select
    new.clinic_id,
    ur.user_id,
    'feedback_received',
    v_title,
    v_body,
    v_link,
    jsonb_build_object('feedback_id', new.id, 'visit_id', new.visit_id)
  from public.user_roles ur
  where ur.clinic_id = new.clinic_id
    and ur.role in ('admin'::app_role, 'super_admin'::app_role)
  on conflict do nothing;

  -- Notify the doctor who handled the visit.
  if new.doctor_id is not null then
    insert into public.staff_notifications (
      clinic_id, recipient_user_id, notification_type, title, body, link, metadata
    )
    values (
      new.clinic_id, new.doctor_id, 'feedback_received',
      v_title, v_body, v_link,
      jsonb_build_object('feedback_id', new.id, 'visit_id', new.visit_id)
    )
    on conflict do nothing;
  end if;

  -- Notify the receptionist who registered the visit.
  insert into public.staff_notifications (
    clinic_id, recipient_user_id, notification_type, title, body, link, metadata
  )
  select
    new.clinic_id,
    v.registered_by,
    'feedback_received',
    v_title,
    v_body,
    v_link,
    jsonb_build_object('feedback_id', new.id, 'visit_id', new.visit_id)
  from public.visits v
  where v.id = new.visit_id
    and v.registered_by is not null
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_feedback_received_notification on public.feedback_responses;
create trigger trg_feedback_received_notification
after insert on public.feedback_responses
for each row
execute function public.notify_feedback_received();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_notifications'
  ) then
    alter publication supabase_realtime add table public.staff_notifications;
  end if;
end $$;