/**
 * App-shell service worker: network-first pages, cache-first hashed static files.
 * Never caches the API (offline data is mirror.ts's job). Bump VERSION on behaviour changes.
 */
const VERSION = "hms-shell-v1";
const SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Caches static files the page loaded before this worker activated, so offline reloads work. */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "cache-urls" || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((u) => {
    try {
      const url = new URL(u);
      return url.origin === self.location.origin && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/socket.io/");
    } catch {
      return false;
    }
  });
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.all(
        urls.map((u) =>
          cache.match(u).then(
            (hit) =>
              hit ||
              fetch(u)
                .then((response) => (storable(response) ? cache.put(u, response) : undefined))
                .catch(() => undefined),
          ),
        ),
      ),
    ),
  );
});

/** Honours no-store/private even same-origin, in case patient data is ever served here. */
function storable(response) {
  const cacheControl = (response.headers.get("Cache-Control") || "").toLowerCase();
  return response.ok && !/\b(no-store|private)\b/.test(cacheControl);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  // A request carrying credentials is a data request by definition.
  if (request.headers.has("Authorization")) return;

  const url = new URL(request.url);
  // Other origins — the API, the socket, anything third-party — pass straight through.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (storable(response)) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("/index.html").then((hit) => hit || caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (storable(response) && response.type === "basic") {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
