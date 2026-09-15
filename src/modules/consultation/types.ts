import type { PatientBanner, Allergy } from "@modules/patient/types";
import type { RecordLabResult, PendingLabOrder } from "@modules/laboratory/types";
import type { DoctorSummary, DepartmentSummary } from "@modules/appointment/types";

export interface Vitals {
  temperatureC?: number | null;
  pulse?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
  respiratoryRate?: number | null;
  spo2?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  bloodSugar?: number | null;
}

export interface Diagnosis {
  id?: string;
  code?: string;
  description: string;
  type?: "provisional" | "final" | "differential" | "comorbidity";
  isPrimary?: boolean;
}

export interface Addendum {
  id: string;
  text: string;
  reason: "correction" | "clarification" | "additional_finding" | "late_result";
  authorName: string;
  createdAt: string;
}

export interface Consultation {
  id: string;
  consultationNumber: string;
  patient: PatientBanner | { id: string };
  doctor: DoctorSummary | { id: string };
  department: DepartmentSummary | null;
  appointmentId: string | null;
  admissionId: string | null;
  type: "opd" | "follow_up" | "ward_round" | "emergency" | "teleconsult";

  chiefComplaint: string;
  historyOfPresentIllness: string;
  examination: string;
  vitals: Vitals;
  diagnoses: Diagnosis[];
  treatmentPlan: string;
  advice: string;
  followUpDate: string;
  followUpNote: string;
  admissionRecommended: boolean;
  admissionReason: string;

  /**
   * OP-06. Once true the note is permanent — the client renders it read-only,
   * and the server refuses any edit regardless of what the client does.
   */
  isSigned: boolean;
  signedAt: string | null;
  signedByName: string;
  addenda: Addendum[];

  createdAt: string;
  updatedAt: string;
}

/** OP-01: the history a doctor needs open before they start. */
export interface ClinicalContext {
  access?: RecordAccess;
  allergies: Allergy[];
  allergiesRecorded: boolean;
  chronicConditions: string[];
  recentConsultations: Consultation[];
  recentPrescriptions: Prescription[];
  diagnosisHistory: {
    code: string;
    description: string;
    type: string;
    firstRecorded: string;
    lastRecorded: string;
    occurrences: number;
  }[];
  /** OP-01 with LB-05: the latest results, and what is already on its way. */
  recentLabResults: RecordLabResult[];
  pendingLabOrders: PendingLabOrder[];
}

export interface ConsultationDraft {
  id: string;
  consultationNumber: string;
  patientName: string;
  patientId: string;
  chiefComplaint: string;
  startedAt: string;
}

// ---- Prescribing ------------------------------------------------------------

export interface Medicine {
  id: string;
  name: string;
  genericName: string;
  ingredients: string[];
  form: string;
  strength: string;
  route: string;
  drugClass: string;
  schedule: "" | "H" | "H1" | "X" | "G";
  isNarcotic: boolean;
  defaultDose: string;
  defaultFrequency: string;
  defaultDurationDays: number | null;
  cautionNote: string;
  /** "Amoxil 500mg capsule" — what a prescriber recognises. */
  label: string;
}

export type SafetyTier = "critical" | "urgent" | "caution" | "normal";

export interface SafetyAlert {
  type: "drug-allergy" | "duplicate-therapy" | "allergy-status";
  tier: SafetyTier;
  matchKind?: "ingredient" | "group" | "cross-reactive" | "name";
  title: string;
  message: string;
  details?: string[];
  substance?: string;
  severity?: string;
  medicineName?: string;
  conflictsWith?: string;
}

export interface SafetyLineResult {
  lineId: string | null;
  medicine: string;
  highestTier: SafetyTier;
  blocked: boolean;
  requiresOverrideReason: boolean;
  alerts: SafetyAlert[];
}

export interface SafetyResult {
  highestTier: SafetyTier;
  /** The server's verdict, not a suggestion — create refuses on the same terms. */
  blocked: boolean;
  requiresOverrideReason: boolean;
  alertCount: number;
  lines: SafetyLineResult[];
  allergyStatusAlert: SafetyAlert | null;
  allergies: Allergy[];
  allergiesRecorded: boolean;
}

export interface PrescriptionLine {
  id: string;
  medicineId: string;
  medicineName: string;
  genericName: string;
  strength: string;
  form: string;
  dose: string;
  frequency: string;
  durationDays: number | null;
  route: string;
  instructions: string;
  quantity: number | null;
  dispensedQuantity: number;
  status: "pending" | "partially_dispensed" | "dispensed" | "cancelled";
  /** Frozen at the moment of prescribing — evidence, not a live check. */
  safetyAlerts: SafetyAlert[];
  overrideReason: string;
  overriddenByName: string;
}

export interface Prescription {
  id: string;
  prescriptionNumber: string;
  patient: PatientBanner | { id: string };
  doctor: { id: string; fullName?: string; designation?: string; registrationNumber?: string };
  consultationId: string | null;
  admissionId: string | null;
  lines: PrescriptionLine[];
  notes: string;
  status: "created" | "pending_dispensing" | "partially_dispensed" | "dispensed" | "cancelled";
  urgency: "routine" | "urgent" | "stat";
  allergySnapshot: { substance: string; severity: string }[];
  allergiesWereRecorded: boolean;
  dispensedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string;
  createdAt: string;
}

/** A line being composed, before it is sent. */
export interface DraftLine {
  id: string;
  medicine: Medicine;
  dose: string;
  frequency: string;
  durationDays: string;
  instructions: string;
  overrideReason: string;
}

// ---- The medical record -----------------------------------------------------

export type RecordScope = "full" | "nursing" | "laboratory" | "pharmacy";

/** How this read was allowed. `viaBreakGlass` drives the emergency-access countdown. */
export interface RecordAccess {
  restricted: boolean;
  viaBreakGlass: boolean;
  basis: string | null;
  expiresAt: string | null;
}

/** What the server says when a restricted record refuses a read. */
export interface RestrictedDetails {
  /** Whose record — a ward screen asks by admission and needs to be told. */
  patientId?: string;
  canBreakGlass: boolean;
  categories: Record<string, string>;
  minutes: number;
}

export interface BreakGlassGrant {
  id: string;
  category: string;
  categoryLabel: string;
  reason: string;
  grantedAt: string;
  expiresAt: string;
  active: boolean;
  reused?: boolean;
}

export interface MedicalRecord {
  access?: RecordAccess;
  /** Named so the UI can say "you are seeing the nursing view". */
  scope: RecordScope;
  patient: PatientBanner & Record<string, unknown>;
  allergies: Allergy[];
  allergiesRecorded: boolean;
  chronicConditions: string[];
  diagnosisHistory: {
    code: string;
    description: string;
    type: string;
    firstRecorded: string;
    lastRecorded: string;
    occurrences: number;
  }[];
  consultations: Consultation[];
  prescriptions: Prescription[];
  visits: {
    id: string;
    appointmentNumber: string;
    date: string;
    time: string;
    status: string;
    visitType: string;
    reason: string;
    doctor: string;
    department: string;
  }[];
  /** Reported only. Empty (not absent) for the pharmacy scope. */
  labResults: RecordLabResult[];
  pendingLabOrders: PendingLabOrder[];
  /**
   * Per section, true when the patient has older history than the record
   * carries (the newest 100 consultations, prescriptions and results, 50 visits
   * and pending tests). Absent from servers that predate it.
   */
  truncated?: Partial<Record<"consultations" | "prescriptions" | "visits" | "labResults" | "pendingLabOrders", boolean>>;
}
