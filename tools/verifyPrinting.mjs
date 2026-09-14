/**
 * Phase 9 gate — a wristband prints at the exact physical size and scans back
 * to the right patient.
 *
 * What only a browser shows:
 *  - the wristband the patient page prints is a 25 × 280 mm page, measured off
 *    the PDF Chromium renders from it, with the allergy strip on it;
 *  - its barcode, rendered and photographed, decodes to the hospital number —
 *    and its 2D code to the versioned payload;
 *  - that code, typed by a keyboard-wedge scanner into the scan screen, opens
 *    that patient's record, and another patient's code opens the other one;
 *  - the tube label is 50 × 25 mm and its payload opens the right lab order;
 *  - the prescription and the lab report are of the right patient.
 *
 * The app is told not to send jobs to a printer: `page.addInitScript` sets
 * `__HMS_TEST_PRINT__`, and `printDocument` then records the job on
 * `window.__hmsLastPrint` instead of opening a print dialog headless Chromium
 * does not have.
 *
 *   node tools/verifyPrinting.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(here, "..");
const BACK = path.resolve(FRONT, "..", "11-9-26-HMS-back");
const DIST = path.join(FRONT, "dist");
const SHOTS = path.join(FRONT, "docs", "shots");

// The decoder is served from node_modules rather than taken from the app
// bundle: the gate must decode what was printed with a reader that shares no
// code with the thing that printed it.
const ZXING = {
  "/__zxing/library.js": path.join(FRONT, "node_modules", "@zxing", "library", "umd", "index.min.js"),
  "/__zxing/browser.js": path.join(FRONT, "node_modules", "@zxing", "browser", "umd", "zxing-browser.min.js"),
};

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".svg": "image/svg+xml",
};
const imp = (...segs) => import(pathToFileURL(path.join(...segs)).href);

const failures = [];
const check = (ok, label, extra = "") => {
  if (ok) console.log(`  ok    ${label}`);
  else {
    console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ""}`);
    failures.push(label);
  }
};

if (!fs.existsSync(DIST)) {
  console.error("No dist/. Run `npm run build:web` first.");
  process.exit(1);
}
fs.mkdirSync(SHOTS, { recursive: true });

console.log("\nStarting the API…");
const { MongoMemoryReplSet } = await imp(BACK, "node_modules", "mongodb-memory-server", "index.js");
const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
const mongoUri = replSet.getUri();

const API_PORT = 5204;
const secrets = {
  JWT_ACCESS_SECRET: "verify-access-secret-not-real",
  JWT_REFRESH_SECRET: "verify-refresh-secret-not-real",
  JWT_ADMIN_SECRET: "verify-admin-secret-not-real",
};
const api = spawn(process.execPath, ["server.js"], {
  cwd: BACK,
  env: { ...process.env, ...secrets, NODE_ENV: "test", PORT: String(API_PORT), MONGODB_URI: mongoUri, BCRYPT_ROUNDS: "4", CORS_ORIGIN: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let apiLog = "";
api.stdout.on("data", (d) => (apiLog += d));
api.stderr.on("data", (d) => (apiLog += d));
const API = `http://127.0.0.1:${API_PORT}`;
for (let waited = 0; ; waited += 300) {
  try {
    if ((await fetch(`${API}/health`)).ok) break;
  } catch { /* not up */ }
  if (waited > 40_000) throw new Error(`API did not start.\n${apiLog}`);
  await new Promise((r) => setTimeout(r, 300));
}
console.log(`API ready on ${API}`);

process.env.MONGODB_URI = mongoUri;
Object.assign(process.env, secrets);
process.env.BCRYPT_ROUNDS = "4";

const mongoose = (await imp(BACK, "node_modules", "mongoose", "index.js")).default;
await mongoose.connect(mongoUri);
const { HospitalModel } = await imp(BACK, "src", "modules", "hospital", "hospital.model.js");
const { UserModel, hashPassword } = await imp(BACK, "src", "modules", "user", "user.model.js");
const { defaultPermissionsFor, ROLES } = await imp(BACK, "src", "config", "roles.js");

