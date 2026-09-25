-- Harden daily report submission/email/follow-up authorization.
create or replace function public.submit_daily_front_desk_report(p_report_id uuid)
returns public.daily_front_desk_reports language plpgsql security definer set search_path=public
as $function$
declare v_report public.daily_front_desk_reports;
begin
 select * into v_report from public.daily_front_desk_reports where id=p_report_id for update;
 if not found then raise exception 'Daily report not found'; end if;
 if not (public.is_super_admin(auth.uid()) or (public.lifecycle_allows_access(v_report.clinic_id) and exists(select 1 from public.user_clinic_memberships m where m.user_id=auth.uid() and m.clinic_id=v_report.clinic_id and lower(m.role::text) in ('receptionist','admin')))) then raise exception 'Daily report access required'; end if;
 if v_report.status='submitted' then raise exception 'This daily report has already been submitted'; end if;
 update public.daily_front_desk_reports set status='submitted',submitted_by=auth.uid(),submitted_at=now(),updated_at=now() where id=p_report_id returning * into v_report;
 return v_report;
end; $function$;

create or replace function public.mark_daily_front_desk_report_emailed(p_report_id uuid)
returns public.daily_front_desk_reports language plpgsql security definer set search_path=public
as $function$
declare v_report public.daily_front_desk_reports;
begin
 select * into v_report from public.daily_front_desk_reports where id=p_report_id;
 if not found then raise exception 'Daily report not found'; end if;
 if not (public.is_super_admin(auth.uid()) or (public.lifecycle_allows_access(v_report.clinic_id) and exists(select 1 from public.user_clinic_memberships m where m.user_id=auth.uid() and m.clinic_id=v_report.clinic_id and lower(m.role::text) in ('receptionist','admin')))) then raise exception 'Daily report access required'; end if;
 if v_report.status<>'submitted' then raise exception 'Submit the daily report before sending it by email'; end if;
 update public.daily_front_desk_reports set email_sent_at=now(),email_sent_by=auth.uid(),updated_at=now() where id=p_report_id returning * into v_report;
 return v_report;
end; $function$;

create or replace function public.save_daily_front_desk_report_followup(p_report_id uuid,p_patient_id uuid,p_visit_id uuid,p_status text,p_note text default null)
returns public.daily_front_desk_report_items language plpgsql security definer set search_path=public
as $function$
declare v_report public.daily_front_desk_reports; v_item public.daily_front_desk_report_items;
begin
 select * into v_report from public.daily_front_desk_reports where id=p_report_id;
 if not found then raise exception 'Daily report not found'; end if;
 if not (public.is_super_admin(auth.uid()) or (public.lifecycle_allows_access(v_report.clinic_id) and exists(select 1 from public.user_clinic_memberships m where m.user_id=auth.uid() and m.clinic_id=v_report.clinic_id and lower(m.role::text) in ('receptionist','admin')))) then raise exception 'Daily report access required'; end if;
 if v_report.status<>'draft' then raise exception 'This daily report has already been submitted'; end if;
 if p_status not in ('Not required','Pending','Completed') then raise exception 'Invalid feedback follow-up status'; end if;
 select * into v_item from public.daily_front_desk_report_items where report_id=p_report_id and patient_id=p_patient_id and visit_id is not distinct from p_visit_id limit 1;
 if not found then raise exception 'Daily report patient entry not found'; end if;
 update public.daily_front_desk_report_items set feedback_follow_up_status=p_status,feedback_follow_up_note=nullif(trim(p_note),''),updated_at=now() where id=v_item.id returning * into v_item;
 return v_item;
end; $function$;