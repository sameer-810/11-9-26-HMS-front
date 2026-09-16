import {
  LayoutDashboard,
  UserPlus,
  Users,
  CalendarDays,
  ListOrdered,
  Stethoscope,
  BedDouble,
  HeartPulse,
  Activity,
  FlaskConical,
  Pill,
  Receipt,
  Boxes,
  BarChart3,
  ScrollText,
  UserCog,
  Settings,
  Ambulance,
  ClipboardList,
  CalendarClock,
  UserRound,
  ScanLine,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react-native";
import { PERMISSIONS } from "@shared/permissions";
import { useAuthStore } from "@shared/store/useAuthStore";

export type NavSection =
  | "Overview"
  | "Front office"
  | "Clinical"
  | "Wards"
  | "Diagnostics"
  | "Supply"
  | "Finance"
  | "Oversight"
  | "Workspace";

export const SECTION_ORDER: NavSection[] = [
  "Overview",
  "Front office",
  "Clinical",
  "Wards",
  "Diagnostics",
  "Supply",
  "Finance",
  "Oversight",
  "Workspace",
];

export interface NavItem {
  /** route name; must match the key in `SCREENS` and in the linking config. */
  name: string;
  label: string;
  icon: LucideIcon;
  section: NavSection;
  /** visible when the user holds any of these. */
  permission?: string;
  permissionAny?: string[];
  adminOnly?: boolean;
  /** registered as a route but not drawn in the sidebar. */
  hidden?: boolean;
}

/**
 * drives both the sidebar and route registration, so a route the role cannot reach is
 * never registered and a deep link to it cannot render. the server enforces this separately.
 */
export const NAV_ITEMS: NavItem[] = [
  // ---- Overview ----
  {
    name: "Dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    section: "Overview",
    permission: PERMISSIONS.DASHBOARD_VIEW,
  },
  // must mirror the API's grant on GET /patients/scan/:code, which leaves out billing.
  {
    name: "Scan",
    label: "Scan",
    icon: ScanLine,
    section: "Overview",
    permissionAny: [
      PERMISSIONS.PATIENTS_MANAGE,
      PERMISSIONS.VITALS_RECORD,
      PERMISSIONS.CONSULTATION_MANAGE,
      PERMISSIONS.RECORD_VIEW,
      PERMISSIONS.LAB_QUEUE_VIEW,
      PERMISSIONS.PHARMACY_DISPENSE,
    ],
  },

  // ---- Front office ----
  {
    name: "Patients",
    label: "Patients",
    icon: Users,
    section: "Front office",
    permission: PERMISSIONS.PATIENTS_VIEW,
  },
  {
    name: "RegisterPatient",
    label: "Register patient",
    icon: UserPlus,
    section: "Front office",
    permission: PERMISSIONS.PATIENTS_MANAGE,
  },
  {
    name: "Appointments",
    label: "Appointments",
    icon: CalendarDays,
    section: "Front office",
    permission: PERMISSIONS.APPOINTMENTS_VIEW,
  },
  {
    name: "OpdQueue",
    label: "OPD queue",
    icon: ListOrdered,
    section: "Front office",
    permission: PERMISSIONS.OPD_QUEUE_MANAGE,
  },
  {
    name: "Emergency",
    label: "Emergency",
    icon: Ambulance,
    section: "Front office",
    permission: PERMISSIONS.TRIAGE_MANAGE,
  },

  // ---- Clinical ----
  {
    name: "MyAppointments",
    label: "My schedule",
    icon: CalendarClock,
    section: "Clinical",
    permissionAny: [PERMISSIONS.CONSULTATION_MANAGE],
  },
  {
    name: "MyPatients",
    label: "My patients",
    icon: Stethoscope,
    section: "Clinical",
    permissionAny: [PERMISSIONS.CONSULTATION_MANAGE],
  },
  {
    name: "Consultation",
    label: "Consultation",
    icon: Stethoscope,
    section: "Clinical",
    permission: PERMISSIONS.CONSULTATION_MANAGE,
    hidden: true,
  },
  {
    name: "MedicalRecord",
    label: "Medical record",
    icon: ClipboardList,
    section: "Clinical",
    /** must mirror the API's grant on GET /records/:patientId, or the link goes nowhere. */
    permissionAny: [
      PERMISSIONS.RECORD_VIEW,
      PERMISSIONS.CONSULTATION_MANAGE,
      PERMISSIONS.VITALS_RECORD,
      PERMISSIONS.LAB_RESULTS_MANAGE,
      PERMISSIONS.PHARMACY_DISPENSE,
    ],
    hidden: true,
  },

  // ---- Wards ----
  {
    name: "AdmittedPatients",
    label: "Admitted patients",
    icon: BedDouble,
    section: "Wards",
    permissionAny: [
      PERMISSIONS.ADMISSION_MANAGE,
      PERMISSIONS.NURSING_PATIENTS_VIEW,
    ],
  },
  {
    name: "Beds",
    label: "Bed management",
    icon: BedDouble,
    section: "Wards",
    permission: PERMISSIONS.BEDS_VIEW,
  },
  {
    name: "Icu",
    label: "ICU",
    icon: Activity,
    section: "Wards",
    permission: PERMISSIONS.ICU_ACCESS,
  },
  {
    name: "NursingPatients",
    label: "My ward",
    icon: HeartPulse,
    section: "Wards",
    permission: PERMISSIONS.NURSING_PATIENTS_VIEW,
  },
  {
    name: "Handover",
    label: "Shift handover",
    icon: ClipboardList,
    section: "Wards",
    permission: PERMISSIONS.HANDOVER_MANAGE,
  },

  // ---- Diagnostics ----
  {
    name: "LabQueue",
    label: "Test queue",
    icon: FlaskConical,
    section: "Diagnostics",
    permission: PERMISSIONS.LAB_QUEUE_VIEW,
  },
  {
    name: "LabReports",
    label: "Lab reports",
    icon: FlaskConical,
    section: "Diagnostics",
    permission: PERMISSIONS.LAB_REPORTS_VIEW,
  },

  // ---- Supply ----
  {
    name: "PharmacyQueue",
    label: "Prescriptions",
    icon: Pill,
    section: "Supply",
    permission: PERMISSIONS.PHARMACY_QUEUE_VIEW,
  },
  {
    name: "MedicineStock",
    label: "Medicine stock",
    icon: Pill,
    section: "Supply",
    permission: PERMISSIONS.PHARMACY_STOCK_VIEW,
  },
  {
    name: "Inventory",
    label: "Inventory",
    icon: Boxes,
    section: "Supply",
    permission: PERMISSIONS.INVENTORY_VIEW,
  },

  // ---- Finance ----
  {
    name: "Bills",
    label: "Bills",
    icon: Receipt,
    section: "Finance",
    permission: PERMISSIONS.BILLING_VIEW,
  },

  // ---- Oversight ----
  {
    name: "Reports",
    label: "Reports",
    icon: BarChart3,
    section: "Oversight",
    permission: PERMISSIONS.REPORTS_VIEW,
  },
  {
    name: "AuditTrail",
    label: "Audit trail",
    icon: ScrollText,
    section: "Oversight",
    permission: PERMISSIONS.AUDIT_VIEW,
  },

  // ---- Workspace ----
  {
    name: "UserManagement",
    label: "Users & access",
    icon: UserCog,
    section: "Workspace",
    adminOnly: true,
  },
  // must mirror the API's grant on /roles (roles.manage, administrator-only).
  {
    name: "RolePermissions",
    label: "Roles & permissions",
    icon: ShieldCheck,
    section: "Workspace",
    permission: PERMISSIONS.MANAGE_ROLES,
  },
  {
    name: "HospitalConfig",
    label: "Hospital setup",
    icon: Settings,
    section: "Workspace",
    adminOnly: true,
  },
  {
    name: "Profile",
    label: "My profile",
    icon: UserRound,
    section: "Workspace",
  },
];

function itemVisible(
  item: NavItem,
  hasPermission: (p: string) => boolean,
  isAdmin: () => boolean,
): boolean {
  if (item.adminOnly) return isAdmin();
  if (item.permissionAny?.length)
    return item.permissionAny.some((p) => hasPermission(p));
  if (item.permission) return hasPermission(item.permission);
  return true;
}

/** everything this user may reach; drives both the sidebar and route registration. */
export function useVisibleNavItems(): NavItem[] {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  return NAV_ITEMS.filter((it) => itemVisible(it, hasPermission, isAdmin));
}

/** what the sidebar draws: permitted and not hidden. */
export function useSidebarNavItems(): NavItem[] {
  return useVisibleNavItems().filter((it) => !it.hidden);
}

/** screens navigation lands on; `Screen` reads this to decide whether to offer a back link. */
export const LANDING_SCREENS = new Set<string>([
  ...NAV_ITEMS.map((it) => it.name),
  "PatientsList",
  "PatientDetail",
  "AppointmentsList",
  "LabQueueList",
  "PharmacyQueueList",
  "BillsList",
  "InventoryList",
  "UsersList",
]);

/** pure helper, exported for tests. */
export function visibleItemsFor(
  permissions: string[],
  role: string,
): NavItem[] {
  const has = (p: string) => permissions.includes(p);
  const admin = () => role === "admin";
  return NAV_ITEMS.filter((it) => itemVisible(it, has, admin));
}
