
-- Add finance email to clinics (optional recipient for monthly reports)
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS finance_email text;

-- =====================================================
-- EXPENSES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  category text NOT NULL,
  description text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text,
  vendor text,
  receipt_url text,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_clinic_date ON public.expenses(clinic_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(clinic_id, category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_select_clinic_members" ON public.expenses
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (SELECT 1 FROM public.user_clinic_memberships m WHERE m.user_id = auth.uid() AND m.clinic_id = expenses.clinic_id)
);

CREATE POLICY "expenses_insert_admin" ON public.expenses
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "expenses_update_admin" ON public.expenses
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "expenses_delete_admin" ON public.expenses
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON public.expenses;
CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- INVENTORY MOVEMENTS AUDIT LOG
-- =====================================================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  product_name text,
  quantity_before integer,
  quantity_delta integer NOT NULL,
  quantity_after integer,
  reason text NOT NULL CHECK (reason IN ('dispensed','sale','manual_adjustment','return','stock_count','restock')),
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_move_clinic_date ON public.inventory_movements(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_move_inventory ON public.inventory_movements(inventory_id);

GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_move_select_members" ON public.inventory_movements
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (SELECT 1 FROM public.user_clinic_memberships m WHERE m.user_id = auth.uid() AND m.clinic_id = inventory_movements.clinic_id)
);

CREATE POLICY "inv_move_insert_members" ON public.inventory_movements
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (SELECT 1 FROM public.user_clinic_memberships m WHERE m.user_id = auth.uid() AND m.clinic_id = inventory_movements.clinic_id)
);

-- Trigger: auto-log & deduct stock on inventory_sale_items insert
CREATE OR REPLACE FUNCTION public.log_inventory_sale_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_before integer;
  v_after integer;
  v_name text;
BEGIN
  SELECT stock_quantity, name INTO v_before, v_name FROM public.inventory WHERE id = NEW.inventory_id;
  IF v_before IS NULL THEN RETURN NEW; END IF;
  v_after := v_before - COALESCE(NEW.quantity, 0);
  UPDATE public.inventory SET stock_quantity = v_after, updated_at = now() WHERE id = NEW.inventory_id;
  INSERT INTO public.inventory_movements(
    clinic_id, inventory_id, product_name, quantity_before, quantity_delta, quantity_after, reason, staff_id
  ) VALUES (
    NEW.clinic_id, NEW.inventory_id, v_name, v_before, -COALESCE(NEW.quantity,0), v_after, 'sale', auth.uid()
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_inv_sale_movement ON public.inventory_sale_items;
CREATE TRIGGER trg_inv_sale_movement AFTER INSERT ON public.inventory_sale_items
FOR EACH ROW EXECUTE FUNCTION public.log_inventory_sale_movement();

-- =====================================================
-- MONTHLY REPORTS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.monthly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','ready','failed')),
  payload jsonb,
  storage_path text,
  file_size_bytes bigint,
  error_message text,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, year, month)
);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_clinic ON public.monthly_reports(clinic_id, year DESC, month DESC);

GRANT SELECT ON public.monthly_reports TO authenticated;
GRANT ALL ON public.monthly_reports TO service_role;
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_reports_select" ON public.monthly_reports
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (SELECT 1 FROM public.user_clinic_memberships m WHERE m.user_id = auth.uid() AND m.clinic_id = monthly_reports.clinic_id)
  )
);

DROP TRIGGER IF EXISTS trg_monthly_reports_updated_at ON public.monthly_reports;
CREATE TRIGGER trg_monthly_reports_updated_at BEFORE UPDATE ON public.monthly_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- REPORT EMAIL LOGS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.report_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.monthly_reports(id) ON DELETE SET NULL,
  recipient text NOT NULL,
  report_year integer NOT NULL,
  report_month integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  retries integer NOT NULL DEFAULT 0,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_email_logs_clinic ON public.report_email_logs(clinic_id, created_at DESC);

GRANT SELECT ON public.report_email_logs TO authenticated;
GRANT ALL ON public.report_email_logs TO service_role;
ALTER TABLE public.report_email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_email_logs_select" ON public.report_email_logs
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (SELECT 1 FROM public.user_clinic_memberships m WHERE m.user_id = auth.uid() AND m.clinic_id = report_email_logs.clinic_id)
  )
);
