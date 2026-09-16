import type { PatientBanner } from "@modules/patient/types";
import type { SafetyAlert } from "@modules/consultation/types";
import type { ExpiryStatus } from "@modules/inventory/types";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export interface PrescriptionHeader {
  id: string;
  prescriptionNumber: string;
  status:
    | "created"
    | "pending_dispensing"
    | "partially_dispensed"
    | "dispensed"
    | "cancelled";
  urgency: "routine" | "urgent" | "stat";
  createdAt: string;
  notes: string;
  doctor: {
    id: string;
    fullName: string;
    designation: string;
    registrationNumber: string;
  };
  allergySnapshot: { substance: string; severity: string }[];
  allergiesWereRecorded: boolean;
}

export interface PharmacyQueueRow extends PrescriptionHeader {
  patient: PatientBanner;
  lineCount: number;
  lineStock: { medicineName: string; status: StockStatus }[];
  stockStatus: StockStatus;
  /** The patient's allergies differ from what the prescriber was working from. */
  allergiesChangedSinceWritten: boolean;
}

export interface DispenseBatch {
  id: string;
  batchNumber: string;
  expiryDate: string;
  quantityOnHand: number;
  expiryStatus: ExpiryStatus;
  daysToExpiry: number;
  selectable: boolean;
  expiresBeforeCourseEnds: boolean;
}

export interface AllergyConflict {
  lineId: string;
  medicineName: string;
  substance: string;
  title: string;
  message: string;
  overrideReason?: string;
  overriddenByName?: string;
}

export interface DispenseLine {
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
  /** Null when the line has no set course (as needed). */
  remaining: number | null;
  status: "pending" | "partially_dispensed" | "dispensed" | "cancelled";
  safetyAlerts: SafetyAlert[];
  overrideReason: string;
  overriddenByName: string;
  currentAlerts: SafetyAlert[];
  item: {
    id: string;
    code: string;
    unit: string;
    unitPrice: number | null;
  } | null;
  stock: { status: StockStatus; label: string; note: string };
  usableQuantity: number;
  suggested: {
    allocations: {
      batchId: string;
      batchNumber: string;
      expiryDate: string;
      quantity: number;
    }[];
    shortBy: number;
  };
  batches: DispenseBatch[];
}

export interface DispenseContext {
  prescription: PrescriptionHeader;
  patient: PatientBanner;
  today: string;
  dispensable: boolean;
  allergyFingerprint: string;
  allergiesChangedSinceWritten: boolean;
  allergyStatusAlert: SafetyAlert | null;
  conflicts: { blocked: AllergyConflict[]; acknowledged: AllergyConflict[] };
  lines: DispenseLine[];
}

export interface Dispensing {
  id: string;
  dispenseNumber: string;
  prescriptionId: string;
  prescriptionNumber: string;
  lines: {
    id: string;
    prescriptionLineId: string;
    medicineName: string;
    strength: string;
    quantity: number;
    batches: { batchNumber: string; expiryDate: string; quantity: number }[];
    unitPrice: number | null;
    amount: number;
    unpriced: boolean;
  }[];
  totalAmount: number;
  allergyAcknowledgement: {
    acknowledgedAt: string;
    allergiesRecorded: boolean;
    allergies: { substance: string; severity: string }[];
    overridesShown: {
      medicineName: string;
      substance: string;
      overrideReason: string;
      overriddenByName: string;
    }[];
    note: string;
  };
  billed: boolean;
  dispensedByName: string;
  dispensedAt: string;
}
