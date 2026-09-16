import { Platform } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { reportsApi, type ExportFormat } from "@modules/reports/api/reportsApi";
import type { ReportFilters } from "@modules/reports/types";

/** A 4xx is a decision (range too long, report not allowed); only network or 5xx failures retry once. */
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
    // Keep the previous result while a new range loads, but only for the same report,
    // so no figure is briefly shown under the wrong report.
    placeholderData: (previous) => (previous?.key === key ? previous : undefined),
    retry: retryUnlessRefused,
  });

/** Web only: hand the browser the file through a throwaway link. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: some browsers start the download asynchronously
  // and a URL revoked in the same tick downloads nothing.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * US-41: CSV, Excel or PDF. The browser (and the desktop app) saves the file;
 * a phone opens the share sheet.
 */
export const useExportReport = () =>
  useMutation({
    mutationFn: async ({ key, filters, format }: { key: string; filters: ReportFilters; format: ExportFormat }) => {
      if (Platform.OS === "web") {
        const { blob, filename } = await reportsApi.exportFile(key, filters, format);
        saveBlob(blob, filename);
        return { filename, format };
      }
      const { shareReportOnDevice } = await import("@modules/reports/api/deviceExport");
      return { ...(await shareReportOnDevice(key, filters, format)), format };
    },
  });
