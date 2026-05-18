import React from "react";

export type DiagLevel = "event" | "warn" | "error" | "critical";

export type DiagEntry = {
  id: string;
  timestamp: string; // ISO
  level: DiagLevel;
  category: string;
  message: string;
  metadata?: Record<string, any> | null;
};

const STORAGE_KEY = "opto:diag:logs:v1";
const MAX_LOGS = 500;

function nowIso() {
  return new Date().toISOString();
}

function makeId(level: string) {
  return `${Date.now().toString(36)}-${level}-${Math.random().toString(36).slice(2, 9)}`;
}

function safeParse(v: string | null) {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

// In-memory cache + subscribers
let logsCache: DiagEntry[] = [];
const subscribers = new Set<(logs: DiagEntry[]) => void>();
let enabled = true;

function loadFromStorage() {
  try {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = safeParse(raw);
    if (Array.isArray(parsed)) {
      logsCache = parsed.slice(-MAX_LOGS);
    }
  } catch (e) {
    // ignore
  }
}

function persistToStorage() {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(logsCache));
  } catch (e) {
    // ignore
  }
}

function notify() {
  const snapshot = logsCache.slice();
  subscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (e) {
      // swallow subscriber errors
      // eslint-disable-next-line no-console
      console.error("diag subscriber error", e);
    }
  });
}

function pushLog(level: DiagLevel, category: string, message: string, metadata?: Record<string, any> | null) {
  if (!enabled) return;
  const entry: DiagEntry = {
    id: makeId(level),
    timestamp: nowIso(),
    level,
    category,
    message,
    metadata: metadata ?? null,
  };
  logsCache.push(entry);
  if (logsCache.length > MAX_LOGS) {
    logsCache = logsCache.slice(-MAX_LOGS);
  }
  persistToStorage();
  notify();
}

// Public API
export const diag = {
  event(category: string, message: string, metadata?: Record<string, any> | null) {
    pushLog("event", category, message, metadata);
  },
  warn(category: string, message: string, metadata?: Record<string, any> | null) {
    pushLog("warn", category, message, metadata);
  },
  error(category: string, message: string, metadata?: Record<string, any> | null) {
    pushLog("error", category, message, metadata);
  },
  critical(category: string, message: string, metadata?: Record<string, any> | null) {
    pushLog("critical", category, message, metadata);
  },
  // time helper: returns end() which when called logs duration in ms
  time(label: string, category = "perf") {
    const start = Date.now();
    return {
      end: (message = "duration") => {
        const ms = Date.now() - start;
        pushLog("event", category, `${label}: ${message} (${ms}ms)`, { duration_ms: ms });
      },
    };
  },
  getLogs(): DiagEntry[] {
    return logsCache.slice();
  },
  clearLogs() {
    logsCache = [];
    persistToStorage();
    notify();
  },
  subscribe(cb: (logs: DiagEntry[]) => void) {
    subscribers.add(cb);
    try {
      cb(logsCache.slice());
    } catch (e) {
      // ignore
    }
    return () => subscribers.delete(cb);
  },
  captureAuthFailure(err: any) {
    try {
      const meta = { ...(err && typeof err === "object" ? err : { detail: String(err) }) };
      pushLog("warn", "auth", "Authentication failure", meta);
    } catch {}
  },
  captureClinicHydrationFailure(err: any, metadata?: Record<string, any>) {
    try {
      const meta = { ...(err && typeof err === "object" ? err : { detail: String(err) }), ...metadata };
      pushLog("error", "clinic.hydration", "Clinic hydration failure", meta);
    } catch {}
  },
  captureQueryFailure(err: any, metadata?: Record<string, any>) {
    try {
      const meta = { ...(err && typeof err === "object" ? err : { detail: String(err) }), ...metadata };
      pushLog("error", "supabase.query", "Query failure", meta);
    } catch {}
  },
  exportLogs(filename = `opto-care-diag-${new Date().toISOString()}`, format: "log" | "json" = "log") {
    // lazy import export utility to avoid cycles
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { exportLogs } = require("@/utils/exportLogs");
      const lines = logsCache.map((l) => `[${l.timestamp}] ${l.level.toUpperCase()} ${l.category} ${l.message}${l.metadata ? ` ${JSON.stringify(l.metadata)}` : ""}`);
      exportLogs(lines, filename, format);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("diag export failed", e);
    }
  },
};

