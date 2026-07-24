import { apiClient } from "@/integrations/api/client";

export async function ensureBillingForVisit(visit: {
  id: string;
  clinic_id: string;
  patient_id: string;
  payment_type: string;
  active_hmo_id?: string | null;
}) {
  const { data: existing, error: checkError } = await apiClient
    .from("billing")
    .select("id")
    .eq("visit_id", visit.id)
    .maybeSingle();

  if (checkError) {
    throw checkError;
  }

  if (existing) {
    return existing.id;
  }

  const { data: created, error: createError } = await apiClient
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

  if (createError) {
    throw createError;
  }

  return created.id;
}
