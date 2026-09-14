import { signal } from "@shared/designSystem";
import { html, raw } from "@shared/print/escapeHtml";
import { code128, dataMatrix } from "@shared/print/barcode";
import { pageDocument } from "@shared/print/page";
import { mm } from "@shared/print/sizing";
import { bareIdentifier, patientPayload } from "@shared/print/scanPayload";
import type { PrintJob } from "@shared/print/printDocument";
import type { WristbandInput } from "@modules/printing/types";
import { allergyStatement, formatDob, printedName, sexLabel } from "./common";

/**
 * Wristband stock, in mm, as the page is fed through the printer.
 *
 * Direct-thermal wristbands are sold by the inch: adult 1" × 11" (25.4 ×
 * 279 mm — Zebra Z-Band Direct, Brady B-Band, PDC Smart Compatible adult) and
 * infant ¾" × 7" (19 × 178 mm). The printer feeds the band lengthways, so the
 * page is band-WIDE and band-LONG, and the layout runs along it rotated.
 *
 * `claspMm` is the end the snap or adhesive tab sits over. Nothing is printed
 * there, because it is folded under or punched through.
 */
export const WRISTBAND_STOCK = {
  adult: { widthMm: 25, lengthMm: 280, claspMm: 30 },
  infant: { widthMm: 19, lengthMm: 180, claspMm: 22 },
} as const;

export type WristbandSize = keyof typeof WRISTBAND_STOCK;

/**
 * Type and spacing per stock. Font sizes are mm, not points, so they are
 * physical sizes on the band whatever the driver thinks a point is.
 */
const LAYOUT = {
  adult: {
    padMm: 1.5, gapMm: 4, identityMm: 104,
    nameMm: 4.4, nameMinMm: 3, lineMm: 2.8, idMm: 3.2, admMm: 2.6,
    bandMm: 4.6, bandFontMm: 2.8, allergyChars: 60,
    oneDAvailableMm: 72, oneDMaxDots: 3, twoDMaxDots: 4, hrMm: 2.6, hospitalMm: 1.9,
  },
  infant: {
    padMm: 1.2, gapMm: 3, identityMm: 80,
    nameMm: 3.4, nameMinMm: 2.4, lineMm: 2.2, idMm: 2.5, admMm: 2.1,
    bandMm: 3.6, bandFontMm: 2.2, allergyChars: 58,
    oneDAvailableMm: 52, oneDMaxDots: 3, twoDMaxDots: 3, hrMm: 2.1, hospitalMm: 1.6,
  },
} as const;

/**
 * A patient wristband.
 *
 * The band is a safety object, not a name tag: it is what a nurse checks the
 * drug chart against at 3am, and what a scanner reads to open the right record.
 * So the content is the identifiers two people compare (name, hospital number,
 * date of birth), the one clinical fact that must reach everyone who touches
 * the patient — allergy status, which is never left blank — and two codes:
 * Code 128 of the bare hospital number, which any scanner reads, and a
 * DataMatrix of the versioned payload, which says unambiguously that this is a
 * patient.
 */
