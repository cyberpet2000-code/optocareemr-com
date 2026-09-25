-- Harden tenant integrity across billing, HMO claims, payments, and inventory audit data.
-- Existing data was checked before this migration:
-- cross-clinic references = 0 across all enforced relationships.
-- null clinic_id counts = 0 for the affected tables.

-- Parent composite keys used to enforce same-clinic foreign-key relationships.
CREATE UNIQUE INDEX IF NOT EXISTS patients_id_clinic_unique
  ON public.patients (id, clinic_id);

CREATE UNIQUE INDEX IF NOT EXISTS visits_id_clinic_unique
  ON public.visits (id, clinic_id);

CREATE UNIQUE INDEX IF NOT EXISTS families_id_clinic_unique
  ON public.families (id, clinic_id);

CREATE UNIQUE INDEX IF NOT EXISTS hmo_plans_id_clinic_unique
  ON public.hmo_plans (id, clinic_id);

CREATE UNIQUE INDEX IF NOT EXISTS hmo_plans_id_hmo_clinic_unique
  ON public.hmo_plans (id, hmo_id, clinic_id);

CREATE UNIQUE INDEX IF NOT EXISTS billing_id_clinic_unique
  ON public.billing (id, clinic_id);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_id_clinic_unique
  ON public.inventory (id, clinic_id);

-- These records are clinic-owned and already have no NULL clinic_id values.
ALTER TABLE public.billing
  ALTER COLUMN clinic_id SET NOT NULL;

ALTER TABLE public.payments
  ALTER COLUMN clinic_id SET NOT NULL;

ALTER TABLE public.hmo_claims
  ALTER COLUMN clinic_id SET NOT NULL;

-- Billing may only reference records belonging to the same clinic.
ALTER TABLE public.billing
  ADD CONSTRAINT billing_patient_same_clinic_fkey
  FOREIGN KEY (patient_id, clinic_id)
  REFERENCES public.patients (id, clinic_id);

ALTER TABLE public.billing
  ADD CONSTRAINT billing_visit_same_clinic_fkey
  FOREIGN KEY (visit_id, clinic_id)
  REFERENCES public.visits (id, clinic_id);

ALTER TABLE public.billing
  ADD CONSTRAINT billing_hmo_same_clinic_fkey
  FOREIGN KEY (hmo_id, clinic_id)
  REFERENCES public.hmos (id, clinic_id);

ALTER TABLE public.billing
  ADD CONSTRAINT billing_hmo_plan_same_clinic_fkey
  FOREIGN KEY (hmo_plan_id, clinic_id)
  REFERENCES public.hmo_plans (id, clinic_id);

ALTER TABLE public.billing
  ADD CONSTRAINT billing_family_same_clinic_fkey
  FOREIGN KEY (family_id, clinic_id)
  REFERENCES public.families (id, clinic_id);

ALTER TABLE public.billing
  ADD CONSTRAINT billing_hmo_plan_same_hmo_clinic_fkey
  FOREIGN KEY (hmo_plan_id, hmo_id, clinic_id)
  REFERENCES public.hmo_plans (id, hmo_id, clinic_id);

-- Billing items may only point to same-clinic billing and inventory.
ALTER TABLE public.billing_items
  ADD CONSTRAINT billing_items_billing_same_clinic_fkey
  FOREIGN KEY (billing_id, clinic_id)
  REFERENCES public.billing (id, clinic_id);

ALTER TABLE public.billing_items
  ADD CONSTRAINT billing_items_inventory_same_clinic_fkey
  FOREIGN KEY (inventory_id, clinic_id)
  REFERENCES public.inventory (id, clinic_id);

-- Payments may only belong to a billing record in the same clinic.
ALTER TABLE public.payments
  ADD CONSTRAINT payments_billing_same_clinic_fkey
  FOREIGN KEY (billing_id, clinic_id)
  REFERENCES public.billing (id, clinic_id);

-- HMO claims may only reference same-clinic billing, HMO, and patient records.
ALTER TABLE public.hmo_claims
  ADD CONSTRAINT hmo_claims_billing_same_clinic_fkey
  FOREIGN KEY (billing_id, clinic_id)
  REFERENCES public.billing (id, clinic_id);

ALTER TABLE public.hmo_claims
  ADD CONSTRAINT hmo_claims_hmo_same_clinic_fkey
  FOREIGN KEY (hmo_id, clinic_id)
  REFERENCES public.hmos (id, clinic_id);

ALTER TABLE public.hmo_claims
  ADD CONSTRAINT hmo_claims_patient_same_clinic_fkey
  FOREIGN KEY (patient_id, clinic_id)
  REFERENCES public.patients (id, clinic_id);

-- Inventory audit records may only point to same-clinic stock/patient/visit records.
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_inventory_same_clinic_fkey
  FOREIGN KEY (inventory_id, clinic_id)
  REFERENCES public.inventory (id, clinic_id);

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_patient_same_clinic_fkey
  FOREIGN KEY (patient_id, clinic_id)
  REFERENCES public.patients (id, clinic_id);

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_visit_same_clinic_fkey
  FOREIGN KEY (visit_id, clinic_id)
  REFERENCES public.visits (id, clinic_id);

-- Inventory movements are an audit trail and should not be directly forgeable
-- by ordinary clinic members. Application code reads this table directly;
-- legitimate stock changes use SECURITY DEFINER stock/dispensing functions and triggers.
DROP POLICY IF EXISTS inv_move_insert_members ON public.inventory_movements;

CREATE POLICY inv_move_insert_admin
ON public.inventory_movements
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.clinic_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.clinic_id = inventory_movements.clinic_id
      AND lower(cu.role) = 'admin'
  )
);
