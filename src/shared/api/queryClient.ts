import { QueryClient } from "@tanstack/react-query";

/** the single query client; a module so the outbox and mirror share the screens' cache. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // refetching on focus makes clinical values flicker and re-sort while being compared.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
      // offline queries pause and keep cached data instead of erroring.
      // "offline" is decided by shared/offline/network.ts, not navigator.onLine alone.
      networkMode: "offlineFirst",
    },
    // mutations never pause: they must fail visibly so nobody thinks unsaved work was saved.
    // the few that may wait go through the outbox explicitly.
    mutations: { networkMode: "always" },
  },
});
