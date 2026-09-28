import { apiClient } from "@/lib/apiClient";

export const LEGAL_VERSIONS = {
  terms: "1.0",
  privacy: "1.0",
  dpa: "1.0",
  security: "1.0",
  "medical-disclaimer": "1.0",
  "ai-disclaimer": "1.0",
  cookies: "1.0",
  "acceptable-use": "1.0",
  "subscription-refund": "1.0",
} as const;

export async function recordLegalAcceptance(userId: string, clinicId?: string | null) {
  const rows = Object.entries(LEGAL_VERSIONS).map(([document_key, document_version]) => ({
    user_id: userId,
    clinic_id: clinicId ?? null,
    document_key,
    document_version,
    acceptance_method: "checkbox",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 1000) : null,
  }));
  const { error } = await apiClient.from("legal_acceptances").upsert(rows, {
    onConflict: "user_id,document_key,document_version",
    ignoreDuplicates: true,
  });
  if (error) throw error;
}

export async function hasCurrentLegalAcceptance(userId: string) {
  const { data, error } = await apiClient
    .from("legal_acceptances")
    .select("document_key,document_version")
    .eq("user_id", userId);
  if (error) throw error;
  const accepted = new Set((data ?? []).map((r: any) => `${r.document_key}:${r.document_version}`));
  return Object.entries(LEGAL_VERSIONS).every(([key, version]) => accepted.has(`${key}:${version}`));
}
