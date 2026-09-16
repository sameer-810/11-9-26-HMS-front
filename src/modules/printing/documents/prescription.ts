import { signal } from "@shared/designSystem";
import { formatDateTime } from "@shared/format";
import { html } from "@shared/print/escapeHtml";
import { pageDocument } from "@shared/print/page";
import type { PrintJob } from "@shared/print/printDocument";
import type { PrescriptionInput } from "@modules/printing/types";
import { allergyStatement, sexLabel } from "./common";

/** A5 portrait, the prescription pad size in Indian and UK practice. */
export const PRESCRIPTION_PAGE = { widthMm: 148, heightMm: 210, marginMm: 10 } as const;

/**
 * Printed prescription with prescriber registration and allergy status (paper leaves the system).
 * Cancelled lines are counted, not printed, so an outside pharmacy cannot dispense them.
 */
export function buildPrescription(input: PrescriptionInput): PrintJob {
  const { widthMm, heightMm, marginMm } = PRESCRIPTION_PAGE;
  const allergy = allergyStatement(input.patient);

  const css = `
.head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 0.5mm solid #000; padding-bottom: 2mm; }
.hospital { font-size: 5mm; font-weight: 700; }
.doc { text-align: right; font-size: 3mm; }
.doc .kind { font-size: 4.2mm; font-weight: 700; }
.block { margin-top: 3mm; font-size: 3.2mm; line-height: 1.35; }
.patient-name { font-size: 4.2mm; font-weight: 700; }
.muted { color: #333; }
.allergy { margin-top: 2mm; padding: 1.2mm 2mm; font-size: 3.3mm; font-weight: 700; }
.allergy.known { border-left: 1.6mm solid ${signal.critical.color}; background: ${signal.critical.bg}; color: ${signal.critical.text}; }
.allergy.unrecorded { border: 0.45mm solid ${signal.caution.text}; color: ${signal.caution.text}; }
.allergy.none { border: 0.2mm solid #000; font-weight: 400; }
.urgency { display: inline-block; margin-left: 2mm; padding: 0 1.2mm; font-weight: 700; border: 0.3mm solid #000; }
.urgency.stat { background: #000; color: #fff; }
.rx { font-size: 7mm; font-weight: 700; margin: 3mm 0 1mm; }
table { width: 100%; border-collapse: collapse; font-size: 3.1mm; }
th { text-align: left; font-weight: 700; border-bottom: 0.35mm solid #000; padding: 1mm 1mm; }
td { vertical-align: top; border-bottom: 0.15mm solid #999; padding: 1.4mm 1mm; }
tr { page-break-inside: avoid; }
td.num { width: 5mm; }
.med { font-weight: 700; }
.note { margin-top: 3mm; font-size: 3.1mm; }
.sign { margin-top: 14mm; display: flex; justify-content: flex-end; page-break-inside: avoid; }
.sign-box { width: 62mm; border-top: 0.3mm solid #000; padding-top: 1.2mm; font-size: 3mm; text-align: center; }
.foot { margin-top: 6mm; font-size: 2.5mm; color: #333; }
`;

  const doctor = input.prescriber;
  const registration = doctor.registrationNumber
    ? `Reg. no ${doctor.registrationNumber}`
    : "Registration number not on record";

  const rows = input.lines.map(
    (l, i) => html`<tr data-line>
  <td class="num">${i + 1}</td>
  <td><div class="med">${l.medicineName}${l.strength ? ` ${l.strength}` : ""}</div><div class="muted">${[l.form, l.route].filter(Boolean).join(" · ")}</div></td>
  <td>${l.dose || "—"}</td>
  <td>${l.frequency || "—"}</td>
  <td>${l.durationDays ? `${l.durationDays} day${l.durationDays === 1 ? "" : "s"}` : "As directed"}${l.quantity ? html`<div class="muted">Qty ${l.quantity}</div>` : ""}</td>
  <td>${l.instructions || "—"}</td>
</tr>`,
  );

  const body = html`
<div class="head">
  <div class="hospital">${input.hospitalName}</div>
  <div class="doc">
    <div class="kind">Prescription${input.urgency !== "routine" ? html`<span class="urgency ${input.urgency}">${input.urgency === "stat" ? "STAT" : "Urgent"}</span>` : ""}</div>
    <div data-field="prescriptionNumber">${input.prescriptionNumber}</div>
    <div>${formatDateTime(input.createdAt)}</div>
  </div>
</div>

<div class="block" data-field="patient">
  <div class="patient-name">${input.patient.fullName}</div>
  <div>Hosp no <strong>${input.patient.patientId}</strong> · ${input.patient.age} · ${sexLabel(input.patient.gender)}</div>
  <div class="allergy ${allergy.state}" data-allergy-band="${allergy.state}">${allergy.text}</div>
</div>

<div class="block" data-field="prescriber">
  Prescriber: <strong>Dr ${doctor.fullName}</strong>${doctor.designation ? `, ${doctor.designation}` : ""} · ${registration}
</div>

<div class="rx">&#8478;</div>
<table>
  <thead><tr><th></th><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead>
  <tbody>${rows}</tbody>
</table>

${input.cancelledLineCount > 0 ? html`<div class="note muted">${input.cancelledLineCount} line${input.cancelledLineCount === 1 ? " was" : "s were"} cancelled by the prescriber and ${input.cancelledLineCount === 1 ? "is" : "are"} not printed.</div>` : ""}
${input.notes ? html`<div class="note"><strong>Notes:</strong> ${input.notes}</div>` : ""}

<div class="sign">
  <div class="sign-box">Dr ${doctor.fullName}<br />${registration}</div>
</div>

<div class="foot">Printed ${formatDateTime(input.printedAt.toISOString())} by ${input.printedBy}. ${input.prescriptionNumber}.</div>
`.__html;

  const title = `Prescription ${input.prescriptionNumber}`;
  return {
    html: pageDocument({ title, widthMm, heightMm, css, body, documentKind: "prescription", layout: "flow", marginMm }),
    widthMm,
    heightMm,
    title,
    printerClass: "page",
  };
}
