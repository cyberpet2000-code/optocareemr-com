-- Keep patient-facing HMO request state consistent with all HMO requests recorded for the patient.
create or replace function public.get_patient_list_page(
  p_clinic_id uuid,
  p_search text default null,
  p_search_mode text default 'all',
  p_hmo_id uuid default null,
  p_family_id uuid default null,
  p_payment_filter text default null,
  p_hmo_attention boolean default false,
  p_created_after timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid, full_name text, date_of_birth date, age integer, gender text, phone text,
  payment_type text, active_hmo_id uuid, queue_number integer, patient_number text,
  hmo_name text, family_id uuid, family_name text, hmo_verification_status text,
  created_at timestamptz, visit_count bigint, last_visit timestamptz,
  outstanding_balance numeric, amount_paid numeric, patient_payable numeric,
  payment_status text, hmo_claim_id uuid, hmo_claim_status text, hmo_claim_amount numeric,
  hmo_request_sent boolean, hmo_request_sent_at timestamptz, hmo_request_status text,
  hmo_request_response_at timestamptz, hmo_request_remarks text, hmo_claim_sent boolean,
  hmo_claim_sent_at timestamptz, hmo_claim_response_status text,
  hmo_claim_response_at timestamptz, hmo_claim_response_remarks text, total_count bigint
)
language sql stable set search_path=''
as $function$
with base as (
  select p.*, h.name hmo_name, f.family_name
  from public.patients p
  left join public.hmos h on h.id=p.active_hmo_id and h.clinic_id=p.clinic_id
  left join public.families f on f.id=p.family_id and f.clinic_id=p.clinic_id
  where p.clinic_id=p_clinic_id
    and (p_created_after is null or p.created_at >= p_created_after)
    and (p_hmo_id is null or p.active_hmo_id=p_hmo_id)
    and (p_family_id is null or p.family_id=p_family_id)
    and (
      p_search is null or btrim(p_search)=''
      or not exists (
        select 1 from regexp_split_to_table(lower(btrim(p_search)), '\s+') term
        where term<>'' and lower(
          coalesce(p.full_name,'') || ' ' || coalesce(p.phone,'') || ' ' ||
          coalesce(p.patient_number,'') || ' ' || coalesce(h.name,'') || ' ' ||
          coalesce(p.hmo_provider,'') || ' ' || coalesce(f.family_name,'') || ' ' ||
          coalesce(f.family_number,'')
        ) not like '%' || term || '%'
      )
    )
    and (
      p_search_mode='all' or
      (p_search_mode='hmo' and p.payment_type='hmo') or
      (p_search_mode='private' and coalesce(p.payment_type,'private')<>'hmo') or
      (p_search_mode='family' and p.family_id is not null)
    )
),
visits as (
  select v.patient_id,count(*)::bigint visit_count,max(v.created_at) last_visit
  from public.visits v join base b on b.id=v.patient_id
  where v.clinic_id=p_clinic_id group by v.patient_id
),
bills as (
  select b.patient_id,
    sum(case when coalesce(b.total_amount,0)>0 or coalesce(b.amount_paid,0)>0 then greatest(coalesce(b.balance,0),0) else 0 end)::numeric outstanding_balance,
    sum(case when coalesce(b.total_amount,0)>0 or coalesce(b.amount_paid,0)>0 then greatest(coalesce(b.amount_paid,0),0) else 0 end)::numeric amount_paid,
    sum(coalesce(b.patient_payable,0))::numeric patient_payable,
    bool_or(coalesce(b.total_amount,0)>0 or coalesce(b.amount_paid,0)>0) has_actual_bill
  from public.billing b join base p on p.id=b.patient_id
  where b.clinic_id=p_clinic_id group by b.patient_id
),
latest_claim as (
  select distinct on (h.patient_id) h.patient_id,h.id,h.status,h.approved_amount,h.service_cost,
    h.hmo_request_sent,h.hmo_request_sent_at,h.hmo_request_status,h.hmo_request_response_at,h.hmo_request_remarks,
    h.claim_sent,h.claim_sent_at,h.claim_response_status,h.claim_response_at,h.claim_response_remarks
  from public.hmo_claims h join base p on p.id=h.patient_id
  where h.clinic_id=p_clinic_id
  order by h.patient_id,h.updated_at desc nulls last,h.created_at desc,h.id desc
),
request_activity as (
  select h.patient_id,
    bool_or(coalesce(h.hmo_request_sent,false)) request_ever_sent,
    max(h.hmo_request_sent_at) filter (where h.hmo_request_sent=true) latest_request_sent_at
  from public.hmo_claims h join base p on p.id=h.patient_id
  where h.clinic_id=p_clinic_id
  group by h.patient_id
),
rows as (
  select b.id,b.full_name,b.date_of_birth,b.age,b.gender,b.phone,b.payment_type,b.active_hmo_id,b.queue_number,
    b.patient_number,b.hmo_name,b.family_id,b.family_name,b.hmo_verification_status,b.created_at,
    coalesce(v.visit_count,0)::bigint visit_count,v.last_visit,
    coalesce(bl.outstanding_balance,0)::numeric outstanding_balance,coalesce(bl.amount_paid,0)::numeric amount_paid,
    coalesce(bl.patient_payable,0)::numeric patient_payable,
    case
      when not coalesce(bl.has_actual_bill,false) then case when b.payment_type='hmo' then 'HMO' else 'No billing' end
      when coalesce(bl.outstanding_balance,0)>0 and coalesce(bl.amount_paid,0)>0 then case when b.payment_type='hmo' then 'HMO / Partial' else 'Partial' end
      when coalesce(bl.outstanding_balance,0)>0 then case when b.payment_type='hmo' then 'HMO / Due' else 'Due' end
      else case when b.payment_type='hmo' then 'HMO / Paid' else 'Paid' end
    end payment_status,
    lc.id hmo_claim_id,lc.status hmo_claim_status,
    case when lc.id is not null and coalesce(lc.approved_amount,0)>0 then lc.approved_amount
         when lc.id is not null then coalesce(lc.service_cost,0) else 0 end::numeric hmo_claim_amount,
    coalesce(ra.request_ever_sent,coalesce(lc.hmo_request_sent,false)) hmo_request_sent,
    coalesce(lc.hmo_request_sent_at,ra.latest_request_sent_at) hmo_request_sent_at,
    case when coalesce(lc.hmo_request_status,'Not sent')='Not sent' and coalesce(ra.request_ever_sent,false)
      then 'Sent' else coalesce(lc.hmo_request_status,'Not sent') end hmo_request_status,
    lc.hmo_request_response_at,lc.hmo_request_remarks,
    coalesce(lc.claim_sent,false) hmo_claim_sent,lc.claim_sent_at,
    coalesce(lc.claim_response_status,'Pending') hmo_claim_response_status,lc.claim_response_at,lc.claim_response_remarks
  from base b left join visits v on v.patient_id=b.id left join bills bl on bl.patient_id=b.id
  left join latest_claim lc on lc.patient_id=b.id
  left join request_activity ra on ra.patient_id=b.id
)
select r.*,count(*) over()::bigint total_count from rows r
where
  (p_payment_filter is null or p_payment_filter='' or
   (p_payment_filter='paid' and r.payment_status in ('Paid','HMO / Paid')) or
   (p_payment_filter='due' and r.payment_status in ('Due','HMO / Due','Partial','HMO / Partial')))
  and (not p_hmo_attention or (r.payment_type='hmo' and
    (r.hmo_claim_status is null or lower(r.hmo_claim_status) in ('pending','requested','submitted','sent','processing','approved'))))
order by r.created_at desc,r.id desc
limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,coalesce(p_offset,0));
$function$;
