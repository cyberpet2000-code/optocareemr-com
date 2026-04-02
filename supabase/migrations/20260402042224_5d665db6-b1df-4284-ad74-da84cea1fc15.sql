
ALTER TABLE public."Patients"
  ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS address text DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_of_kin text DEFAULT '',
  ADD COLUMN IF NOT EXISTS insurance_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS enrollee_number text DEFAULT '';

ALTER TABLE public."History" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on History" ON public."History" FOR SELECT USING (true);
CREATE POLICY "Allow public insert on History" ON public."History" FOR INSERT WITH CHECK (true);
