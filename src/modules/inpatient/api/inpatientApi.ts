import { apiClient } from "@api/apiClient";
import type { Paginated } from "@modules/patient/types";
import type {
  Admission,
  AdmissionRequest,
  RequestClosureOutcome,
  AdmissionRow,
  Observation,
  EscalationRow,
  NursingNote,
  DrugRound,
  Administration,
  Handover,
  Bedside,
  Shift,
} from "@modules/inpatient/types";

export interface AdmitBody {
  patientId: string;
  doctorId?: string;
  departmentId?: string;
  consultationId?: string;
  bedId: string;
  reason: string;
  provisionalDiagnosis?: string;
  expectedStayDays?: number | null;
  admissionType?: "planned" | "emergency" | "transfer_in" | "day_care";
}

export interface DischargeBody {
  dischargeSummary: string;
  dischargeMedication: string;
  followUpInstructions: string;
  dischargeDiagnosis?: string;
  dischargeType?: "routine" | "against_advice" | "referred" | "absconded" | "deceased";
}

export interface ObservationBody {
  admissionId?: string;
  patientId?: string;
  respiratoryRate?: number | null;
  spo2?: number | null;
  onOxygen?: boolean | null;
  oxygenLitresPerMin?: number | null;
  oxygenDevice?: string;
  systolic?: number | null;
  diastolic?: number | null;
  pulse?: number | null;
  consciousness?: string | null;
  temperatureC?: number | null;
  painScore?: number | null;
  bloodSugar?: number | null;
  weightKg?: number | null;
  urineOutputMl?: number | null;
  clinicalConcern?: string;
  /** Stamped before the first attempt; see shared/offline/outbox.ts. */
  clientOpId?: string;
  takenAt?: string;
  /**
   * Note what is NOT here: there is no `escalationRequired`, and no
   * `useScale2`. Whether an observation escalates is decided by the server from
   * the score, and the NEWS2 scale belongs to the admission because it is a
   * prescribing decision. A client that could send either could make a
   * deteriorating patient look well.
   */
}

export interface AdministerBody {
  admissionId: string;
  prescriptionId: string;
  prescriptionItemId: string;
  status: "given" | "omitted" | "refused" | "withheld" | "self_administered";
  reason?: string;
  dueDate?: string;
  dueTime?: string;
  witnessedBy?: string;
  witnessedByName?: string;
  note?: string;
}

export interface HandoverBody {
  admissionId: string;
  fromShift: Shift;
  toShift: Shift;
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
  outstandingTasks?: string[];
  alerts?: string[];
}

export interface AdmissionQuery {
  page?: number;
  limit?: number;
  status?: string;
  wardId?: string;
  wardType?: string;
  /** "critical" is the ICU workspace: every ICU and HDU ward on one board. */
  acuity?: "critical";
  doctorId?: string;
  nurseId?: string;
  patientId?: string;
}

