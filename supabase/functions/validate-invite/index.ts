// Public token validator for invite links. No auth required.
// Returns invite metadata so the /accept-invite page can show
// the right state immediately (valid / expired / used / unknown).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const body = await req.json().catch(() => ({}));
    const token: string | undefined = body?.token;
    if (!token) return json({ valid: false, reason: "missing_token" }, 400);

    let email = ""; let clinicId: string | null = null; let status: string | null = null;

    const { data: ci } = await admin
      .from("clinic_invites")
      .select("clinic_id, email, status")
      .eq("token", token)
      .maybeSingle();

    if (ci) {
      email = ci.email || "";
      clinicId = ci.clinic_id;
      status = ci.status;
    } else {
      const { data: legacy } = await admin
        .from("invites")
        .select("clinic_id, email, accepted")
        .eq("token", token)
        .maybeSingle();
      if (legacy) {
        email = legacy.email || "";
        clinicId = legacy.clinic_id;
        status = legacy.accepted ? "accepted" : "pending";
      }
    }

    if (!clinicId) return json({ valid: false, reason: "not_found" });
    if (status === "accepted") return json({ valid: false, reason: "already_used", email });

    const { data: clinic } = await admin
      .from("clinics").select("name").eq("id", clinicId).maybeSingle();

    return json({
      valid: true,
      email,
      clinic_id: clinicId,
      clinic_name: clinic?.name || "the clinic",
    });
  } catch (e) {
    console.error("validate-invite fatal", e);
    return json({ valid: false, reason: "error", error: (e as Error).message }, 500);
  }
});
