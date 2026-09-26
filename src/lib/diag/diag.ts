// Public diagnostic API. All calls are short-circuited when disabled.

import { isDiagEnabled } from "./diagConfig";
import { hintFor } from "./diagRules";
import { pushEntry, getEntries, type DiagArea } from "./diagSinks";

function now() { return Date.now(); }

function event(area: DiagArea, name: string, data?: Record<string, unknown>) {
  if (!isDiagEnabled()) return;
  pushEntry({ t: now(), level: "info", area, name, data });
}

function warn(area: DiagArea, name: string, data?: Record<string, unknown>) {
  if (!isDiagEnabled()) return;
  const hint = hintFor({ event: `${area}/${name}`, code: (data as any)?.code, status: (data as any)?.status });
  pushEntry({ t: now(), level: "warn", area, name, data, hint });
}

function error(area: DiagArea, name: string, err: unknown, extra?: Record<string, unknown>) {
  if (!isDiagEnabled()) return;
  const e = err as any;
  const code = e?.code ?? extra?.code ?? null;
  const status = e?.status ?? extra?.status ?? null;
  const message = e?.message ?? String(err);
  const data = { message, code, status, ...extra };
  const hint = hintFor({ code, status, event: `${area}/${name}` });
  pushEntry({ t: now(), level: "error", area, name, data, hint });
}

function time(area: DiagArea, name: string, data?: Record<string, unknown>) {
  if (!isDiagEnabled()) return () => {};
  const started = now();
  return (extra?: Record<string, unknown>) => {
    const durationMs = now() - started;
    const merged = { ...(data || {}), ...(extra || {}) };
    const slow = durationMs > 1500;
    const severity = durationMs >= 5000 ? "critical" : durationMs >= 3000 ? "slow" : durationMs >= 1500 ? "degraded" : "normal";
    pushEntry({
      t: now(),
      level: slow ? "warn" : "info",
      area,
      name,
      data: { ...merged, performance: severity },
      durationMs,
      hint: slow ? hintFor({ event: "query/slow" }) : null,
    });
  };
}

function snapshot() {
  return getEntries();
}

export const diag = { event, warn, error, time, snapshot };
export type { DiagArea };
