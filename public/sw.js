/**
 * HMS service worker — keeps the app openable with no connection.
 *
 * Deliberately small, and deliberately NOT a data cache:
 *
 *  - Page loads are network-first. Online, every load gets the current
 *    index.html (and through it the current bundle), so a deploy reaches the
 *    ward on the next refresh. Offline, the last index.html served is used.
 *  - Static files on this origin are cache-first. Expo's bundles are
 *    content-hashed, so a cached one can never be stale — a new build has a new
 *    file name.
 *  - The API is never touched. Patient data offline comes from the record
 *    mirror (src/shared/offline/mirror.ts), which knows who is signed in, what
 *    may be kept and for how long. A worker caching API responses would keep
 *    records past sign-out and past break-the-glass expiry, with none of that.
 *
 * Bump VERSION when this file's behaviour changes; old caches are deleted on
 * activation.
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

/**
 * The page sends the static files it loaded before this worker was active —
 * its bundle, fonts and icons. Without them an offline reload finds the page
 * but not the program, and the app never draws.
 */
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
                .then((response) => (response.ok ? cache.put(u, response) : undefined))
                .catch(() => undefined),
          ),
        ),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Other origins — the API, the socket, anything third-party — pass straight through.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
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
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
