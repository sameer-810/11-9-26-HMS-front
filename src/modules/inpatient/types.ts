import type { PatientBanner } from "@modules/patient/types";
import type {
  DoctorSummary,
  DepartmentSummary,
} from "@modules/appointment/types";

export type AlertTier = "critical" | "urgent" | "caution" | "normal";

/**
 * US-17: a doctor's recommendation to admit. for a restricted record `reason` and `diagnosis`
 * are empty; name and allergies still travel so a bed can be found.
 */
export interface AdmissionRequest {
  consultationId: string;
  consultationNumber: string;
  recommendedAt: string;
  patient: PatientBanner;
  restricted: boolean;
  reason: string;
  diagnosis: string;
  doctor: DoctorSummary | null;
  department: { id: string; name: string } | null;
}

export type RequestClosureOutcome =
  "patient_declined" | "referred_elsewhere" | "no_longer_needed" | "duplicate";

export const REQUEST_CLOSURE_LABELS: Record<RequestClosureOutcome, string> = {
  patient_declined: "Patient declined admission",
  referred_elsewhere: "Referred to another hospital",
  no_longer_needed: "Admission no longer needed",
  duplicate: "Duplicate recommendation",
};

export type News2BandKey = "none" | "low" | "lowMedium" | "medium" | "high";

/** the escalation policy (`response`) travels with the score. */
export interface News2Band {
  key: News2BandKey;
  label: string;
  tier: AlertTier;
  monitoringFrequency?: string;
  response?: string;
}

export interface EarlyWarning {
  score: number | null;
  band: News2BandKey | null;
  label: string;
  tier: AlertTier;
  monitoringFrequency?: string;
  response?: string;
  recordedAt: string | null;
  /** True when no observation exists, as well as when one is late. */
  overdue: boolean;
}

export interface WardSummary {
  id: string;
  name?: string;
  code?: string;
  type?: string;
}

export interface BedSummary {
  id: string;
  number?: string;
}

export interface BedMovement {
  id: string;
  bedNumber: string;
  wardName: string;
  roomNumber: string;
  from: string;
  to: string | null;
  reason: string;
  movedBy: string;
}

export type AdmissionStatus =
  "admitted" | "discharged" | "transferred_out" | "lama" | "deceased";

export interface AdmissionRow {
  id: string;
  admissionNumber: string;
  patient: PatientBanner | { id: string };
  doctor: DoctorSummary | null;
  nurse: DoctorSummary | null;
  ward: WardSummary | null;
  bed: BedSummary | null;
  reason: string;
  admittedAt: string;
  status: AdmissionStatus;
  lengthOfStayDays: number | null;
  earlyWarning: EarlyWarning;
  news2Scale: 1 | 2;
}

export interface Admission extends AdmissionRow {
  department: DepartmentSummary | null;
  consultationId: string | null;
  provisionalDiagnosis: string;
  expectedStayDays: number | null;
  admissionType: "planned" | "emergency" | "transfer_in" | "day_care";
  admittedBy: string;
  bedMovements: BedMovement[];
  dischargeSummary: string;
  dischargeMedication: string;
  followUpInstructions: string;
  dischargeDiagnosis: string;
  dischargeType: string;
  dischargedAt: string | null;
  dischargedBy: string;
}

export type Consciousness =
  "alert" | "confusion" | "voice" | "pain" | "unresponsive";

export interface ObservationVitals {
  respiratoryRate: number | null;
  spo2: number | null;
  onOxygen: boolean | null;
  oxygenLitresPerMin: number | null;
  oxygenDevice: string;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  consciousness: Consciousness | "";
  temperatureC: number | null;
  painScore: number | null;
  bloodSugar: number | null;
  weightKg: number | null;
  urineOutputMl: number | null;
}

export interface News2Parameter {
  value: number | string | boolean;
  score: number;
}

export interface News2Result {
  /** When false, `total` is null: a partial score must never be shown as a NEWS2 score. */
  complete: boolean;
  total: number | null;
  scale: 1 | 2;
  missing: string[];
  parameters: Record<string, News2Parameter>;
  redFlagParameters: string[];
  band: News2Band | null;
  delta: number | null;
  significantRise: boolean;
}

export interface Observation {
  id: string;
  admissionId: string | null;
  recordedAt: string;
  recordedBy: string;
  /** Minutes between charting and the server receiving it — non-zero for sets charted offline. */
  syncedLateMinutes?: number;
  vitals: ObservationVitals;
  news2: News2Result;
  escalation: {
    required: boolean;
    reason: string;
    escalatedAt: string | null;
    acknowledged: boolean;
    acknowledgedBy: string;
    acknowledgedAt: string | null;
    acknowledgementNote: string;
  };
}

export interface EscalationRow extends Observation {
  patient: PatientBanner | { id: string };
  admissionNumber: string;
  ward: string;
  bed: string;
  waitingMinutes: number;
}

export interface NursingNote {
  id: string;
  admissionId: string;
  category:
    | "general"
    | "assessment"
    | "intervention"
    | "incident"
    | "family"
    | "escalation";
  note: string;
  correctsNoteId: string | null;
  shift: "" | "morning" | "evening" | "night";
  recordedAt: string;
  recordedBy: string;
  recordedByRole: string;
  syncedLateMinutes?: number;
}

export type AdministrationStatus =
  "given" | "omitted" | "refused" | "withheld" | "self_administered";

export interface Administration {
  id: string;
  prescriptionId: string;
  prescriptionItemId: string;
  drugName: string;
  dose: string;
  route: string;
  dueAt: string | null;
  status: AdministrationStatus;
  reason: string;
  administeredAt: string | null;
  administeredBy: string;
  witnessedBy: string;
  note: string;
}

export interface DrugRoundSlot {
  prescriptionId: string;
  prescriptionNumber: string;
  prescriptionItemId: string;
  drugName: string;
  strength: string;
  dose: string;
  route: string;
  frequency: string;
  instructions: string;
  /** Wall-clock round time on the ward. Null for as-needed drugs. */
  time: string | null;
  dueAt: string | null;
  asNeeded: boolean;
  administration: Pick<
    Administration,
    | "id"
    | "status"
    | "reason"
    | "administeredAt"
    | "administeredBy"
    | "witnessedBy"
    | "note"
  > | null;
  overdue: boolean;
  minutesLate: number;
}

export interface DrugRound {
  date: string;
  timezone: string;
  slots: DrugRoundSlot[];
  admission?: AdmissionRow;
}

export type Shift = "morning" | "evening" | "night";

export interface Handover {
  id: string;
  admissionId: string;
  fromShift: Shift;
  toShift: Shift;
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
  outstandingTasks: string[];
  alerts: string[];
  news2AtHandover: number | null;
  bandAtHandover: Pick<News2Band, "key" | "label" | "tier"> | null;
  givenBy: string;
  givenAt: string;
  receivedBy: string;
  receivedAt: string | null;
  outstanding: boolean;
}

export interface Bedside {
  admission: AdmissionRow | null;
  observations: Observation[];
  notes: NursingNote[];
  handovers: Handover[];
  round: DrugRound | null;
  current: {
    total: number;
    band: News2Band | null;
    recordedAt: string;
    redFlagParameters: string[];
  } | null;
}
