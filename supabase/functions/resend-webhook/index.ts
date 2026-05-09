// resend-webhook — receives Resend delivery events and updates
// notification_logs + maintains email_suppressions for bounces & complaints.
// Configure in Resend dashboard: Webhooks → Add endpoint → this function URL.
// Optional: set RESEND_WEBHOOK_SECRET (Svix signing secret) for signature verification.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

async function verifySvix(req: Request, raw: string, secret: string): Promise<boolean> {
  // Svix signature: header "svix-signature" = "v1,<base64sig> v1,<base64sig>..."
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sig = req.headers.get("svix-signature");
  if (!id || !ts || !sig) return false;
  // secret format "whsec_xxxx" — strip prefix and base64-decode
  const keyStr = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = Uint8Array.from(atob(keyStr), c => c.charCodeAt(0));
  const data = new TextEncoder().encode(`${id}.${ts}.${raw}`);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const macBuf = await crypto.subtle.sign("HMAC", key, data);
  const expected = btoa(String.fromCharCode(...new Uint8Array(macBuf)));
  return sig.split(" ").some(part => part.split(",")[1] === expected);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const raw = await req.text();
  if (SECRET) {
    const ok = await verifySvix(req, raw, SECRET).catch(() => false);
    if (!ok) return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400, headers: corsHeaders }); }

  const type: string = payload?.type || "";
  const data = payload?.data || {};
  const messageId: string | undefined = data?.email_id || data?.id;
  const to: string | undefined = Array.isArray(data?.to) ? data.to[0] : data?.to;
  const recipient = (to || "").toString().toLowerCase();
  const now = new Date().toISOString();

  const updates: Record<string, any> = {};
  let suppressionReason: string | null = null;

  switch (type) {
    case "email.delivered":
      updates.delivered_at = now; updates.status = "delivered"; break;
    case "email.opened":
      updates.opened_at = now; break;
    case "email.clicked":
      updates.clicked_at = now; break;
    case "email.bounced":
      updates.bounced_at = now; updates.status = "bounced";
      updates.error_message = data?.bounce?.message || data?.bounce?.subType || "bounced";
      // Hard bounce → suppress
      if ((data?.bounce?.type || "").toLowerCase().includes("hard") || (data?.bounce?.subType || "").toLowerCase().includes("permanent")) {
        suppressionReason = "hard_bounce";
      }
      break;
    case "email.complained":
      updates.complained_at = now; updates.status = "complained";
      updates.error_message = "spam complaint";
      suppressionReason = "complaint";
      break;
    case "email.delivery_delayed":
      updates.error_message = "delivery delayed"; break;
    default:
      // ignore unknown event but ack
      return new Response(JSON.stringify({ ok: true, ignored: type }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Update matching notification_logs row(s) by provider_message_id
  if (messageId && Object.keys(updates).length) {
    await admin.from("notification_logs").update(updates).eq("provider_message_id", messageId);
  }

  if (recipient && suppressionReason) {
    // Look up clinic_id from any prior log (best effort)
    const { data: log } = await admin.from("notification_logs")
      .select("clinic_id").eq("provider_message_id", messageId).limit(1).maybeSingle();
    await admin.from("email_suppressions").upsert({
      email: recipient, reason: suppressionReason, source: "resend_webhook",
      clinic_id: log?.clinic_id ?? null, details: data,
    }, { onConflict: "email" });

    // Alert super_admin via the platform alerts table
    await admin.from("alerts").insert({
      clinic_id: log?.clinic_id ?? null,
      alert_type: "email_deliverability",
      severity: suppressionReason === "complaint" ? "high" : "warning",
      message: `${recipient} ${suppressionReason === "complaint" ? "marked our email as spam" : "hard-bounced"} — address suppressed.`,
      status: "active",
    });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
