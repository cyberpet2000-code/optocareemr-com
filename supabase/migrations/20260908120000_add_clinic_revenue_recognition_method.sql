-- Migration: Add clinic-level revenue_recognition_method and set Cedar Eye Clinic to payment_date

BEGIN;

-- 1) Add column with allowed values and default to preserve existing behavior
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS revenue_recognition_method text NOT NULL DEFAULT 'service_date'
    CHECK (revenue_recognition_method IN ('service_date','payment_date'));

-- 2) Backfill existing rows explicitly to the default to be safe (idempotent)
UPDATE public.clinics
  SET revenue_recognition_method = 'service_date'
  WHERE revenue_recognition_method IS NULL;

-- 3) One-time Cedar Eye Clinic update: resolve by auth.users.email -> auth.users.id -> profiles/clinic_users -> clinics.id
--    This uses the email only inside this migration to identify the target clinic. It will NOT be used in runtime code.
DO $$
DECLARE
  uid uuid;
  cid uuid;
BEGIN
  -- Find the auth user by email (case-insensitive)
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower('cedaeyeclinic@gmail.com') LIMIT 1;
  IF uid IS NULL THEN
    RAISE NOTICE 'No auth user found for cedaeyeclinic@gmail.com; skipping Cedar clinic update.';
    RETURN;
  END IF;

  -- First try the profile primary clinic
  SELECT clinic_id INTO cid FROM public.profiles WHERE id = uid AND clinic_id IS NOT NULL LIMIT 1;

  -- If not found via profile, try clinic_users membership
  IF cid IS NULL THEN
    SELECT clinic_id INTO cid FROM public.clinic_users WHERE user_id = uid LIMIT 1;
  END IF;

  IF cid IS NULL THEN
    RAISE NOTICE 'No clinic_id found for user %; skipping Cedar clinic update.', uid;
    RETURN;
  END IF;

  UPDATE public.clinics
    SET revenue_recognition_method = 'payment_date'
    WHERE id = cid;

  RAISE NOTICE 'Set revenue_recognition_method = payment_date for clinic % (resolved from email).', cid;
END$$;

COMMIT;
