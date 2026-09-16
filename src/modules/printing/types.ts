import type { AllergySeverity, PatientBanner } from "@modules/patient/types";
import type { LabResult, LabUrgency } from "@modules/laboratory/types";

/** The allergy tri-state, as a printed document needs it. See CLINICAL_SAFETY §2. */
export interface PrintAllergies {
  recorded: boolean;
  allergies: { substance: string; severity: AllergySeverity }[];
}

/** Who the label is for — the identifiers a second person checks it against. */
export interface PrintIdentity extends PrintAllergies {
  patientId: string;
  firstName: string;
  lastName: string;
  /** ISO date or instant; null when only an age was stated. */
  dateOfBirth: string | null;
  age: string;
  gender: string;
}

export interface WristbandInput extends PrintIdentity {
  hospitalName: string;
  admission: {
    admissionNumber: string;
    wardName: string;
    bedNumber: string;
  } | null;
}

export interface SpecimenLabelInput {
  patient: Omit<PrintIdentity, "recorded" | "allergies">;
  sampleId: string;
  orderNumber: string;
  testName: string;
  sampleType: string;
  container: string;
  collectedAt: string | null;
  urgency: LabUrgency;
}

export interface PrescriptionPrintLine {
  medicineName: string;
  strength: string;
  form: string;
  dose: string;
  frequency: string;
  durationDays: number | null;
  route: string;
  instructions: string;
  quantity: number | null;
}

export interface PrescriptionInput {
  hospitalName: string;
  prescriptionNumber: string;
  createdAt: string;
  urgency: "routine" | "urgent" | "stat";
  notes: string;
  patient: Pick<PatientBanner, "patientId" | "fullName" | "age" | "gender"> &
    PrintAllergies;
  prescriber: {
    fullName: string;
    designation: string;
    registrationNumber: string;
  };
  lines: PrescriptionPrintLine[];
  /** Lines the prescriber cancelled. Counted on the page, never printed as medicines. */
  cancelledLineCount: number;
  printedBy: string;
  printedAt: Date;
}

export interface LabReportInput {
  hospitalName: string;
  patient: Pick<PatientBanner, "patientId" | "fullName" | "age" | "gender">;
  orderNumber: string;
  sampleId: string;
  testName: string;
  sampleType: string;
  urgency: LabUrgency;
  clinicalIndication: string;
  orderedBy: string;
  requestedAt: string;
  sampleCollectedAt: string | null;
  reportedAt: string | null;
  performedByName: string;
  reportedByName: string;
  labComment: string;
  results: LabResult[];
  printedBy: string;
  printedAt: Date;
}

/** `GET /patients/scan/:code`. `orderId` only reaches someone who can open the order. */
export interface ScanResult {
  kind: "patient" | "specimen";
  patient: PatientBanner;
  orderId?: string;
}
