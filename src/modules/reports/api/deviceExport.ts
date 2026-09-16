import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { environment } from "@config/env";
import { getDeviceId } from "@api/deviceId";
import { isTokenExpired, useAuthStore } from "@shared/store/useAuthStore";
import { EXPORT_TYPES, type ExportFormat } from "@modules/reports/api/reportsApi";
import type { ReportFilters } from "@modules/reports/types";

/**
 * US-41 on a phone or tablet: download the export into the app's cache and
 * hand it to the share sheet — save to Files, send to email, open in Sheets.
 *
 * The download goes around the API client, so the token is checked and
 * refreshed here first; a stale token would come back as a 401 saved to disk
 * under a .pdf name.
 */
export async function shareReportOnDevice(key: string, filters: ReportFilters, format: ExportFormat) {
  let token = useAuthStore.getState().token;
  if (isTokenExpired(token)) token = await useAuthStore.getState().refreshSession();
  if (!token) throw new Error("Sign in again to export this report.");
  if (!FileSystem.cacheDirectory) throw new Error("This device has no space to save the export.");

  const query = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    format,
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
  });
  const filename = `${key}_${filters.from}_${filters.to}.${format}`;
  const result = await FileSystem.downloadAsync(
    `${environment.apiUrl}/reports/${key}?${query.toString()}`,
    `${FileSystem.cacheDirectory}${filename}`,
    { headers: { Authorization: `Bearer ${token}`, "x-device-id": await getDeviceId() } },
  );

  if (result.status !== 200) {
    let message = "The export could not be downloaded.";
    try {
      message = JSON.parse(await FileSystem.readAsStringAsync(result.uri))?.error?.message ?? message;
    } catch {
      /* not a JSON refusal */
    }
    await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
    throw new Error(message);
  }

  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device.");
  await Sharing.shareAsync(result.uri, { mimeType: EXPORT_TYPES[format].mime, dialogTitle: filename });
  return { filename };
}
