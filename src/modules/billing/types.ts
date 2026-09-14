/** All amounts in this module arrive as rupees. The server computes in paise. */

export type BillStatus = "draft" | "finalised" | "partially_paid" | "paid" | "cancelled";
export type BillType = "opd" | "ipd";
export type ChargeCategory = "consultation" | "room" | "laboratory" | "pharmacy" | "procedure";
export type PaymentMethod = "cash" | "card" | "upi" | "bank_transfer" | "cheque";

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  draft: "Draft",
  finalised: "Finalised",
  partially_paid: "Partially paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const CATEGORY_LABELS: Record<ChargeCategory, string> = {
  consultation: "Consultation",
  room: "Room and bed",
  laboratory: "Laboratory",
  pharmacy: "Pharmacy",
  procedure: "Procedures",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
};

/**
 * The patient as billing may see them. No allergies — section 2 gives billing
 * "charges only", and the server does not send them.
 */
export interface BillPatient {
  id: string;
  patientId: string;
  fullName: string;
  age: string;
  gender: string;
  mobile: string;
}

export interface Charge {
  id?: string;
  sourceKey: string;
  category: ChargeCategory;
  sourceType: "consultation" | "bed" | "lab" | "dispensing" | "service";
  description: string;
  detail: string;
  serviceDate: string;
  quantity: number;
  unit: string;
  /** Null when the source has no price. Such a charge blocks finalisation. */
  unitPrice: number | null;
  amount: number;
  taxRate: number;
  tax: number;
  unpriced: boolean;
  addedByName: string;
}

export interface Payment {
  id: string;
  receiptNumber: string;
  billId: string;
  billNumber: string;
  amount: number;
  method: PaymentMethod;
  methodLabel: string;
  reference: string;
  bankName: string;
  chequeDate: string;
  note: string;
  receivedAt: string;
  receivedByName: string;
  isVoid: boolean;
  voidedAt: string | null;
  voidedByName: string;
  voidReason: string;
}

export interface Bill {
  id: string;
  billNumber: string;
  billType: BillType;
  patient: BillPatient;
  admissionId: string | null;
  status: BillStatus;
  lines: Charge[];
  removedLines: { description: string; amount: number; reason: string; byName: string; at: string }[];
  categoryTotals: Partial<Record<ChargeCategory, number>>;
  discount: {
    status: "none" | "pending" | "approved" | "rejected";
    amount: number;
    reason: string;
    requestedByName: string;
    requestedAt: string | null;
    decidedByName: string;
    decidedAt: string | null;
    decisionNote: string;
  };
  subtotal: number;
  discountAmount: number;
  tax: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  hasUnpriced: boolean;
  notes: string;
  createdByName: string;
  createdAt: string;
  finalisedAt: string | null;
  finalisedByName: string;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string;
  payments?: Payment[];
  warnings?: string[];
  payment?: Payment;
}

export interface BillRow {
  id: string;
  billNumber: string;
  billType: BillType;
  patient: BillPatient;
  status: BillStatus;
  total: number;
  amountPaid: number;
  balanceDue: number;
  lineCount: number;
  discountStatus: Bill["discount"]["status"];
  createdAt: string;
  finalisedAt: string | null;
}

export interface BillingPreview {
  patient: BillPatient;
  opd: { lines: Charge[]; total: number; warnings: string[] };
  admissions: {
    id: string;
    admissionNumber: string;
    status: string;
    admittedAt: string;
    dischargedAt: string | null;
    lines: Charge[];
    total: number;
    warnings: string[];
  }[];
  drafts: { id: string; billNumber: string; billType: BillType; admissionId: string | null; total: number }[];
}

export interface Receipt {
  hospital: { name: string; address: string; phone: string; email: string; gstin: string; registrationNumber: string };
  patient: BillPatient;
  payment: Payment;
  amountInWords: string;
  bill: { id: string; billNumber: string; billType: BillType; total: number; amountPaid: number; balanceDue: number; status: BillStatus } | null;
  footer: string;
}

export type AgingBucket = "0_30" | "31_60" | "61_90" | "90_plus";

export interface Outstanding {
  total: number;
  buckets: Record<AgingBucket, { label: string; amount: number }>;
  rows: (BillRow & { ageDays: number; bucket: AgingBucket; bucketLabel: string })[];
}

export interface TariffItem {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  taxRate: number;
  isActive: boolean;
}
