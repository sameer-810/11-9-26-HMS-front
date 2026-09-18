import { formatDateTime, formatRupees, shortDate } from "@shared/format";
import { html } from "@shared/print/escapeHtml";
import { pageDocument } from "@shared/print/page";
import type { PrintJob } from "@shared/print/printDocument";
import {
  CATEGORY_LABELS,
  type Bill,
  type ChargeCategory,
} from "@modules/billing/types";
import { sexLabel } from "./common";

/** A4 portrait: the invoice goes to the patient, their insurer or employer. */
export const INVOICE_PAGE = { widthMm: 210, heightMm: 297, marginMm: 15 } as const;

const CATEGORY_ORDER: ChargeCategory[] = ["consultation", "room", "laboratory", "pharmacy", "procedure"];

export interface InvoiceInput {
  hospital: {
    name: string;
    /** One line, already joined. */
    address: string;
    phone: string;
    email: string;
    gstin: string;
    registrationNumber: string;
  };
  bill: Pick<
    Bill,
    | "billNumber"
    | "billType"
    | "status"
    | "patient"
    | "lines"
    | "discount"
    | "subtotal"
    | "discountAmount"
    | "tax"
    | "total"
    | "creditNotes"
    | "credited"
    | "netTotal"
    | "amountPaid"
    | "refunded"
    | "refundDue"
    | "balanceDue"
    | "createdAt"
    | "finalisedAt"
  >;
  /** The receipt footer from billing settings. */
  footer: string;
  printedBy: string;
  printedAt: Date;
}

/**
 * The finalised bill on paper: identity and charges only, never the clinical reason behind them.
 * Drafts and cancelled bills are refused rather than watermarked, as a draft's charges can still change.
 */
