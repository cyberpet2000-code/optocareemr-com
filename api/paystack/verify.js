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
