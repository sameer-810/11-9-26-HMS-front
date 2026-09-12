/**
 * Mirror of the API's `src/config/roles.js`.
 *
 * This file exists so the UI can decide what to draw. It is NOT the enforcer —
 * the server checks every request regardless of what the client believes, and a
 * user who edits their own bundle gains a menu item and nothing else.
 *
 * Drift between the two copies is caught in CI: the backend test
 * `src/config/permissionParity.test.js` reads THIS file off disk and fails the
 * build if the catalogues disagree.
 */

export const ROLES = {
  RECEPTIONIST: "receptionist",
  DOCTOR: "doctor",
  NURSE: "nurse",
  LAB: "lab",
  PHARMACY: "pharmacy",
  BILLING: "billing",
  INVENTORY: "inventory",
  ADMIN: "admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_CODES: Record<Role, string> = {
  [ROLES.RECEPTIONIST]: "REC",
  [ROLES.DOCTOR]: "DOC",
  [ROLES.NURSE]: "NUR",
  [ROLES.LAB]: "LAB",
  [ROLES.PHARMACY]: "PHA",
  [ROLES.BILLING]: "BIL",
  [ROLES.INVENTORY]: "INV",
  [ROLES.ADMIN]: "ADM",
};

export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.RECEPTIONIST]: "Receptionist",
  [ROLES.DOCTOR]: "Doctor",
  [ROLES.NURSE]: "Nurse",
  [ROLES.LAB]: "Laboratory Staff",
  [ROLES.PHARMACY]: "Pharmacy Staff",
  [ROLES.BILLING]: "Billing Staff",
  [ROLES.INVENTORY]: "Inventory Staff",
  [ROLES.ADMIN]: "Administrator",
};

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",

  PATIENTS_VIEW: "patients.view",
  PATIENTS_MANAGE: "patients.manage",
  APPOINTMENTS_VIEW: "appointments.view",
  APPOINTMENTS_MANAGE: "appointments.manage",
  OPD_QUEUE_MANAGE: "opd_queue.manage",

  RECORD_VIEW: "record.view",
  CONSULTATION_MANAGE: "consultation.manage",
  PRESCRIPTION_CREATE: "prescription.create",
  LAB_REQUEST_CREATE: "lab_request.create",
  ADMISSION_MANAGE: "admission.manage",
  DISCHARGE_MANAGE: "discharge.manage",
  ICU_ACCESS: "icu.access",

  NURSING_PATIENTS_VIEW: "nursing.patients.view",
  VITALS_RECORD: "vitals.record",
  NURSING_NOTES_MANAGE: "nursing.notes.manage",
  MEDICATION_ADMINISTER: "medication.administer",
  HANDOVER_MANAGE: "handover.manage",

  BEDS_VIEW: "beds.view",
  BEDS_MANAGE: "beds.manage",

  TRIAGE_MANAGE: "triage.manage",

  LAB_QUEUE_VIEW: "lab.queue.view",
  LAB_RESULTS_MANAGE: "lab.results.manage",
  LAB_REPORTS_VIEW: "lab.reports.view",

  PHARMACY_QUEUE_VIEW: "pharmacy.queue.view",
  PHARMACY_DISPENSE: "pharmacy.dispense",
  PHARMACY_STOCK_VIEW: "pharmacy.stock.view",

  BILLING_VIEW: "billing.view",
  BILLING_MANAGE: "billing.manage",
  PAYMENT_RECORD: "payment.record",

  INVENTORY_VIEW: "inventory.view",
  INVENTORY_MANAGE: "inventory.manage",

  REPORTS_VIEW: "reports.view",
  AUDIT_VIEW: "audit.view",

  MANAGE_USERS: "users.manage",
  MANAGE_ROLES: "roles.manage",
  HOSPITAL_CONFIG: "hospital.config",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Grouping and copy for the permission editor an administrator uses.
 *
 * `description` is written for the person granting it, not for a developer:
 * an administrator deciding whether a ward clerk should hold `record.view`
 * needs to be told what that actually exposes.
 */
export const PERMISSION_META: Record<
  string,
  { label: string; group: string; description: string; clinical?: boolean }
