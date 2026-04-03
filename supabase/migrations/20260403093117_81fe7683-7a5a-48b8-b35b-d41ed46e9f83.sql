
-- ========== 1. USER ROLES ==========
CREATE TYPE public.app_role AS ENUM ('admin', 'doctor', 'receptionist');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Roles: users can see their own roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Admins can manage all roles
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ========== 2. PATIENTS: new columns ==========
ALTER TABLE public."Patients"
  ADD COLUMN IF NOT EXISTS patient_type text NOT NULL DEFAULT 'Private',
  ADD COLUMN IF NOT EXISTS hmo_provider text DEFAULT '',
  ADD COLUMN IF NOT EXISTS patient_uid text;

-- Sequence for patient_uid
CREATE SEQUENCE IF NOT EXISTS patient_uid_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_patient_uid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.patient_uid IS NULL OR NEW.patient_uid = '' THEN
    NEW.patient_uid := 'OPT-' || LPAD(nextval('patient_uid_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_patient_uid
  BEFORE INSERT ON public."Patients"
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_patient_uid();

-- ========== 3. VISITS: new clinical columns ==========
ALTER TABLE public."Visits"
  ADD COLUMN IF NOT EXISTS pinhole_od text,
  ADD COLUMN IF NOT EXISTS pinhole_os text,
  ADD COLUMN IF NOT EXISTS auto_va_od text,
  ADD COLUMN IF NOT EXISTS auto_va_os text,
  ADD COLUMN IF NOT EXISTS sub_va_od text,
  ADD COLUMN IF NOT EXISTS sub_va_os text,
  ADD COLUMN IF NOT EXISTS reading_add_od text,
  ADD COLUMN IF NOT EXISTS reading_add_os text,
  ADD COLUMN IF NOT EXISTS reading_add_va_od text,
  ADD COLUMN IF NOT EXISTS reading_add_va_os text,
  ADD COLUMN IF NOT EXISTS ext_lids text,
  ADD COLUMN IF NOT EXISTS ext_conjunctiva text,
  ADD COLUMN IF NOT EXISTS ext_cornea text,
  ADD COLUMN IF NOT EXISTS int_fundoscopy_od text,
  ADD COLUMN IF NOT EXISTS int_fundoscopy_os text,
  ADD COLUMN IF NOT EXISTS int_cdr_od text,
  ADD COLUMN IF NOT EXISTS int_cdr_os text,
  ADD COLUMN IF NOT EXISTS int_fundus_bg text,
  ADD COLUMN IF NOT EXISTS tonometry_od text,
  ADD COLUMN IF NOT EXISTS tonometry_os text,
  ADD COLUMN IF NOT EXISTS tonometry_time text,
  ADD COLUMN IF NOT EXISTS tonometry_ampm text;

-- ========== 4. SECURE RLS: Replace public policies with authenticated ==========

-- Patients: drop old public policies
DROP POLICY IF EXISTS "Allow public select on Patients" ON public."Patients";
DROP POLICY IF EXISTS "Allow public insert on Patients" ON public."Patients";
DROP POLICY IF EXISTS "Allow public update on Patients" ON public."Patients";

CREATE POLICY "Authenticated select Patients" ON public."Patients"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert Patients" ON public."Patients"
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update Patients" ON public."Patients"
  FOR UPDATE TO authenticated USING (true);

-- Visits: drop old public policies
DROP POLICY IF EXISTS "Allow public select on Visits" ON public."Visits";
DROP POLICY IF EXISTS "Allow public insert on Visits" ON public."Visits";
DROP POLICY IF EXISTS "Allow public update on Visits" ON public."Visits";

CREATE POLICY "Authenticated select Visits" ON public."Visits"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert Visits" ON public."Visits"
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update Visits" ON public."Visits"
  FOR UPDATE TO authenticated USING (true);

-- History: drop old public policies
DROP POLICY IF EXISTS "Allow public select on History" ON public."History";
DROP POLICY IF EXISTS "Allow public insert on History" ON public."History";

CREATE POLICY "Authenticated select History" ON public."History"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert History" ON public."History"
  FOR INSERT TO authenticated WITH CHECK (true);
