import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as bwipjs from "bwip-js";

import { dotMm, fitModule, mmToPt, ptToMm, MIN_NARROW_BAR_MM } from "../src/shared/print/sizing";
import { code128, dataMatrix, CODE128_QUIET_MODULES } from "../src/shared/print/barcode";
import { escapeHtml, html, raw } from "../src/shared/print/escapeHtml";
import { patientPayload, specimenPayload } from "../src/shared/print/scanPayload";
import { allergyStatement, printedName, formatDob } from "../src/modules/printing/documents/common";
import { buildWristband, WRISTBAND_STOCK } from "../src/modules/printing/documents/wristband";
import { buildSpecimenLabel } from "../src/modules/printing/documents/specimenLabel";

/**
 * The printing core: sizes that stay physical, codes that scan, and a band
 * that is never blank where it matters.
 *
 * The browser gate (tools/verifyPrinting.mjs) measures a real PDF and decodes a
 * real render. These pin the arithmetic underneath it, where a regression is a
 * one-line diff rather than a label that will not scan on a ward.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const serverScanCode = path.resolve(here, "..", "..", "11-9-26-HMS-back", "src", "modules", "patient", "scanCode.js");

const anita = {
  hospitalName: "City General Hospital",
  patientId: "CGH-P000001",
  firstName: "Anita",
  lastName: "Case",
  dateOfBirth: "1970-01-01T00:00:00.000Z",
  age: "56 yr",
  gender: "female",
  recorded: true,
  allergies: [{ substance: "Sulfa", severity: "moderate" as const }],
  admission: { admissionNumber: "ADM-000001", wardName: "Medical Ward A", bedNumber: "A1" },
};

const widthOf = (svg: string) => Number(/width="([\d.]+)mm"/.exec(svg)?.[1]);

// ---- Units ----------------------------------------------------------------

test("mm and points convert exactly, as expo-print sizes a page in points", () => {
  assert.equal(mmToPt(25.4), 72);
  assert.ok(Math.abs(mmToPt(25) - 70.866) < 0.001);
  assert.ok(Math.abs(ptToMm(mmToPt(280)) - 280) < 1e-9);
});

test("the narrowest module is two dots of a 203 dpi head, and never below 0.25 mm", () => {
  const fit = fitModule({ modules: 100, quietModules: 10, availableMm: 1000, maxDots: 2 });
  assert.equal(fit.dots, 2);
  assert.ok(fit.moduleMm >= MIN_NARROW_BAR_MM);
  assert.ok(Math.abs(fit.moduleMm - 2 * dotMm(203)) < 1e-12);
});

test("a module is always a whole number of dots, the largest that fits, capped", () => {
  const roomy = fitModule({ modules: 134, quietModules: 10, availableMm: 72, maxDots: 3 });
  assert.equal(roomy.dots, 3);
  assert.ok(roomy.totalMm <= 72);
  const tight = fitModule({ modules: 143, quietModules: 10, availableMm: 47, maxDots: 3 });
  assert.equal(tight.dots, 2);
  assert.ok(tight.totalMm <= 47);
  assert.equal(Number.isInteger(tight.dots), true);
});

test("a symbol that cannot fit at the minimum module says so rather than shrinking", () => {
  const fit = fitModule({ modules: 300, quietModules: 10, availableMm: 30, maxDots: 4 });
  assert.equal(fit.fits, false);
  assert.ok(fit.moduleMm >= MIN_NARROW_BAR_MM);
});

// ---- Barcodes ---------------------------------------------------------------

test("Code 128 is drawn exactly modules × module width wide", () => {
  const sym = code128("CGH-P000001", { heightMm: 15, availableMm: 72, maxDots: 3 });
  assert.equal(sym.modules, 134);
  assert.ok(sym.moduleMm >= MIN_NARROW_BAR_MM);
  assert.ok(Math.abs(widthOf(sym.svg) - sym.modules * sym.moduleMm) < 1e-3);
  assert.ok(Math.abs(sym.quietMm - CODE128_QUIET_MODULES * sym.moduleMm) < 1e-9);
  assert.match(sym.svg, /preserveAspectRatio="none"/);
  assert.match(sym.svg, /height="15mm"/);
});

/**
 * The app reads module counts off the SVG, because `raw()` needs a canvas in
 * the browser build. Under Node `raw()` works, so it is the independent answer.
 */
