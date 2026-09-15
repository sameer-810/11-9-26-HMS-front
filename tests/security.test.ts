import test from "node:test";
import assert from "node:assert/strict";

import { escapeHtml, html, isSafeHtml, raw } from "../src/shared/print/escapeHtml";
import { PRINT_CSP, pageDocument } from "../src/shared/print/page";
import { buildPrescription } from "../src/modules/printing/documents/prescription";
import { buildWristband } from "../src/modules/printing/documents/wristband";
import type { PrescriptionInput } from "../src/modules/printing/types";
import { collectBreakGlassIds, isTainted } from "../src/shared/offline/mirrorPolicy";
import { belongsTo, ownerOf, sameOwner } from "../src/shared/offline/outboxOwnership";

/**
 * Client-side rules that keep one person's data from reaching the wrong place:
 * a printed document that cannot carry script, a tablet mirror that does not
 * keep emergency-access reads, and a write queue that files a nurse's vitals
 * only under that nurse.
 */

const HOSTILE = `"><img src=x onerror=alert(1)><script>alert(2)</script>'`;

// ---- Printing ----------------------------------------------------------------

test("escapeHtml escapes all five HTML-significant characters, and backtick", () => {
  assert.equal(escapeHtml(`&<>"'\``), "&amp;&lt;&gt;&quot;&#39;&#96;");
  assert.equal(escapeHtml(0), "0");
  assert.equal(escapeHtml(undefined), "");
});

test("an API value shaped like trusted markup is still escaped", () => {
  const forged = { __html: "<img src=x onerror=alert(1)>" };
  assert.equal(isSafeHtml(forged), false);
  const out = html`<td>${forged}</td>`.__html;
  assert.ok(!out.includes("<img"), out);
  // Markup this module built is still trusted, including when nested.
  assert.equal(isSafeHtml(raw("<b>")), true);
  assert.equal(html`<p>${html`<b>${"<"}</b>`}</p>`.__html, "<p><b>&lt;</b></p>");
});

test("every printed document carries a policy that forbids script and network", () => {
  assert.equal(/script-src|'unsafe-eval'|https?:/.test(PRINT_CSP), false);
  assert.match(PRINT_CSP, /default-src 'none'/);
  const doc = pageDocument({ title: HOSTILE, widthMm: 50, heightMm: 25, css: "", body: "", documentKind: HOSTILE });
  assert.ok(doc.includes(`<meta http-equiv="Content-Security-Policy" content="${PRINT_CSP}" />`));
  assert.ok(!doc.includes("<img"), "title and document kind are escaped");
  assert.ok(!doc.includes("<script>"), "title and document kind are escaped");
});

test("hostile text in every prescription field is inert, in text and attribute contexts", () => {
  const input = {
    hospitalName: HOSTILE,
    prescriptionNumber: HOSTILE,
    urgency: "stat",
    createdAt: "2026-09-14T04:30:00.000Z",
    patient: {
      fullName: HOSTILE,
      patientId: HOSTILE,
      age: HOSTILE,
      gender: "female",
      recorded: true,
      allergies: [{ substance: HOSTILE, severity: "severe" }],
    },
    prescriber: { fullName: HOSTILE, designation: HOSTILE, registrationNumber: HOSTILE },
    lines: [
      {
        medicineName: HOSTILE,
        strength: HOSTILE,
        form: HOSTILE,
        route: HOSTILE,
        dose: HOSTILE,
        frequency: HOSTILE,
        durationDays: 5,
        quantity: HOSTILE,
        instructions: { __html: "<img src=x onerror=alert(3)>" },
      },
    ],
    cancelledLineCount: 0,
    notes: HOSTILE,
    printedAt: new Date("2026-09-14T05:00:00.000Z"),
    printedBy: HOSTILE,
  } as unknown as PrescriptionInput;

  const { html: doc } = buildPrescription(input);
  assert.ok(!/<img|<script/i.test(doc), "no element can be injected");
  // The template's own `class="note"><strong>` is legitimate; what must never
  // appear is the payload's quote closing an attribute ahead of its markup.
  assert.ok(!doc.includes(HOSTILE) && !doc.includes(`"><img`) && !doc.includes(`'><`), "no attribute can be broken out of");
  assert.ok(doc.includes("&lt;script&gt;alert(2)&lt;/script&gt;"));
});

