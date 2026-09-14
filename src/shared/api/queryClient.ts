import { QueryClient } from "@tanstack/react-query";

/**
 * The one query client.
 *
 * A module rather than a value created inside App, because the offline outbox
 * and the record mirror work outside the component tree and need to invalidate
 * and hydrate the same cache the screens read.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A clinical record is not a social feed. Refetching on every window
      // focus means a doctor comparing two values watches them flicker and
      // re-sort under the cursor.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
      // A query that fails while the device is offline pauses and keeps what
      // it already has — the record saved on this device stays on screen
      // instead of turning into an error. "Offline" is decided by
      // shared/offline/network.ts, not by navigator.onLine alone.
      networkMode: "offlineFirst",
    },
    // Mutations are never paused by React Query. The few that may be saved for
    // later go through the outbox explicitly; everything else must fail
    // visibly so nobody believes a prescription was saved when it was not.
    mutations: { networkMode: "always" },
  },
});
