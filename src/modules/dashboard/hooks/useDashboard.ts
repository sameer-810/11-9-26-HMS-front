import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@modules/dashboard/api/dashboardApi";

export const useDashboardSummary = () =>
  useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: dashboardApi.summary,
    // A ward board left open all shift should not go stale, but it also should
    // not hammer the API. A minute is the compromise; anything genuinely urgent
    // arrives over the socket instead.
    staleTime: 60_000,
  });
