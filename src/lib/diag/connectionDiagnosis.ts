import { apiClient } from "@/lib/apiClient";
import { supabase } from "@/integrations/supabase/client";

export type ServiceStatus = "online" | "degraded" | "offline" | "unknown";
export type DeviceClass = "phone" | "tablet" | "desktop" | "unknown";
export type DiagnosisCode =
  | "NO_NETWORK"
  | "NO_INTERNET"
  | "AUTH_SERVICE"
  | "DATABASE_SERVICE"
  | "EDGE_FUNCTION"
  | "APPLICATION"
  | "SLOW_NETWORK"
  | "OFFLINE_MODE"
  | "UNKNOWN";

export type ConnectionDiagnosis = {
  code: DiagnosisCode;
  message: string;
  technicalMessage: string;
  network: ServiceStatus;
  internet: ServiceStatus;
  authentication: ServiceStatus;
  database: ServiceStatus;
  edgeFunctions: ServiceStatus;
  application: ServiceStatus;
  latencyMs?: number;
  deviceClass?: DeviceClass;
  connectionType?: string;
};

const SUPABASE_URL = (() => {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL as string).origin;
  } catch {
    return "";
  }
})();

const NETWORK_ERROR = /failed to fetch|network|offline|load failed|networkerror|err_internet|err_network|timeout|timed out|connection/i;

function messageFor(code: DiagnosisCode) {
  switch (code) {
    case "NO_NETWORK":
      return "No internet connection. Please check your Wi-Fi or mobile data.";
    case "NO_INTERNET":
      return "Your device is connected to a network, but internet access is unavailable.";
    case "AUTH_SERVICE":
      return "OptoCare sign-in services are temporarily unavailable. Please try again shortly.";
    case "DATABASE_SERVICE":
      return "OptoCare database services are temporarily unavailable. Your clinic data has not been deleted.";
    case "EDGE_FUNCTION":
      return "An OptoCare background service is temporarily unavailable. Please try again shortly.";
    case "SLOW_NETWORK":
      return "Your internet connection is slow. Some OptoCare features may take longer to load.";
    case "OFFLINE_MODE":
      return "You are offline. OptoCare is operating in Offline Mode.";
    case "APPLICATION":
      return "This OptoCare page encountered a temporary system problem. Your records are safe.";
    default:
      return "OptoCare could not complete the request. Please try again shortly.";
  }
}

export function getDeviceClass(): DeviceClass {
  if (typeof window === "undefined") return "unknown";
  const width = window.innerWidth;
  const ua = navigator.userAgent || "";
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua) || (width >= 600 && width < 1024)) return "tablet";
  if (/Mobi|Android/i.test(ua) || width < 600) return "phone";
  if (width >= 1024) return "desktop";
  return "unknown";
}

export function getConnectionType(): string {
  const connection = (navigator as any)?.connection || (navigator as any)?.mozConnection || (navigator as any)?.webkitConnection;
  return String(connection?.effectiveType || connection?.type || "unknown");
}

export function classifyConnectionError(error: unknown): DiagnosisCode {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "NO_NETWORK";
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (NETWORK_ERROR.test(text)) return "NO_INTERNET";
  const status = Number((error as any)?.status ?? (error as any)?.code);
  if (status === 401 || status === 403) return "AUTH_SERVICE";
  if (status >= 500) return "DATABASE_SERVICE";
  if (status >= 400) return "APPLICATION";
  return "UNKNOWN";
}

async function probe(url: string, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal });
    return { ok: response.ok || response.status < 500, status: response.status, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { ok: false, status: 0, latencyMs: Math.round(performance.now() - started), error };
  } finally {
    window.clearTimeout(timer);
  }
}


export async function checkDatabaseService(): Promise<ServiceStatus> {
  try {
    if (!SUPABASE_URL) return "unknown";

    const client = supabase;
    const started = performance.now();
    const { error } = await client
      .from("clinics")
      .select("id")
      .limit(1);

    if (error) {
      const status = (error as any)?.status;
      return typeof status === "number" && status >= 500 ? "offline" : "degraded";
    }

    const elapsed = performance.now() - started;
    return elapsed >= 2500 ? "degraded" : "online";
  } catch {
    return "offline";
  }
}

export async function diagnoseRequestFailure(error: unknown): Promise<ConnectionDiagnosis> {
  const text = error instanceof Error ? error.message : String(error ?? "");
  const status = Number((error as any)?.status ?? (error as any)?.code);

  // A request that failed because the device lost connectivity should use
  // the full layered diagnosis so Login can distinguish internet failure
  // from an actual OptoCare service outage.
  if (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    NETWORK_ERROR.test(text)
  ) {
    return diagnoseConnection();
  }

  // Server-side failures are diagnosed against the live OptoCare services.
  if (status >= 500) {
    return diagnoseConnection();
  }

  // Client-side authentication/application errors (for example, an
  // incorrect email or password) are not system outages. Preserve the
  // service error returned by Supabase instead of masking it.
  const code: DiagnosisCode = status >= 400 ? "APPLICATION" : "UNKNOWN";
  return {
    code,
    message: text || messageFor(code),
    technicalMessage: text || "The request failed without a network or server status.",
    network: typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline",
    internet: "unknown",
    authentication: "unknown",
    database: "unknown",
    edgeFunctions: "unknown",
    application: "online",
  };
}

