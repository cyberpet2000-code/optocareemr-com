// Single source of truth for the application URL.
// Used wherever an absolute URL is required (auth email redirects, invite links, etc.).
//
// Strict policy:
// - Production builds → ALWAYS https://optocareemr.com
// - Local development (localhost / 127.0.0.1) → window.location.origin
// - Anything else (preview deploys, lovable.app, lovableproject.com, custom previews)
//   → https://optocareemr.com (no preview-domain fallback ever leaks into links)
export const PRODUCTION_APP_URL = "https://optocareemr.com";

function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local")
  );
}

function resolveAppUrl(): string {
  if (import.meta.env.PROD) return PRODUCTION_APP_URL;
  if (typeof window !== "undefined" && window.location?.hostname) {
    if (isLocalHost(window.location.hostname)) {
      return window.location.origin;
    }
  }
  // Any non-local, non-production context (preview domains, etc.) → production URL.
  return PRODUCTION_APP_URL;
}

export const APP_URL = resolveAppUrl();
