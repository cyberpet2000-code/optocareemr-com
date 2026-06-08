ALTER TABLE public.hmos
  ADD COLUMN IF NOT EXISTS claims_portal_url text,
  ADD COLUMN IF NOT EXISTS verification_notes text;