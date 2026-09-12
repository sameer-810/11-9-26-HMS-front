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
  /** Route name. Must match the key in `SCREENS` and in the linking config. */
  name: string;
  label: string;
  icon: LucideIcon;
  section: NavSection;
  /** Visible when the user holds ANY of these. */
  permission?: string;
  permissionAny?: string[];
  adminOnly?: boolean;
  /**
   * Registered as a route — reachable by deep link, a button or the command
   * palette — but not drawn in the sidebar. For screens you arrive at from
   * somewhere else rather than navigate to directly.
   */
  hidden?: boolean;
}

/**
 * The single source of truth for navigation.
 *
 * Both the sidebar AND the set of registered routes derive from this list. That
 * coupling is the point: a screen the user's role cannot reach is never
 * registered in the navigator at all, so a deep link to it cannot render. The
 * guard is the absence of the route, not a check inside it — there is no
 * component to forget to wrap.
 *
 * The server enforces the same thing independently. This only decides what to
 * draw.
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
    /**
     * MUST mirror the API's grant on GET /records/:patientId.
     *
     * These lists drifted once: the route was registered for record.view
     * alone, while the API also serves nursing, laboratory and pharmacy their
     * own scoped views. A pharmacist could therefore fetch a record they could
     * not open — the screen was simply not registered for them, so the link
     * went nowhere with no error to explain it.
     */
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
    permissionAny: [PERMISSIONS.ADMISSION_MANAGE, PERMISSIONS.NURSING_PATIENTS_VIEW],
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
  if (item.permissionAny?.length) return item.permissionAny.some((p) => hasPermission(p));
  if (item.permission) return hasPermission(item.permission);
  return true;
}

/** Everything this user may reach — drives BOTH the sidebar and route registration. */
export function useVisibleNavItems(): NavItem[] {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  return NAV_ITEMS.filter((it) => itemVisible(it, hasPermission, isAdmin));
}

/** What the sidebar draws — permitted AND not hidden. */
export function useSidebarNavItems(): NavItem[] {
  return useVisibleNavItems().filter((it) => !it.hidden);
}

/**
 * Screens navigation LANDS on. `Screen` reads this to decide whether to show an
 * automatic back link — history is the wrong signal, because arriving at the
 * dashboard from a deep link should not offer "back" to nowhere.
 */
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

/** Pure helper, exported for tests. */
export function visibleItemsFor(
  permissions: string[],
  role: string,
): NavItem[] {
  const has = (p: string) => permissions.includes(p);
  const admin = () => role === "admin";
  return NAV_ITEMS.filter((it) => itemVisible(it, has, admin));
}
