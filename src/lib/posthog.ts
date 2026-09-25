import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com";

let initialized = false;

function sanitizeRoute(route: string | null | undefined) {
  if (!route) return null;
  return route
    .replace(/\/patient\/[^/?#]+/gi, "/patient/[id]")
    .replace(/\/appointments\/[^/?#]+/gi, "/appointments/[id]")
    .replace(/\/outreach\/[^/?#]+/gi, "/outreach/[id]");
}

function cleanMessage(value: unknown) {
  return String(value ?? "")
    .replace(/\b(?:\+?234|0)\d{10}\b/g, "[phone]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .slice(0, 1000);
}

export function initPostHog() {
  if (initialized || !POSTHOG_KEY || typeof window === "undefined") return;
  initialized = true;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_performance: false,
    capture_console_log: false,
    disable_session_recording: true,
    persistence: "localStorage+cookie",
    loaded: (client) => {
      client.register({
        app: "OptoCare EMR",
        app_version: import.meta.env.VITE_APP_VERSION || "unknown",
      });
    },
  });
}

export function captureDiagEvent(
  event: string,
  properties: Record<string, unknown> = {},
) {
  if (!initialized) return;
  posthog.capture(event, {
    ...properties,
    route: sanitizeRoute(
      typeof window !== "undefined" ? window.location.pathname : null,
    ),
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
  });
}

export function captureDiagError(input: {
  source: string;
  severity: string;
  error_name?: string | null;
  error_message?: string | null;
  route?: string | null;
}) {
  captureDiagEvent("optocare_diagnostic_error", {
    source: input.source,
    severity: input.severity,
    error_name: cleanMessage(input.error_name),
    error_message: cleanMessage(input.error_message),
    route: sanitizeRoute(input.route),
  });
}
