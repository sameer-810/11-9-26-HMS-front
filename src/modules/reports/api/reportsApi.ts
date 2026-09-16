import { apiClient } from "@api/apiClient";
import type { ReportDefinition, ReportFilters, ReportResult } from "@modules/reports/types";

/** US-41: the formats a report downloads as. */
export type ExportFormat = "csv" | "xlsx" | "pdf";

export const EXPORT_TYPES: Record<ExportFormat, { mime: string; label: string }> = {
  csv: { mime: "text/csv", label: "CSV" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel" },
  pdf: { mime: "application/pdf", label: "PDF" },
};

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

  /** The report as a file, for the browser to save. Phones go through deviceExport.ts. */
  exportFile: async (key: string, filters: ReportFilters, format: ExportFormat) => {
    try {
      const res = await apiClient.get<Blob>(`/reports/${key}`, {
        params: { ...filters, format },
        responseType: "blob",
      });
      return {
        blob: res.data,
        filename: filenameFrom(res.headers["content-disposition"], `${key}_${filters.from}_${filters.to}.${format}`),
      };
    } catch (err) {
      await unwrapBlobError(err);
      throw err;
    }
  },
};
