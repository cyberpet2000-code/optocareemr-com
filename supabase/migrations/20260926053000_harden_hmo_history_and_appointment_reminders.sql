-- Restrict audit-only HMO history writes and tighten appointment reminder RLS.
revoke all on function public.log_hmo_change(uuid,text,text,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.log_hmo_change(uuid,text,text,uuid,uuid,uuid,text) to service_role;

drop policy if exists clinic_delete_appointment_reminders on public.appointment_reminders;
drop policy if exists clinic_insert_appointment_reminders on public.appointment_reminders;
drop policy if exists clinic_select_appointment_reminders on public.appointment_reminders;
drop policy if exists clinic_update_appointment_reminders on public.appointment_reminders;

create policy clinic_select_appointment_reminders on public.appointment_reminders for select to authenticated
using (public.is_super_admin(auth.uid()) or exists (select 1 from public.clinic_users cu where cu.user_id=auth.uid() and cu.clinic_id=appointment_reminders.clinic_id));

create policy clinic_insert_appointment_reminders on public.appointment_reminders for insert to authenticated
with check (public.is_super_admin(auth.uid()) or exists (select 1 from public.clinic_users cu where cu.user_id=auth.uid() and cu.clinic_id=appointment_reminders.clinic_id));

create policy clinic_update_appointment_reminders on public.appointment_reminders for update to authenticated
using (public.is_super_admin(auth.uid()) or exists (select 1 from public.clinic_users cu where cu.user_id=auth.uid() and cu.clinic_id=appointment_reminders.clinic_id))
with check (public.is_super_admin(auth.uid()) or exists (select 1 from public.clinic_users cu where cu.user_id=auth.uid() and cu.clinic_id=appointment_reminders.clinic_id));

create policy clinic_delete_appointment_reminders on public.appointment_reminders for delete to authenticated
using (public.is_super_admin(auth.uid()) or (public.has_role(auth.uid(),'admin') and exists (select 1 from public.clinic_users cu where cu.user_id=auth.uid() and cu.clinic_id=appointment_reminders.clinic_id)));