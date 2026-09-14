import { apiClient } from "@api/apiClient";
import type {
  Bill,
  BillRow,
  BillStatus,
  BillType,
  BillingPreview,
  Outstanding,
  PaymentMethod,
  Receipt,
  TariffItem,
} from "@modules/billing/types";

export interface PaymentBody {
  amount: number;
  method: PaymentMethod;
  reference?: string;
  bankName?: string;
  chequeDate?: string;
  note?: string;
}

export const billingApi = {
  preview: async (patientId: string) => {
    const res = await apiClient.get<{ data: BillingPreview }>(`/billing/preview/${patientId}`);
    return res.data.data;
  },

  /**
   * No amounts, no lines. Section 7: charges compile from source records, and
   * the server refuses a request that tries to send its own.
   */
  generate: async (body: { patientId: string; billType: BillType; admissionId?: string }) => {
    const res = await apiClient.post<{ data: Bill }>("/billing/bills", body);
    return res.data.data;
  },

  list: async (params: { status?: BillStatus; search?: string; page?: number; limit?: number } = {}) => {
    const res = await apiClient.get<{ data: BillRow[]; meta: { total: number; page: number; totalPages: number } }>(
      "/billing/bills",
      { params },
    );
    return res.data;
  },

  get: async (id: string) => (await apiClient.get<{ data: Bill }>(`/billing/bills/${id}`)).data.data,
  refresh: async (id: string) =>
    (await apiClient.post<{ data: Bill & { added: number; repriced: number } }>(`/billing/bills/${id}/refresh`)).data.data,
  addService: async (id: string, body: { tariffId: string; quantity: number }) =>
    (await apiClient.post<{ data: Bill }>(`/billing/bills/${id}/services`, body)).data.data,
  removeLine: async (id: string, lineId: string, reason: string) =>
    (await apiClient.post<{ data: Bill }>(`/billing/bills/${id}/lines/${lineId}/remove`, { reason })).data.data,
  requestDiscount: async (id: string, body: { amount: number; reason: string }) =>
    (await apiClient.post<{ data: Bill }>(`/billing/bills/${id}/discount`, body)).data.data,
  decideDiscount: async (id: string, body: { approve: boolean; note?: string }) =>
    (await apiClient.post<{ data: Bill }>(`/billing/bills/${id}/discount/decision`, body)).data.data,
  finalise: async (id: string) => (await apiClient.post<{ data: Bill }>(`/billing/bills/${id}/finalise`)).data.data,
  cancel: async (id: string, reason: string) =>
    (await apiClient.post<{ data: Bill }>(`/billing/bills/${id}/cancel`, { reason })).data.data,

  pay: async (id: string, body: PaymentBody) =>
    (await apiClient.post<{ data: Bill }>(`/billing/bills/${id}/payments`, body)).data.data,
  voidPayment: async (paymentId: string, reason: string) =>
    (await apiClient.post<{ data: Bill }>(`/billing/payments/${paymentId}/void`, { reason })).data.data,
  receipt: async (paymentId: string) =>
    (await apiClient.get<{ data: Receipt }>(`/billing/payments/${paymentId}/receipt`)).data.data,

  outstanding: async () => (await apiClient.get<{ data: Outstanding }>("/billing/outstanding")).data.data,
  tariff: async () => (await apiClient.get<{ data: TariffItem[] }>("/billing/tariff")).data.data,
};
