import crypto from "node:crypto";

function json(res, body, status = 200) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function getAuth(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL || `https://${process.env.VITE_SUPABASE_PROJECT_ID || "avogfzqizuusqzjivhqj"}.supabase.co`;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ") || !supabaseKey) {
    json(res, { ok: false, error: "Authentication required." }, 401);
    return null;
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, Authorization: authHeader },
  });
  if (!authResponse.ok) {
    json(res, { ok: false, error: "Invalid or expired session." }, 401);
    return null;
  }
  const user = await authResponse.json();
  if (!user?.id) {
    json(res, { ok: false, error: "Invalid or expired session." }, 401);
    return null;
  }

  return { user, supabaseUrl, supabaseKey, authHeader };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, { ok: false, error: "Method not allowed." }, 405);
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return json(res, { ok: false, error: "Paystack is not configured." }, 503);

  try {
    const auth = await getAuth(req, res);
    if (!auth) return;

    const { user, supabaseUrl, supabaseKey, authHeader } = auth;
    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=role,is_super_admin,active_clinic_id,clinic_id&id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: { apikey: supabaseKey, Authorization: authHeader, Accept: "application/json" } },
    );
    const profiles = await profileResponse.json().catch(() => []);
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    const role = String(profile?.role || "").toLowerCase();
    const clinicId = profile?.active_clinic_id || profile?.clinic_id || null;

    if (!clinicId) return json(res, { ok: false, error: "No active clinic is associated with this session." }, 403);
    if (!profile?.is_super_admin && !["admin", "owner", "super_admin"].includes(role)) {
      return json(res, { ok: false, error: "Only an authorized clinic administrator can initiate refunds." }, 403);
    }

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return json(res, { ok: false, error: "Invalid JSON body." }, 400); }
    }

    const transaction = String(body?.transaction || "").trim();
    const amount = body?.amount == null ? null : Number(body.amount);
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : null;
    const customerNote = typeof body?.customer_note === "string" ? body.customer_note.trim().slice(0, 500) : null;
    const merchantNote = typeof body?.merchant_note === "string" ? body.merchant_note.trim().slice(0, 500) : null;

    if (!transaction || !/^[A-Za-z0-9.=\-]{1,100}$/.test(transaction)) {
      return json(res, { ok: false, error: "A valid Paystack transaction reference is required." }, 400);
    }
    if (amount !== null && (!Number.isInteger(amount) || amount <= 0)) {
      return json(res, { ok: false, error: "Refund amount must be a positive integer in the smallest currency unit." }, 400);
    }

    const upstream = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction,
        ...(amount !== null ? { amount: String(amount) } : {}),
        ...(customerNote ? { customer_note: customerNote } : {}),
        ...(merchantNote ? { merchant_note: merchantNote } : {}),
      }),
    });
    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok || !data?.status) {
      return json(res, {
        ok: false,
        code: "paystack_refund_failed",
        error: data?.message || "Paystack could not initiate the refund.",
      }, upstream.ok ? 400 : 502);
    }

    const refund = data.data || {};
    const transactionReference = refund.transaction?.reference || transaction;
    const refundAmount = Number(refund.amount || amount || 0);

    // The ledger table is intentionally isolated and only used when its migration is installed.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (serviceKey && refundAmount > 0) {
      await fetch(`${supabaseUrl}/rest/v1/paystack_refunds`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          clinic_id: clinicId,
          transaction_reference: transactionReference,
          refund_reference: refund.id ? String(refund.id) : null,
          amount: refundAmount,
          currency: refund.currency || "NGN",
          status: refund.status || "pending",
          reason,
          customer_note: customerNote,
          merchant_note: merchantNote,
          initiated_by: user.id,
        }),
      });
    }

    return json(res, {
      ok: true,
      transaction_reference: transactionReference,
      refund_reference: refund.id ? String(refund.id) : null,
      amount: refundAmount,
      currency: refund.currency || "NGN",
      status: refund.status || "pending",
    });
  } catch {
    return json(res, { ok: false, error: "Refund request could not be completed." }, 500);
  }
}