> = {
  [PERMISSIONS.DASHBOARD_VIEW]: {
    label: "View dashboard",
    group: "General",
    description: "See the landing dashboard for their role.",
  },

  [PERMISSIONS.PATIENTS_VIEW]: {
    label: "Search patients",
    group: "Front office",
    description: "Find patients and see name, age, contact and visit history. No clinical detail.",
  },
  [PERMISSIONS.PATIENTS_MANAGE]: {
    label: "Register and edit patients",
    group: "Front office",
    description: "Create patient records and correct demographic details.",
  },
  [PERMISSIONS.APPOINTMENTS_VIEW]: {
    label: "View appointments",
    group: "Front office",
    description: "See the appointment diary.",
  },
  [PERMISSIONS.APPOINTMENTS_MANAGE]: {
    label: "Book and cancel appointments",
    group: "Front office",
    description: "Book, reschedule and cancel against any doctor's free slots.",
  },
  [PERMISSIONS.OPD_QUEUE_MANAGE]: {
    label: "Manage the OPD queue",
    group: "Front office",
    description: "Mark patients arrived and move them through the waiting queue.",
  },

  [PERMISSIONS.RECORD_VIEW]: {
    label: "Open the medical record",
    group: "Clinical",
    clinical: true,
    description:
      "Read consultations, diagnoses, prescriptions and results. Every view is logged against this user.",
  },
  [PERMISSIONS.CONSULTATION_MANAGE]: {
    label: "Record consultations",
    group: "Clinical",
    clinical: true,
    description: "Record symptoms, examination and diagnosis. Saved consultations cannot be edited.",
  },
  [PERMISSIONS.PRESCRIPTION_CREATE]: {
    label: "Prescribe medicine",
    group: "Clinical",
    clinical: true,
    description: "Create prescriptions that reach the pharmacy.",
  },
  [PERMISSIONS.LAB_REQUEST_CREATE]: {
    label: "Order laboratory tests",
    group: "Clinical",
    clinical: true,
    description: "Raise test requests that enter the laboratory queue.",
  },
  [PERMISSIONS.ADMISSION_MANAGE]: {
    label: "Admit and transfer patients",
    group: "Clinical",
    clinical: true,
    description: "Admit a patient to a ward and bed, and move them between beds.",
  },
  [PERMISSIONS.DISCHARGE_MANAGE]: {
    label: "Discharge patients",
    group: "Clinical",
    clinical: true,
    description: "Complete a discharge with summary, medication and follow-up. Frees the bed.",
  },
  [PERMISSIONS.ICU_ACCESS]: {
    label: "ICU workspace",
    group: "Clinical",
    clinical: true,
    description:
      "Open the ICU workspace. Requires the account to also be marked as ICU staff.",
  },

  [PERMISSIONS.NURSING_PATIENTS_VIEW]: {
    label: "See assigned patients",
    group: "Nursing",
    description: "See the patients assigned to this nurse for the current shift.",
  },
  [PERMISSIONS.VITALS_RECORD]: {
    label: "Record vital signs",
    group: "Nursing",
    clinical: true,
    description: "Chart vitals. Out-of-range readings are flagged to the treating doctor.",
  },
  [PERMISSIONS.NURSING_NOTES_MANAGE]: {
    label: "Write nursing notes",
    group: "Nursing",
    clinical: true,
    description: "Add care observations. Notes are appended, never overwritten.",
  },
  [PERMISSIONS.MEDICATION_ADMINISTER]: {
    label: "Record medication given",
    group: "Nursing",
    clinical: true,
    description: "Record administration against the patient and time.",
  },
  [PERMISSIONS.HANDOVER_MANAGE]: {
    label: "Shift handover",
    group: "Nursing",
    description: "Write and receive the structured shift handover.",
  },

  [PERMISSIONS.BEDS_VIEW]: {
    label: "View bed status",
    group: "Wards",
    description: "See which beds are free, occupied, reserved or out of service.",
  },
  [PERMISSIONS.BEDS_MANAGE]: {
    label: "Configure beds",
    group: "Wards",
    description: "Add wards, rooms and beds, and take a bed out of service.",
  },

  [PERMISSIONS.TRIAGE_MANAGE]: {
    label: "Emergency triage",
    group: "Emergency",
    description: "Register an emergency arrival and assign a triage level.",
  },

  [PERMISSIONS.LAB_QUEUE_VIEW]: {
    label: "View the test queue",
    group: "Laboratory",
    description: "See requested tests with urgency and waiting time.",
  },
  [PERMISSIONS.LAB_RESULTS_MANAGE]: {
    label: "Enter results",
    group: "Laboratory",
    clinical: true,
    description: "Move tests through their stages and enter results. A reported result is final.",
  },
  [PERMISSIONS.LAB_REPORTS_VIEW]: {
    label: "View lab reports",
    group: "Laboratory",
    clinical: true,
    description: "Read completed laboratory reports.",
  },

  [PERMISSIONS.PHARMACY_QUEUE_VIEW]: {
    label: "View the prescription queue",
    group: "Pharmacy",
    description: "See prescriptions waiting to be filled.",
  },
  [PERMISSIONS.PHARMACY_DISPENSE]: {
    label: "Dispense medicine",
    group: "Pharmacy",
    clinical: true,
    description: "Dispense against batch and expiry. Deducts stock and posts the charge.",
  },
  [PERMISSIONS.PHARMACY_STOCK_VIEW]: {
    label: "View medicine stock",
    group: "Pharmacy",
    description: "See live medicine availability and batch expiry.",
  },

  [PERMISSIONS.BILLING_VIEW]: {
    label: "View bills",
    group: "Billing",
    description: "See bills and outstanding balances. No clinical detail.",
  },
  [PERMISSIONS.BILLING_MANAGE]: {
    label: "Generate bills",
    group: "Billing",
    description: "Compile charges into a bill and finalise it.",
  },
  [PERMISSIONS.PAYMENT_RECORD]: {
    label: "Record payments",
    group: "Billing",
    description: "Take payment and issue receipts.",
  },

  [PERMISSIONS.INVENTORY_VIEW]: {
    label: "View stock",
    group: "Inventory",
    description: "See stock on hand and movement history.",
  },
  [PERMISSIONS.INVENTORY_MANAGE]: {
    label: "Receive and issue stock",
    group: "Inventory",
    description: "Record goods received and stock issued to departments.",
  },

  [PERMISSIONS.REPORTS_VIEW]: {
    label: "View reports",
    group: "Oversight",
    description: "Run activity reports for the areas this user can already see.",
  },
  [PERMISSIONS.AUDIT_VIEW]: {
    label: "View the audit trail",
    group: "Oversight",
    description: "Read the immutable log of who did and saw what.",
  },

  [PERMISSIONS.MANAGE_USERS]: {
    label: "Manage users",
    group: "Administration",
    description: "Create, edit, activate and deactivate staff accounts.",
  },
  [PERMISSIONS.MANAGE_ROLES]: {
    label: "Manage roles",
    group: "Administration",
    description: "Change what each role can reach.",
  },
  [PERMISSIONS.HOSPITAL_CONFIG]: {
    label: "Hospital configuration",
    group: "Administration",
    description: "Configure departments, wards, rooms, beds and services.",
  },
};

/** Admin-only. Never offered in the per-user permission editor. */
export const ADMIN_ONLY_PERMISSIONS: string[] = [
  PERMISSIONS.MANAGE_USERS,
  PERMISSIONS.MANAGE_ROLES,
  PERMISSIONS.HOSPITAL_CONFIG,
];

/**
 * Permissions that expose clinical content. The permission editor warns before
 * granting one of these, because "let the ward clerk see the record so they can
 * find the bed number" is how a hospital ends up with an unauditable leak.
 */
export const CLINICAL_PERMISSIONS: string[] = Object.entries(PERMISSION_META)
  .filter(([, meta]) => meta.clinical)
  .map(([key]) => key);

export const PERMISSION_GROUPS = [
  "General",
  "Front office",
  "Clinical",
  "Nursing",
  "Wards",
  "Emergency",
  "Laboratory",
  "Pharmacy",
  "Billing",
  "Inventory",
  "Oversight",
  "Administration",
] as const;
