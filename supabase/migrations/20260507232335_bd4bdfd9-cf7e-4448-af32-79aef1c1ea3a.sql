
-- Fix UUID/text COALESCE mismatch in enforce_clinic_id trigger function
CREATE OR REPLACE FUNCTION public.enforce_clinic_id()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  NEW.clinic_id := COALESCE(
    NEW.clinic_id,
    NULLIF(auth.jwt() ->> 'clinic_id', '')::uuid,
    public.current_clinic_id()
  );
  if NEW.clinic_id is null then
    raise exception 'No clinic context found';
  end if;
  return NEW;
end;
$function$;

-- Ensure clinic_switch_log has needed columns and RLS for inserts by authenticated users
ALTER TABLE public.clinic_switch_log
  ADD COLUMN IF NOT EXISTS access_granted boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.clinic_switch_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "switch_log_insert" ON public.clinic_switch_log;
CREATE POLICY "switch_log_insert" ON public.clinic_switch_log
  FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid());

DROP POLICY IF EXISTS "switch_log_select" ON public.clinic_switch_log;
CREATE POLICY "switch_log_select" ON public.clinic_switch_log
  FOR SELECT TO authenticated
  USING (admin_id = auth.uid() OR public.is_super_admin(auth.uid()));