export function buildWristband(input: WristbandInput, size: WristbandSize = "adult"): PrintJob {
  const stock = WRISTBAND_STOCK[size];
  const L = LAYOUT[size];
  const band = stock.widthMm;
  const usable = band - 2 * L.padMm;

  const name = printedName(input.firstName, input.lastName);
  const dob = formatDob(input.dateOfBirth);
  const allergy = allergyStatement(input, L.allergyChars);

  // Shrink a long name to fit rather than clip it: a clipped surname is a
  // different surname. 0.62 em is a bold capital's average advance in Arial.
  const nameText = name.given ? `${name.surname}, ${name.given}` : name.surname;
  const nameMm = Math.max(L.nameMinMm, Math.min(L.nameMm, L.identityMm / (0.62 * nameText.length)));

  const identifier = bareIdentifier(input.patientId);
  const barsHeightMm = usable - L.hrMm - L.hospitalMm - 0.4;
  const linear = code128(identifier, { heightMm: barsHeightMm, availableMm: L.oneDAvailableMm, maxDots: L.oneDMaxDots });
  const matrix = dataMatrix(patientPayload(input.patientId), { availableMm: usable, maxDots: L.twoDMaxDots });
  if (!linear.fits || !matrix.fits) {
    // Refused rather than printed small: a band whose code will not scan is
    // worse than no code, because staff learn that scanning "doesn't work".
    throw new Error("This patient's code does not fit on the band at a scannable size");
  }

  const location = name.unidentified
    ? `ED visit ${name.visitNumber}`
    : input.admission
      ? [
          `IP ${input.admission.admissionNumber}`,
          input.admission.wardName,
          input.admission.bedNumber ? `Bed ${input.admission.bedNumber}` : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

  const facts = [dob ? `DOB ${dob}` : "DOB not recorded", input.age, sexLabel(input.gender)].filter(Boolean).join(" · ");

  const css = `
.strip {
  position: absolute; top: 0; left: 0;
  width: ${mm(stock.lengthMm)}; height: ${mm(band)};
  /* The page is band-wide and band-long; the layout is laid out along the
     band and turned onto it. Rotate about the top-left corner, then shift
     right by the band width so it lands back on the page. */
  transform-origin: 0 0;
  transform: translateX(${mm(band)}) rotate(90deg);
  display: flex; align-items: center;
  padding: ${mm(L.padMm)} 0;
}
.clasp { flex: 0 0 ${mm(stock.claspMm)}; height: 100%; }
.identity {
  flex: 0 0 ${mm(L.identityMm)}; height: 100%;
  display: flex; flex-direction: column; justify-content: space-between;
  overflow: hidden;
}
.name { font-size: ${mm(nameMm)}; line-height: 1.05; font-weight: 700; white-space: nowrap; overflow: hidden; }
.name .given { font-weight: 400; }
.name.unidentified { letter-spacing: 0.04em; }
.facts { font-size: ${mm(L.lineMm)}; line-height: 1.1; white-space: nowrap; overflow: hidden; }
.hospno { font-size: ${mm(L.idMm)}; line-height: 1.1; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.location { font-size: ${mm(L.admMm)}; line-height: 1.1; white-space: nowrap; overflow: hidden; }
.allergy {
  height: ${mm(L.bandMm)}; font-size: ${mm(L.bandFontMm)}; line-height: ${mm(L.bandMm - 0.5)};
  padding: 0 ${mm(1)}; font-weight: 700; white-space: nowrap; overflow: hidden;
}
/* Three states, three forms — never only a colour. On a monochrome thermal head
   the known-allergy band prints as a solid black bar with reversed text, which
   is still unmistakable; "not recorded" is a heavy outline; "none" a hairline. */
.allergy.known { background: ${signal.critical.color}; color: ${signal.critical.onColor}; }
.allergy.unrecorded { border: ${mm(0.45)} solid ${signal.caution.text}; color: ${signal.caution.text}; line-height: ${mm(L.bandMm - 1.4)}; }
.allergy.none { border: ${mm(0.2)} solid #000000; font-weight: 400; line-height: ${mm(L.bandMm - 0.9)}; }
.code2d { flex: 0 0 auto; margin-left: ${mm(L.gapMm)}; padding: ${mm(matrix.quietMm)}; }
.code1d {
  flex: 0 0 auto; height: 100%; margin-left: ${mm(L.gapMm)};
  padding: 0 ${mm(linear.quietMm)};
  display: flex; flex-direction: column; align-items: center; justify-content: space-between;
}
.hr { font-size: ${mm(L.hrMm)}; line-height: 1; font-weight: 700; letter-spacing: 0.08em; font-variant-numeric: tabular-nums; }
.hospital { font-size: ${mm(L.hospitalMm)}; line-height: 1; white-space: nowrap; }
`;

  const body = html`
<div class="strip" data-band-size="${size}">
  <div class="clasp"></div>
  <div class="identity">
    ${
      name.unidentified
        ? html`<div class="name unidentified" data-field="name">UNIDENTIFIED</div>`
        : html`<div class="name" data-field="name">${name.surname}${name.given ? html`<span class="given">, ${name.given}</span>` : ""}</div>`
    }
    <div class="facts" data-field="facts">${facts}</div>
    <div class="hospno" data-field="patientId">Hosp no ${identifier}</div>
    ${location ? html`<div class="location" data-field="location">${location}</div>` : ""}
    <div class="allergy ${allergy.state}" data-allergy-band="${allergy.state}">${allergy.text}</div>
  </div>
  <div class="code2d" data-scan-payload="${patientPayload(input.patientId)}">${raw(matrix.svg)}</div>
  <div class="code1d">
    <div id="wristband-code128" data-barcode="${identifier}">${raw(linear.svg)}</div>
    <div class="hr">${identifier}</div>
    <div class="hospital">${input.hospitalName}</div>
  </div>
</div>`.__html;

  const title = `Wristband ${identifier}`;
  return {
    html: pageDocument({ title, widthMm: band, heightMm: stock.lengthMm, css, body, documentKind: `wristband-${size}` }),
    widthMm: band,
    heightMm: stock.lengthMm,
    title,
    printerClass: "label",
  };
}
