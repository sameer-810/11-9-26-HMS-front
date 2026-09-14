import { apiClient } from "@api/apiClient";
import type { ReportDefinition, ReportFilters, ReportResult } from "@modules/reports/types";

/**
 * With `responseType: "blob"` a refusal arrives as a Blob too, and
 * `apiErrorMessage` would find no `error.message` inside it. Parse it back into
 * the JSON envelope so "A report covers at most 366 days" reaches the screen
 * instead of "Something went wrong".
 */
async function unwrapBlobError(err: unknown) {
  const response = (err as { response?: { data?: unknown } })?.response;
  if (!response || typeof Blob === "undefined" || !(response.data instanceof Blob)) return;
  try {
    response.data = JSON.parse(await response.data.text());
  } catch {
    /* not JSON — leave it for the generic message */
  }
}

/**
 * The server names the file. A browser only exposes Content-Disposition when
 * CORS lists it, so the fallback reproduces the server's own naming.
 */
function filenameFrom(disposition: unknown, fallback: string) {
  const m = /filename="?([^";]+)"?/i.exec(String(disposition ?? ""));
  return m ? m[1] : fallback;
}

export const reportsApi = {
  available: async () => (await apiClient.get<{ data: ReportDefinition[] }>("/reports")).data.data,

  run: async (key: string, filters: ReportFilters) =>
    (await apiClient.get<{ data: ReportResult }>(`/reports/${key}`, { params: filters })).data.data,

  exportCsv: async (key: string, filters: ReportFilters) => {
    try {
      const res = await apiClient.get<Blob>(`/reports/${key}`, {
        params: { ...filters, format: "csv" },
        responseType: "blob",
      });
      return {
        blob: res.data,
        filename: filenameFrom(res.headers["content-disposition"], `${key}_${filters.from}_${filters.to}.csv`),
      };
    } catch (err) {
      await unwrapBlobError(err);
      throw err;
    }
  },
};