export async function diagnoseConnection(): Promise<ConnectionDiagnosis> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      code: "NO_NETWORK",
      message: messageFor("NO_NETWORK"),
      technicalMessage: "Browser reports navigator.onLine=false.",
      network: "offline",
      internet: "offline",
      authentication: "unknown",
      database: "unknown",
      edgeFunctions: "unknown",
      application: "online",
    };
  }

  if (!SUPABASE_URL) {
    return {
      code: "APPLICATION",
      message: messageFor("APPLICATION"),
      technicalMessage: "Supabase URL is not configured in the application build.",
      network: "online",
      internet: "unknown",
      authentication: "unknown",
      database: "unknown",
      edgeFunctions: "unknown",
      application: "offline",
    };
  }

  // Probe each layer independently. This prevents an unavailable OptoCare
  // service from being mislabeled as a user's internet problem.
  const [internetProbe, authProbe, databaseStatus, edgeProbe] = await Promise.all([
    probe("https://www.gstatic.com/generate_204", 3500),
    probe(`${SUPABASE_URL}/auth/v1/health`, 4000),
    checkDatabaseService(),
    probe(`${SUPABASE_URL}/functions/v1/health-check`, 4000),
  ]);

  const latencyMs = Math.max(
    internetProbe.latencyMs,
    authProbe.latencyMs,
    edgeProbe.latencyMs,
  );

  // If the public internet probe is unavailable and Supabase is also
  // unreachable, this is a connectivity problem rather than an OptoCare
  // outage. Do not blame the platform when the device cannot reach it.
  if (!internetProbe.ok && authProbe.status === 0 && edgeProbe.status === 0) {
    return {
      code: "NO_INTERNET",
      message: messageFor("NO_INTERNET"),
      technicalMessage: `Internet probe failed and OptoCare endpoints were unreachable (Auth: ${authProbe.status || "network error"}, Edge: ${edgeProbe.status || "network error"}).`,
      network: "online",
      internet: "offline",
      authentication: "unknown",
      database: "unknown",
      edgeFunctions: "unknown",
      application: "online",
      latencyMs,
      deviceClass: getDeviceClass(),
      connectionType: getConnectionType(),
    };
  }

  // The device has internet access, but an OptoCare service is actually down.
  if (internetProbe.ok && authProbe.status >= 500) {
    return {
      code: "AUTH_SERVICE",
      message: messageFor("AUTH_SERVICE"),
      technicalMessage: `Internet is reachable, but Supabase Auth health returned HTTP ${authProbe.status}.`,
      network: "online",
      internet: "online",
      authentication: "offline",
      database: databaseStatus,
      edgeFunctions: edgeProbe.ok ? "online" : "offline",
      application: "online",
      latencyMs,
    };
  }

  if (internetProbe.ok && databaseStatus === "offline") {
    return {
      code: "DATABASE_SERVICE",
      message: messageFor("DATABASE_SERVICE"),
      technicalMessage: "Internet is reachable, but the OptoCare database health query failed with a server-side or connectivity error.",
      network: "online",
      internet: "online",
      authentication: authProbe.ok ? "online" : "degraded",
      database: "offline",
      edgeFunctions: edgeProbe.ok ? "online" : "offline",
      application: "online",
      latencyMs,
    };
  }

  if (internetProbe.ok && !edgeProbe.ok && edgeProbe.status >= 500) {
    return {
      code: "EDGE_FUNCTION",
      message: messageFor("EDGE_FUNCTION"),
      technicalMessage: `Internet and core authentication are reachable, but the OptoCare Edge Function health check returned HTTP ${edgeProbe.status}.`,
      network: "online",
      internet: "online",
      authentication: authProbe.ok ? "online" : "degraded",
      database: databaseStatus,
      edgeFunctions: "offline",
      application: "online",
      latencyMs,
    };
  }

  if (latencyMs >= 2000) {
    return {
      code: "SLOW_NETWORK",
      message: messageFor("SLOW_NETWORK"),
      technicalMessage: `Connectivity probes completed in ${latencyMs}ms.`,
      network: "online",
      internet: internetProbe.ok ? "online" : "degraded",
      authentication: authProbe.ok ? "online" : "degraded",
      database: databaseStatus,
      edgeFunctions: edgeProbe.ok ? "online" : "degraded",
      application: "online",
      latencyMs,
    };
  }

  return {
    code: "UNKNOWN",
    message: "OptoCare services are reachable. The request may have failed for an application-specific reason.",
    technicalMessage: `Internet: HTTP ${internetProbe.status}; Auth: HTTP ${authProbe.status}; Database: ${databaseStatus}; Edge Functions: HTTP ${edgeProbe.status}.`,
    network: "online",
    internet: internetProbe.ok ? "online" : "degraded",
    authentication: authProbe.ok ? "online" : "degraded",
    database: databaseStatus,
    edgeFunctions: edgeProbe.ok ? "online" : "degraded",
    application: "online",
    latencyMs,
  };
}


export async function getUserFacingErrorMessage(error: unknown, fallback: string): Promise<string> {
  try {
    const diagnosis = await diagnoseRequestFailure(error);
    if (diagnosis.code !== "UNKNOWN" || diagnosis.message !== (error instanceof Error ? error.message : String(error ?? ""))) {
      return diagnosis.message;
    }
  } catch {
    // Preserve the feature-specific fallback if diagnosis itself cannot run.
  }
  return fallback;
}
