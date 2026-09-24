const CACHE_NAME = "optocare-shell-v7";
const APP_SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await Promise.all(
          APP_SHELL.map(async (url) => {
            try {
              const response = await fetch(url, { cache: "no-store" });
              if (response.ok) await cache.put(url, response);
            } catch {
              // Keep installation resilient if one shell URL is unavailable.
            }
          }),
        );
        try {
          const response = await fetch("/index.html", { cache: "no-store" });
          if (!response.ok) return;
          const html = await response.text();
          const assets = Array.from(
            html.matchAll(/(?:src|href)=["']([^"']+)["']/g),
            (match) => match[1],
          )
            .filter((url) => url.startsWith("/") && !url.startsWith("//"))
            .filter((url) => !url.includes("sw.js"));

          await Promise.all(
            Array.from(new Set(assets)).map(async (url) => {
              try {
                const assetResponse = await fetch(url, { cache: "no-store" });
                if (assetResponse.ok) await cache.put(url, assetResponse);
              } catch {
                // An optional asset failing must not block installation.
              }
            }),
          );
        } catch {
          // The shell itself is already cached.
        }
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("optocare-shell-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API/Supabase traffic.
  if (url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/functions/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => caches.match("/index.html").then((cached) => cached || caches.match("/"))),
    );
    return;
  }

  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".webp")
  ) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => caches.match(request)),

    );
  }
});
