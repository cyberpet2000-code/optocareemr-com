import { apiClient } from "@/lib/apiClient";

type AuditPayload = {
  action: string;
  table_name: string;
  record_id?: string | null;
  clinic_id?: string | null;
  old_data?: unknown;
  new_data?: unknown;
};

export async function logSuperAdminAction(userId: string | undefined, payload: AuditPayload) {
  if (!userId) return;

  await apiClient.from("audit_logs").insert({
    user_id: userId,
    action: payload.action,
    table_name: payload.table_name,
    record_id: payload.record_id ?? null,
    clinic_id: payload.clinic_id ?? null,
    old_data: payload.old_data ?? null,
    new_data: payload.new_data ?? null,
  } as never);
}