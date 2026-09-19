export function normalizeWhatsAppNumber(phone: string | null | undefined) {
  if (!phone) return "";
  const cleaned = phone.trim();
  if (!cleaned) return "";
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return "";
  if (cleaned.startsWith("+")) return digits;
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return "234" + digits.slice(1);
  return "234" + digits;
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
