import { apiClient } from "@api/apiClient";
import type { Paginated } from "@modules/patient/types";
import type {
  Consultation,
  ClinicalContext,
  ConsultationDraft,
  Medicine,
  Prescription,
  SafetyResult,
  MedicalRecord,
  BreakGlassGrant,
  Vitals,
  Diagnosis,
} from "@modules/consultation/types";

export interface ConsultationPatch {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  examination?: string;
  vitals?: Vitals;
  diagnoses?: Diagnosis[];
  treatmentPlan?: string;
  advice?: string;
  followUpDate?: string;
  followUpNote?: string;
  admissionRecommended?: boolean;
  admissionReason?: string;
}

export const consultationApi = {
  /** OP-01. Loaded when the screen opens, before anyone starts typing. */
  context: async (patientId: string) => {
    const res = await apiClient.get<{ data: ClinicalContext }>(
      `/consultations/context/${patientId}`,
    );
    return res.data.data;
  },

  open: async (body: { patientId: string; appointmentId?: string; type?: string }) => {
    const res = await apiClient.post<{ data: Consultation }>("/consultations", body);
    return res.data.data;
  },

  get: async (id: string) => {
    const res = await apiClient.get<{ data: Consultation }>(`/consultations/${id}`);
    return res.data.data;
  },

  update: async (id: string, patch: ConsultationPatch) => {
    const res = await apiClient.patch<{ data: Consultation }>(`/consultations/${id}`, patch);
    return res.data.data;
  },

  /** OP-06. After this, the note is permanent. */
  sign: async (id: string) => {
    const res = await apiClient.post<{ data: Consultation }>(`/consultations/${id}/sign`);
    return res.data.data;
  },

  addAddendum: async (id: string, body: { text: string; reason?: string }) => {
    const res = await apiClient.post<{ data: Consultation }>(
      `/consultations/${id}/addendum`,
      body,
    );
    return res.data.data;
  },

  list: async (params?: { patientId?: string; page?: number; limit?: number }) => {
    const res = await apiClient.get<Paginated<Consultation>>("/consultations", { params });
    return res.data;
  },

  myDrafts: async () => {
    const res = await apiClient.get<{ data: ConsultationDraft[] }>("/consultations/my-drafts");
    return res.data.data;
  },
};

export const prescriptionApi = {
  searchMedicines: async (search: string) => {
    const res = await apiClient.get<Paginated<Medicine>>("/prescriptions/medicines", {
      params: { search, limit: 20 },
    });
    return res.data.data;
  },

  /** Safety check as each line is added, so alerts appear while prescribing. Writes nothing. */
  check: async (patientId: string, lines: { id: string; medicineId: string }[]) => {
    const res = await apiClient.post<{ data: SafetyResult }>("/prescriptions/check", {
      patientId,
      lines,
    });
    return res.data.data;
  },

  create: async (body: {
    patientId: string;
    consultationId?: string;
    lines: {
      medicineId: string;
      dose: string;
      frequency: string;
      durationDays?: number | null;
      instructions?: string;
      overrideReason?: string;
    }[];
    notes?: string;
    urgency?: "routine" | "urgent" | "stat";
  }) => {
    const res = await apiClient.post<{
      data: { prescription: Prescription; safety: SafetyResult };
    }>("/prescriptions", body);
    return res.data.data;
  },

  get: async (id: string) => {
    const res = await apiClient.get<{ data: Prescription }>(`/prescriptions/${id}`);
    return res.data.data;
  },

  list: async (params?: { patientId?: string; status?: string; page?: number }) => {
    const res = await apiClient.get<Paginated<Prescription>>("/prescriptions", { params });
    return res.data;
  },
};

export const recordApi = {
  /** MR-01. The response scope says which view came back, so the UI can flag a partial record. */
  forPatient: async (patientId: string) => {
    const res = await apiClient.get<{ data: MedicalRecord }>(`/records/${patientId}`);
    return res.data.data;
  },

  /** Break-glass access to a restricted record; the server refuses a short reason. */
  breakGlass: async (patientId: string, body: { category: string; reason: string }) => {
    const res = await apiClient.post<{ data: BreakGlassGrant }>(`/access/patients/${patientId}/break-glass`, body);
    return res.data.data;
  },
};
