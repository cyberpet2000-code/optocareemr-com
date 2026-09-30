-- Canonical receptionist/admin authorization for daily front-desk draft mutations.
-- Applied live on 2026-09-30; kept in GitHub so production DB and migrations remain synchronized.

create or replace function public.save_daily_front_desk_report(
  p_clinic_id uuid, p_report_date date, p_opening_cash numeric default 0, p_report_notes text default null
)
returns table(report_id uuid, clinic_id uuid, report_date date, status text, submitted_by uuid, submitted_at timestamptz, opening_cash numeric, report_notes text, email_sent_at timestamptz, email_sent_by uuid)
language plpgsql security definer set search_path=public
as $$
declare v_report_id uuid; v_status text;
begin
 if not (
   exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_super_admin=true and p.is_active=true)
   or (
     public.lifecycle_allows_access(p_clinic_id)
     and exists(select 1 from public.profiles p join public.user_clinic_memberships m on m.user_id=p.id and m.clinic_id=p_clinic_id and m.is_active=true where p.id=auth.uid() and p.is_active=true and lower(p.role) in ('receptionist','admin'))
   )
 ) then raise exception 'Daily report access required'; end if;
 if p_opening_cash < 0 then raise exception 'Opening cash cannot be negative'; end if;
 select r.id,r.status into v_report_id,v_status from public.daily_front_desk_reports r where r.clinic_id=p_clinic_id and r.report_date=p_report_date;
 if v_status='submitted' then raise exception 'This daily report has already been submitted'; end if;
 if v_report_id is null then
   insert into public.daily_front_desk_reports(clinic_id,report_date,submitted_by,status,opening_cash,report_notes) values(p_clinic_id,p_report_date,auth.uid(),'draft',p_opening_cash,p_report_notes) returning id into v_report_id;
 else
   update public.daily_front_desk_reports set opening_cash=p_opening_cash,report_notes=p_report_notes,updated_at=now() where id=v_report_id and status='draft';
 end if;
 return query select r.id,r.clinic_id,r.report_date,r.status,r.submitted_by,r.submitted_at,r.opening_cash,r.report_notes,r.email_sent_at,r.email_sent_by from public.daily_front_desk_reports r where r.id=v_report_id;
end; $$;

-- The remaining draft mutation functions use the same membership authorization in production.
-- Their complete definitions are maintained by the corresponding live SQL migration history.

-- Align patient-row, feedback-note, follow-up and expense mutations with the same
-- canonical profiles + user_clinic_memberships authorization used above.
-- These definitions were applied live during the same repair; this migration file
-- records the report-note fix that was directly responsible for the reported failure.
