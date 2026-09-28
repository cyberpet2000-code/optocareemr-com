-- OptoCare legal acceptance ledger
-- Versioned evidence of explicit acceptance. CAC identity details remain placeholders in legal copy
-- until corporate registration details are available.

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete set null,
  document_key text not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  acceptance_method text not null default 'checkbox',
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint legal_acceptances_method_check check (
    acceptance_method in ('checkbox','reacceptance_checkbox','admin_acknowledgement')
  ),
  constraint legal_acceptances_document_key_check check (
    document_key in (
      'terms',
      'privacy',
      'dpa',
      'security',
      'medical-disclaimer',
      'ai-disclaimer',
      'cookies',
      'acceptable-use',
      'subscription-refund'
    )
  ),
  constraint legal_acceptances_unique_version unique (user_id, document_key, document_version)
);

create index if not exists legal_acceptances_user_idx
  on public.legal_acceptances (user_id, accepted_at desc);

create index if not exists legal_acceptances_clinic_idx
  on public.legal_acceptances (clinic_id, accepted_at desc);

alter table public.legal_acceptances enable row level security;

drop policy if exists "legal_acceptances_select_own" on public.legal_acceptances;
create policy "legal_acceptances_select_own"
on public.legal_acceptances
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "legal_acceptances_insert_own" on public.legal_acceptances;
create policy "legal_acceptances_insert_own"
on public.legal_acceptances
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    clinic_id is null
    or exists (
      select 1
      from public.clinic_users cu
      where cu.user_id = (select auth.uid())
        and cu.clinic_id = legal_acceptances.clinic_id
    )
  )
);

comment on table public.legal_acceptances is
  'Versioned evidence of explicit acceptance of OptoCare legal documents. Does not replace statutory rights or legal advice.';
