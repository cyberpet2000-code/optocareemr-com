// Single source of truth for the application URL.
// Used wherever an absolute URL is required (auth email redirects, etc.).
// NEVER use window.location.origin or preview domains for these — preview
// domains rotate and break invite/recovery links.
export const APP_URL = "https://optocareemr.lovable.app";
