
CREATE POLICY "Allow public insert on Patients" ON public."Patients" FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select on Patients" ON public."Patients" FOR SELECT USING (true);
CREATE POLICY "Allow public update on Patients" ON public."Patients" FOR UPDATE USING (true);
