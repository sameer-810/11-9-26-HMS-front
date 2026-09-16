import { apiClient } from "@api/apiClient";
import type {
  DispenseContext,
  Dispensing,
  PharmacyQueueRow,
} from "@modules/pharmacy/types";
import type { Prescription } from "@modules/consultation/types";

export interface DispenseBody {
  /** PH-03: the pharmacist has checked the allergies shown. */
  allergiesAcknowledged: boolean;
  /** Echoed from the loaded context; the server refuses if allergies changed since. */
  allergyFingerprint: string;
  note?: string;
  lines: {
    lineId: string;
    allocations: { batchId: string; quantity: number }[];
  }[];
}

export const pharmacyApi = {
  queue: async (params: { urgency?: string; search?: string } = {}) => {
    const res = await apiClient.get<{ data: PharmacyQueueRow[] }>(
      "/pharmacy/queue",
      { params },
    );
    return res.data.data;
  },

  context: async (prescriptionId: string) => {
    const res = await apiClient.get<{ data: DispenseContext }>(
      `/pharmacy/prescriptions/${prescriptionId}/dispense-context`,
    );
    return res.data.data;
  },

  dispense: async (prescriptionId: string, body: DispenseBody) => {
    const res = await apiClient.post<{
      data: { dispensing: Dispensing; prescription: Prescription };
    }>(`/pharmacy/prescriptions/${prescriptionId}/dispense`, body);
    return res.data.data;
  },

  dispensings: async (prescriptionId: string) => {
    const res = await apiClient.get<{ data: Dispensing[] }>(
      `/pharmacy/prescriptions/${prescriptionId}/dispensings`,
    );
    return res.data.data;
  },
};
