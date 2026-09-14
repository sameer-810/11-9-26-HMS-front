import { Platform } from "react-native";

/** Same-origin static files this page has loaded — never API calls. */
function loadedAssets(): string[] {
  const origin = window.location.origin;
  const urls = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name.split("#")[0])
    .filter((url) => url.startsWith(origin) && !url.includes("/api/") && !url.includes("/socket.io/"));
  return [...new Set([`${origin}/index.html`, ...urls])];
}

/**
 * Registers `public/sw.js` on the web build.
 *
 * The record mirror is useless if the app itself cannot open: a ward browser
 * refreshed during an outage would otherwise show the browser's own "no
 * internet" page, with every saved record sitting unreachable behind it. The
 * worker keeps the app shell — the page and its bundles — so a reload with no
 * connection still boots the app, which then shows what this device saved.
 *
 * Not in development: a cached bundle in front of a hot-reloading dev server is
 * how an afternoon disappears into "why is my change not showing".
 */
export function registerServiceWorker(): void {
  if (Platform.OS !== "web" || __DEV__) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        // The worker installs AFTER this page already loaded its bundle and
        // fonts, so it never saw them go past. Hand it the list, now and once
        // more after late assets (fonts, icons) have arrived — without the
        // fonts the app waits forever on an offline reload.
        const send = () => registration.active?.postMessage({ type: "cache-urls", urls: loadedAssets() });
        send();
        setTimeout(send, 5000);
      })
      .catch(() => {
        // No worker (a private window, an http origin that is not localhost).
        // The app works online exactly as before.
      });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