test("a hostile hospital name cannot inject markup into a wristband", () => {
  const job = buildWristband({
    hospitalName: HOSTILE,
    patientId: "CGH-P000001",
    firstName: "Anita",
    lastName: HOSTILE,
    dateOfBirth: null,
    age: "56 yr",
    gender: "female",
    recorded: true,
    allergies: [{ substance: HOSTILE, severity: "moderate" }],
    admission: { admissionNumber: HOSTILE, wardName: HOSTILE, bedNumber: HOSTILE },
  });
  assert.ok(!/<img|<script/i.test(job.html));
});

// ---- Record mirror -------------------------------------------------------------

const PATIENT = "p-restricted";
const ADMISSION = "a-restricted";

const cache = [
  { key: ["medical-record", PATIENT], data: { access: { viaBreakGlass: true }, patient: { id: PATIENT } } },
  { key: ["bedside", ADMISSION], data: { admission: { id: ADMISSION, patient: { id: PATIENT } }, observations: [] } },
  { key: ["observations", ADMISSION], data: [{ admissionId: ADMISSION }] },
  { key: ["drug-round", ADMISSION, "today"], data: { slots: [] } },
  { key: ["bedside", "a-other"], data: { admission: { id: "a-other", patient: { id: "p-other" } } } },
  { key: ["drug-round", "a-other", "today"], data: { slots: [] } },
  { key: ["my-ward-patients"], data: [{ patient: { id: PATIENT } }] },
];

test("a break-the-glass read taints the patient and their admissions, not the ward", () => {
  const tainted = collectBreakGlassIds(cache, new Set());
  assert.deepEqual([...tainted].sort(), [ADMISSION, PATIENT].sort());

  const kept = cache.filter((e) => !isTainted(e, tainted)).map((e) => e.key.join("/"));
  assert.deepEqual(kept, ["bedside/a-other", "drug-round/a-other/today", "my-ward-patients"]);
});

test("the taint outlives the emergency read leaving the cache, and nothing is tainted without one", () => {
  const tainted = collectBreakGlassIds(cache, new Set());
  collectBreakGlassIds(cache.slice(2), tainted);
  assert.ok(isTainted({ key: ["nursing-notes", ADMISSION], data: [] }, tainted));

  const quiet = collectBreakGlassIds(cache.slice(1), new Set());
  assert.equal(quiet.size, 0);
  assert.ok(!isTainted(cache[1], quiet));
});

// ---- Outbox ----------------------------------------------------------------------

test("a queued op is filed only under the user and hospital that charted it", () => {
  const nurseA = ownerOf({ id: "u-a", hospitalId: "h-1" });
  const nurseB = ownerOf({ id: "u-b", hospitalId: "h-1" });
  const sameIdOtherTenant = ownerOf({ id: "u-a", hospitalId: "h-2" });
  const op = { userId: "u-a", hospitalId: "h-1" };

  assert.equal(belongsTo(op, nurseA), true);
  assert.equal(belongsTo(op, nurseB), false);
  assert.equal(belongsTo(op, sameIdOtherTenant), false);
  assert.equal(belongsTo(op, null), false, "signed out: nobody's ops drain");
  assert.equal(belongsTo({ userId: "", hospitalId: "h-1" }, ownerOf({ id: "", hospitalId: "h-1" })), false);
});

test("ops queued before the hospital was recorded still reach their own user", () => {
  assert.equal(belongsTo({ userId: "u-a" }, ownerOf({ id: "u-a", hospitalId: "h-1" })), true);
  assert.equal(belongsTo({ userId: "u-a" }, ownerOf({ id: "u-b", hospitalId: "h-1" })), false);
});

test("a drain notices when the signed-in owner changes under it", () => {
  const a = ownerOf({ id: "u-a", hospitalId: "h-1" });
  assert.equal(sameOwner(a, ownerOf({ id: "u-a", hospitalId: "h-1" })), true);
  assert.equal(sameOwner(a, ownerOf({ id: "u-b", hospitalId: "h-1" })), false);
  assert.equal(sameOwner(a, null), false);
  assert.equal(ownerOf(null), null);
  assert.equal(ownerOf({ id: "u-a", hospitalId: null }), null);
});
