import type { PatientBanner } from "@modules/patient/types";

export type LabUrgency = "routine" | "urgent" | "stat";

export type LabStatus =
  | "requested"
  | "sample_collected"
  | "in_progress"
  | "completed"
  | "reported"
  | "cancelled";

export const LAB_STAGES: Exclude<LabStatus, "cancelled">[] = [
  "requested",
  "sample_collected",
  "in_progress",
  "completed",
  "reported",
];

export const LAB_STAGE_LABELS: Record<LabStatus, string> = {
  requested: "Requested",
  sample_collected: "Sample collected",
  in_progress: "In progress",
  completed: "Completed",
  reported: "Reported",
  cancelled: "Cancelled",
};

/**
 * Flags as the server assigns them.
 *
 * `none` and `indeterminate` are real answers, not gaps: "no range applies to
 * this patient" and "this censored value straddles a boundary" must never be
 * drawn as normal.
 */
export type LabFlag =
  | "criticalLow"
  | "low"
  | "normal"
  | "high"
  | "criticalHigh"
  | "abnormal"
  | "critical"
  | "indeterminate"
  | "none";

export interface LabRangeBand {
  sex: "any" | "male" | "female";
  ageMinYears: number;
  ageMaxYears: number | null;
  low: number | null;
  high: number | null;
  criticalLow?: number | null;
  criticalHigh?: number | null;
}

export interface LabTestParameterDef {
  code: string;
  name: string;
  unit: string;
  type: "numeric" | "choice" | "text";
  required: boolean;
  decimals: number | null;
  ranges: LabRangeBand[];
  criticalLow: number | null;
  criticalHigh: number | null;
  choices: string[];
  abnormalValues: string[];
  criticalValues: string[];
  normalText: string;
}

export interface LabTest {
  id: string;
  code: string;
  name: string;
  category: string;
  sampleType: string;
  container: string;
  preparation: string;
  targetMinutes: Record<LabUrgency, number>;
  duplicateWindowHours: number;
  isActive: boolean;
  parameters: LabTestParameterDef[];
  price?: number;
}

/** A parameter on the entry form, carrying the range for THIS patient. */
export interface LabEntryParameter {
  code: string;
  name: string;
  unit: string;
  type: "numeric" | "choice" | "text";
  required: boolean;
  decimals: number | null;
  choices: string[];
  abnormalValues: string[];
  criticalValues: string[];
  range: { low: number | null; high: number | null; text: string; basis: string } | null;
  rangeNote: string;
  criticalLow: number | null;
  criticalHigh: number | null;
}

export interface LabDelta {
  previousValue: number | string | null;
  previousAt: string | null;
  change: number | null;
  percent: number | null;
  direction: "up" | "down" | "unchanged" | "";
  significant: boolean;
}

export interface LabResult {
  code: string;
  name: string;
  unit: string;
  type?: string;
  value?: number | string | null;
  valueText: string;
  qualifier?: string;
  flag: LabFlag;
  isCritical: boolean;
  isAbnormal: boolean;
  rangeText: string;
  rangeBasis?: string;
  rangeNote: string;
  delta: LabDelta | null;
}

export interface LabTurnaround {
  ageMinutes: number;
  targetMinutes: number;
  dueAt: string;
  overdue: boolean;
}

export type CriticalStatus = "none" | "unacknowledged" | "acknowledged";

export interface LabOrder {
  id: string;
  orderNumber: string;
  groupNumber: string;
  patient: PatientBanner | { id: string };
  doctor: { id: string; fullName: string };
  consultationId: string | null;
  admissionId: string | null;
  test: {
    id: string;
    code: string;
    name: string;
    category: string;
    sampleType: string;
    container: string;
    preparation: string;
  };
  parameters: LabEntryParameter[];
  clinicalIndication: string;
  urgency: LabUrgency;
  status: LabStatus;
  statusLabel: string;
  requestedAt: string;
  sampleCollectedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  reportedAt: string | null;
  turnaround: LabTurnaround;
  stageHistory: { from: string; to: string; toLabel: string; at: string; byName: string; note: string }[];
  sampleId: string;
  sampleCollectedByName: string;
  sampleRejections: { reason: string; fromStatus: string; sampleId: string; at: string; byName: string }[];
  results: LabResult[];
  labComment: string;
  hasCritical: boolean;
  abnormalCount: number;
  significantDeltas: string[];
  resultsEnteredAt: string | null;
  performedByName: string;
  reportedByName: string;
  critical: {
    status: CriticalStatus;
    raisedAt: string | null;
    escalationLevel: number;
    escalations: { level: number; at: string; notified: string[] }[];
    communications: {
      to: string;
      method: "phone" | "in_person" | "system";
      readBack: boolean;
      note: string;
      at: string;
      byName: string;
    }[];
    acknowledgedByName: string;
    acknowledgedAt: string | null;
    acknowledgementNote: string;
  };
  reviewedAt: string | null;
  reviewedByName: string;
  cancelledAt: string | null;
  cancelledByName: string;
  cancelReason: string;
  prior: {
    id: string;
    orderNumber: string;
    reportedAt: string;
    results: Pick<LabResult, "code" | "name" | "valueText" | "unit" | "flag" | "isCritical">[];
  }[];
}

export interface LabQueueRow {
  id: string;
  orderNumber: string;
  patient: PatientBanner | { id: string };
  testName: string;
  testCode: string;
  sampleType: string;
  urgency: LabUrgency;
  status: LabStatus;
  statusLabel: string;
  sampleId: string;
  requestedAt: string;
  doctorName: string;
  hasCritical: boolean;
  rejections: number;
  turnaround: LabTurnaround;
}

export interface LabInbox {
  scope: "mine" | "all";
  critical: LabOrder[];
  needsReview: LabOrder[];
  reported: LabOrder[];
  pending: LabOrder[];
}

export interface DuplicateOrder {
  testName: string;
  orderNumber: string;
  status: LabStatus;
  statusLabel: string;
  requestedAt: string;
  doctorName: string;
  reportedAt: string | null;
  ago: string;
}

/** A reported result as the medical record carries it. */
export interface RecordLabResult {
  id: string;
  orderNumber: string;
  testCode: string;
  testName: string;
  category: string;
  urgency: LabUrgency;
  clinicalIndication: string;
  doctorName: string;
  requestedAt: string;
  reportedAt: string;
  reportedByName: string;
  performedByName: string;
  labComment: string;
  hasCritical: boolean;
  abnormalCount: number;
  criticalStatus: CriticalStatus;
  acknowledgedByName: string;
  results: LabResult[];
}

export interface PendingLabOrder {
  id: string;
  orderNumber: string;
  testName: string;
  urgency: LabUrgency;
  status: LabStatus;
  requestedAt: string;
  doctorName: string;
}
