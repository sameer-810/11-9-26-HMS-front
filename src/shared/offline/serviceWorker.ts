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
 * Registers `public/sw.js` on web so an offline reload still boots the app shell.
 * Skipped in development, where a cached bundle would hide hot-reload changes.
 */
export function registerServiceWorker(): void {
  if (Platform.OS !== "web" || __DEV__) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        // The worker installs after assets loaded, so send it the list now and again for late fonts;
        // without fonts an offline reload hangs.
        const send = () => registration.active?.postMessage({ type: "cache-urls", urls: loadedAssets() });
        send();
        setTimeout(send, 5000);
      })
      .catch(() => {
      // No worker (private window, non-localhost http); the app still works online.
      });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
