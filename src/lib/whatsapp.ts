export function normalizeWhatsAppNumber(phone: string | null | undefined) {
  if (!phone) return "";
  const cleaned = phone.trim();
  if (!cleaned) return "";

  // A patient contact field represents ONE primary phone/WhatsApp number.
  // Never concatenate two numbers when punctuation, a second line, or words
  // such as "or"/"and" indicate that multiple numbers were pasted.
  if (!/^[0-9+().\-\s]+$/.test(cleaned)) return "";
  if (/[\n,;/|]/.test(cleaned)) return "";

  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return "";

  let normalized: string;
  if (cleaned.startsWith("+")) {
    normalized = digits;
  } else if (digits.startsWith("234")) {
    normalized = digits;
  } else if (digits.startsWith("0")) {
    normalized = "234" + digits.slice(1);
  } else {
    normalized = "234" + digits;
  }

  // E.164 numbers are limited to 15 digits (excluding the + sign).
  // This also prevents accidental concatenation of two Nigerian numbers.
  if (normalized.length < 8 || normalized.length > 15) return "";

  return normalized;
}

export function isValidWhatsAppNumber(phone: string | null | undefined) {
  if (!phone || !phone.trim()) return true;
  return Boolean(normalizeWhatsAppNumber(phone));
}

export function formatWhatsAppDisplay(phone: string | null | undefined) {
  const normalized = normalizeWhatsAppNumber(phone);
  return normalized ? "+" + normalized : "";
}

export function whatsappLink(phone: string | null | undefined, message?: string) {
  const normalized = normalizeWhatsAppNumber(phone);
  if (!normalized) return "";
  return "https://wa.me/" + normalized + (message ? "?text=" + encodeURIComponent(message) : "");
}
