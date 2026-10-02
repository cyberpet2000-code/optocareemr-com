let initialized = false;

const MEASUREMENT_ID =
  (import.meta.env.VITE_GOOGLE_ANALYTICS_ID as string | undefined)?.trim() || "";

function loadScript() {
  if (typeof document === "undefined" || !MEASUREMENT_ID) return false;
  if (document.querySelector('script[data-optocare-google-analytics="true"]')) return true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  script.dataset.optocareGoogleAnalytics = "true";
  document.head.appendChild(script);
  return true;
}

export function initGoogleGrowthAnalytics() {
  if (initialized || typeof window === "undefined" || !MEASUREMENT_ID) return false;
  if (!loadScript()) return false;

  const w = window as typeof window & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };

  w.dataLayer = w.dataLayer || [];
  w.gtag = w.gtag || function gtag(...args: unknown[]) {
    w.dataLayer!.push(args);
  };

  w.gtag("js", new Date());
  w.gtag("config", MEASUREMENT_ID, {
    anonymize_ip: true,
    transport_type: "beacon",
    send_page_view: false,
  });

  initialized = true;
  return true;
}

export function trackGoogleGrowthEvent(
  eventName: string,
  params: Record<string, string | number | boolean | undefined> = {},
) {
  if (typeof window === "undefined" || !MEASUREMENT_ID) return;
  initGoogleGrowthAnalytics();

  const w = window as typeof window & {
    gtag?: (...args: unknown[]) => void;
  };

  w.gtag?.("event", eventName, params);
}

export function trackGoogleGrowthPageView(path: string) {
  if (!path) return;
  trackGoogleGrowthEvent("page_view", {
    page_path: path,
    page_title: typeof document !== "undefined" ? document.title : undefined,
  });
}

export const googleGrowthMeasurementConfigured = Boolean(MEASUREMENT_ID);
