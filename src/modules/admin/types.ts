import type { Role } from "@shared/permissions";

/**
 * Admin API shapes, mirroring the backend DTOs.
 * Paged lists use `meta.pages` (not `totalPages`), as sent on the wire.
 */
export interface PagedMeta {
  total: number;
  pages: number;
  page: number;
}

export interface Paged<T> {
  data: T[];
  meta: PagedMeta;
}

/** Role picker summaries; each states what the role cannot open as well as what it can. */
export const ROLE_SUMMARIES: Record<Role, string> = {
  receptionist: "Registration, appointments, OPD queue. No clinical record.",
  doctor: "Full clinical record, prescribing, admission. No billing.",
  nurse: "Ward care, vitals, medication rounds. No diagnosing or discharge.",
  lab: "Test queue and results. Cannot order tests.",
  pharmacy: "Prescription queue, dispensing, medicine stock.",
  billing: "Bills and payments. Never the clinical reason behind a charge.",
  inventory: "Stores and stock movements. No patient access.",
  admin: "Accounts and configuration. Cannot read clinical records.",
};

export interface DepartmentRef {
  id: string;
  name: string;
  code: string;
}

// ---- Users ------------------------------------------------------------------
export interface AdminUser {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  role: Role;
  roleLabel: string;
  designation: string;
  department: DepartmentRef | null;
  /** The authoritative grant — seeded from the role, then tuned per person. */
  permissions: string[];
  registrationNumber: string;
  specialization: string;
  qualifications: string;
  icuAuthorized: boolean;
  /** US-23: wards a nurse is allocated to. Always empty for other roles. */
  wardIds: string[];
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

// ---- Roles (US-04) ----------------------------------------------------------

/** GET /roles — one role's set at this hospital. */
export interface RoleSet {
  role: Role;
  label: string;
  /** False for the administrator role, which is fixed. */
  editable: boolean;
  /** This hospital's set differs from the standard one. */
  customised: boolean;
  permissions: string[];
  /** The standard set from the specification's permission matrix. */
  defaults: string[];
  /** What the signed-in administrator may put in this role: what they hold, plus the standard set. */
  grantable: string[];
  staff: { total: number; active: number };
  updatedAt: string | null;
  updatedByName: string;
}

/** What saving or resetting a role changed. */
export interface RoleChange {
  role: Role;
  label: string;
  permissions: string[];
  added: string[];
  removed: string[];
  applyToStaff: boolean;
  staffUpdated: number;
  customised: boolean;
}

/**
 * Returned by account creation or credential reset. The temporary password is only in
 * this response: keep it in component state, never in the query cache.
 */
export interface IssuedCredential {
  user: AdminUser;
  temporaryPassword: string;
}

/**
 * Permission editor catalogue. `assignable` omits admin-only permissions; `grantable`
 * is true only for ones the signed-in admin holds (server escalation guard).
 */
export interface PermissionCatalogue {
  all: string[];
  assignable: { permission: string; grantable: boolean }[];
}

export interface UserListParams {
  search?: string;
  role?: Role;
  isActive?: boolean;
  departmentId?: string;
  page?: number;
  limit?: number;
}

export interface ClinicalIdentity {
  registrationNumber?: string;
  specialization?: string;
  qualifications?: string;
  icuAuthorized?: boolean;
}

export interface CreateUserBody extends ClinicalIdentity {
  employeeId: string;
  firstName: string;
  lastName?: string;
  email: string;
  phone?: string;
  role: Role;
  designation?: string;
  departmentId?: string | null;
}

export interface UpdateUserBody extends ClinicalIdentity {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: Role;
  designation?: string;
  departmentId?: string | null;
  permissions?: string[];
  wardIds?: string[];
}

// ---- Hospital ---------------------------------------------------------------
export interface HospitalAddress {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface HospitalProfile {
  id: string;
  name: string;
  /** Platform-owned. Every identifier already issued embeds it. */
  code: string;
  registrationNumber: string;
  address: HospitalAddress;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  hfrId: string;
  gstin: string;
  timezone: string;
  currency: string;
  /** US-01: minutes without activity before a screen signs itself out (5–480). */
  sessionIdleMinutes: number;
  approvalStatus: "pending" | "approved" | "rejected";
  subscription: {
    planCode: string;
    status: "trial" | "active" | "past_due" | "cancelled";
    trialEndsAt: string | null;
    currentPeriodEndsAt: string | null;
  };
  isActive: boolean;
  createdAt: string;
}

/** Only these fields are tenant-editable (hospital.service.js TENANT_EDITABLE). */
export type HospitalPatch = Partial<
  Pick<
    HospitalProfile,
    | "name"
    | "registrationNumber"
    | "phone"
    | "email"
    | "website"
    | "logoUrl"
    | "hfrId"
    | "gstin"
    | "timezone"
    | "currency"
    | "sessionIdleMinutes"
  > & { address: Partial<HospitalAddress> }
>;

// ---- Departments ------------------------------------------------------------
export interface Department {
  id: string;
  name: string;
  code: string;
  description: string;
  isClinical: boolean;
  headOfDepartment: { id: string; name: string; designation: string } | null;
  consultationFee: number;
  opdTimings: string;
  isActive: boolean;
  createdAt: string;
}

export interface DepartmentBody {
  name: string;
  code: string;
  description?: string;
  isClinical?: boolean;
  consultationFee?: number;
  opdTimings?: string;
}

// ---- Wards, rooms, beds -----------------------------------------------------
export type WardType =
  | "general"
  | "icu"
  | "hdu"
  | "emergency"
  | "maternity"
  | "paediatric"
  | "isolation"
  | "private";

export type WardGender = "male" | "female" | "mixed";
export type RoomType =
  "general" | "semi-private" | "private" | "deluxe" | "icu";
export type BedStatus = "available" | "occupied" | "reserved" | "maintenance";

export const WARD_TYPE_LABELS: Record<WardType, string> = {
  general: "General",
  icu: "ICU",
  hdu: "High dependency",
  emergency: "Emergency",
  maternity: "Maternity",
  paediatric: "Paediatric",
  isolation: "Isolation",
  private: "Private",
};

export const WARD_GENDER_LABELS: Record<WardGender, string> = {
  mixed: "Mixed",
  male: "Male only",
  female: "Female only",
};

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  general: "General",
  "semi-private": "Semi-private",
  private: "Private",
  deluxe: "Deluxe",
  icu: "ICU",
};

export interface Ward {
  id: string;
  name: string;
  code: string;
  type: WardType;
  gender: WardGender;
  floor: string;
  dailyCharge: number;
  department: DepartmentRef | null;
  isActive: boolean;
}

export interface WardBody {
  name: string;
  code: string;
  type?: WardType;
  gender?: WardGender;
  floor?: string;
  dailyCharge?: number;
  departmentId?: string | null;
}

export interface Room {
  id: string;
  number: string;
  type: RoomType;
  dailyCharge: number;
  ward: { id: string; name: string; code: string; type: WardType } | null;
  isActive: boolean;
}

export interface Bed {
  id: string;
  number: string;
  status: BedStatus;
  maintenanceNote: string;
  /** Id only: bed routes need just beds.view, so the patient name is deliberately absent. */
  currentPatientId: string | null;
  dailyCharge: number;
  features: { oxygen: boolean; ventilator: boolean; monitor: boolean };
  ward: { id: string; name: string; code: string; type: WardType } | null;
  room: { id: string; number: string; type: RoomType } | null;
  isActive: boolean;
}

export interface BulkBedsBody {
  roomId: string;
  prefix?: string;
  from: number;
  to: number;
  dailyCharge?: number;
  hasOxygen?: boolean;
  hasVentilator?: boolean;
  hasMonitor?: boolean;
}

export interface BulkBedsResult {
  created: number;
  skipped: number;
  message: string;
}

export interface BedCounts {
  available: number;
  occupied: number;
  reserved: number;
  maintenance: number;
  total: number;
}

/** GET /beds/board — counts only, one aggregation, no patient data. */
export interface BedBoard {
  wards: (BedCounts & {
    wardId: string;
    name: string;
    code: string;
    type: WardType;
  })[];
  totals: BedCounts;
}

// ---- Doctor schedules (mounted at /appointments) ----------------------------

/** One weekly clinic session. Times are "HH:mm" on the hospital's wall clock. */
export interface ClinicSession {
  id: string;
  doctor: { id: string; fullName?: string };
  department: DepartmentRef | null;
  /** 0 = Sunday. */
  dayOfWeek: number;
  dayName: string;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  slotCapacity: number;
  location: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

export interface ClinicSessionBody {
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes?: number;
  slotCapacity?: number;
  location?: string;
  /** An instant. The API defaults to "now", which hides the rest of today. */
  effectiveFrom?: string;
}

export interface ClinicSessionPatch {
  startTime?: string;
  endTime?: string;
  slotMinutes?: number;
  slotCapacity?: number;
  location?: string;
  effectiveTo?: string | null;
  isActive?: boolean;
}

export type ScheduleExceptionType = "leave" | "blocked" | "extra";

export interface ScheduleException {
  id: string;
  doctor: { id: string; fullName?: string };
  /** Calendar date "YYYY-MM-DD" in the hospital's timezone. */
  date: string;
  type: ScheduleExceptionType;
  startTime: string;
  endTime: string;
  reason: string;
  isWholeDay: boolean;
}

export interface ScheduleExceptionBody {
  doctorId: string;
  date: string;
  type: ScheduleExceptionType;
  startTime?: string;
  endTime?: string;
  slotMinutes?: number;
  slotCapacity?: number;
  reason?: string;
}

/** Bookings on that day are not cancelled; the count is for a person to act on. */
export interface CreatedScheduleException extends ScheduleException {
  affectedAppointments: number;
}

// ---- Services and prices (mounted at /billing) ------------------------------
export type TariffCategory = "procedure" | "service" | "registration" | "other";

export const TARIFF_CATEGORY_LABELS: Record<TariffCategory, string> = {
  procedure: "Procedures",
  service: "Services",
  registration: "Registration",
  other: "Other",
};

/** `price` is rupees on the wire; the API stores paise. */
export interface TariffService {
  id: string;
  code: string;
  name: string;
  category: TariffCategory;
  price: number;
  taxRate: number;
  isActive: boolean;
}

export interface TariffBody {
  code: string;
  name: string;
  category: TariffCategory;
  price: number;
  taxRate?: number;
}

export type TariffPatch = Partial<
  Pick<TariffService, "name" | "price" | "taxRate" | "isActive">
>;

export type TaxHead =
  "consultation" | "room" | "laboratory" | "pharmacy" | "procedure";

export interface BillingSettings {
  taxRates: Record<TaxHead, number>;
  receiptFooter: string;
}

export interface BillingSettingsPatch {
  taxRates?: Partial<Record<TaxHead, number>>;
  receiptFooter?: string;
}
