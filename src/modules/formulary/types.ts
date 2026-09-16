export type MedicineForm =
  | "tablet"
  | "capsule"
  | "syrup"
  | "suspension"
  | "injection"
  | "infusion"
  | "cream"
  | "ointment"
  | "drops"
  | "inhaler"
  | "patch"
  | "sachet"
  | "other";

export type MedicineRoute =
  | "oral"
  | "iv"
  | "im"
  | "sc"
  | "topical"
  | "inhaled"
  | "rectal"
  | "ophthalmic"
  | "otic"
  | "nasal"
  | "other";

/** Drugs and Cosmetics Rules schedule; "" is unscheduled. */
export type DrugSchedule = "" | "H" | "H1" | "X" | "G";

export const FORM_LABELS: Record<MedicineForm, string> = {
  tablet: "Tablet",
  capsule: "Capsule",
  syrup: "Syrup",
  suspension: "Suspension",
  injection: "Injection",
  infusion: "Infusion",
  cream: "Cream",
  ointment: "Ointment",
  drops: "Drops",
  inhaler: "Inhaler",
  patch: "Patch",
  sachet: "Sachet",
  other: "Other",
};

export const ROUTE_LABELS: Record<MedicineRoute, string> = {
  oral: "Oral",
  iv: "Intravenous (IV)",
  im: "Intramuscular (IM)",
  sc: "Subcutaneous (SC)",
  topical: "Topical",
  inhaled: "Inhaled",
  rectal: "Rectal",
  ophthalmic: "Eye",
  otic: "Ear",
  nasal: "Nasal",
  other: "Other",
};

export const SCHEDULE_LABELS: Record<DrugSchedule, string> = {
  "": "Not scheduled",
  H: "Schedule H",
  H1: "Schedule H1",
  X: "Schedule X",
  G: "Schedule G",
};

/** GET /prescriptions/medicines, as a formulary manager sees it. */
export interface FormularyMedicine {
  id: string;
  name: string;
  genericName: string;
  ingredients: string[];
  allergyGroups: string[];
  form: MedicineForm;
  strength: string;
  route: MedicineRoute;
  drugClass: string;
  atcCode: string;
  schedule: DrugSchedule;
  isNarcotic: boolean;
  defaultDose: string;
  defaultFrequency: string;
  defaultDurationDays: number | null;
  cautionNote: string;
  isActive: boolean;
  /** "Amoxil 500mg capsule". */
  label: string;
}

export interface MedicineBody {
  name: string;
  genericName?: string;
  ingredients: string[];
  allergyGroups?: string[];
  form?: MedicineForm;
  strength?: string;
  route?: MedicineRoute;
  drugClass?: string;
  atcCode?: string;
  schedule?: DrugSchedule;
  isNarcotic?: boolean;
  defaultDose?: string;
  defaultFrequency?: string;
  defaultDurationDays?: number | null;
  cautionNote?: string;
}

export type MedicinePatch = Partial<MedicineBody> & { isActive?: boolean };

export interface FormularyParams {
  search?: string;
  includeInactive?: boolean;
  page?: number;
  limit?: number;
}

export interface FormularyPage {
  data: FormularyMedicine[];
  meta: { total: number; pages: number; page: number };
}
