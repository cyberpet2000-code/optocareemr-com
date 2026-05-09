
-- 1) Add expires_at to clinic_invites with 48h default
ALTER TABLE public.clinic_invites
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours');

-- Backfill: any old rows without expires_at -> 48h after created_at
UPDATE public.clinic_invites
SET expires_at = COALESCE(created_at, now()) + interval '48 hours'
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clinic_invites_token ON public.clinic_invites(token);
CREATE INDEX IF NOT EXISTS idx_clinic_invites_clinic ON public.clinic_invites(clinic_id);

-- 2) Super admin RLS for managing invites (select/update/delete)
DROP POLICY IF EXISTS "invites_select_super_admin" ON public.clinic_invites;
CREATE POLICY "invites_select_super_admin"
  ON public.clinic_invites FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "invites_update_super_admin" ON public.clinic_invites;
CREATE POLICY "invites_update_super_admin"
  ON public.clinic_invites FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "invites_delete_super_admin" ON public.clinic_invites;
CREATE POLICY "invites_delete_super_admin"
  ON public.clinic_invites FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 3) Onboarding tracker: log account_created step when invite accepted
CREATE OR REPLACE FUNCTION public.log_invite_acceptance_onboarding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    INSERT INTO public.clinic_onboarding (clinic_id, user_id, step, completed)
    SELECT NEW.clinic_id, p.id, 'account_created', false
    FROM public.profiles p
    WHERE lower(p.email) = lower(NEW.email)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invite_accept_onboarding ON public.clinic_invites;
CREATE TRIGGER trg_invite_accept_onboarding
AFTER UPDATE ON public.clinic_invites
FOR EACH ROW EXECUTE FUNCTION public.log_invite_acceptance_onboarding();
