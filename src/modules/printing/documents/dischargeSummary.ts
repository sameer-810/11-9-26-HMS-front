import { formatDateTime } from "@shared/format";
import { html } from "@shared/print/escapeHtml";
import { pageDocument } from "@shared/print/page";
import type { PrintJob } from "@shared/print/printDocument";
import type { PrintAllergies } from "@modules/printing/types";
import { allergyStatement, sexLabel } from "./common";

/** A4 portrait: the discharge summary goes home with the patient and on to their GP. */
export const DISCHARGE_SUMMARY_PAGE = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 15,
} as const;

export interface DischargeSummaryInput {
  hospitalName: string;
  admissionNumber: string;
  patient: PrintAllergies & {
    patientId: string;
    fullName: string;
    age: string;
    gender: string;
  };
  admittedAt: string;
  dischargedAt: string | null;
  dischargedBy: string;
  doctorName: string;
  wardName: string;
  bedNumber: string;
  reason: string;
  dischargeType: string;
  dischargeDiagnosis: string;
  dischargeSummary: string;
  dischargeMedication: string;
  followUpInstructions: string;
  printedBy: string;
  printedAt: Date;
}

/** The recorded discharge summary, printed as it was signed off. Nothing here is editable. */
export function buildDischargeSummary(input: DischargeSummaryInput): PrintJob {
  const { widthMm, heightMm, marginMm } = DISCHARGE_SUMMARY_PAGE;
  const allergy = allergyStatement(input.patient);

  const css = `
.head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 0.5mm solid #000; padding-bottom: 2mm; }
.hospital { font-size: 6mm; font-weight: 700; }
.doc { text-align: right; font-size: 3.2mm; }
.doc .kind { font-size: 5mm; font-weight: 700; }
.block { margin-top: 4mm; font-size: 3.6mm; line-height: 1.4; }
.patient-name { font-size: 4.8mm; font-weight: 700; }
.allergy { margin-top: 2mm; padding: 1.4mm 2mm; font-size: 3.6mm; font-weight: 700; }
.allergy.known { border-left: 1.6mm solid #000; }
.allergy.unrecorded { border: 0.45mm solid #000; }
.allergy.none { border: 0.2mm solid #000; font-weight: 400; }
.grid { display: grid; grid-template-columns: 38mm 1fr; gap: 1.2mm 4mm; }
.label { color: #333; }
h2 { font-size: 4.2mm; margin: 6mm 0 1.5mm; border-bottom: 0.2mm solid #999; padding-bottom: 1mm; }
.text { font-size: 3.6mm; line-height: 1.45; white-space: pre-wrap; page-break-inside: avoid; }
.foot { margin-top: 10mm; font-size: 2.8mm; color: #333; }
`;

  const section = (title: string, text: string) =>
    html`<h2>${title}</h2>
      <div class="text">${text || "Not recorded"}</div>`;

  const body = html`
    <div class="head">
      <div class="hospital">${input.hospitalName}</div>
      <div class="doc">
        <div class="kind">Discharge summary</div>
        <div data-field="admissionNumber">${input.admissionNumber}</div>
      </div>
    </div>

    <div class="block" data-field="patient">
      <div class="patient-name">${input.patient.fullName}</div>
      <div>
        Hosp no <strong>${input.patient.patientId}</strong> ·
        ${input.patient.age} · ${sexLabel(input.patient.gender)}
      </div>
      <div class="allergy ${allergy.state}">${allergy.text}</div>
    </div>

    <div class="block grid">
      <div class="label">Admitted</div>
      <div>${formatDateTime(input.admittedAt)}${input.wardName ? ` · ${input.wardName}` : ""}${input.bedNumber ? `, bed ${input.bedNumber}` : ""}</div>
      <div class="label">Discharged</div>
      <div>${formatDateTime(input.dischargedAt)}${input.dischargedBy ? ` by ${input.dischargedBy}` : ""}</div>
      <div class="label">Type of discharge</div>
      <div>${input.dischargeType}</div>
      <div class="label">Consultant</div>
      <div>${input.doctorName ? `Dr ${input.doctorName}` : "Not recorded"}</div>
      <div class="label">Reason for admission</div>
      <div>${input.reason || "Not recorded"}</div>
      <div class="label">Diagnosis</div>
      <div>${input.dischargeDiagnosis || "Not recorded"}</div>
    </div>

    ${section("Summary", input.dischargeSummary)}
    ${section("Medication to take home", input.dischargeMedication)}
    ${section("Follow-up", input.followUpInstructions)}

    <div class="foot">
      Printed ${formatDateTime(input.printedAt.toISOString())} by
      ${input.printedBy}. ${input.admissionNumber}.
    </div>
  `.__html;

  const title = `Discharge summary ${input.admissionNumber}`;
  return {
    html: pageDocument({
      title,
      widthMm,
      heightMm,
      css,
      body,
      documentKind: "discharge-summary",
      layout: "flow",
      marginMm,
    }),
    widthMm,
    heightMm,
    title,
    printerClass: "page",
  };
}
