import { signal } from "@shared/designSystem";
import { formatDateTime } from "@shared/format";
import { html } from "@shared/print/escapeHtml";
import { pageDocument } from "@shared/print/page";
import type { PrintJob } from "@shared/print/printDocument";
import { flagPresentation } from "@modules/laboratory/components/LabFlag";
import type { LabReportInput } from "@modules/printing/types";
import { sexLabel } from "./common";

export const LAB_REPORT_PAGE = { widthMm: 210, heightMm: 297, marginMm: 14 } as const;

/**
 * A laboratory report on paper; refuses unreported results (CLINICAL_SAFETY §16).
 * Values print glyph, range and the word "Critical" so they survive greyscale printing (§6, §15).
 */
export function buildLabReport(input: LabReportInput): PrintJob {
  if (!input.reportedAt) {
    throw new Error("Only a reported result can be printed");
  }
  const { widthMm, heightMm, marginMm } = LAB_REPORT_PAGE;
  const critical = input.results.filter((r) => r.isCritical);

  const css = `
.head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 0.6mm solid #000; padding-bottom: 2.5mm; }
.hospital { font-size: 6mm; font-weight: 700; }
.doc { text-align: right; font-size: 3.2mm; }
.doc .kind { font-size: 4.6mm; font-weight: 700; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 8mm; margin-top: 4mm; font-size: 3.3mm; line-height: 1.4; }
.patient-name { font-size: 4.6mm; font-weight: 700; }
.label { color: #333; }
.indication { margin-top: 4mm; padding: 2mm 3mm; background: #F2F4F7; font-size: 3.3mm; }
.critical-box { margin-top: 4mm; padding: 2mm 3mm; border: 0.5mm solid ${signal.critical.color}; border-left-width: 2mm; color: ${signal.critical.text}; font-size: 3.5mm; font-weight: 700; }
h2 { font-size: 4.4mm; margin: 6mm 0 2mm; }
table { width: 100%; border-collapse: collapse; font-size: 3.4mm; }
th { text-align: left; border-bottom: 0.4mm solid #000; padding: 1.4mm 1.5mm; }
td { border-bottom: 0.15mm solid #BBB; padding: 1.6mm 1.5mm; vertical-align: top; }
tr { page-break-inside: avoid; }
td.value { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.flag { white-space: nowrap; font-weight: 700; }
tr.abnormal td.value { text-decoration: underline; }
tr.critical td { background: ${signal.critical.bg}; color: ${signal.critical.text}; }
tr.critical td:first-child { border-left: 1.5mm solid ${signal.critical.color}; }
.range-note { font-size: 2.8mm; color: #333; }
.legend { margin-top: 2mm; font-size: 2.8mm; color: #333; }
.comment { margin-top: 4mm; font-size: 3.3mm; }
.sign { margin-top: 10mm; display: flex; gap: 12mm; font-size: 3.2mm; page-break-inside: avoid; }
.sign > div { flex: 1; border-top: 0.3mm solid #000; padding-top: 1.5mm; }
.foot { margin-top: 8mm; font-size: 2.7mm; color: #333; }
`;

  const rows = input.results.map((r) => {
    const flag = flagPresentation(r.flag);
    const cls = r.isCritical ? "critical" : r.isAbnormal ? "abnormal" : "";
    return html`<tr class="${cls}" data-result="${r.code}">
  <td>${r.name}</td>
  <td class="value">${r.valueText || "—"}</td>
  <td>${r.unit || ""}</td>
  <td class="flag">${r.flag === "normal" ? "" : `${flag.glyph} ${r.isCritical ? "Critical" : flag.label}`}</td>
  <td>${r.rangeText || (r.flag === "none" ? "No range for this patient" : "—")}${r.rangeNote ? html`<div class="range-note">${r.rangeNote}</div>` : ""}</td>
</tr>`;
  });

  const body = html`
<div class="head">
  <div class="hospital">${input.hospitalName}</div>
  <div class="doc">
    <div class="kind">Laboratory report</div>
    <div data-field="orderNumber">${input.orderNumber}</div>
    <div>Reported ${formatDateTime(input.reportedAt)}</div>
  </div>
</div>

<div class="grid">
  <div data-field="patient">
    <div class="patient-name">${input.patient.fullName}</div>
    <div>Hosp no <strong>${input.patient.patientId}</strong> · ${input.patient.age} · ${sexLabel(input.patient.gender)}</div>
  </div>
  <div>
    <div><span class="label">Test</span> <strong>${input.testName}</strong>${input.urgency !== "routine" ? ` (${input.urgency === "stat" ? "STAT" : "Urgent"})` : ""}</div>
    <div><span class="label">Sample</span> ${input.sampleType}${input.sampleId ? ` · ${input.sampleId}` : ""}</div>
  </div>
  <div><span class="label">Ordered by</span> Dr ${input.orderedBy}, ${formatDateTime(input.requestedAt)}</div>
  <div><span class="label">Collected</span> ${formatDateTime(input.sampleCollectedAt)}</div>
</div>

<div class="indication" data-field="indication"><span class="label">Clinical indication:</span> ${input.clinicalIndication || "—"}</div>

${
  critical.length
    ? html`<div class="critical-box" data-critical>Critical result: ${critical.map((r, i) => html`${i ? "; " : ""}${r.name} ${r.valueText} ${r.unit} (${flagPresentation(r.flag).glyph})`)}</div>`
    : ""
}

<h2>Results</h2>
<table>
  <thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Flag</th><th>Reference range</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="legend">L low · H high · LL critically low · HH critically high · A abnormal · ? cannot be flagged, check · – no range applies to this patient. Ranges are those for this patient's age and sex at collection.</div>

${input.labComment ? html`<div class="comment"><strong>Laboratory comment:</strong> ${input.labComment}</div>` : ""}

<div class="sign">
  <div>Performed by<br /><strong>${input.performedByName || "—"}</strong></div>
  <div>Reported by<br /><strong>${input.reportedByName || "—"}</strong> · ${formatDateTime(input.reportedAt)}</div>
</div>

<div class="foot">Printed ${formatDateTime(input.printedAt.toISOString())} by ${input.printedBy}. Reported results only.</div>
`.__html;

  const title = `Lab report ${input.orderNumber}`;
  return {
    html: pageDocument({ title, widthMm, heightMm, css, body, documentKind: "lab-report", layout: "flow", marginMm }),
    widthMm,
    heightMm,
    title,
    printerClass: "page",
  };
}
