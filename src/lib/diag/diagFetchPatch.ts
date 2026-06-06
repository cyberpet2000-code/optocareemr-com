// One-time window.fetch patch. Captures Supabase REST traffic that
// supabase-js performs directly (not through authenticatedFetch).
// No-op when diag is disabled. Safe to call multiple times.

import { isDiagEnabled } from "./diagConfig";
import { diag } from "./diag";
import { checkSlowQuery } from "./healthChecks";

const FLAG = "__optocareDiagFetchPatched";

export function installDiagFetchPatch() {
  if (!isDiagEnabled()) return;
  if (typeof window === "undefined") return;
  if ((window as any)[FLAG]) return;
  (window as any)[FLAG] = true;

  const orig = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL ? input.toString() : input.url;

    // Only instrument Supabase calls — keep noise low.
    const isSupabase = url.includes(".supabase.co/") || url.includes("/rest/v1/") || url.includes("/functions/v1/") || url.includes("/auth/v1/");
    if (!isSupabase) return orig(input as any, init);

    const method = init?.method
      || (typeof input !== "string" && !(input instanceof URL) ? (input as Request).method : "GET")
      || "GET";

    const start = Date.now();
const end = diag.time("query", "fetch", { url, method });
    let res: Response;
    try {
      res = await orig(input as any, init);
    } catch (err) {
      end({ status: 0 });
      diag.error("query", "network failed", err, { url, method });
      throw err;
    }
    end({ status: res.status });
    
    const durationMs = Date.now() - start;

checkSlowQuery(
  url,
  durationMs
);

    if (!res.ok) {
      let body: any = null;
      try {
        const clone = res.clone();
        const text = await clone.text();
        try { body = JSON.parse(text); } catch { body = text?.slice(0, 500); }
      } catch { /* noop */ }

      const code = body?.code ?? null;
      const message = body?.message ?? `HTTP ${res.status}`;
      const tableMatch = url.match(/\/rest\/v1\/([^?]+)/);
      const table = tableMatch?.[1] ?? null;
      const fnMatch = url.match(/\/functions\/v1\/([^?]+)/);
      const fn = fnMatch?.[1] ?? null;

      const area = code === "42501" || code === "42P17" || res.status === 401 || res.status === 403
        ? "rls" : "query";
      const name = table
        ? `${table} request failed`
        : fn ? `edge ${fn} failed` : "request failed";

      diag.error(area, name, { message, code }, {
        url, status: res.status, table, fn,
      });
    }
    return res;
  };
}
