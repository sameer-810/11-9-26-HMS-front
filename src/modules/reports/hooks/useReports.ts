import { useMutation, useQuery } from "@tanstack/react-query";
import { reportsApi } from "@modules/reports/api/reportsApi";
import type { ReportFilters } from "@modules/reports/types";

/**
 * A 4xx here is a decision — range too long, report not for this role — and
 * asking again returns the same answer a second later. Only a network or
 * server failure is worth one retry.
 */
const retryUnlessRefused = (failureCount: number, err: unknown) => {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status && status >= 400 && status < 500) return false;
  return failureCount < 1;
};

export const useReportCatalogue = () =>
  useQuery({ queryKey: ["reports"], queryFn: reportsApi.available, staleTime: 5 * 60_000 });

export const useReport = (key: string | undefined, filters: ReportFilters, enabled = true) =>
  useQuery({
    queryKey: ["report", key, filters],
    queryFn: () => reportsApi.run(key!, filters),
    enabled: Boolean(key) && enabled,
    // Keep the last result on screen while a new range loads — but only for the
    // same report. Showing billing's table under the pharmacy chip for a second
    // is how a number gets read against the wrong report.
    placeholderData: (previous) => (previous?.key === key ? previous : undefined),
    retry: retryUnlessRefused,
  });

export const useExportReportCsv = () =>
  useMutation({
    mutationFn: ({ key, filters }: { key: string; filters: ReportFilters }) => reportsApi.exportCsv(key, filters),
  });
