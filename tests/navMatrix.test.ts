import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { fileURLToPath } from "node:url";

/**
 * each role's drawer is exactly its spec section 5 screens plus the listed HMS additions,
 * using default permissions read from the API's roles.js.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const ROLES_JS = path.resolve(
  here,
  "..",
  "..",
  "11-9-26-HMS-back",
  "src",
  "config",
  "roles.js",
);
const apiAvailable = fs.existsSync(ROLES_JS);

// navItems.ts pulls in react native via icons and the auth store; stubbed so node can load it.
type Loader = { _load: (request: string, ...rest: unknown[]) => unknown };
const loader = Module as unknown as Loader;
const originalLoad = loader._load;
const STUBS: Record<string, unknown> = {
  "lucide-react-native": new Proxy(
    {},
    {
      get: (_t, key) =>
        key === "__esModule"
          ? false
          : function Icon() {
              return null;
            },
    },
  ),
  "@shared/store/useAuthStore": { useAuthStore: () => undefined },
};
loader._load = function load(request: string, ...rest: unknown[]) {
  if (request in STUBS) return STUBS[request];
  return originalLoad.call(this, request, ...rest);
};

// ---------------------------------------------------------------------------
// Role defaults, from the API's roles.js
// ---------------------------------------------------------------------------
function block(source: string, name: string): string {
  const start = source.indexOf(`export const ${name} = Object.freeze({`);
  assert.notEqual(start, -1, `roles.js has no ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated ${name}`);
}

function roleDefaults(): Record<string, string[]> {
  const source = fs.readFileSync(ROLES_JS, "utf8").replace(/\/\/.*$/gm, "");
  const constants = (name: string) =>
    Object.fromEntries(
      [...block(source, name).matchAll(/^\s*([A-Z0-9_]+):\s*"([^"]+)"/gm)].map(
        (m) => [m[1], m[2]],
      ),
    );
  const roles = constants("ROLES");
  const permissions = constants("PERMISSIONS");
  const out: Record<string, string[]> = {};
  for (const m of block(source, "ROLE_DEFAULT_PERMISSIONS").matchAll(
    /\[ROLES\.([A-Z_]+)\]:\s*\[([\s\S]*?)\]/g,
  )) {
    out[roles[m[1]]] = [...m[2].matchAll(/P\.([A-Z0-9_]+)/g)].map((p) => {
      assert.ok(
        permissions[p[1]],
        `roles.js default names unknown permission P.${p[1]}`,
      );
      return permissions[p[1]];
    });
  }
  return out;
}

const REC = "receptionist";
const DOC = "doctor";
const NUR = "nurse";
const LAB = "lab";
const PHA = "pharmacy";
const BIL = "billing";
const INV = "inventory";
const ADM = "admin";
const ALL = [REC, DOC, NUR, LAB, PHA, BIL, INV, ADM];

// ---------------------------------------------------------------------------
// Section 5 — every screen, with the navigator item it lives under
// ---------------------------------------------------------------------------
interface Screen {
  screen: string;
  route: string;
  access: string[];
  /** The NAV_ITEMS entry that IS this screen. */
  item?: string;
  /** Or: reached from inside another item's screen, so not a drawer entry of its own. */
  within?: string;
}

