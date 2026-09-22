import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installRuntimeErrorDetector } from "./lib/diag";

if (typeof window !== "undefined") installRuntimeErrorDetector();

// ---------------------------------------------------------------------------
// Global fetch guard — strips the legacy `x-optocare-shared-client` header
// from every outgoing request so it can never reach Supabase preflight again,
// no matter where the request originates. Also unregisters any stale service
// worker that might be replaying an older bundle.
// ---------------------------------------------------------------------------
const FORBIDDEN_HEADERS = ["x-optocare-shared-client"];
const SUPABASE_HOST = "avogfzqizuusqzjivhqj.supabase.co";

if (typeof window !== "undefined" && !(window as any).__optocareFetchPatched) {
  (window as any).__optocareFetchPatched = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      let stripped = false;
      for (const name of FORBIDDEN_HEADERS) {
        if (headers.has(name)) {
          headers.delete(name);
          stripped = true;
        }
      }

      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.includes(SUPABASE_HOST)) {
        // Temporary dev logging — remove after verification.
        // eslint-disable-next-line no-console
        console.debug("[fetch:supabase]", {
          url,
          method: init?.method ?? (input instanceof Request ? input.method : "GET"),
          headers: Object.fromEntries(headers.entries()),
          stripped,
        });
      }

      if (input instanceof Request) {
        const cloned = new Request(input, { ...init, headers });
        return originalFetch(cloned);
      }
      return originalFetch(input, { ...init, headers });
    } catch {
      return originalFetch(input as any, init);
    }
  };

}

createRoot(document.getElementById("root")!).render(<App />);
