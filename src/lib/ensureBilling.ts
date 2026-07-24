import { supabase } from "@/integrations/supabase/client";

interface VisitForBilling {
  id: string;
  clinic_id: string;
  patient_id: string;
  payment_type: string;
  active_hmo_id?: string | null;
}

export async function ensureBillingForVisit(
  visit: VisitForBilling
) {
  // First check if billing already exists
  const { data: existing, error: checkError } =
    await apiClient
      .from("billing")
      .select("id")
      .eq("visit_id", visit.id)
      .maybeSingle();

  if (checkError) {
    throw checkError;
  }

  // Trigger already created it
  if (existing) {
    return existing.id;
  }

  // Try creating it
  const { data: created, error: createError } =
    await apiClient
      .from("billing")
      .insert({
        clinic_id: visit.clinic_id,
        visit_id: visit.id,
        patient_id: visit.patient_id,
        payer_type: visit.payment_type,
        hmo_id: visit.active_hmo_id,

        consultation_fee: 0,
        items_total: 0,
        total_amount: 0,
        amount_paid: 0,
        balance: 0,

        status: "pending",
      })
      .select("id")
      .single();

  // Success
  if (!createError) {
    return created.id;
  }

  /*
   * Possible race condition:
   * Trigger created the bill milliseconds before us.
   * Check one more time.
   */
  const { data: retry, error: retryError } =
    await apiClient
      .from("billing")
      .select("id")
      .eq("visit_id", visit.id)
      .maybeSingle();

  if (retryError) {
    throw retryError;
  }

  if (retry) {
    return retry.id;
  }

  // Truly failed
  throw createError;
}
