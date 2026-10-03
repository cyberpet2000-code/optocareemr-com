import crypto from "node:crypto";

function json(res, body, status = 200) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function signatureMatches(raw, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha512", secret).update(raw, "utf8").digest("hex");
  const provided = String(signature).trim();
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || `https://${process.env.VITE_SUPABASE_PROJECT_ID || "avogfzqizuusqzjivhqj"}.supabase.co`,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

async function recordWebhookEvent(event) {
  const { url, serviceKey } = supabaseConfig();
  if (!serviceKey) return;

  await fetch(`${url}/rest/v1/paystack_webhook_events`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({
      id: String(event.id || event.data?.id || `${event.event}:${event.data?.reference || Date.now()}`),
      event_name: event.event || "unknown",
      payload: event,
    }),
  });
}

async function updateRefundFromEvent(event) {
  const { url, serviceKey } = supabaseConfig();
  if (!serviceKey || !event.event?.startsWith("refund.")) return;
  const data = event.data || {};
  const transactionReference = data.transaction_reference || data.transaction?.reference || null;
  if (!transactionReference) return;
  const status = event.event.replace("refund.", "");
  await fetch(`${url}/rest/v1/paystack_refunds?transaction_reference=eq.${encodeURIComponent(transactionReference)}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      refund_reference: data.refund_reference || null,
      amount: Number(data.amount || 0) || undefined,
      currency: data.currency || "NGN",
      status,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function updateSubscriptionFromEvent(event) {
  const { url, serviceKey } = supabaseConfig();
  if (!serviceKey) return;

  const data = event.data || {};
  const metadata =
    typeof data.metadata === "string"
      ? (() => { try { return JSON.parse(data.metadata); } catch { return {}; } })()
      : (data.metadata && typeof data.metadata === "object" ? data.metadata : {});

  let clinicId = metadata?.clinic_id || null;
  const customerCode = data.customer?.customer_code || null;

  if (!clinicId && customerCode) {
    const lookup = await fetch(
      `${url}/rest/v1/clinic_subscriptions?select=clinic_id&paystack_customer_id=eq.${encodeURIComponent(customerCode)}&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept: "application/json",
        },
      },
    );
    const rows = await lookup.json().catch(() => []);
    clinicId = Array.isArray(rows) ? rows[0]?.clinic_id || null : null;
  }

  if (!clinicId) return;

  const plan =
    metadata?.plan ||
    data.plan?.plan_code ||
    data.plan?.name ||
    null;

  let status = null;
  if (event.event === "charge.success" || event.event === "subscription.create") status = "active";
  if (event.event === "invoice.payment_failed") status = "past_due";
  if (event.event === "subscription.not_renew") status = "non_renewing";
  if (event.event === "subscription.disable") status = "disabled";

  if (!status) return;

  const row = {
    clinic_id: clinicId,
    plan,
    status,
    paystack_customer_id: data.customer?.customer_code || null,
    paystack_subscription_id:
      data.subscription_code ||
      data.subscription?.subscription_code ||
      data.subscription?.code ||
      null,
    end_date: data.next_payment_date || null,
  };

  // Preserve the original subscription start date. Recurring charge events must not reset it.
  let existingStartDate = null;
  const existing = await fetch(`${url}/rest/v1/clinic_subscriptions?select=start_date&clinic_id=eq.${encodeURIComponent(clinicId)}&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/json" },
  });
  const existingRows = await existing.json().catch(() => []);
  existingStartDate = Array.isArray(existingRows) ? existingRows[0]?.start_date || null : null;
  if (!existingStartDate) row.start_date = data.created_at || data.paid_at || new Date().toISOString();

  await fetch(`${url}/rest/v1/clinic_subscriptions?on_conflict=clinic_id`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, { ok: false, error: "Method not allowed." }, 405);
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return json(res, { ok: false, error: "Webhook secret is not configured." }, 503);

  try {
    const raw = await rawBody(req);
    const signature = req.headers["x-paystack-signature"];
    if (!signatureMatches(raw, signature, secret)) {
      return json(res, { ok: false, error: "Invalid signature." }, 401);
    }

    const event = JSON.parse(raw);
    await recordWebhookEvent(event);
    await updateRefundFromEvent(event);
    await updateSubscriptionFromEvent(event);

    // Acknowledge quickly so Paystack does not retry the event unnecessarily.
    return json(res, { ok: true });
  } catch {
    return json(res, { ok: false, error: "Webhook processing failed." }, 500);
  }
}


export const config = { api: { bodyParser: false } };