test("module counts read from the SVG agree with bwip-js's own encoder", () => {
  for (const text of ["CGH-P000001", "SMP-000001", "OGH-P123456", "A1"]) {
    const [symbol] = bwipjs.raw({ bcid: "code128", text }) as unknown as { sbs: number[] }[];
    const expected = symbol.sbs.reduce((a, b) => a + b, 0);
    assert.equal(code128(text, { heightMm: 10, availableMm: 200, maxDots: 3 }).modules, expected, text);
  }
  for (const text of ["HMS1|P|CGH-P000001", "HMS1|S|SMP-000001", "HMS1|P|A-LONGER-HOSPITAL-P000123"]) {
    const [symbol] = bwipjs.raw({ bcid: "datamatrix", text }) as unknown as { pixx: number; pixy: number }[];
    assert.equal(dataMatrix(text, { availableMm: 200, maxDots: 3 }).modules, Math.max(symbol.pixx, symbol.pixy), text);
  }
});

test("DataMatrix modules are square and sized from the module count", () => {
  const sym = dataMatrix(patientPayload("CGH-P000001"), { availableMm: 22, maxDots: 4 });
  assert.ok(sym.fits);
  assert.equal(sym.widthMm, sym.heightMm);
  assert.ok(sym.moduleMm >= MIN_NARROW_BAR_MM);
  assert.ok(sym.widthMm + 2 * sym.quietMm <= 22);
});

// ---- Payload ----------------------------------------------------------------

test("the payload the label carries is the payload the server reads", async () => {
  const { parseScanCode } = (await import(pathToFileURL(serverScanCode).href)) as {
    parseScanCode: (raw: string) => { ok: boolean; kind?: string; id?: string };
  };
  assert.equal(patientPayload("CGH-P000001"), "HMS1|P|CGH-P000001");
  assert.equal(specimenPayload("smp-000123"), "HMS1|S|SMP-000123");
  assert.deepEqual(parseScanCode(patientPayload("CGH-P000001")), { ok: true, kind: "patient", id: "CGH-P000001" });
  assert.deepEqual(parseScanCode(specimenPayload("SMP-000123")), { ok: true, kind: "specimen", id: "SMP-000123" });
});

test("a label is never printed carrying something the scan endpoint will refuse", () => {
  assert.throws(() => patientPayload("CGH P1"));
  assert.throws(() => specimenPayload("<x>"));
  assert.throws(() => patientPayload(""));
});

// ---- Escaping -----------------------------------------------------------------

test("every interpolated value is escaped; only markup this code built is not", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  assert.equal(escapeHtml(null), "");
  const out = html`<p title="${'"><script>'}">${"<5 mmol/L"}${raw("<b>ok</b>")}${[html`<i>${"<"}</i>`]}</p>`.__html;
  assert.equal(out, `<p title="&quot;&gt;&lt;script&gt;">&lt;5 mmol/L<b>ok</b><i>&lt;</i></p>`);
});

// ---- Content rules ------------------------------------------------------------

test("allergy status is three statements, and none of them is blank", () => {
  assert.deepEqual(allergyStatement({ recorded: false, allergies: [] }), { state: "unrecorded", text: "Allergies not recorded" });
  assert.deepEqual(allergyStatement({ recorded: true, allergies: [] }), { state: "none", text: "No known allergies" });
  assert.equal(allergyStatement({ recorded: true, allergies: [{ substance: "Sulfa", severity: "mild" }] }).text, "ALLERGIES: Sulfa");
});

test("a long allergy list is counted, never silently cut, with the dangerous ones first", () => {
  const { text } = allergyStatement(
    {
      recorded: true,
      allergies: [
        { substance: "Latex", severity: "mild" },
        { substance: "Peanut", severity: "moderate" },
        { substance: "Penicillin", severity: "anaphylaxis" },
        { substance: "Iodinated contrast", severity: "severe" },
      ],
    },
    45,
  );
  assert.ok(text.length <= 45, text);
  assert.equal(text, "ALLERGIES: Penicillin +3 more, see record");

  // Tighter still, the most dangerous substance survives and the count stays.
  const tight = allergyStatement(
    {
      recorded: true,
      allergies: [
        { substance: "Latex", severity: "mild" },
        { substance: "Peanut", severity: "moderate" },
        { substance: "Penicillin", severity: "anaphylaxis" },
      ],
    },
    30,
  );
  assert.equal(tight.text, "ALLERGIES: Penicillin +2 more");
});

