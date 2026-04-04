
-- ============================
-- APPOINTMENTS TABLE
-- ============================
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id BIGINT REFERENCES public."Patients"(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  appointment_time TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated select appointments" ON public.appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert appointments" ON public.appointments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update appointments" ON public.appointments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete appointments" ON public.appointments FOR DELETE TO authenticated USING (true);

-- ============================
-- INVENTORY / PRODUCTS TABLE
-- ============================
CREATE TABLE public.inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Frames',
  price NUMERIC NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  drug_category TEXT,
  expiry_date DATE,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated select inventory" ON public.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert inventory" ON public.inventory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update inventory" ON public.inventory FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete inventory" ON public.inventory FOR DELETE TO authenticated USING (true);

-- ============================
-- INVENTORY SALES TABLE
-- ============================
CREATE TABLE public.inventory_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id BIGINT REFERENCES public."Patients"(id),
  sold_by UUID REFERENCES auth.users(id),
  total_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated select inventory_sales" ON public.inventory_sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert inventory_sales" ON public.inventory_sales FOR INSERT TO authenticated WITH CHECK (true);

-- ============================
-- INVENTORY SALE ITEMS TABLE
-- ============================
CREATE TABLE public.inventory_sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES public.inventory_sales(id) ON DELETE CASCADE NOT NULL,
  inventory_id UUID REFERENCES public.inventory(id) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.inventory_sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated select inventory_sale_items" ON public.inventory_sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert inventory_sale_items" ON public.inventory_sale_items FOR INSERT TO authenticated WITH CHECK (true);

-- ============================
-- AUTO DEDUCT STOCK TRIGGER
-- ============================
CREATE OR REPLACE FUNCTION public.deduct_inventory_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.inventory
  SET stock = stock - NEW.quantity, updated_at = now()
  WHERE id = NEW.inventory_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER deduct_stock_on_sale
AFTER INSERT ON public.inventory_sale_items
FOR EACH ROW
EXECUTE FUNCTION public.deduct_inventory_stock();
