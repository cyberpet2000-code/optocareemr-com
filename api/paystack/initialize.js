const ALLOWED_ORIGIN = process.env.APP_URL || "";

function json(res, body, status = 200) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (ALLOWED_ORIGIN) {
    res.setHeader("Vary", "Origin");
  }
  return res.status(status).json(body);
}

function validEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function safeReference(value) {
  if (!value) return `oc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const ref = String(value).trim();
  if (!/^[A-Za-z0-9.=\-]+$/.test(ref) || ref.length > 100) return "";
  return ref;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, { ok: false, error: "Method not allowed." }, 405);
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || `https://${process.env.VITE_SUPABASE_PROJECT_ID || "avogfzqizuusqzjivhqj"}.supabase.co`;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ") || !supabaseKey) {
    return json(res, { ok: false, error: "Authentication required." }, 401);
  }
  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: authHeader },
    });
    if (!authResponse.ok) return json(res, { ok: false, error: "Invalid or expired session." }, 401);
  } catch {
    return json(res, { ok: false, error: "Authentication service unavailable." }, 503);
  }
  if (!secret) {
    return json(res, {
      ok: false,
      code: "paystack_not_configured",
      error: "Paystack is not configured on this environment.",
    }, 503);
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, { ok: false, error: "Invalid JSON body." }, 400);
    }
  }

  let authenticatedUser = null;
  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: authHeader },
    });
    if (!authResponse.ok) {
      return json(res, { ok: false, error: "Invalid or expired session." }, 401);
    }
    authenticatedUser = await authResponse.json();
  } catch {
    return json(res, { ok: false, error: "Authentication service unavailable." }, 503);
  }

  if (!authenticatedUser?.id) {
    return json(res, { ok: false, error: "Invalid or expired session." }, 401);
  }

  let authenticatedClinicId = null;
  try {
    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=active_clinic_id,clinic_id&id=eq.${encodeURIComponent(authenticatedUser.id)}&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: authHeader,
          Accept: "application/json",
        },
      },
    );
    const profiles = await profileResponse.json().catch(() => []);
    authenticatedClinicId = Array.isArray(profiles)
      ? profiles[0]?.active_clinic_id || profiles[0]?.clinic_id || null
      : null;
  } catch {
    return json(res, { ok: false, error: "Unable to resolve the active clinic." }, 503);
  }

  if (!authenticatedClinicId) {
    return json(res, { ok: false, error: "No active clinic is associated with this session." }, 403);
  }

  const email = String(body?.email || authenticatedUser.email || "").trim();
  const amount = Number(body?.amount);
  const plan = typeof body?.plan === "string" ? body.plan.trim() : "";
  const callbackUrl = `${process.env.APP_URL || ""}/paystack/callback`;

  if (!validEmail(email)) return json(res, { ok: false, error: "A valid customer email is required." }, 400);
  if (!Number.isInteger(amount) || amount <= 0) return json(res, { ok: false, error: "Amount must be an integer in the smallest currency unit." }, 400);
  if (!callbackUrl.startsWith("http://") && !callbackUrl.startsWith("https://")) {
    return json(res, { ok: false, error: "A valid callback URL is required." }, 400);
  }

  const reference = safeReference(body?.reference);
  if (!reference) return json(res, { ok: false, error: "Invalid transaction reference." }, 400);

  const metadata = {
    source: "optocare-paystack-project",
    ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}),
    clinic_id: authenticatedClinicId,
    user_id: authenticatedUser.id,
  };

  const payload = {
    email,
    amount: String(amount),
    currency: String(body?.currency || "NGN"),
    reference,
    callback_url: callbackUrl,
    metadata,
    ...(plan ? { plan } : {}),
    ...(Array.isArray(body?.channels) ? { channels: body.channels } : {}),
  };

  try {
    const upstream = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok || !data?.status) {
      return json(res, {
        ok: false,
        code: "paystack_initialize_failed",
        error: data?.message || "Paystack could not initialize the transaction.",
      }, upstream.ok ? 400 : 502);
    }

    return json(res, {
      ok: true,
      authorization_url: data.data?.authorization_url || null,
      access_code: data.data?.access_code || null,
      reference: data.data?.reference || reference,
    });
  } catch {
    return json(res, {
      ok: false,
      code: "paystack_network_error",
      error: "Could not reach Paystack.",
    }, 502);
  }
}
