import { create } from "zustand";
import { onlineManager } from "@tanstack/react-query";
import { Platform } from "react-native";
import { environment } from "@config/env";

/**
 * Server reachability flag (not just `navigator.onLine`): browser events, API responses and
 * an offline probe. React Query shares it, so offline queries pause instead of erroring.
 */
interface NetworkState {
  online: boolean;
  /** When the flag last changed. The offline strip says how long it has been. */
  since: number;
  setOnline: (online: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  online: true,
  since: Date.now(),
  setOnline: (online) => {
    if (get().online === online) return;
    set({ online, since: Date.now() });
  },
}));

onlineManager.setEventListener((setOnline) => {
  setOnline(useNetworkStore.getState().online);
  return useNetworkStore.subscribe((s) => setOnline(s.online));
});

/** A request that never got an answer — as opposed to one the server refused. */
export function isNetworkError(err: unknown): boolean {
  const e = err as {
    isAxiosError?: boolean;
    response?: unknown;
    code?: string;
  } | null;
  return Boolean(e?.isAxiosError) && !e?.response && e?.code !== "ERR_CANCELED";
}

// Probe the API root, not /health: no session needed, and it goes through the same proxies.
const HEALTH_URL = `${environment.apiUrl.replace(/\/+$/, "")}/`;
const PROBE_EVERY_MS = 10_000;
const PROBE_TIMEOUT_MS = 5_000;

export async function probeServer(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(HEALTH_URL, {
      cache: "no-store",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Starts the listeners and the recovery probe. Returns a stop function. */
export function startNetworkWatch(): () => void {
  const { setOnline } = useNetworkStore.getState();
  const cleanups: (() => void)[] = [];

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const goOffline = () => setOnline(false);
    // Browser "online" only means the link is back; probe before flipping the flag.
    const maybeOnline = () =>
      void probeServer().then((ok) => ok && setOnline(true));
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", maybeOnline);
    if (typeof navigator !== "undefined" && navigator.onLine === false)
      setOnline(false);
    cleanups.push(() => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", maybeOnline);
    });
  }

  const timer = setInterval(() => {
    if (useNetworkStore.getState().online) return;
    if (
      Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      navigator.onLine === false
    )
      return;
    void probeServer().then((ok) => ok && setOnline(true));
  }, PROBE_EVERY_MS);
  cleanups.push(() => clearInterval(timer));

  return () => cleanups.forEach((fn) => fn());
}
