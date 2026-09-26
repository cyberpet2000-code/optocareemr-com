import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installRuntimeErrorDetector } from "./lib/diag";
import { initPostHog } from "./lib/posthog";

if (typeof window !== "undefined") {
  initPostHog();
  installRuntimeErrorDetector();

  // Vite can encounter deployment-version skew when an already-open tab
  // tries to lazy-load a chunk from a previous build. Recover once by clearing
  // the app-shell caches and reloading; never loop indefinitely.
  window.addEventListener("vite:preloadError", (event) => {
    const key = "optocare:vite-preload-recovery";
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");

    const recover = async () => {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
        const cacheKeys = await caches.keys();
        await Promise.all(
          cacheKeys
            .filter((name) => name.startsWith("optocare-shell-"))
            .map((name) => caches.delete(name)),
        );
      } catch {
        // Recovery is best-effort; the reload below remains safe.
      } finally {
        window.location.reload();
      }
    };

    event.preventDefault();
    void recover();
  });
}

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
