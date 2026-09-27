// deno-lint-ignore-file no-explicit-any
// Scheduled entry: iterates all active clinics and generates + emails the previous month's report.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function isInternalServiceCall(req: Request, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const provided = req.headers.get("x-optocare-internal-secret");
  if (!provided) return false;
  const { data: expected } = await admin.rpc("get_optocare_internal_edge_secret");
  return !!expected && provided === expected;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  if (!(await isInternalServiceCall(req, admin))) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = body.year ?? prev.getFullYear();
    const month = body.month ?? (prev.getMonth() + 1);

    const { data: clinics, error } = await admin.from("clinics")
      .select("id,name,is_active,lifecycle_status")
      .neq("lifecycle_status", "suspended");
    if (error) return json({ error: error.message }, 500);

    const results: any[] = [];
    for (const c of clinics || []) {
      if (c.is_active === false) continue;
      try {
        const internalSecret = (await admin.rpc("get_optocare_internal_edge_secret")).data;
        if (!internalSecret) throw new Error("Internal invocation secret is not configured");
        const r = await admin.functions.invoke("generate-monthly-report", {
          body: { clinic_id: c.id, year, month, send_email: true },
          headers: { "x-optocare-internal-secret": internalSecret },
        });
        results.push({ clinic_id: c.id, ok: !r.error, error: r.error?.message });
      } catch (e: any) {
        results.push({ clinic_id: c.id, ok: false, error: e?.message || String(e) });
      }
    }
    return json({ ok: true, year, month, count: results.length, results });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
