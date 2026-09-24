alter table public.hmo_claims
  add column if not exists hmo_request_sent boolean not null default false,
  add column if not exists hmo_request_sent_at timestamptz,
  add column if not exists hmo_request_status text not null default 'Not sent',
  add column if not exists hmo_request_response_at timestamptz,
  add column if not exists hmo_request_remarks text;