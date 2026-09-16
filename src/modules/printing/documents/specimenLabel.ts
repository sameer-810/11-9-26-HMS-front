import { formatDateTime } from "@shared/format";
import { html, raw } from "@shared/print/escapeHtml";
import { code128, dataMatrix } from "@shared/print/barcode";
import { pageDocument } from "@shared/print/page";
import { mm } from "@shared/print/sizing";
import { bareIdentifier, specimenPayload } from "@shared/print/scanPayload";
import type { PrintJob } from "@shared/print/printDocument";
import type { SpecimenLabelInput } from "@modules/printing/types";
import { formatDob, printedName } from "./common";

/** Standard 2" × 1" thermal tube label; wraps a 13 mm tube without covering the fill line. */
export const SPECIMEN_LABEL = { widthMm: 50, heightMm: 25 } as const;

/**
 * Specimen tube label, printed only at collection (pre-printed labels cause mislabelling).
 * Code 128 holds the bare sample number for analysers; DataMatrix holds `HMS1|S|…`.
 */
export function buildSpecimenLabel(input: SpecimenLabelInput): PrintJob {
  const { widthMm, heightMm } = SPECIMEN_LABEL;
  const pad = 1.5;
  const topMm = 11.4;
  const usableWidth = widthMm - 2 * pad;

  const identifier = bareIdentifier(input.sampleId);
  // DataMatrix up to 4 dots/module so phone cameras read it; Code 128 stays at 3 to fit the width.
  const matrix = dataMatrix(specimenPayload(input.sampleId), {
    availableMm: topMm,
    maxDots: 4,
  });
  const barsHeightMm = heightMm - 2 * pad - topMm - 0.6 - 2.5;
  const linear = code128(identifier, {
    heightMm: barsHeightMm,
    availableMm: usableWidth,
    maxDots: 3,
  });
  if (!linear.fits || !matrix.fits) {
    throw new Error(
      "This sample number does not fit on the label at a scannable size",
    );
  }

  const name = printedName(input.patient.firstName, input.patient.lastName);
  const dob = formatDob(input.patient.dateOfBirth);
  const nameText = name.unidentified
    ? `UNIDENTIFIED ${name.visitNumber}`
    : name.given
      ? `${name.surname}, ${name.given}`
      : name.surname;
  const textWidth = usableWidth - matrix.widthMm - 1;
  const nameMm = Math.max(
    2.1,
    Math.min(2.9, textWidth / (0.6 * nameText.length)),
  );

  const css = `
.label { position: absolute; inset: ${mm(pad)}; display: flex; flex-direction: column; }
.top { height: ${mm(topMm)}; display: flex; gap: ${mm(1)}; }
.text { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
.name { font-size: ${mm(nameMm)}; line-height: 1.1; font-weight: 700; white-space: nowrap; overflow: hidden; }
.ids { font-size: ${mm(2.25)}; line-height: 1.1; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
.test { font-size: ${mm(2.2)}; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.collected { font-size: ${mm(2)}; line-height: 1.1; white-space: nowrap; }
/* STAT is a reversed block, URGENT an outline: distinct in shape, not only in
   weight, and both survive a monochrome head. */
.urgency { font-weight: 700; padding: 0 ${mm(0.6)}; margin-right: ${mm(0.6)}; }
.urgency.stat { background: #000000; color: #FFFFFF; }
.urgency.urgent { border: ${mm(0.25)} solid #000000; }
.code2d { flex: 0 0 auto; align-self: flex-start; }
.bottom { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-top: ${mm(0.6)}; }
.hr { font-size: ${mm(2.2)}; line-height: 1; font-weight: 700; letter-spacing: 0.08em; font-variant-numeric: tabular-nums; margin-top: ${mm(0.3)}; }
`;

  const urgency =
    input.urgency === "stat"
      ? html`<span class="urgency stat" data-urgency="stat">STAT</span>`
      : input.urgency === "urgent"
        ? html`<span class="urgency urgent" data-urgency="urgent">URGENT</span>`
        : "";

  const body = html` <div class="label">
    <div class="top">
      <div class="text">
        <div class="name" data-field="name">${nameText}</div>
        <div class="ids" data-field="patientId">
          ${input.patient.patientId} · ${dob ? `DOB ${dob}` : input.patient.age}
        </div>
        <div class="test" data-field="test">
          ${urgency}${input.testName}${input.container ? ` · ${input.container}` : ""}
        </div>
        <div class="collected">
          Collected ${formatDateTime(input.collectedAt)}
        </div>
      </div>
      <div
        class="code2d"
        data-scan-payload="${specimenPayload(input.sampleId)}"
      >
        ${raw(matrix.svg)}
      </div>
    </div>
    <div class="bottom">
      <div id="specimen-code128" data-barcode="${identifier}">
        ${raw(linear.svg)}
      </div>
      <div class="hr">${identifier}</div>
    </div>
  </div>`.__html;

  const title = `Specimen ${identifier}`;
  return {
    html: pageDocument({
      title,
      widthMm,
      heightMm,
      css,
      body,
      documentKind: "specimen-label",
    }),
    widthMm,
    heightMm,
    title,
    printerClass: "label",
  };
}