// Initialize from sessionStorage
loadFromStorage();

// Global capture: window.onerror + unhandledrejection
if (typeof window !== "undefined") {
  try {
    window.addEventListener("error", (ev: ErrorEvent) => {
      try {
        const { message, filename, lineno, colno, error } = ev;
        diag.error("window.onerror", String(message || "Error"), {
          filename,
          lineno,
          colno,
          stack: error?.stack || null,
        });
      } catch (e) {
        // ignore
      }
    });

    window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
      try {
        const reason = ev.reason;
        diag.error("unhandledrejection", "Unhandled promise rejection", { reason: (reason && (typeof reason === "object" ? reason : String(reason))) });
      } catch (e) {
        // ignore
      }
    });
  } catch (e) {
    // ignore
  }
}

// fetch patch to capture 401s & supabase error payloads
export function installDiagFetchPatch() {
  if (typeof window === "undefined") return;
  if ((window as any).__diag_fetch_patched) return;
  (window as any).__diag_fetch_patched = true;

  const orig = window.fetch.bind(window);
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.fetch = async function (input: RequestInfo, init?: RequestInit) {
    try {
      const res = await orig(input, init);
      try {
        // clone and inspect json body if possible
        const clone = res.clone();
        const ct = clone.headers.get("content-type") || "";
        if (res.status === 401) {
          diag.warn("auth", "HTTP 401 response", { url: typeof input === "string" ? input : (input as Request).url, status: res.status });
        }
        if (ct.includes("application/json")) {
          clone.json().then((body) => {
            if (body && typeof body === "object") {
              // Supabase sometimes returns an "error" key
              if (body.error || body.message || body['status'] >= 400) {
                diag.error("http.response", "JSON response with error", { url: typeof input === "string" ? input : (input as Request).url, status: res.status, body });
                // If this looks like a supabase query error, capture specifically
                if (body?.error || body?.status !== undefined) {
                  diag.captureQueryFailure(body?.error || body || null, { url: typeof input === "string" ? input : (input as Request).url, status: res.status });
                }
              }
            }
          }).catch(() => {});
        }
      } catch (e) {
        // ignore
      }
      return res;
    } catch (err) {
      diag.error("fetch", "Fetch failed", { error: String(err), url: typeof input === "string" ? input : (input as Request).url });
      throw err;
    }
  };
}

export function isDiagEnabled() {
  return enabled;
}

export function enableDiag(v: boolean) {
  enabled = v;
}

// Simple overlay component to show recent errors (optional)
export function DiagOverlay() {
  const [open, setOpen] = React.useState(false);
  const [entries, setEntries] = React.useState<DiagEntry[]>(diag.getLogs());

  React.useEffect(() => {
    const unsub = diag.subscribe((logs) => setEntries(logs));
    return unsub;
  }, []);

  if (!open) {
    return (
      <div style={{ position: "fixed", right: 12, bottom: 12, zIndex: 9999 }}>
        <button
          onClick={() => setOpen(true)}
          className="bg-primary text-primary-foreground px-3 py-1 rounded-full shadow"
        >
          D
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", right: 12, bottom: 12, zIndex: 9999, width: 360, maxHeight: "60vh", overflow: "auto" }}>
      <div className="bg-white border rounded shadow p-3">
        <div className="flex justify-between items-center mb-2">
          <strong>Diagnostics</strong>
          <div>
            <button onClick={() => { diag.clearLogs(); }} className="text-xs text-rose-600 mr-2">Clear</button>
            <button onClick={() => setOpen(false)} className="text-xs">Close</button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mb-2">Recent events (session)</div>
        <div className="space-y-2 text-xs">
          {entries.slice().reverse().map((e) => (
            <div key={e.id} className="p-2 border rounded">
              <div className="flex justify-between text-[11px] text-muted-foreground"><span>{e.timestamp}</span><span>{e.level.toUpperCase()}</span></div>
              <div className="text-sm font-medium">{e.category}</div>
              <div className="text-[12px]">{e.message}</div>
              {e.metadata && <pre className="text-[11px] mt-1 max-h-20 overflow-auto">{JSON.stringify(e.metadata)}</pre>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// export helpers as convenience
export function getLogs() {
  return diag.getLogs();
}

export function clearLogs() {
  return diag.clearLogs();
}

export function exportDiagLogs(filename?: string, format?: "log" | "json") {
  return diag.exportLogs(filename, format);
}

export default diag;