export const inpatientApi = {
  // ---- Admissions ---------------------------------------------------------
  list: async (query: AdmissionQuery = {}) => {
    const res = await apiClient.get<Paginated<AdmissionRow>>("/admissions", { params: query });
    return res.data;
  },

  get: async (id: string) => {
    const res = await apiClient.get<{ data: Admission }>(`/admissions/${id}`);
    return res.data.data;
  },

  admit: async (body: AdmitBody) => {
    const res = await apiClient.post<{ data: Admission }>("/admissions", body);
    return res.data.data;
  },

  transfer: async (id: string, body: { bedId: string; reason: string }) => {
    const res = await apiClient.post<{ data: Admission }>(`/admissions/${id}/transfer`, body);
    return res.data.data;
  },

  discharge: async (id: string, body: DischargeBody) => {
    const res = await apiClient.post<{ data: Admission }>(`/admissions/${id}/discharge`, body);
    return res.data.data;
  },

  /** US-17: recommendations to admit that have not become an admission. */
  admissionRequests: async () => {
    const res = await apiClient.get<{ data: AdmissionRequest[] }>("/admissions/requests");
    return res.data.data;
  },

  closeAdmissionRequest: async (consultationId: string, body: { outcome: RequestClosureOutcome; note: string }) => {
    const res = await apiClient.post<{ data: { consultationId: string; outcome: RequestClosureOutcome } }>(
      `/admissions/requests/${consultationId}/close`,
      body,
    );
    return res.data.data;
  },

  /** NU-01 / US-23. The nurse's own list: allocated by name, or on their wards. */
  myPatients: async () => {
    const res = await apiClient.get<Paginated<AdmissionRow>>("/admissions/my-patients");
    return res.data;
  },

  assignNurse: async (id: string, nurseId: string) => {
    const res = await apiClient.post<{ data: AdmissionRow }>(`/admissions/${id}/nurse`, {
      nurseId,
    });
    return res.data.data;
  },

  setNews2Scale: async (id: string, useScale2: boolean, indication?: string) => {
    const res = await apiClient.post<{ data: AdmissionRow }>(`/admissions/${id}/news2-scale`, {
      useScale2,
      indication,
    });
    return res.data.data;
  },

  // ---- Observations -------------------------------------------------------
  recordObservation: async (body: ObservationBody) => {
    const res = await apiClient.post<{ data: Observation }>("/nursing/observations", body);
    return res.data.data;
  },

  observations: async (query: { admissionId?: string; patientId?: string; limit?: number }) => {
    const res = await apiClient.get<Paginated<Observation>>("/nursing/observations", {
      params: query,
    });
    return res.data;
  },

  escalations: async (wardId?: string) => {
    const res = await apiClient.get<{ data: EscalationRow[] }>("/nursing/escalations", {
      params: wardId ? { wardId } : undefined,
    });
    return res.data.data;
  },

  acknowledgeEscalation: async (id: string, note: string) => {
    const res = await apiClient.post<{ data: Observation }>(
      `/nursing/escalations/${id}/acknowledge`,
      { note },
    );
    return res.data.data;
  },

  // ---- Notes --------------------------------------------------------------
  addNote: async (body: {
    admissionId: string;
    category?: string;
    note: string;
    clientOpId?: string;
    takenAt?: string;
  }) => {
    const res = await apiClient.post<{ data: NursingNote }>("/nursing/notes", body);
    return res.data.data;
  },

  notes: async (admissionId: string) => {
    const res = await apiClient.get<Paginated<NursingNote>>("/nursing/notes", {
      params: { admissionId },
    });
    return res.data;
  },

  // ---- NU-04: the drug round ---------------------------------------------
  drugRound: async (admissionId: string, date?: string) => {
    const res = await apiClient.get<{ data: DrugRound }>("/nursing/drug-round", {
      params: { admissionId, ...(date ? { date } : {}) },
    });
    return res.data.data;
  },

  administer: async (body: AdministerBody) => {
    const res = await apiClient.post<{ data: Administration }>("/nursing/administrations", body);
    return res.data.data;
  },

  // ---- NU-05: SBAR --------------------------------------------------------
  submitHandover: async (body: HandoverBody) => {
    const res = await apiClient.post<{ data: Handover }>("/nursing/handovers", body);
    return res.data.data;
  },

  handovers: async (admissionId: string) => {
    const res = await apiClient.get<{ data: Handover[] }>("/nursing/handovers", {
      params: { admissionId },
    });
    return res.data.data;
  },

  receiveHandover: async (id: string) => {
    const res = await apiClient.post<{ data: Handover }>(`/nursing/handovers/${id}/receive`);
    return res.data.data;
  },

  // ---- IP-04: the bedside chart in one request ----------------------------
  bedside: async (admissionId: string) => {
    const res = await apiClient.get<{ data: Bedside }>(`/nursing/bedside/${admissionId}`);
    return res.data.data;
  },
};
