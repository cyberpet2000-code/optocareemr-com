import { supabase } from "@/integrations/supabase/client";

export type PaystackInitializeInput = {
  email: string;
  amountNaira: number;
  plan?: string;
  reference?: string;
  channels?: string[];
};

export type PaystackInitializeResult =
  | { ok: true; authorization_url: string; access_code: string | null; reference: string }
  | { ok: false; error: string; code?: string };

export async function initializePaystackCheckout(
  input: PaystackInitializeInput,
): Promise<PaystackInitializeResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { ok: false, error: "Please sign in before starting payment." };
  }

  if (!Number.isFinite(input.amountNaira) || input.amountNaira <= 0) {
    return { ok: false, error: "Payment amount must be greater than zero." };
  }

  const response = await fetch("/api/paystack/initialize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      email: input.email,
      amount: Math.round(input.amountNaira * 100),
      plan: input.plan,
      reference: input.reference,
      channels: input.channels,
      metadata: {
        plan: input.plan || undefined,
      },
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.ok) {
    return {
      ok: false,
      code: body?.code,
      error: body?.error || "Unable to initialize Paystack payment.",
    };
  }

  return {
    ok: true,
    authorization_url: body.authorization_url,
    access_code: body.access_code || null,
    reference: body.reference,
  };
}

export async function verifyPaystackTransaction(reference: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error("Please sign in before verifying payment.");
  }

  const response = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.ok) {
    throw new Error(body?.error || "Unable to verify payment.");
  }
  return body;
}
