
-- 1. Extend clinics with cancellation + retention fields
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz;

-- 2. Archive scope + status enums (as text with check for portability)
CREATE TABLE IF NOT EXISTS public.clinic_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  generated_by uuid,
  scope text NOT NULL CHECK (scope IN ('full','patient','date_range')),
  patient_id uuid,
  date_from date,
  date_to date,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','generating','ready','failed','deleted')),
  storage_path text,
  file_size_bytes bigint,
  file_count int,
  encrypted boolean NOT NULL DEFAULT false,
  password_hint text,
  expires_at timestamptz,
  error_message text,
  progress int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_archives TO authenticated;
GRANT ALL ON public.clinic_archives TO service_role;

ALTER TABLE public.clinic_archives ENABLE ROW LEVEL SECURITY;

-- Super admins only
CREATE POLICY "super_admin_select_archives" ON public.clinic_archives
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true));

CREATE POLICY "super_admin_insert_archives" ON public.clinic_archives
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true));

CREATE POLICY "super_admin_update_archives" ON public.clinic_archives
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true));

CREATE POLICY "super_admin_delete_archives" ON public.clinic_archives
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true));

CREATE INDEX IF NOT EXISTS idx_clinic_archives_clinic ON public.clinic_archives(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinic_archives_status ON public.clinic_archives(status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_clinic_archives_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_clinic_archives_updated_at ON public.clinic_archives;
CREATE TRIGGER trg_clinic_archives_updated_at
  BEFORE UPDATE ON public.clinic_archives
  FOR EACH ROW EXECUTE FUNCTION public.touch_clinic_archives_updated_at();
