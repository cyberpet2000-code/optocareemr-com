function json(res, body, status = 200) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function validReference(value) {
  return typeof value === "string" && /^[A-Za-z0-9.=\-]{1,100}$/.test(value.trim());
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, { ok: false, error: "Method not allowed." }, 405);
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || `https://${process.env.VITE_SUPABASE_PROJECT_ID || "avogfzqizuusqzjivhqj"}.supabase.co`;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ") || !supabaseKey) {
    return json(res, { ok: false, error: "Authentication required." }, 401);
  }
  let authenticatedUser = null;
  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: authHeader },
    });
    if (!authResponse.ok) return json(res, { ok: false, error: "Invalid or expired session." }, 401);
    authenticatedUser = await authResponse.json();
  } catch {
    return json(res, { ok: false, error: "Authentication service unavailable." }, 503);
  }
  if (!authenticatedUser?.id) return json(res, { ok: false, error: "Invalid or expired session." }, 401);

  let clinicId = null;
  try {
    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=active_clinic_id,clinic_id&id=eq.${encodeURIComponent(authenticatedUser.id)}&limit=1`,
      { headers: { apikey: supabaseKey, Authorization: authHeader, Accept: "application/json" } },
    );
    const profiles = await profileResponse.json().catch(() => []);
    clinicId = Array.isArray(profiles) ? profiles[0]?.active_clinic_id || profiles[0]?.clinic_id || null : null;
  } catch {
    return json(res, { ok: false, error: "Unable to resolve the active clinic." }, 503);
  }
  if (!clinicId) return json(res, { ok: false, error: "No active clinic is associated with this session." }, 403);
  if (!secret) {
    return json(res, { ok: false, code: "paystack_not_configured", error: "Paystack is not configured." }, 503);
  }

  const reference = String(req.query?.reference || "").trim();
  if (!validReference(reference)) {
    return json(res, { ok: false, error: "A valid transaction reference is required." }, 400);
  }

  try {
    const upstream = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok || !data?.status) {
      return json(res, {
        ok: false,
        code: "paystack_verify_failed",
        error: data?.message || "Paystack verification failed.",
      }, upstream.ok ? 400 : 502);
    }

    const transaction = data.data || {};
    const metadata = typeof transaction.metadata === "string"
      ? (() => { try { return JSON.parse(transaction.metadata); } catch { return {}; } })()
      : (transaction.metadata && typeof transaction.metadata === "object" ? transaction.metadata : {});
    if (metadata?.clinic_id && metadata.clinic_id !== clinicId) {
      return json(res, { ok: false, error: "This transaction does not belong to the active clinic." }, 403);
    }
    if (transaction.status === "success" && metadata?.clinic_id !== clinicId) {
      return json(res, { ok: false, error: "Transaction ownership could not be verified." }, 403);
    }
    return json(res, {
      ok: true,
      status: transaction.status || "unknown",
      reference: transaction.reference || reference,
      amount: transaction.amount ?? null,
      currency: transaction.currency || null,
      paid_at: transaction.paid_at || null,
      customer_code: transaction.customer?.customer_code || null,
      plan_code: transaction.plan?.plan_code || null,
    });
  } catch {
    return json(res, { ok: false, code: "paystack_network_error", error: "Could not reach Paystack." }, 502);
  }
}
