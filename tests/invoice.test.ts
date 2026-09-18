import test from "node:test";
import assert from "node:assert/strict";

import { buildInvoice, INVOICE_PAGE, type InvoiceInput } from "../src/modules/printing/documents/invoice";
import type { Charge } from "../src/modules/billing/types";
import { formatRupees } from "../src/shared/format";

/**
 * The printed A4 invoice: figures, grouping, escaping, and nothing clinical.
 * The browser-level check lives in tools/verifyPhase13Billing.mjs.
 */
const charge = (over: Partial<Charge>): Charge => ({
  id: "l1",
  sourceKey: "k",
  category: "consultation",
  sourceType: "consultation",
  description: "Consultation — General Medicine",
  detail: "Dr Rajesh Rao",
  serviceDate: "2026-09-14",
  quantity: 1,
  unit: "visit",
  unitPrice: 500,
  amount: 500,
  taxRate: 0,
  tax: 0,
  unpriced: false,
  addedByName: "",
  ...over,
});

const base = (): InvoiceInput => ({
  hospital: {
    name: "City General Hospital",
    address: "12 MG Road, Bengaluru",
    phone: "080 1234 5678",
    email: "billing@cgh.test",
    gstin: "29ABCDE1234F1Z5",
    registrationNumber: "KA-HOSP-42",
  },
  bill: {
    billNumber: "BIL-000007",
    billType: "opd",
    status: "paid",
    patient: { id: "p1", patientId: "CGH-P000001", fullName: "Anita Case", age: "56 yr", gender: "female", mobile: "9876500001" },
    lines: [
      charge({ id: "a", category: "procedure", sourceType: "service", description: "Wound dressing", detail: "", quantity: 2, unit: "", unitPrice: 150, amount: 300, taxRate: 5, tax: 15 }),
      charge({ id: "b" }),
      charge({ id: "c", category: "laboratory", sourceType: "lab", description: "Complete blood count", detail: "LAB-000001", unit: "test", unitPrice: 350, amount: 350 }),
    ],
    discount: { status: "approved", amount: 100, reason: "Senior citizen", requestedByName: "Priya", requestedAt: null, decidedByName: "Asha", decidedAt: null, decisionNote: "" },
    subtotal: 1150,
    discountAmount: 100,
    tax: 15,
    total: 1065,
    creditNotes: [
      { id: "cn1", creditNoteNumber: "CRN-000001", amount: 300, reason: "Dressing charged twice", status: "approved", requestedByName: "Priya", requestedAt: "2026-09-14T06:00:00.000Z", decidedByName: "Asha", decidedAt: "2026-09-14T07:00:00.000Z", decisionNote: "" },
      { id: "cn2", creditNoteNumber: "CRN-000002", amount: 50, reason: "Rounding", status: "rejected", requestedByName: "Priya", requestedAt: "2026-09-14T06:00:00.000Z" },
    ],
    credited: 300,
    netTotal: 765,
    amountPaid: 1065,
    refunded: 200,
    refundDue: 100,
    balanceDue: 0,
    createdAt: "2026-09-14T05:00:00.000Z",
    finalisedAt: "2026-09-14T05:30:00.000Z",
  },
  footer: "Thank you. Keep this invoice for your records.",
  printedBy: "Priya Rao",
  printedAt: new Date("2026-09-14T08:00:00.000Z"),
});

const field = (doc: string, name: string) =>
  new RegExp(`data-field="${name}">([^<]*)<`).exec(doc)?.[1];

test("the invoice is an A4 flowing page for the page printer", () => {
  const job = buildInvoice(base());
  assert.equal(job.widthMm, INVOICE_PAGE.widthMm);
  assert.equal(job.heightMm, INVOICE_PAGE.heightMm);
  assert.equal(job.printerClass, "page");
  assert.equal(job.title, "Invoice BIL-000007");
  assert.match(job.html, /@page \{ size: 210mm 297mm; margin: 15mm; \}/);
  assert.match(job.html, /data-print-document="invoice"/);
});

