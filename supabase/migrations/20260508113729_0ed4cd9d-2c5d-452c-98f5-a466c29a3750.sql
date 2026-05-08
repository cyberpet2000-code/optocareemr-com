
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS va_unaided_near_ou text,
  ADD COLUMN IF NOT EXISTS va_aided_near_ou text,
  ADD COLUMN IF NOT EXISTS auto_va_od text,
  ADD COLUMN IF NOT EXISTS auto_va_os text,
  ADD COLUMN IF NOT EXISTS sub_va_od text,
  ADD COLUMN IF NOT EXISTS sub_va_os text;
