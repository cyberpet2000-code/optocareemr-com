-- Drop and rebuild
DROP TABLE IF EXISTS public.billing_items CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.hmo_payments CASCADE;
DROP TABLE IF EXISTS public.hmo_approvals CASCADE;
DROP TABLE IF EXISTS public.hmo_claims CASCADE;
DROP TABLE IF EXISTS public.hmo_history CASCADE;
DROP TABLE IF EXISTS public.patient_hmos CASCADE;
DROP TABLE IF EXISTS public.hmo_plans CASCADE;
DROP TABLE IF EXISTS public.hmos CASCADE;
DROP TABLE IF EXISTS public.billing CASCADE;
DROP TABLE IF EXISTS public.billing_local CASCADE;
DROP TABLE IF EXISTS public.dispensing CASCADE;
DROP TABLE IF EXISTS public.prescriptions CASCADE;
DROP TABLE IF EXISTS public.prescriptions_local CASCADE;
DROP TABLE IF EXISTS public.lens_prescriptions CASCADE;
DROP TABLE IF EXISTS public.refraction CASCADE;
DROP TABLE IF EXISTS public.glaucoma_records CASCADE;
DROP TABLE IF EXISTS public.cataract_cases CASCADE;
DROP TABLE IF EXISTS public.consultations CASCADE;
DROP TABLE IF EXISTS public.pharmacy_sales CASCADE;
DROP TABLE IF EXISTS public.pharmacy CASCADE;
DROP TABLE IF EXISTS public.inventory_sale_items CASCADE;
DROP TABLE IF EXISTS public.inventory_sales CASCADE;
DROP TABLE IF EXISTS public.inventory CASCADE;
DROP TABLE IF EXISTS public.appointments CASCADE;
DROP TABLE IF EXISTS public.auto_appointments CASCADE;
DROP TABLE IF EXISTS public.alerts CASCADE;
DROP TABLE IF EXISTS public.followups CASCADE;
DROP TABLE IF EXISTS public.receipts CASCADE;
DROP TABLE IF EXISTS public.restock_history CASCADE;
DROP TABLE IF EXISTS public.restock_logs CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.history CASCADE;
DROP TABLE IF EXISTS public.visits CASCADE;
DROP TABLE IF EXISTS public.patients CASCADE;
DROP TABLE IF EXISTS public.patients_local CASCADE;
DROP TABLE IF EXISTS public.patients_new CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.claims CASCADE;
DROP TABLE IF EXISTS public.user_role CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  clinic_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, clinic_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.current_clinic_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE SEQUENCE IF NOT EXISTS public.patient_queue_seq;

CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  full_name text NOT NULL DEFAULT '',
  phone text DEFAULT '',
  age integer,
  gender text,
  address text DEFAULT '',
  next_of_kin text DEFAULT '',
  payment_type text NOT NULL DEFAULT 'private',
  active_hmo_id uuid,
  active_hmo_plan_id uuid,
  enrollee_number text DEFAULT '',
  queue_number integer NOT NULL DEFAULT nextval('public.patient_queue_seq'),
  queue_status text NOT NULL DEFAULT 'waiting',
  priority text NOT NULL DEFAULT 'normal',
  assigned_doctor uuid,
  status text NOT NULL DEFAULT 'new',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.hmos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  name text NOT NULL,
  website text, phone text, email text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hmos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_hmos_updated BEFORE UPDATE ON public.hmos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.hmo_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hmo_id uuid NOT NULL REFERENCES public.hmos(id) ON DELETE CASCADE,
  clinic_id uuid,
  plan_name text NOT NULL,
  coverage_limit numeric DEFAULT 0,
  used_amount numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hmo_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hmo_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id uuid,
  old_payment_type text, new_payment_type text,
  old_hmo_id uuid, new_hmo_id uuid,
  old_hmo_plan_id uuid, new_hmo_plan_id uuid,
  change_reason text, changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hmo_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid, clinic_id uuid,
  payment_type text NOT NULL DEFAULT 'private',
  active_hmo_id uuid, active_hmo_plan_id uuid,
  chief_complaint text, history text,
  va_unaided_od text, va_unaided_os text,
  va_aided_od text, va_aided_os text,
  old_lens_prescription text,
  examination text, diagnosis text, treatment text,
  iop_od numeric, iop_os numeric,
  notes text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_visits_updated BEFORE UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_visits_patient ON public.visits(patient_id, created_at DESC);

