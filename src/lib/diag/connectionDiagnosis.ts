import { apiClient } from "@/lib/apiClient";

export type ServiceStatus = "online" | "degraded" | "offline" | "unknown";
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

  const [internetProbe, authProbe] = await Promise.all([
    probe("https://www.gstatic.com/generate_204", 3500),
    probe(`${SUPABASE_URL}/auth/v1/health`, 4000),
  ]);

  const latencyMs = Math.max(internetProbe.latencyMs, authProbe.latencyMs);

  if (!internetProbe.ok && !authProbe.ok) {
    return {
      code: internetProbe.status === 0 ? "NO_INTERNET" : "DATABASE_SERVICE",
      message: messageFor(internetProbe.status === 0 ? "NO_INTERNET" : "DATABASE_SERVICE"),
      technicalMessage: `Internet probe failed and Supabase health probe failed (status ${authProbe.status || "network error"}).`,
      network: "online",
      internet: "offline",
      authentication: "offline",
      database: "unknown",
      edgeFunctions: "unknown",
      application: "online",
      latencyMs,
    };
  }

  if (!authProbe.ok && authProbe.status >= 500) {
    return {
      code: "AUTH_SERVICE",
      message: messageFor("AUTH_SERVICE"),
      technicalMessage: `Supabase Auth health endpoint returned HTTP ${authProbe.status}.`,
      network: "online",
      internet: internetProbe.ok ? "online" : "degraded",
      authentication: "offline",
      database: "unknown",
      edgeFunctions: "unknown",
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
      database: "unknown",
      edgeFunctions: "unknown",
      application: "online",
      latencyMs,
    };
  }

  return {
    code: "UNKNOWN",
    message: "OptoCare services are reachable. The request may have failed for an application-specific reason.",
    technicalMessage: `Internet probe HTTP ${internetProbe.status}; Auth health HTTP ${authProbe.status}.`,
    network: "online",
    internet: internetProbe.ok ? "online" : "degraded",
    authentication: authProbe.ok ? "online" : "degraded",
    database: "unknown",
    edgeFunctions: "unknown",
    application: "online",
    latencyMs,
  };
}

export async function diagnoseRequestFailure(error: unknown): Promise<ConnectionDiagnosis> {
  const initial = classifyConnectionError(error);
  if (initial === "AUTH_SERVICE" || initial === "APPLICATION") {
    const base = await diagnoseConnection();
    if (base.code !== "UNKNOWN") return base;
  }
  if (initial !== "UNKNOWN") {
    const message = messageFor(initial);
    return {
      code: initial,
      message,
      technicalMessage: error instanceof Error ? error.message : String(error ?? ""),
      network: typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline",
      internet: initial === "NO_NETWORK" || initial === "NO_INTERNET" ? "offline" : "unknown",
      authentication: initial === "AUTH_SERVICE" ? "offline" : "unknown",
      database: initial === "DATABASE_SERVICE" ? "offline" : "unknown",
      edgeFunctions: initial === "EDGE_FUNCTION" ? "offline" : "unknown",
      application: initial === "APPLICATION" ? "offline" : "unknown",
    };
  }
  return diagnoseConnection();
}

export async function checkDatabaseService(): Promise<ServiceStatus> {
  try {
    const { error } = await (apiClient as any).from("clinics").select("id").limit(1);
    if (!error) return "online";
    const status = Number(error?.status);
    return status >= 500 ? "offline" : "degraded";
  } catch {
    return "offline";
  }
}
