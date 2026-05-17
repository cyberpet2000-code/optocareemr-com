// Sinks: console + in-memory ring buffer. Overlay reads the buffer.

export type DiagArea = "auth" | "routing" | "hydration" | "query" | "rls" | "perf";

export type DiagEntry = {
  t: number;             // ms since epoch
  level: "info" | "warn" | "error";
  area: DiagArea;
  name: string;
  data?: Record<string, unknown>;
  hint?: string | null;
  durationMs?: number;
};

const MAX = 200;
const buffer: DiagEntry[] = [];
const listeners = new Set<() => void>();

declare global {
  // eslint-disable-next-line no-var
  var __optocareDiag: { buffer: DiagEntry[]; snapshot: () => DiagEntry[] } | undefined;
}

function notify() {
  for (const l of listeners) {
    try { l(); } catch { /* noop */ }
  }
}

export function pushEntry(entry: DiagEntry) {
  buffer.push(entry);
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);

  const tag = `%c[diag:${entry.area}]%c ${entry.name}`;
  const tagStyle = entry.level === "error"
    ? "color:#fff;background:#b91c1c;padding:1px 4px;border-radius:3px"
    : entry.level === "warn"
      ? "color:#000;background:#fbbf24;padding:1px 4px;border-radius:3px"
      : "color:#fff;background:#2563eb;padding:1px 4px;border-radius:3px";
  const payload: Record<string, unknown> = {};
  if (entry.data) payload.data = entry.data;
  if (entry.hint) payload.hint = entry.hint;
  if (entry.durationMs !== undefined) payload.durationMs = entry.durationMs;

  const fn = entry.level === "error" ? console.error : entry.level === "warn" ? console.warn : console.debug;
  // eslint-disable-next-line no-console
  fn(tag, tagStyle, "color:inherit", payload);

  notify();
}

export function getEntries(): DiagEntry[] {
  return buffer.slice();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearEntries() {
  buffer.length = 0;
  notify();
}

if (typeof globalThis !== "undefined") {
  globalThis.__optocareDiag = {
    buffer,
    snapshot: () => buffer.slice(),
  };
}