CREATE TABLE public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Frames',
  price numeric NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 5,
  low_stock_threshold integer NOT NULL DEFAULT 5,
  image_url text,
  drug_category text,
  expiry_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_inventory_updated BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.inventory_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  patient_id uuid,
  sold_by uuid,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_sales ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.inventory_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.inventory_sales(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id),
  clinic_id uuid,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0
);
ALTER TABLE public.inventory_sale_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pharmacy_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  inventory_id uuid REFERENCES public.inventory(id),
  quantity integer NOT NULL DEFAULT 1,
  price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pharmacy_sales ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.restock_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE CASCADE,
  clinic_id uuid,
  added_by uuid,
  previous_stock integer,
  quantity_added integer,
  new_stock integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.restock_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.billing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  payer_type text NOT NULL DEFAULT 'private',
  hmo_id uuid REFERENCES public.hmos(id),
  hmo_plan_id uuid REFERENCES public.hmo_plans(id),
  consultation_fee numeric NOT NULL DEFAULT 0,
  items_total numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0,
  hmo_covered_amount numeric DEFAULT 0,
  patient_payable numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_billing_updated BEFORE UPDATE ON public.billing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.billing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_id uuid NOT NULL REFERENCES public.billing(id) ON DELETE CASCADE,
  clinic_id uuid,
  item_type text NOT NULL,
  item_name text NOT NULL,
  inventory_id uuid REFERENCES public.inventory(id),
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_id uuid NOT NULL REFERENCES public.billing(id) ON DELETE CASCADE,
  clinic_id uuid,
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'Cash',
  paid_by text NOT NULL DEFAULT 'patient',
  received_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hmo_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  billing_id uuid REFERENCES public.billing(id) ON DELETE CASCADE,
  hmo_id uuid REFERENCES public.hmos(id),
  hmo_name text,
  patient_id uuid REFERENCES public.patients(id),
  service_cost numeric NOT NULL DEFAULT 0,
  approved_amount numeric NOT NULL DEFAULT 0,
  co_payment numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hmo_claims ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_hmo_claims_updated BEFORE UPDATE ON public.hmo_claims FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid,
  appointment_date date NOT NULL,
  appointment_time time,
  reason text, notes text,
  priority text DEFAULT 'normal',
  status text NOT NULL DEFAULT 'pending',
  source text DEFAULT 'manual',
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  due_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  alert_type text,
  severity text NOT NULL DEFAULT 'info',
  message text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- ===== Auto-billing trigger =====
CREATE OR REPLACE FUNCTION public.auto_create_bill_on_visit_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    IF NOT EXISTS (SELECT 1 FROM public.billing WHERE visit_id = NEW.id) THEN
      INSERT INTO public.billing (clinic_id, visit_id, patient_id, payer_type, hmo_id, consultation_fee, total_amount, balance, status)
      VALUES (NEW.clinic_id, NEW.id, NEW.patient_id, NEW.payment_type, NEW.active_hmo_id, 0, 0, 0, 'pending');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_auto_bill_visit AFTER UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.auto_create_bill_on_visit_complete();

CREATE OR REPLACE FUNCTION public.recalc_billing_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_billing_id uuid; v_items numeric; v_paid numeric; v_consult numeric;
BEGIN
  v_billing_id := COALESCE(NEW.billing_id, OLD.billing_id);
  SELECT COALESCE(SUM(total_price),0) INTO v_items FROM public.billing_items WHERE billing_id = v_billing_id;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.payments WHERE billing_id = v_billing_id;
  SELECT consultation_fee INTO v_consult FROM public.billing WHERE id = v_billing_id;
  UPDATE public.billing
    SET items_total = v_items,
        total_amount = COALESCE(v_consult,0) + v_items,
        amount_paid = v_paid,
        balance = (COALESCE(v_consult,0) + v_items) - v_paid,
        status = CASE
          WHEN v_paid <= 0 THEN 'pending'
          WHEN v_paid >= (COALESCE(v_consult,0) + v_items) THEN 'paid'
          ELSE 'partial' END
    WHERE id = v_billing_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_billing_items_recalc AFTER INSERT OR UPDATE OR DELETE ON public.billing_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_billing_totals();
CREATE TRIGGER trg_payments_recalc AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.recalc_billing_totals();

CREATE OR REPLACE FUNCTION public.log_hmo_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (OLD.payment_type IS DISTINCT FROM NEW.payment_type)
     OR (OLD.active_hmo_id IS DISTINCT FROM NEW.active_hmo_id)
     OR (OLD.active_hmo_plan_id IS DISTINCT FROM NEW.active_hmo_plan_id) THEN
    INSERT INTO public.hmo_history (patient_id, clinic_id, old_payment_type, new_payment_type, old_hmo_id, new_hmo_id, old_hmo_plan_id, new_hmo_plan_id, changed_by)
    VALUES (NEW.id, NEW.clinic_id, OLD.payment_type, NEW.payment_type, OLD.active_hmo_id, NEW.active_hmo_id, OLD.active_hmo_plan_id, NEW.active_hmo_plan_id, auth.uid());
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_log_hmo_change AFTER UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.log_hmo_change();

-- ===== RLS policies =====
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'patients','visits','hmos','hmo_plans','hmo_history','hmo_claims',
    'billing','billing_items','payments','inventory','inventory_sales',
    'inventory_sale_items','pharmacy_sales','restock_history',
    'appointments','followups','alerts'
  ]) LOOP
    EXECUTE format('CREATE POLICY "clinic_select_%s" ON public.%I FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR clinic_id = public.current_clinic_id() OR clinic_id IS NULL);', t, t);
    EXECUTE format('CREATE POLICY "clinic_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()) OR clinic_id = public.current_clinic_id() OR clinic_id IS NULL);', t, t);
    EXECUTE format('CREATE POLICY "clinic_update_%s" ON public.%I FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid()) OR clinic_id = public.current_clinic_id() OR clinic_id IS NULL);', t, t);
    EXECUTE format('CREATE POLICY "clinic_delete_%s" ON public.%I FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),''admin''));', t, t);
  END LOOP;
END $$;

-- ===== Realtime =====
ALTER TABLE public.patients REPLICA IDENTITY FULL;
ALTER TABLE public.visits REPLICA IDENTITY FULL;
ALTER TABLE public.billing REPLICA IDENTITY FULL;
ALTER TABLE public.appointments REPLICA IDENTITY FULL;
ALTER TABLE public.alerts REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.patients, public.visits, public.billing, public.appointments, public.alerts;
EXCEPTION WHEN OTHERS THEN NULL; END $$;