test("it carries the letterhead, the bill number and the patient's identity", () => {
  const { html } = buildInvoice(base());
  assert.equal(field(html, "billNumber"), "BIL-000007");
  assert.equal(field(html, "gstin"), "GSTIN 29ABCDE1234F1Z5");
  assert.ok(html.includes("City General Hospital"));
  assert.ok(html.includes("12 MG Road, Bengaluru"));
  assert.ok(html.includes("Reg. no KA-HOSP-42"));
  assert.ok(html.includes("Anita Case"));
  assert.ok(html.includes("<strong>CGH-P000001</strong>"));
  assert.ok(html.includes("Thank you. Keep this invoice for your records."));
});

test("every figure on the bill is printed as the bill states it", () => {
  const { html } = buildInvoice(base());
  assert.equal(field(html, "subtotal"), formatRupees(1150));
  assert.equal(field(html, "discount"), `− ${formatRupees(100)}`);
  assert.equal(field(html, "tax"), formatRupees(15));
  assert.equal(field(html, "total"), formatRupees(1065));
  assert.equal(field(html, "credited"), `− ${formatRupees(300)}`);
  assert.equal(field(html, "netTotal"), formatRupees(765));
  assert.equal(field(html, "amountPaid"), formatRupees(1065));
  assert.equal(field(html, "refunded"), formatRupees(200));
  assert.equal(field(html, "refundDue"), formatRupees(100));
  assert.equal(field(html, "balanceDue"), formatRupees(0));
});

test("lines are grouped by category in a fixed order, with quantity × unit price", () => {
  const { html } = buildInvoice(base());
  const order = [...html.matchAll(/data-category="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["consultation", "laboratory", "procedure"]);
  assert.ok(html.includes(`2 × ${formatRupees(150)}`));
  assert.ok(html.includes(`1 visit × ${formatRupees(500)}`));
  assert.equal((html.match(/data-line/g) ?? []).length, 3);
  // A procedure group subtotal is its line amounts, before tax.
  assert.match(html, new RegExp(`data-category="procedure"><td colspan="4">Procedures</td><td class="r">${formatRupees(300).replace(/[.]/g, "\\.")}</td>`));
});

test("only approved credit notes are listed; nothing unapproved is counted", () => {
  const { html } = buildInvoice(base());
  assert.ok(html.includes("CRN-000001"));
  assert.ok(!html.includes("CRN-000002"));

  const input = base();
  input.bill.creditNotes.push({ ...input.bill.creditNotes[0], id: "cn3", creditNoteNumber: "CRN-000003", status: "pending" });
  assert.ok(buildInvoice(input).html.includes("waiting for approval and is not counted"));
});

test("with nothing credited, discounted or refunded, those rows are left off", () => {
  const input = base();
  Object.assign(input.bill, { discountAmount: 0, credited: 0, netTotal: 1165, refunded: 0, refundDue: 0, creditNotes: [] });
  const { html } = buildInvoice(input);
  for (const name of ["discount", "credited", "netTotal", "refunded", "refundDue"]) {
    assert.equal(field(html, name), undefined, name);
  }
  assert.equal(field(html, "balanceDue"), formatRupees(0));
});

test("a draft or cancelled bill is refused, never printed as a bill", () => {
  const draft = base();
  draft.bill.status = "draft";
  assert.throws(() => buildInvoice(draft), /Finalise the bill/);
  const cancelled = base();
  cancelled.bill.status = "cancelled";
  assert.throws(() => buildInvoice(cancelled), /cancelled/);
});

test("hostile record text cannot inject markup into the print frame", () => {
  const input = base();
  input.bill.patient.fullName = `<img src=x onerror=alert(1)>`;
  input.bill.lines[0].description = `<script>alert(1)</script>`;
  input.footer = `"><iframe>`;
  const { html } = buildInvoice(input);
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<iframe>"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("nothing clinical is printed, even if a record carries it", () => {
  const input = base();
  // Fields the invoice has no business reading, smuggled onto the objects it is given.
  Object.assign(input.bill.patient, { allergies: [{ substance: "Sulfa" }], diagnosis: "Type 2 diabetes mellitus" });
  Object.assign(input.bill, { notes: "Suspected anaemia", clinicalIndication: "Suspected anaemia" });
  const { html } = buildInvoice(input);
  // The page template's stylesheet mentions allergy bands; the printed body must not.
  const printed = html.slice(html.indexOf("<body"));
  for (const word of ["Sulfa", "diabetes", "anaemia", "llerg", "iagnos"]) {
    assert.ok(!printed.includes(word), word);
  }
});
