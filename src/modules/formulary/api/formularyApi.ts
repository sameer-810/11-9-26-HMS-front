import { apiClient } from "@api/apiClient";
import type {
  FormularyMedicine,
  FormularyPage,
  FormularyParams,
  MedicineBody,
  MedicinePatch,
} from "@modules/formulary/types";

/** Reads need a formulary grant; writes need pharmacy.stock.view or hospital.config. */
export const formularyApi = {
  list: async ({ includeInactive, ...params }: FormularyParams) =>
    (
      await apiClient.get<FormularyPage>("/prescriptions/medicines", {
        // Honoured only for formulary managers; anyone else gets active medicines.
        params: { ...params, ...(includeInactive ? { includeInactive } : {}) },
      })
    ).data,
  /** Refused with MEDICINE_EXISTS when name, strength and form are already listed. */
  create: async (body: MedicineBody) =>
    (
      await apiClient.post<{ data: FormularyMedicine }>(
        "/prescriptions/medicines",
        body,
      )
    ).data.data,
  update: async (id: string, body: MedicinePatch) =>
    (
      await apiClient.patch<{ data: FormularyMedicine }>(
        `/prescriptions/medicines/${id}`,
        body,
      )
    ).data.data,
};
