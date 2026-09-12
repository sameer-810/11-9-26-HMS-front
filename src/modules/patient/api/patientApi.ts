import { apiClient } from "@api/apiClient";
import type {
  Patient,
  PatientBanner,
  Paginated,
  RegisterPatientPayload,
  DuplicateCheckResult,
  Allergy,
} from "@modules/patient/types";

export interface PatientListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  gender?: string;
}

export const patientApi = {
  list: async (params?: PatientListParams) => {
    const res = await apiClient.get<Paginated<Patient>>("/patients", { params });
    return res.data;
  },

  get: async (id: string) => {
    const res = await apiClient.get<{ data: Patient }>(`/patients/${id}`);
    return res.data.data;
  },

  /** The identity band. Cheap enough to fetch on every clinical screen. */
  banner: async (id: string) => {
    const res = await apiClient.get<{ data: PatientBanner }>(`/patients/${id}/banner`);
    return res.data.data;
  },

  byPatientId: async (patientId: string) => {
    const res = await apiClient.get<{ data: Patient }>(
      `/patients/by-patient-id/${encodeURIComponent(patientId)}`,
    );
    return res.data.data;
  },

  /**
   * RG-01. Run as the form is filled in, before submit.
   *
   * The server re-runs it regardless — this is the convenience, not the
   * control — but running it here means the desk sees the match while the
   * patient is still standing in front of them.
   */
  checkDuplicates: async (details: {
    firstName?: string;
    lastName?: string;
    mobile?: string;
    dateOfBirth?: string;
    approximateAgeYears?: number;
    gender?: string;
    abhaNumber?: string;
  }) => {
    const res = await apiClient.post<{ data: DuplicateCheckResult }>(
      "/patients/check-duplicates",
      details,
    );
    return res.data.data;
  },

  register: async (payload: RegisterPatientPayload) => {
    const res = await apiClient.post<{ data: Patient }>("/patients", payload);
    return res.data.data;
  },

  update: async (id: string, payload: Partial<RegisterPatientPayload>) => {
    const res = await apiClient.patch<{ data: Patient }>(`/patients/${id}`, payload);
    return res.data.data;
  },

  /** `recorded: true` with an empty list is how "asked, and none" is said. */
  setAllergies: async (id: string, allergies: Allergy[], recorded = true) => {
    const res = await apiClient.put<{ data: Patient }>(`/patients/${id}/allergies`, {
      allergies,
      recorded,
    });
    return res.data.data;
  },
};
