export type Gender = "male" | "female" | "other";

export type AllergySeverity = "mild" | "moderate" | "severe" | "anaphylaxis";

export type PatientStatus =
  | "registered"
  | "scheduled"
  | "arrived"
  | "in_consultation"
  | "admitted"
  | "discharged";

export interface Allergy {
  id?: string;
  substance: string;
  severity: AllergySeverity;
  reaction?: string;
  category?: "drug" | "food" | "environmental" | "other";
  notedAt?: string;
  notedByName?: string;
}

export interface Address {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

/**
 * What reception and billing receive.
 *
 * The clinical fields are not optional-and-absent here by accident — the server
 * serves a different shape entirely to roles without `record.view`, so they
 * never reach the device.
 */
export interface PatientDemographic {
  id: string;
  patientId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  age: string;
  ageYears: number | null;
  ageIsApproximate: boolean;
  dateOfBirth: string | null;
  gender: Gender;
  mobile: string;
  alternatePhone: string;
  email: string;
  address: Address;
  emergencyContact: EmergencyContact;
  abhaNumber: string;
  governmentIdType: string;
  governmentIdLast4: string;
  status: PatientStatus;
  isMlc: boolean;
  lastVisitAt: string | null;
  visitCount: number;
  registeredAt: string;
  registeredByName: string;
}

/** The same record, for a role that holds `record.view`. */
export interface PatientClinical extends PatientDemographic {
  bloodGroup: string;
  allergies: Allergy[];
  /** Distinguishes "asked, none" from "never asked". Never ignore it. */
  allergiesRecorded: boolean;
  allergiesRecordedAt: string | null;
  chronicConditions: string[];
  mlcNumber: string;
}

export type Patient = PatientDemographic & Partial<PatientClinical>;

export interface PatientBanner {
  id: string;
  patientId: string;
  fullName: string;
  age: string;
  gender: string;
  bloodGroup: string;
  allergies: { substance: string; severity: AllergySeverity; reaction?: string }[];
  allergiesRecorded: boolean;
  status: PatientStatus;
  isMlc: boolean;
}

export interface DuplicateMatch {
  id: string;
  patientId: string;
  fullName: string;
  age: string;
  gender: Gender;
  mobile: string;
  lastVisitAt: string | null;
  score: number;
  /** Written for the person at the desk: "Same mobile number", "Similar name". */
  reasons: string[];
}

export interface DuplicateCheckResult {
  matches: DuplicateMatch[];
  /** True when the server will refuse the save without an explicit override. */
  mustConfirm: boolean;
}

export interface RegisterPatientPayload {
  firstName: string;
  lastName?: string;
  dateOfBirth?: string;
  approximateAgeYears?: number;
  approximateAgeMonths?: number;
  gender: Gender;
  bloodGroup?: string;
  mobile: string;
  alternatePhone?: string;
  email?: string;
  address?: Partial<Address>;
  emergencyContact?: Partial<EmergencyContact>;
  abhaNumber?: string;
  chronicConditions?: string[];
  isMlc?: boolean;
  allergies?: Allergy[];
  allergiesRecorded?: boolean;
  confirmedNotDuplicate?: boolean;
}

export interface Paginated<T> {
  success: boolean;
  data: T[];
  meta: { total: number; pages: number; page: number };
}
