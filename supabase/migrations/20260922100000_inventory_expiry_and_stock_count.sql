-- Inventory expiry management and physical stock counts
-- Adds a transactional stock-count finalization RPC using the existing inventory_movements audit trail.

CREATE OR REPLACE FUNCTION public.finalize_inventory_stock_count(
  p_inventory_id uuid,
  p_physical_quantity integer,
  p_notes text DEFAULT NULL
)
RETURNS public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory public.inventory%ROWTYPE;
  v_delta integer;
  v_movement public.inventory_movements;
BEGIN
  IF p_physical_quantity < 0 THEN
    RAISE EXCEPTION 'Physical quantity cannot be negative';
  END IF;

  SELECT *
  INTO v_inventory
  FROM public.inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.user_clinic_memberships m
      WHERE m.user_id = auth.uid()
        AND m.clinic_id = v_inventory.clinic_id
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to count this inventory item';
  END IF;

  v_delta := p_physical_quantity - v_inventory.stock_quantity;

  UPDATE public.inventory
  SET stock_quantity = p_physical_quantity,
      updated_at = now()
  WHERE id = p_inventory_id;

  INSERT INTO public.inventory_movements(
    clinic_id, inventory_id, product_name,
    quantity_before, quantity_delta, quantity_after,
    reason, staff_id, notes
  )
  VALUES (
    v_inventory.clinic_id, v_inventory.id, v_inventory.name,
    v_inventory.stock_quantity, v_delta, p_physical_quantity,
    'stock_count', auth.uid(), NULLIF(trim(p_notes), '')
  )
  RETURNING * INTO v_movement;

  RETURN v_movement;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_inventory_stock_count(uuid, integer, text) TO authenticated;
