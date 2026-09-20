-- Add staff personal and emergency contact details.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_address text,
  ADD COLUMN IF NOT EXISTS next_of_kin_name text,
  ADD COLUMN IF NOT EXISTS next_of_kin_phone text;
