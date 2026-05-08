
-- PHASE 1: Create missing tables (non-destructive)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  role text not null,
  created_at timestamp default now()
);

-- Add unique constraint if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_clinic_id_key'
  ) THEN
    BEGIN
      ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_clinic_id_key UNIQUE (user_id, clinic_id);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END $$;

-- clinic_invites table already exists per schema; ensure required columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_invites' AND column_name='status') THEN
    ALTER TABLE public.clinic_invites ADD COLUMN status text default 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_invites' AND column_name='invited_by') THEN
    ALTER TABLE public.clinic_invites ADD COLUMN invited_by uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_invites' AND column_name='created_at') THEN
    ALTER TABLE public.clinic_invites ADD COLUMN created_at timestamp default now();
  END IF;
END $$;

-- PHASE 2: Ensure clinic_settings.setup_completed exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_settings' AND column_name='setup_completed') THEN
    ALTER TABLE public.clinic_settings ADD COLUMN setup_completed boolean default false;
  END IF;
END $$;

-- PHASE 3: Enable RLS safely
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_invites ENABLE ROW LEVEL SECURITY;

-- PHASE 4: RLS policies (drop+create for idempotency since CREATE POLICY IF NOT EXISTS is unsupported pre-PG15)
DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;
CREATE POLICY "user_roles_select"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "invites_select" ON public.clinic_invites;
CREATE POLICY "invites_select"
ON public.clinic_invites
FOR SELECT
USING (email = (select email from auth.users where id = auth.uid())::text);

DROP POLICY IF EXISTS "invites_insert" ON public.clinic_invites;
CREATE POLICY "invites_insert"
ON public.clinic_invites
FOR INSERT
WITH CHECK (true);