test("names print SURNAME first; an unidentified patient prints as unidentified", () => {
  assert.deepEqual(printedName("Anita", "Case"), { surname: "CASE", given: "Anita", unidentified: false, visitNumber: null });
  assert.deepEqual(printedName("Unidentified", "ED-000042"), { surname: "UNIDENTIFIED", given: "", unidentified: true, visitNumber: "ED-000042" });
  assert.equal(formatDob("1970-01-01T00:00:00.000Z"), "1 Jan 1970");
  assert.equal(formatDob(null), null);
});

// ---- Documents ---------------------------------------------------------------

test("the adult wristband is a 25 × 280 mm page with the band's safety content", () => {
  const job = buildWristband(anita);
  assert.equal(job.widthMm, WRISTBAND_STOCK.adult.widthMm);
  assert.equal(job.heightMm, WRISTBAND_STOCK.adult.lengthMm);
  assert.equal(job.printerClass, "label");
  assert.match(job.html, /@page \{ size: 25mm 280mm; margin: 0; \}/);
  assert.match(job.html, /data-allergy-band="known">ALLERGIES: Sulfa</);
  assert.match(job.html, /data-barcode="CGH-P000001"/);
  assert.match(job.html, /data-scan-payload="HMS1\|P\|CGH-P000001"/);
  assert.match(job.html, /CASE<span class="given">, Anita<\/span>/);
  assert.match(job.html, /IP ADM-000001 · Medical Ward A · Bed A1/);
});

test("the band's allergy strip is never blank, in any of the three states", () => {
  for (const [recorded, allergies, expected] of [
    [false, [], "Allergies not recorded"],
    [true, [], "No known allergies"],
  ] as const) {
    const job = buildWristband({ ...anita, recorded, allergies: [...allergies] });
    assert.ok(job.html.includes(`>${expected}</div>`), expected);
  }
});

test("the infant band is 19 × 180 mm and still fits both codes", () => {
  const job = buildWristband(anita, "infant");
  assert.equal(job.widthMm, 19);
  assert.equal(job.heightMm, 180);
  assert.match(job.html, /@page \{ size: 19mm 180mm; margin: 0; \}/);
});

test("an unidentified emergency patient prints UNIDENTIFIED with the visit number", () => {
  const job = buildWristband({ ...anita, firstName: "Unidentified", lastName: "ED-000042", dateOfBirth: null, admission: null, recorded: false, allergies: [] });
  assert.match(job.html, /data-field="name">UNIDENTIFIED</);
  assert.match(job.html, /ED visit ED-000042/);
  assert.match(job.html, /DOB not recorded/);
});

test("a hostile name cannot inject markup into the print frame", () => {
  const job = buildWristband({ ...anita, firstName: `<img src=x onerror=alert(1)>`, lastName: "Case" });
  assert.ok(!job.html.includes("<img"));
  assert.ok(job.html.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("the tube label is 50 × 25 mm, marks STAT, and carries the specimen payload", () => {
  const job = buildSpecimenLabel({
    patient: { patientId: "CGH-P000001", firstName: "Anita", lastName: "Case", dateOfBirth: "1970-01-01", age: "56 yr", gender: "female" },
    sampleId: "SMP-000001",
    orderNumber: "LAB-000001",
    testName: "Complete blood count",
    sampleType: "Whole blood",
    container: "EDTA (purple)",
    collectedAt: "2026-09-14T04:30:00.000Z",
    urgency: "stat",
  });
  assert.equal(job.widthMm, 50);
  assert.equal(job.heightMm, 25);
  assert.match(job.html, /@page \{ size: 50mm 25mm; margin: 0; \}/);
  assert.match(job.html, /data-urgency="stat">STAT</);
  assert.match(job.html, /data-scan-payload="HMS1\|S\|SMP-000001"/);
  assert.match(job.html, /data-barcode="SMP-000001"/);
  assert.match(job.html, /DOB 1 Jan 1970/);
});
