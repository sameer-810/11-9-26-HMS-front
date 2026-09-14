import { apiClient } from "@api/apiClient";
import type { ScanResult } from "@modules/printing/types";

/** Just what a wristband needs from an admission. */
export interface CurrentAdmission {
  id: string;
  admissionNumber: string;
  ward: { name?: string } | null;
  bed: { number?: string } | null;
}

export const printingApi = {
  /**
   * The raw scanned text, encoded whole. The server parses it — bare number or
   * `HMS1|…` payload — so there is one reader, not one per client.
   */
  scan: async (code: string) => {
    const res = await apiClient.get<{ data: ScanResult }>(`/patients/scan/${encodeURIComponent(code)}`);
    return res.data.data;
  },

  /**
   * The open admission, for ward and bed on the band.
   *
   * Called directly rather than through the inpatient module's API so this
   * module does not depend on code that changes with the nursing work; the
   * endpoint and its row shape are the contract.
   */
  currentAdmission: async (patientId: string) => {
    const res = await apiClient.get<{ data: CurrentAdmission[] }>("/admissions", {
      params: { patientId, status: "admitted", limit: 1 },
    });
    return res.data.data[0] ?? null;
  },
};
