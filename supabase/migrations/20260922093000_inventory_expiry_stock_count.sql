-- Inventory expiry management and physical stock count finalization
CREATE OR REPLACE FUNCTION public.finalize_inventory_stock_count(
  p_clinic_id uuid,
  p_counts jsonb
)
RETURNS TABLE (
  inventory_id uuid,
  product_name text,
  quantity_before integer,
  physical_quantity integer,
  quantity_delta integer,
  quantity_after integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_before integer;
  v_after integer;
  v_delta integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'super_admin')
    OR (
      public.has_role(auth.uid(), 'admin')
      AND EXISTS (
        SELECT 1
        FROM public.user_clinic_memberships m
        WHERE m.user_id = auth.uid()
          AND m.clinic_id = p_clinic_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to finalize stock counts for this clinic';
  END IF;

  FOR r IN
    SELECT
      (x->>'inventory_id')::uuid AS inventory_id,
      GREATEST(0, (x->>'physical_quantity')::integer) AS physical_quantity
    FROM jsonb_array_elements(COALESCE(p_counts, '[]'::jsonb)) x
    WHERE x ? 'inventory_id'
      AND x ? 'physical_quantity'
  LOOP
    SELECT stock_quantity, name
      INTO v_before, product_name
    FROM public.inventory
    WHERE id = r.inventory_id
      AND clinic_id = p_clinic_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_delta := r.physical_quantity - v_before;
    v_after := r.physical_quantity;

    IF v_delta <> 0 THEN
      UPDATE public.inventory
      SET stock_quantity = v_after, updated_at = now()
      WHERE id = r.inventory_id
        AND clinic_id = p_clinic_id;

      INSERT INTO public.inventory_movements (
        clinic_id, inventory_id, product_name, quantity_before,
        quantity_delta, quantity_after, reason, staff_id, notes
      ) VALUES (
        p_clinic_id, r.inventory_id, product_name, v_before,
        v_delta, v_after, 'stock_count', auth.uid(),
        'Physical stock count adjustment'
      );
    END IF;

    inventory_id := r.inventory_id;
    quantity_before := v_before;
    physical_quantity := r.physical_quantity;
    quantity_delta := v_delta;
    quantity_after := v_after;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_inventory_stock_count(uuid, jsonb) TO authenticated;