const hospital = await HospitalModel.create({
  name: "City General Hospital", code: "CGH", approvalStatus: "approved", approvedAt: new Date(), isActive: true,
  timezone: "Asia/Kolkata", address: { line1: "12 MG Road", city: "Bengaluru" },
});
await UserModel.create({
  hospitalId: hospital._id, employeeId: "ADM001", firstName: "Asha", lastName: "Menon", email: "admin@cgh.test",
  passwordHash: await hashPassword("AdminPassword123"), role: ROLES.ADMIN, permissions: defaultPermissionsFor(ROLES.ADMIN),
  isActive: true, mustChangePassword: false,
});

const req = (method, p, body, token) =>
  fetch(`${API}/api/v1${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then((r) => r.json());

const adminToken = (await req("POST", "/auth/login", { email: "admin@cgh.test", password: "AdminPassword123", deviceId: "verify-admin", deviceName: "Verifier" })).data.accessToken;
const dept = await req("POST", "/departments", { name: "General Medicine", code: "MED" }, adminToken);

async function provision({ employeeId, firstName, email, role, departmentId }) {
  const created = await req("POST", "/users", { employeeId, firstName, lastName: "Rao", email, role, departmentId }, adminToken);
  const temp = created.data.temporaryPassword;
  const first = await req("POST", "/auth/login", { email, password: temp, deviceId: `${employeeId}-device`, deviceName: "Verifier" });
  const password = `${firstName}Password123`;
  await req("POST", "/auth/change-password", { currentPassword: temp, newPassword: password, deviceId: `${employeeId}-device` }, first.data.accessToken);
  const live = await req("POST", "/auth/login", { email, password, deviceId: `${employeeId}-device` });
  return { id: created.data.user.id, email, password, token: live.data.accessToken };
}

const doctor = await provision({ employeeId: "DOC001", firstName: "Rajesh", email: "rajesh@cgh.test", role: "doctor", departmentId: dept.data.id });
const nurse = await provision({ employeeId: "NUR001", firstName: "Lakshmi", email: "lakshmi@cgh.test", role: "nurse" });
const lab = await provision({ employeeId: "LAB001", firstName: "Sunita", email: "sunita@cgh.test", role: "lab" });
const pharmacist = await provision({ employeeId: "PHA001", firstName: "Imran", email: "imran@cgh.test", role: "pharmacy" });
const store = await provision({ employeeId: "INV001", firstName: "Kavya", email: "kavya@cgh.test", role: "inventory" });
const reception = await provision({ employeeId: "REC001", firstName: "Deepak", email: "deepak@cgh.test", role: "receptionist" });

// ---- Anita: a sulfa allergy, admitted, a collected blood sample, a prescription
const anita = (await req("POST", "/patients", { firstName: "Anita", lastName: "Case", gender: "female", dateOfBirth: "1970-01-01", mobile: "9876500001" }, reception.token)).data;
await req("PUT", `/patients/${anita.id}/allergies`, { allergies: [{ substance: "Sulfa", severity: "moderate", reaction: "Rash", category: "drug" }] }, doctor.token);
// ---- Mohan: allergies never asked, and a reported blood test
const mohan = (await req("POST", "/patients", { firstName: "Mohan", lastName: "Das", gender: "male", dateOfBirth: "1966-03-02", mobile: "9876500002" }, reception.token)).data;

const ward = await req("POST", "/beds/wards", { name: "Medical Ward A", code: "MWA", type: "general", departmentId: dept.data.id }, adminToken);
const room = await req("POST", "/beds/rooms", { wardId: ward.data.id, number: "101", type: "general" }, adminToken);
await req("POST", "/beds/bulk", { roomId: room.data.id, prefix: "A", from: 1, to: 2 }, adminToken);
const beds = (await req("GET", `/beds?wardId=${ward.data.id}&limit=20`, null, adminToken)).data;
const bedA1 = beds.find((b) => b.number === "A1");
const admission = (await req("POST", "/admissions", { patientId: anita.id, bedId: bedA1.id, reason: "Community acquired pneumonia" }, doctor.token)).data;

await req("POST", "/laboratory/tests/load-standard", null, adminToken);
const cbcTest = (await req("GET", "/laboratory/tests?search=blood", null, doctor.token)).data.find((t) => t.code === "CBC");
const anitaCbc = (await req("POST", "/laboratory/orders", { patientId: anita.id, testIds: [cbcTest.id], clinicalIndication: "Fever with raised respiratory rate", urgency: "stat" }, doctor.token)).data.orders[0];
const collected = (await req("POST", `/laboratory/orders/${anitaCbc.id}/stage`, { to: "sample_collected" }, lab.token)).data;

const mohanCbc = (await req("POST", "/laboratory/orders", { patientId: mohan.id, testIds: [cbcTest.id], clinicalIndication: "Suspected anaemia", urgency: "routine" }, doctor.token)).data.orders[0];
for (const to of ["sample_collected", "in_progress"]) await req("POST", `/laboratory/orders/${mohanCbc.id}/stage`, { to }, lab.token);
await req("PUT", `/laboratory/orders/${mohanCbc.id}/results`, { values: { HB: "8.1", WBC: "7.0", PLT: "250", HCT: "30" } }, lab.token);
for (const to of ["completed", "reported"]) await req("POST", `/laboratory/orders/${mohanCbc.id}/stage`, { to }, lab.token);

const glycomet = (await req("POST", "/prescriptions/medicines", { name: "Glycomet", genericName: "metformin", ingredients: ["metformin"], form: "tablet", strength: "500mg" }, adminToken)).data.id;
const glycometItem = (await req("POST", "/inventory/items", { code: "METF500", name: "METF500", medicineId: glycomet, unit: "tablet" }, store.token)).data.id;
const supplier = (await req("POST", "/inventory/suppliers", { name: "MedLine" }, store.token)).data.id;
await req("POST", "/inventory/receipts", {
  location: "pharmacy", supplierId: supplier, invoiceNumber: "INV-1",
  lines: [{ itemId: glycometItem, batchNumber: "M1", expiry: "12/2030", quantity: 100 }],
}, pharmacist.token);
const rx = (await req("POST", "/prescriptions", {
  patientId: anita.id,
  lines: [{ medicineId: glycomet, dose: "1 tab", frequency: "1-0-1", durationDays: 5, instructions: "After food" }],
}, doctor.token)).data.prescription;

console.log(`Seeded: ${anita.patientId} (sulfa, admitted ${admission.admissionNumber}, sample ${collected.sampleId}, ${rx.prescriptionNumber}) and ${mohan.patientId} (reported ${mohanCbc.orderNumber})\n`);

// ---------------------------------------------------------------------------
const web = http.createServer((rq, rs) => {
  const url = decodeURIComponent((rq.url || "/").split("?")[0]);
  if (url === "/__zxing/decode.html") {
    rs.writeHead(200, { "Content-Type": "text/html" });
    rs.end('<!doctype html><html><body><script src="/__zxing/library.js"></script><script src="/__zxing/browser.js"></script></body></html>');
    return;
  }
  if (ZXING[url]) {
    rs.writeHead(200, { "Content-Type": "text/javascript" });
    fs.createReadStream(ZXING[url]).pipe(rs);
    return;
  }
  let file = path.join(DIST, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  rs.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(file).pipe(rs);
});
await new Promise((r) => web.listen(0, "127.0.0.1", r));
const WEB = `http://127.0.0.1:${web.address().port}`;

const browser = await chromium.launch();
const consoleErrors = [];
const httpFailures = [];

async function newPage() {
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  // The documented test hook: record print jobs instead of printing them.
  await ctx2.addInitScript(() => { globalThis.__HMS_TEST_PRINT__ = true; });
  const p = await ctx2.newPage();
  p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  p.on("pageerror", (e) => consoleErrors.push(String(e)));
  p.on("response", (r) => { if (r.status() >= 400) httpFailures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
  // The live-update socket is not under test here. Blocked, so the gate never
  // reaches whatever else happens to listen on the dev port baked into the build.
  await p.route("**/socket.io/**", (route) => route.abort());
  await p.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${API}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  return p;
}
const signIn = async (p, email, password) => {
  await p.goto(WEB, { waitUntil: "networkidle" });
  await p.waitForTimeout(1300);
  await p.getByTestId("login-email").fill(email);
  await p.getByTestId("login-password").fill(password);
  await p.getByTestId("login-submit").click();
  await p.waitForTimeout(2400);
};
const body = (p) => p.innerText("body");

/** Presses a print button and returns the job the app would have printed. */
async function printJob(p, testId) {
  await p.evaluate(() => { window.__hmsLastPrint = undefined; });
  await p.getByTestId(testId).click();
  await p.waitForFunction(() => Boolean(window.__hmsLastPrint), null, { timeout: 8000 });
  return p.evaluate(() => window.__hmsLastPrint);
}

const PT_PER_MM = 72 / 25.4;

/** Chromium's PDF of the document, and the size of its first page in mm. */
async function pdfPageSize(html) {
  const r = await browser.newPage();
  await r.setContent(html, { waitUntil: "load" });
  const pdf = await r.pdf({ preferCSSPageSize: true, printBackground: true });
  await r.close();
  const box = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString("latin1"));
  if (!box) return null;
  const [x1, y1, x2, y2] = box.slice(1).map(Number);
  return { widthMm: (x2 - x1) / PT_PER_MM, heightMm: (y2 - y1) / PT_PER_MM };
}
const within = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

/** The document drawn at its real size — 1 mm is 96/25.4 CSS px — at a device scale. */
async function renderAtSize(job, scale) {
  const ctx3 = await browser.newContext({
    viewport: { width: Math.ceil((job.widthMm * 96) / 25.4), height: Math.ceil((job.heightMm * 96) / 25.4) },
    deviceScaleFactor: scale,
  });
  const r = await ctx3.newPage();
  await r.setContent(job.html, { waitUntil: "load" });
  return { page: r, close: () => ctx3.close() };
}

const decoder = await browser.newPage();
await decoder.goto(`${WEB}/__zxing/decode.html`, { waitUntil: "load" });

/**
 * Decode a photographed symbol in the browser with ZXing.
 *
 * The screenshot is cropped to the bars, so a white margin is added back as
 * the quiet zone; a band's code runs along the band, so it is turned upright
 * first.
 */
async function decode(png, { rotate = false } = {}) {
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  return decoder.evaluate(async ({ dataUrl, rotate }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const pad = 60;
    const w = rotate ? img.height : img.width;
    const h = rotate ? img.width : img.height;
    const canvas = document.createElement("canvas");
    canvas.width = w + 2 * pad;
    canvas.height = h + 2 * pad;
    const g = canvas.getContext("2d");
    g.fillStyle = "#FFFFFF";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.translate(pad, pad);
    if (rotate) {
      g.translate(0, h);
      g.rotate(-Math.PI / 2);
    }
    g.drawImage(img, 0, 0);
    try {
      const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(canvas.toDataURL("image/png"));
      return result.getText();
    } catch (err) {
      return `DECODE FAILED: ${err && err.message ? err.message : err}`;
    }
  }, { dataUrl, rotate });
}

const ward1 = await newPage();
let text;
let wristbandCode = "";

try {
  // =========================================================================
  console.log("PR-01 — the wristband, printed from the patient page\n");

  await signIn(ward1, nurse.email, nurse.password);
  await ward1.goto(`${WEB}/patients`, { waitUntil: "networkidle" });
  await ward1.waitForTimeout(1800);
  await ward1.getByTestId("patient-search").fill("Anita");
  await ward1.waitForTimeout(1600);
  await ward1.getByText("Anita Case", { exact: true }).first().click();
  await ward1.waitForTimeout(2600);
  check(await ward1.getByTestId("print-wristband").isVisible(), "a nurse is offered Print wristband on the patient page");
  await ward1.screenshot({ path: path.join(SHOTS, "print-1-patient-detail.png") });

  const band = await printJob(ward1, "print-wristband");
  check(band.widthMm === 25 && band.heightMm === 280, "the job asks for a 25 × 280 mm page", `${band.widthMm} × ${band.heightMm}`);
  check(band.html.includes("@page { size: 25mm 280mm; margin: 0; }"), "and its document says so to the print pipeline");

  const size = await pdfPageSize(band.html);
  check(
    size && within(size.widthMm, 25) && within(size.heightMm, 280),
    "Chromium's PDF of it is 25 × 280 mm (±0.5)",
    size ? `${size.widthMm.toFixed(2)} × ${size.heightMm.toFixed(2)} mm` : "no MediaBox",
  );

  const rendered = await renderAtSize(band, 2);
  text = await rendered.page.locator("[data-allergy-band]").innerText();
  check(text === "ALLERGIES: Sulfa", "the allergy strip reads ALLERGIES: Sulfa", text);
  text = await rendered.page.innerText("body");
  check(text.includes("CASE, Anita") && text.includes(`Hosp no ${anita.patientId}`) && text.includes("DOB 1 Jan 1970"), "surname first, hospital number and date of birth");
  check(text.includes(admission.admissionNumber) && text.includes("Medical Ward A") && text.includes("Bed A1"), "admitted: admission number, ward and bed");
  await rendered.page.screenshot({ path: path.join(SHOTS, "print-2-wristband.png"), fullPage: true });

  wristbandCode = await decode(await rendered.page.locator("#wristband-code128").screenshot(), { rotate: true });
  check(wristbandCode === anita.patientId, "the band's Code 128, photographed at 2×, decodes to the hospital number", wristbandCode);
  const bandPayload = await decode(await rendered.page.locator("[data-scan-payload] svg").screenshot());
  check(bandPayload === `HMS1|P|${anita.patientId}`, "its DataMatrix decodes to the versioned patient payload", bandPayload);
  await rendered.close();

  // Mohan has never been asked — the strip must say so, not go blank.
  await ward1.goto(`${WEB}/patients`, { waitUntil: "networkidle" });
  await ward1.waitForTimeout(1800);
  await ward1.getByTestId("patient-search").fill("Mohan");
  await ward1.waitForTimeout(1600);
  await ward1.getByText("Mohan Das", { exact: true }).first().click();
  await ward1.waitForTimeout(2600);
  const mohanBand = await printJob(ward1, "print-wristband");
  check(mohanBand.html.includes('data-allergy-band="unrecorded">Allergies not recorded<'), "a patient never asked prints Allergies not recorded, never a blank strip");
  check(mohanBand.html.includes(mohan.patientId) && !mohanBand.html.includes(anita.patientId), "and it is his band, not the last one printed");

  // =========================================================================
  console.log("\nPR-02 — scanned back\n");

  const scanCode = async (p, code) => {
    await p.goto(`${WEB}/scan`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1600);
    const input = p.getByTestId("scan-input");
    // A keyboard-wedge scanner: the characters, then Enter. Focus is already
    // in the field — nothing is clicked first.
    await p.keyboard.type(code, { delay: 5 });
    check(await input.inputValue() === code, `the scan field had focus and took "${code}"`);
    await p.keyboard.press("Enter");
    await p.waitForTimeout(2800);
  };

  await scanCode(ward1, wristbandCode);
  check(ward1.url().includes(`/patients/${anita.id}/record`), "the decoded band opens Anita's record", ward1.url());
  check((await body(ward1)).includes("Anita Case"), "with Anita's name on screen");
  await ward1.screenshot({ path: path.join(SHOTS, "print-3-scan-record.png") });

  await scanCode(ward1, mohan.patientId);
  check(ward1.url().includes(`/patients/${mohan.id}/record`), "another patient's code opens the other patient", ward1.url());
  text = await body(ward1);
  check(text.includes("Mohan Das") && !text.includes("Anita Case"), "Mohan's name, and not Anita's");

  await scanCode(ward1, `HMS1|P|${anita.patientId}`);
  check(ward1.url().includes(`/patients/${anita.id}/record`), "the 2D payload, typed by a 2D imager, opens Anita too");

  await scanCode(ward1, "CGH-P999999");
  check(await ward1.getByTestId("scan-not-found").isVisible(), "a code that matches nobody says No patient matches this code");
  check(new URL(ward1.url()).pathname === "/scan", "and goes nowhere", ward1.url());
  await ward1.screenshot({ path: path.join(SHOTS, "print-4-scan-not-found.png") });

  // =========================================================================
  console.log("\nPR-03 — the tube label\n");

  const bench = await newPage();
  await signIn(bench, lab.email, lab.password);
  await bench.goto(`${WEB}/lab/requests/${anitaCbc.id}`, { waitUntil: "networkidle" });
  await bench.waitForTimeout(2600);
  check(await bench.getByTestId("print-tube-label").isVisible(), "a collected sample offers Print tube label");
  const label = await printJob(bench, "print-tube-label");
  check(label.widthMm === 50 && label.heightMm === 25, "the job asks for a 50 × 25 mm label");
  const labelSize = await pdfPageSize(label.html);
  check(
    labelSize && within(labelSize.widthMm, 50) && within(labelSize.heightMm, 25),
    "Chromium's PDF of it is 50 × 25 mm (±0.5)",
    labelSize ? `${labelSize.widthMm.toFixed(2)} × ${labelSize.heightMm.toFixed(2)} mm` : "no MediaBox",
  );
  check(label.html.includes('data-urgency="stat">STAT<'), "the STAT order is marked STAT");
  check(label.html.includes("CASE, Anita") && label.html.includes(`${anita.patientId} · DOB 1 Jan 1970`), "name, hospital number and date of birth");

  const labelPage = await renderAtSize(label, 2);
  await labelPage.page.screenshot({ path: path.join(SHOTS, "print-5-tube-label.png") });
  const tubeCode = await decode(await labelPage.page.locator("#specimen-code128").screenshot());
  check(tubeCode === collected.sampleId, "its Code 128 decodes to the sample number", tubeCode);
  const specimenPayload = /data-scan-payload="([^"]+)"/.exec(label.html)?.[1] ?? "";
  const tubePayload = await decode(await labelPage.page.locator("[data-scan-payload] svg").screenshot());
  check(tubePayload === specimenPayload && specimenPayload === `HMS1|S|${collected.sampleId}`, "its DataMatrix decodes to the specimen payload", tubePayload);
  await labelPage.close();

  await scanCode(bench, tubePayload);
  check(bench.url().includes(`/lab/requests/${anitaCbc.id}`), "the label's payload, scanned, opens that laboratory order", bench.url());
  text = await body(bench);
  check(text.includes(collected.sampleId) && text.includes("Anita Case"), "with the sample number and the patient on screen");

  // =========================================================================
  console.log("\nPR-04 — prescription and report\n");

  await bench.goto(`${WEB}/lab/requests/${mohanCbc.id}`, { waitUntil: "networkidle" });
  await bench.waitForTimeout(2600);
  const report = await printJob(bench, "print-lab-report");
  check(report.html.includes("Mohan Das") && report.html.includes(mohan.patientId), "the lab report is Mohan's");
  check(!report.html.includes("Anita"), "and nobody else's");
  check(report.html.includes("Suspected anaemia") && report.html.includes("Haemoglobin"), "with the indication and the reported values");
  const reportSize = await pdfPageSize(report.html);
  check(reportSize && within(reportSize.widthMm, 210) && within(reportSize.heightMm, 297), "on A4");
  const reportPage = await renderAtSize(report, 1);
  await reportPage.page.screenshot({ path: path.join(SHOTS, "print-7-lab-report.png"), fullPage: true });
  await reportPage.close();

  const counter = await newPage();
  await signIn(counter, pharmacist.email, pharmacist.password);
  await counter.goto(`${WEB}/pharmacy/dispense/${rx.id}`, { waitUntil: "networkidle" });
  await counter.waitForTimeout(2800);
  const script = await printJob(counter, "print-prescription");
  check(script.html.includes("Anita Case") && script.html.includes(anita.patientId), "the prescription is Anita's");
  check(script.html.includes("Glycomet") && script.html.includes("ALLERGIES: Sulfa"), "with the medicine and her allergy");
  check(script.html.includes("Dr Rajesh Rao"), "and the prescriber");
  const scriptSize = await pdfPageSize(script.html);
  check(scriptSize && within(scriptSize.widthMm, 148) && within(scriptSize.heightMm, 210), "on A5");
  const scriptPage = await renderAtSize(script, 1);
  await scriptPage.page.screenshot({ path: path.join(SHOTS, "print-6-prescription.png"), fullPage: true });
  await scriptPage.close();

  // -- Health ----------------------------------------------------------------
  console.log(`\n  (HTTP non-2xx seen: ${httpFailures.join(", ") || "none"})\n`);
  const jsErrors = consoleErrors.filter((e) => !/Failed to load resource/i.test(e));
  check(jsErrors.length === 0, "no JavaScript errors", jsErrors.slice(0, 2).join(" | "));
  // The unknown band is scanned on purpose.
  const unexpected = httpFailures.filter((f) => f !== "404 GET /api/v1/patients/scan/CGH-P999999");
  check(unexpected.length === 0, "no unexpected HTTP failures", unexpected.join(", "));
} catch (err) {
  console.error("\nJourney threw:", err.message);
  failures.push(`exception: ${err.message}`);
  await ward1.screenshot({ path: path.join(SHOTS, "print-FAILURE.png") }).catch(() => {});
} finally {
  await browser.close();
  web.close();
  api.kill("SIGTERM");
  await mongoose.disconnect().catch(() => {});
  await replSet.stop().catch(() => {});
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n - ${failures.join("\n - ")}\n`);
  process.exit(1);
}
console.log("\nWristbands print at their real size and scan back to the right patient. Screenshots in docs/shots/\n");
