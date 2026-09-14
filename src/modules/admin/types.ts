import type { Role } from "@shared/permissions";

/**
 * Shapes as the API sends them — see the backend's user, hospital, department
 * and ward DTOs. The server is the authority; nothing here is invented.
 *
 * Paged lists carry `meta.pages`, not `totalPages`: that is the name the
 * department, user and ward controllers put on the wire.
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

/**
 * One line per role, shown in the role picker.
 *
 * Transcribed from the CANNOT side of the backend's role matrix as much as the
 * CAN side — an administrator choosing between "Nurse" and "Receptionist" for a
 * ward clerk needs to see what each one does NOT open.
 */
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
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/**
 * What creating an account or resetting a credential returns.
 *
 * The temporary password travels in this one response and nowhere else — the
 * server never stores it in plain text, so a screen that loses it cannot get it
 * back. It is kept in component state only, never in the query cache.
 */
export interface IssuedCredential {
  user: AdminUser;
  temporaryPassword: string;
}

/**
 * The permission editor's catalogue.
 *
 * `assignable` excludes the administrator-only permissions entirely, and marks
 * the rest `grantable` only when the signed-in administrator holds them — the
 * escalation guard in user.service.js refuses anything else.
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
export type RoomType = "general" | "semi-private" | "private" | "deluxe" | "icu";
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
  /**
   * An id and nothing more. Who is in a bed is clinical; the bed routes are
   * reachable with beds.view alone, so the name is never attached here.
   */
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
  wards: (BedCounts & { wardId: string; name: string; code: string; type: WardType })[];
  totals: BedCounts;
}