export function buildInvoice(input: InvoiceInput): PrintJob {
  const { bill, hospital } = input;
  if (bill.status === "draft") {
    throw new Error("A draft can still change, so it has no invoice yet. Finalise the bill to print one.");
  }
  if (bill.status === "cancelled") {
    throw new Error("A cancelled draft has no invoice.");
  }
  const { widthMm, heightMm, marginMm } = INVOICE_PAGE;

  const css = `
.head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 0.5mm solid #000; padding-bottom: 2mm; gap: 6mm; }
.hospital { font-size: 6mm; font-weight: 700; }
.letterhead { font-size: 3mm; line-height: 1.4; color: #222; }
.doc { text-align: right; font-size: 3.2mm; line-height: 1.4; white-space: nowrap; }
.doc .kind { font-size: 5.5mm; font-weight: 700; }
.block { margin-top: 4mm; font-size: 3.5mm; line-height: 1.4; }
.patient-name { font-size: 4.4mm; font-weight: 700; }
.muted { color: #333; }
table { width: 100%; border-collapse: collapse; font-size: 3.2mm; margin-top: 4mm; }
th { text-align: left; font-weight: 700; border-bottom: 0.35mm solid #000; padding: 1mm; }
td { vertical-align: top; border-bottom: 0.15mm solid #bbb; padding: 1.2mm 1mm; }
tr { page-break-inside: avoid; }
.r { text-align: right; white-space: nowrap; }
tr.group td { font-weight: 700; border-bottom: 0.25mm solid #000; padding-top: 3mm; }
.totals { margin: 4mm 0 0 auto; width: 90mm; font-size: 3.4mm; border-collapse: collapse; page-break-inside: avoid; }
.totals td { border: none; padding: 0.8mm 1mm; }
.totals tr.strong td { font-weight: 700; border-top: 0.3mm solid #000; }
.credits { margin-top: 4mm; font-size: 3.1mm; page-break-inside: avoid; }
.foot { margin-top: 8mm; font-size: 2.8mm; color: #333; line-height: 1.4; }
`;

  const p = bill.patient;
  const groups = CATEGORY_ORDER.filter((c) => bill.lines.some((l) => l.category === c)).map((category) => {
    const lines = bill.lines.filter((l) => l.category === category);
    const subtotal = lines.reduce((n, l) => n + l.amount, 0);
    return html`<tr class="group" data-category="${category}"><td colspan="4">${CATEGORY_LABELS[category]}</td><td class="r">${formatRupees(subtotal)}</td></tr>
${lines.map(
  (l) => html`<tr data-line>
  <td><div>${l.description}</div>${l.detail || l.serviceDate ? html`<div class="muted">${[l.detail, l.serviceDate ? shortDate(l.serviceDate) : ""].filter(Boolean).join(" · ")}</div>` : ""}</td>
  <td class="r">${l.quantity}${l.unit ? ` ${l.unit}` : ""} × ${formatRupees(l.unitPrice)}</td>
  <td class="r">${l.tax ? `${l.taxRate}%` : "—"}</td>
  <td class="r">${l.tax ? formatRupees(l.tax) : "—"}</td>
  <td class="r">${formatRupees(l.amount)}</td>
</tr>`,
)}`;
  });

  const approved = bill.creditNotes.filter((c) => c.status === "approved");
  const waiting = bill.creditNotes.some((c) => c.status === "pending");
  const row = (label: string, value: string, field: string, strong = false) =>
    html`<tr${strong ? html` class="strong"` : ""}><td>${label}</td><td class="r" data-field="${field}">${value}</td></tr>`;

  const body = html`
<div class="head">
  <div>
    <div class="hospital">${hospital.name}</div>
    <div class="letterhead">
      ${hospital.address ? html`<div>${hospital.address}</div>` : ""}
      ${hospital.phone || hospital.email ? html`<div>${[hospital.phone, hospital.email].filter(Boolean).join(" · ")}</div>` : ""}
      ${hospital.gstin ? html`<div data-field="gstin">GSTIN ${hospital.gstin}</div>` : ""}
      ${hospital.registrationNumber ? html`<div>Reg. no ${hospital.registrationNumber}</div>` : ""}
    </div>
  </div>
  <div class="doc">
    <div class="kind">Invoice</div>
    <div data-field="billNumber">${bill.billNumber}</div>
    <div>${bill.billType === "ipd" ? "Inpatient" : "Outpatient"}</div>
    <div>Bill date ${formatDateTime(bill.finalisedAt)}</div>
    <div class="muted">Generated ${formatDateTime(bill.createdAt)}</div>
  </div>
</div>

<div class="block" data-field="patient">
  <div class="patient-name">${p.fullName}</div>
  <div>Hosp no <strong>${p.patientId}</strong>${p.age ? ` · ${p.age}` : ""} · ${sexLabel(p.gender)}${p.mobile ? ` · ${p.mobile}` : ""}</div>
</div>

<table>
  <thead><tr><th>Charge</th><th class="r">Qty × unit price</th><th class="r">Tax rate</th><th class="r">Tax</th><th class="r">Amount</th></tr></thead>
  <tbody>${groups}</tbody>
</table>

<table class="totals">
  ${row("Subtotal", formatRupees(bill.subtotal), "subtotal")}
  ${bill.discountAmount > 0 ? row("Discount", `− ${formatRupees(bill.discountAmount)}`, "discount") : ""}
  ${row("Tax", formatRupees(bill.tax), "tax")}
  ${row("Total", formatRupees(bill.total), "total", true)}
  ${bill.credited > 0 ? row("Credit notes", `− ${formatRupees(bill.credited)}`, "credited") : ""}
  ${bill.credited > 0 ? row("Net total", formatRupees(bill.netTotal), "netTotal", true) : ""}
  ${row("Paid", formatRupees(bill.amountPaid), "amountPaid")}
  ${bill.refunded > 0 ? row("Refunded", formatRupees(bill.refunded), "refunded") : ""}
  ${bill.refundDue > 0 ? row("Refund due", formatRupees(bill.refundDue), "refundDue") : ""}
  ${row("Balance due", formatRupees(bill.balanceDue), "balanceDue", true)}
</table>

${approved.length ? html`<div class="credits" data-field="creditNotes">
  <strong>Credit notes</strong>
  ${approved.map((c) => html`<div>${c.creditNoteNumber} · ${formatRupees(c.amount)} · approved ${formatDateTime(c.decidedAt)}</div>`)}
</div>` : ""}
${waiting ? html`<div class="credits muted">A credit note on this bill is waiting for approval and is not counted above.</div>` : ""}

<div class="foot">
  ${input.footer ? html`<div data-field="footer">${input.footer}</div>` : ""}
  <div>Printed ${formatDateTime(input.printedAt.toISOString())} by ${input.printedBy}. ${bill.billNumber}.</div>
</div>
`.__html;

  const title = `Invoice ${bill.billNumber}`;
  return {
    html: pageDocument({ title, widthMm, heightMm, css, body, documentKind: "invoice", layout: "flow", marginMm }),
    widthMm,
    heightMm,
    title,
    printerClass: "page",
  };
}
