
-- Add columns to Visits table
ALTER TABLE public."Visits"
ADD COLUMN patient_id bigint REFERENCES public."Patients"(id) ON DELETE CASCADE,
ADD COLUMN va_od_distance text,
ADD COLUMN va_os_distance text,
ADD COLUMN va_ou_distance text,
ADD COLUMN va_od_near text,
ADD COLUMN va_os_near text,
ADD COLUMN va_ou_near text,
ADD COLUMN auto_od_sphere text,
ADD COLUMN auto_od_cylinder text,
ADD COLUMN auto_od_axis text,
ADD COLUMN auto_os_sphere text,
ADD COLUMN auto_os_cylinder text,
ADD COLUMN auto_os_axis text,
ADD COLUMN sub_od_sphere text,
ADD COLUMN sub_od_cylinder text,
ADD COLUMN sub_od_axis text,
ADD COLUMN sub_os_sphere text,
ADD COLUMN sub_os_cylinder text,
ADD COLUMN sub_os_axis text,
ADD COLUMN final_prescription text,
ADD COLUMN chief_complaint text,
ADD COLUMN duration text,
ADD COLUMN ocular_history text,
ADD COLUMN medical_history text,
ADD COLUMN diagnosis text,
ADD COLUMN drugs_given text,
ADD COLUMN glasses_prescribed text;

-- RLS policies for Visits
CREATE POLICY "Allow public insert on Visits" ON public."Visits" FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select on Visits" ON public."Visits" FOR SELECT USING (true);
CREATE POLICY "Allow public update on Visits" ON public."Visits" FOR UPDATE USING (true);