const SECTION_5: Screen[] = [
  // 5.1
  { screen: "Dashboard", route: "/dashboard", access: ALL, item: "Dashboard" },
  { screen: "My Profile", route: "/profile", access: ALL, item: "Profile" },
  {
    screen: "Change Password",
    route: "/profile/password",
    access: ALL,
    within: "Profile",
  },
  // 5.2
  {
    screen: "Patient Search",
    route: "/patients",
    access: [REC, DOC, NUR, LAB, PHA, BIL],
    item: "Patients",
  },
  {
    screen: "Register Patient",
    route: "/patients/new",
    access: [REC],
    item: "RegisterPatient",
  },
  {
    screen: "Patient Summary",
    route: "/patients/:id",
    access: [REC, DOC, NUR, LAB, PHA],
    within: "Patients",
  },
  {
    screen: "Electronic Medical Record",
    route: "/patients/:id/record",
    access: [DOC, NUR, LAB, PHA],
    item: "MedicalRecord",
  },
  {
    screen: "Appointment List",
    route: "/appointments",
    access: [REC],
    item: "Appointments",
  },
  {
    screen: "Book Appointment",
    route: "/appointments/new",
    access: [REC],
    within: "Appointments",
  },
  {
    screen: "Reschedule Appointment",
    route: "/appointments/:id/reschedule",
    access: [REC],
    within: "Appointments",
  },
  {
    screen: "My Appointments",
    route: "/doctor/appointments",
    access: [DOC],
    item: "MyAppointments",
  },
  {
    screen: "OPD Queue",
    route: "/opd/queue",
    access: [REC, DOC],
    item: "OpdQueue",
  },
  // 5.3
  {
    screen: "OPD Consultation",
    route: "/opd/consultation/:patientId",
    access: [DOC],
    item: "Consultation",
  },
  {
    screen: "My Patients",
    route: "/doctor/patients",
    access: [DOC],
    item: "MyPatients",
  },
  {
    screen: "Create Prescription",
    route: "/prescriptions/new/:consultationId",
    access: [DOC],
    within: "Consultation",
  },
  {
    screen: "Request Lab Test",
    route: "/lab-requests/new/:consultationId",
    access: [DOC],
    within: "Consultation",
  },
  {
    screen: "Admit Patient",
    route: "/ipd/admit/:patientId",
    access: [DOC],
    within: "AdmittedPatients",
  },
  {
    screen: "Admitted Patients",
    route: "/ipd/patients",
    access: [DOC, NUR],
    item: "AdmittedPatients",
  },
  {
    screen: "Discharge Patient",
    route: "/ipd/discharge/:admissionId",
    access: [DOC],
    within: "AdmittedPatients",
  },
  {
    screen: "Bed Management",
    route: "/beds",
    access: [DOC, NUR, ADM],
    item: "Beds",
  },
  // "DOC, NUR — ICU assigned only": granted to the individual (icu.access plus
  // the icuAuthorized flag), so no role default reaches it.
  { screen: "ICU Workspace", route: "/icu", access: [], item: "Icu" },
  // 5.4
  {
    screen: "My Patients (Nursing)",
    route: "/nursing/patients",
    access: [NUR],
    item: "NursingPatients",
  },
  {
    screen: "Record Vitals",
    route: "/nursing/vitals/:patientId",
    access: [NUR],
    within: "NursingPatients",
  },
  {
    screen: "Nursing Notes",
    route: "/nursing/notes/:patientId",
    access: [NUR],
    within: "NursingPatients",
  },
  {
    screen: "Medication Administration",
    route: "/nursing/medications/:patientId",
    access: [NUR],
    within: "NursingPatients",
  },
  {
    screen: "Test Queue",
    route: "/lab/requests",
    access: [LAB],
    item: "LabQueue",
  },
  {
    screen: "Enter Test Results",
    route: "/lab/results/:testId",
    access: [LAB],
    within: "LabQueue",
  },
  {
    screen: "Lab Reports",
    route: "/lab/reports",
    access: [LAB, DOC],
    item: "LabReports",
  },
  {
    screen: "Prescription Queue",
    route: "/pharmacy/prescriptions",
    access: [PHA],
    item: "PharmacyQueue",
  },
  {
    screen: "Dispense Medicine",
    route: "/pharmacy/dispense/:prescriptionId",
    access: [PHA],
    within: "PharmacyQueue",
  },
  {
    screen: "Medicine Stock",
    route: "/pharmacy/stock",
    access: [PHA],
    item: "MedicineStock",
  },
  // 5.5
  { screen: "Bills", route: "/billing/bills", access: [BIL], item: "Bills" },
  {
    screen: "Generate Bill",
    route: "/billing/generate/:patientId",
    access: [BIL],
    within: "Bills",
  },
  {
    screen: "Record Payment",
    route: "/billing/payment/:billId",
    access: [BIL],
    within: "Bills",
  },
  {
    screen: "Receipt",
    route: "/billing/receipt/:paymentId",
    access: [BIL],
    within: "Bills",
  },
  // The Outstanding screen opens from the Bills drawer item (BillsScreen →
  // "Outstanding"), so ADM reaching it means ADM has the Bills item.
  {
    screen: "Outstanding Bills",
    route: "/billing/outstanding",
    access: [BIL, ADM],
    item: "Bills",
  },
  {
    screen: "Inventory",
    route: "/inventory",
    access: [INV],
    item: "Inventory",
  },
  {
    screen: "Record Stock Received",
    route: "/inventory/receive",
    access: [INV],
    within: "Inventory",
  },
  {
    screen: "Record Stock Issued",
    route: "/inventory/issue",
    access: [INV],
    within: "Inventory",
  },
  // Likewise LowStock opens from the Inventory drawer item.
  {
    screen: "Low Stock Alerts",
    route: "/inventory/low-stock",
    access: [INV, ADM],
    item: "Inventory",
  },
  {
    screen: "User Management",
    route: "/admin/users",
    access: [ADM],
    item: "UserManagement",
  },
  {
    screen: "Create / Edit User",
    route: "/admin/users/new, /admin/users/:id",
    access: [ADM],
    within: "UserManagement",
  },
  // own drawer item for US-04 role-level permissions.
  {
    screen: "Roles & Permissions",
    route: "/admin/roles",
    access: [ADM],
    item: "RolePermissions",
  },
  {
    screen: "Hospital Configuration",
    route: "/admin/config",
    access: [ADM],
    item: "HospitalConfig",
  },
  {
    screen: "Reports & Analytics",
    route: "/reports",
    access: [ADM, BIL, INV],
    item: "Reports",
  },
  {
    screen: "Audit Trail",
    route: "/admin/audit",
    access: [ADM],
    item: "AuditTrail",
  },
];

