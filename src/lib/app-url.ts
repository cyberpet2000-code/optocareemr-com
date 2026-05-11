// Single source of truth for the application URL.
// Used wherever an absolute URL is required (auth email redirects, invite links, etc.).
//
// Environment-aware:
// - Production builds → always https://optocareemr.com
// - Development/preview → current window origin (so local/preview testing works)
//
// NEVER hardcode lovable.app or lovableproject.com domains — they rotate and
// break invite/recovery links in production.
export const PRODUCTION_APP_URL = "https://optocareemr.com";

function resolveAppUrl(): string {
  if (import.meta.env.PROD) return PRODUCTION_APP_URL;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return PRODUCTION_APP_URL;
}

export const APP_URL = resolveAppUrl();
