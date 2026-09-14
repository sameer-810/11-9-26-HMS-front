import { apiClient } from "@api/apiClient";
import type {
  LabTest,
  LabOrder,
  LabQueueRow,
  LabInbox,
  LabUrgency,
  LabStatus,
} from "@modules/laboratory/types";

export interface OrderTestsBody {
  patientId: string;
  consultationId?: string;
  admissionId?: string;
  testIds: string[];
  clinicalIndication: string;
  urgency: LabUrgency;
  acknowledgeDuplicates?: boolean;
  /**
   * Deliberately no patient name, age or sex here. LB-01: identity comes from
   * the record the doctor is in, and the server refuses a request carrying a
   * typed name rather than quietly ignoring it.
   */
}

export interface SaveResultsResponse {
  order: LabOrder;
  interpretation: {
    missingRequired: string[];
    hasCritical: boolean;
    criticalParameters: string[];
    abnormalCount: number;
    significantDeltas: string[];
  };
}

export const laboratoryApi = {
  tests: async (params: { search?: string; category?: string } = {}) => {
    const res = await apiClient.get<{ data: LabTest[] }>("/laboratory/tests", { params });
    return res.data.data;
  },

  loadStandardCatalogue: async () => {
    const res = await apiClient.post<{ data: { added: string[]; skipped: string[] } }>(
      "/laboratory/tests/load-standard",
    );
    return res.data.data;
  },

  order: async (body: OrderTestsBody) => {
    const res = await apiClient.post<{ data: { groupNumber: string; orders: LabOrder[] } }>(
      "/laboratory/orders",
      body,
    );
    return res.data.data;
  },

  cancel: async (id: string, reason: string) => {
    const res = await apiClient.post<{ data: LabOrder }>(`/laboratory/orders/${id}/cancel`, { reason });
    return res.data.data;
  },

  queue: async (params: { status?: LabStatus; urgency?: LabUrgency; search?: string } = {}) => {
    const res = await apiClient.get<{ data: LabQueueRow[] }>("/laboratory/queue", { params });
    return res.data.data;
  },

  get: async (id: string) => {
    const res = await apiClient.get<{ data: LabOrder }>(`/laboratory/orders/${id}`);
    return res.data.data;
  },

  advance: async (id: string, to: LabStatus, note?: string) => {
    const res = await apiClient.post<{ data: LabOrder }>(`/laboratory/orders/${id}/stage`, { to, note });
    return res.data.data;
  },

  rejectSample: async (id: string, reason: string) => {
    const res = await apiClient.post<{ data: LabOrder }>(`/laboratory/orders/${id}/reject-sample`, {
      reason,
    });
    return res.data.data;
  },

  /**
   * Values go as typed strings. "<0.01" is a result, and the server is the one
   * place that parses — an unreadable value is refused there, not coerced here.
   */
  saveResults: async (id: string, values: Record<string, string>, labComment?: string) => {
    const res = await apiClient.put<{ data: SaveResultsResponse }>(`/laboratory/orders/${id}/results`, {
      values,
      labComment,
    });
    return res.data.data;
  },

  acknowledge: async (id: string, note: string) => {
    const res = await apiClient.post<{ data: LabOrder }>(`/laboratory/orders/${id}/acknowledge`, { note });
    return res.data.data;
  },

  recordCall: async (
    id: string,
    body: { to: string; method: "phone" | "in_person"; readBack: boolean; note?: string },
  ) => {
    const res = await apiClient.post<{ data: LabOrder }>(`/laboratory/orders/${id}/communications`, body);
    return res.data.data;
  },

  review: async (id: string) => {
    const res = await apiClient.post<{ data: LabOrder }>(`/laboratory/orders/${id}/review`);
    return res.data.data;
  },

  inbox: async (params: { scope?: "mine" | "all"; patientId?: string } = {}) => {
    const res = await apiClient.get<{ data: LabInbox }>("/laboratory/inbox", { params });
    return res.data.data;
  },
};