/** Beyond section 5, on purpose. Each is documented in docs/PERMISSION_MATRIX.md. */
const HMS_ADDITIONS: { item: string; roles: string[]; reason: string }[] = [
  {
    item: "Scan",
    roles: [REC, DOC, NUR, LAB, PHA],
    reason:
      "PHASES 9 wristband/tube scanning; mirrors GET /patients/scan/:code, which excludes billing and administration",
  },
  {
    item: "Emergency",
    roles: [REC, DOC, NUR],
    reason:
      "PHASES 8 emergency department — absent from the source specification; reception registers, nurse/doctor triage",
  },
  {
    item: "Handover",
    roles: [NUR],
    reason: "PHASES 4 SBAR shift handover (NU-05)",
  },
];

// ---------------------------------------------------------------------------
test(
  "every navigator item is accounted for by section 5 or a listed HMS addition",
  { skip: !apiAvailable && "API not checked out beside the app" },
  async () => {
    const { NAV_ITEMS } = await import("../src/navigation/navItems");
    const known = new Set([
      ...SECTION_5.flatMap((s) => (s.item ? [s.item] : [])),
      ...HMS_ADDITIONS.map((a) => a.item),
    ]);
    const names = NAV_ITEMS.map((i) => i.name);
    assert.deepEqual(
      names.filter((n) => !known.has(n)),
      [],
      "navigator items with no section 5 screen and no documented reason",
    );
    assert.deepEqual(
      [...known].filter((n) => !names.includes(n)),
      [],
      "section 5 / additions name items the navigator no longer has",
    );
    for (const s of SECTION_5) {
      if (s.within)
        assert.ok(
          names.includes(s.within),
          `${s.screen} is said to live within ${s.within}, which does not exist`,
        );
    }
  },
);

for (const role of ALL) {
  test(
    `${role}: the drawer is section 5 plus the listed additions, nothing else`,
    { skip: !apiAvailable && "API not checked out beside the app" },
    async () => {
      const { NAV_ITEMS, visibleItemsFor } =
        await import("../src/navigation/navItems");
      const defaults = roleDefaults()[role];
      assert.ok(defaults?.length, `no default permissions found for ${role}`);

      const hidden = new Set(
        NAV_ITEMS.filter((i) => i.hidden).map((i) => i.name),
      );
      const expected = new Set([
        ...SECTION_5.filter((s) => s.item && s.access.includes(role)).map(
          (s) => s.item as string,
        ),
        ...HMS_ADDITIONS.filter((a) => a.roles.includes(role)).map(
          (a) => a.item,
        ),
      ]);

      const registered = visibleItemsFor(defaults, role)
        .map((i) => i.name)
        .sort();
      const drawer = registered.filter((n) => !hidden.has(n));

      assert.deepEqual(
        drawer,
        [...expected].filter((n) => !hidden.has(n)).sort(),
      );
      // hidden routes are still registered, and registration is the route guard, so they must match too.
      assert.deepEqual(
        registered.filter((n) => hidden.has(n)),
        [...expected].filter((n) => hidden.has(n)).sort(),
        `${role}: hidden-but-registered routes differ from section 5`,
      );
    },
  );
}
