
-- Storage bucket for product images
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);

CREATE POLICY "Anyone can view product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');

-- Billings table
CREATE TABLE public.billings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id bigint REFERENCES public.patients(id),
  visit_id bigint REFERENCES public.visits(id),
  consultation_fee numeric NOT NULL DEFAULT 0,
  drug_cost numeric NOT NULL DEFAULT 0,
  glasses_cost numeric NOT NULL DEFAULT 0,
  other_charges numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0,
  payment_method text DEFAULT 'Cash',
  payment_status text NOT NULL DEFAULT 'Unpaid',
  patient_type text NOT NULL DEFAULT 'Private',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated select billings" ON public.billings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert billings" ON public.billings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update billings" ON public.billings FOR UPDATE TO authenticated USING (true);

-- HMO Claims table
CREATE TABLE public.hmo_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_id uuid REFERENCES public.billings(id),
  patient_id bigint REFERENCES public.patients(id),
  hmo_name text NOT NULL,
  service_cost numeric NOT NULL DEFAULT 0,
  approved_amount numeric NOT NULL DEFAULT 0,
  co_payment numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hmo_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated select hmo_claims" ON public.hmo_claims FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert hmo_claims" ON public.hmo_claims FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update hmo_claims" ON public.hmo_claims FOR UPDATE TO authenticated USING (true);

-- Add missing RLS policies for appointments
CREATE POLICY "Authenticated select appointments" ON public.appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert appointments" ON public.appointments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update appointments" ON public.appointments FOR UPDATE TO authenticated USING (true);

-- Add missing RLS policies for prescriptions
CREATE POLICY "Authenticated select prescriptions" ON public.prescriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert prescriptions" ON public.prescriptions FOR INSERT TO authenticated WITH CHECK (true);

-- Add missing RLS policies for receipts
CREATE POLICY "Authenticated select receipts" ON public.receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert receipts" ON public.receipts FOR INSERT TO authenticated WITH CHECK (true);
