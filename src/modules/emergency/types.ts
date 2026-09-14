import type { PatientBanner } from "@modules/patient/types";

export type ArrivalMode = "walk_in" | "ambulance" | "police" | "referral" | "other";
export type EdStatus =
  | "expected"
  | "waiting_triage"
  | "triaged"
  | "in_treatment"
  | "disposed"
  | "left_without_being_seen";
export type DispositionType =
  | "admitted"
  | "discharged"
  | "referred"
  | "left_against_advice"
  | "absconded"
  | "deceased";

export const ARRIVAL_MODE_LABELS: Record<ArrivalMode, string> = {
  walk_in: "Walk-in",
  ambulance: "Ambulance",
  police: "Police",
  referral: "Referral",
  other: "Other",
};

export const ED_STATUS_LABELS: Record<EdStatus, string> = {
  expected: "Expected",
  waiting_triage: "Waiting triage",
  triaged: "Triaged",
  in_treatment: "In treatment",
  disposed: "Disposed",
  left_without_being_seen: "Left without being seen",
};

export const DISPOSITION_LABELS: Record<DispositionType, string> = {
  admitted: "Admitted",
  discharged: "Discharged home",
  referred: "Referred elsewhere",
  left_against_advice: "Left against advice",
  absconded: "Absconded",
  deceased: "Deceased",
};

/** The states in which the department still owes the patient something. */
export const ACTIVE_STATUSES: EdStatus[] = ["expected", "waiting_triage", "triaged", "in_treatment"];

export interface EdMeta {
  resources: { key: string; label: string; weight: number }[];
  levels: { level: number; label: string; targetMinutes: number }[];
}

export interface EsiAnswers {
  lifeSavingIntervention: boolean;
  highRisk: boolean;
  alteredMentalStatus: boolean;
  severePainOrDistress: boolean;
  expectedResources: string[];
}

export type VitalKey = "pulse" | "respiratoryRate" | "spo2" | "systolic" | "temperatureC" | "painScore";
export type EsiVitals = Partial<Record<VitalKey, number | null>>;

export interface EsiSuggestion {
  level: number;
  decisionPoint: "A" | "B" | "C" | "D";
  /** Written for the nurse deciding whether to agree. Shown verbatim. */
  reasons: string[];
  resourceCount: number | null;
  dangerZone: string[];
}

/**
 * The patient as the department sees them. A bare `{ id }` when the server
 * could not populate the record, which the screens must survive.
 */
export type EdPatient = PatientBanner & { accessRestricted: boolean };

export const hasBanner = (p: EdPatient | { id: string }): p is EdPatient => "patientId" in p;

export interface EdVisit {
  id: string;
  visitNumber: string;
  patient: EdPatient | { id: string };
  unidentified: boolean;
  arrivalMode: ArrivalMode;
  arrivedAt: string | null;
  expectedAt: string | null;
  broughtBy: string;
  ambulance: { service: string; vehicleNumber: string; crew: string; preAlertNote: string } | null;
  referredFrom: string;
  chiefComplaint: string;
  isMlc: boolean;
  status: EdStatus;

  esiLevel: number | null;
  esiLabel: string | null;
  targetMinutes: number | null;
  triagedAt: string | null;
  triagedByName: string;
  /** Only sent to clinical users. Reception sees the level, not the reasoning. */
  triage?: {
    suggestedLevel: number;
    overridden: boolean;
    overrideReason: string;
    decisionPoint: EsiSuggestion["decisionPoint"];
    reasons: string[];
    answers: Partial<EsiAnswers>;
    vitals: EsiVitals;
  };
  triageCount?: number;

  assignedDoctorName: string;
  seenByDoctorAt: string | null;
  consultationId: string | null;
  disposition: {
    type: DispositionType | null;
    at: string;
    byName: string;
    note?: string;
    admissionId: string | null;
  } | null;

  /** Board rows only — computed by the server against its own clock. */
  waitMinutes?: number | null;
  overTarget?: boolean;
  doorToTriageMinutes?: number | null;
  registeredByName: string;
}

export interface EdBoard {
  expected: EdVisit[];
  /** Already in triage order. Never re-sorted here. */
  active: EdVisit[];
}

export interface RegisterArrivalBody {
  patientId?: string;
  unidentified?: { gender: "male" | "female" | "other"; approximateAgeYears?: number };
  arrivalMode: ArrivalMode;
  chiefComplaint: string;
  broughtBy?: string;
  ambulance?: { service?: string; vehicleNumber?: string; crew?: string; preAlertNote?: string };
  referredFrom?: string;
  isMlc?: boolean;
  expected?: boolean;
  expectedAt?: string;
}

export interface EsiPreviewBody {
  patientId?: string;
  answers: EsiAnswers;
  vitals: EsiVitals;
}

export interface TriageBody {
  answers: EsiAnswers;
  vitals: EsiVitals;
  esiLevel?: number;
  overrideReason?: string;
}

export interface DisposeBody {
  type: DispositionType;
  note?: string;
  admissionId?: string;
}
