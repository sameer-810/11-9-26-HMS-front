/**
 * Phase 11 gate — the gaps found checking the build against "User Story
 * Hospital Management" v1.0, in a real browser.
 *
 * What only a browser shows:
 *  - US-01  staff sign in with the employee ID on their badge; a screen left
 *           idle warns for a minute, can be kept, then signs out and says why;
 *  - US-05  dashboard cards open the list behind their number, and a figure
 *           administration may see but not list leads to its report instead;
 *  - US-17  a doctor's recommendation to admit waits on the admitted patients
 *           board, opens the admission form already filled in, or is closed
 *           with a reason;
 *  - US-04  the roles screen locks clinical access a role never had, applies a
 *           saved change to existing staff, and resets;
 *  - US-23  a ward allocation puts the ward's patients on a nurse's list;
 *  - US-39/41 doctor activity, downloaded as a real Excel workbook and PDF.
 *
 *   node tools/verifyStories.mjs
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(here, "..");
const BACK = path.resolve(FRONT, "..", "11-9-26-HMS-back");
const DIST = path.join(FRONT, "dist");
const SHOTS = path.join(FRONT, "docs", "shots");

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

const API_PORT = 5206;
const secrets = {
  JWT_ACCESS_SECRET: "verify-access-secret-not-real",
  JWT_REFRESH_SECRET: "verify-refresh-secret-not-real",
  JWT_ADMIN_SECRET: "verify-admin-secret-not-real",
};
const api = spawn(process.execPath, ["server.js"], {
  cwd: BACK,
  env: {
    ...process.env, ...secrets, NODE_ENV: "test", PORT: String(API_PORT), MONGODB_URI: mongoUri, BCRYPT_ROUNDS: "4", CORS_ORIGIN: "",
    // Several browser contexts sign the same people in; the device cap is not under test.
    MAX_DEVICES_PER_USER: "100",
  },
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
const ExcelJS = (await imp(BACK, "node_modules", "exceljs", "lib", "exceljs.nodejs.js")).default;

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
  }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

const adminToken = (await req("POST", "/auth/login", { email: "admin@cgh.test", password: "AdminPassword123", deviceId: "verify-admin", deviceName: "Verifier" })).data.accessToken;
const med = (await req("POST", "/departments", { name: "General Medicine", code: "MED" }, adminToken)).data;
const ortho = (await req("POST", "/departments", { name: "Orthopaedics", code: "ORT" }, adminToken)).data;

async function provision({ employeeId, firstName, email, role, departmentId }) {
  const created = await req("POST", "/users", { employeeId, firstName, lastName: "Rao", email, role, departmentId }, adminToken);
  const temp = created.data.temporaryPassword;
  const first = await req("POST", "/auth/login", { email, password: temp, deviceId: `${employeeId}-device`, deviceName: "Verifier" });
  const password = `${firstName}Password123`;
  await req("POST", "/auth/change-password", { currentPassword: temp, newPassword: password, deviceId: `${employeeId}-device` }, first.data.accessToken);
  const live = await req("POST", "/auth/login", { email, password, deviceId: `${employeeId}-device` });
  return { id: created.data.user.id, employeeId, email, password, token: live.data.accessToken };
}

const doctor = await provision({ employeeId: "DOC001", firstName: "Rajesh", email: "rajesh@cgh.test", role: "doctor", departmentId: med.id });
await provision({ employeeId: "DOC002", firstName: "Farah", email: "farah@cgh.test", role: "doctor", departmentId: ortho.id });
const nurse = await provision({ employeeId: "NUR001", firstName: "Lakshmi", email: "lakshmi@cgh.test", role: "nurse" });
const reception = await provision({ employeeId: "REC001", firstName: "Deepak", email: "deepak@cgh.test", role: "receptionist" });
const billing = await provision({ employeeId: "BIL001", firstName: "Priya", email: "priya@cgh.test", role: "billing" });

const register = async (firstName, mobile) =>
  (await req("POST", "/patients", { firstName, lastName: "Case", gender: "female", dateOfBirth: "1970-01-01", mobile }, reception.token)).data;
const anita = await register("Anita", "9876500001");
const bhavna = await register("Bhavna", "9876500002");
const chitra = await register("Chitra", "9876500003");
const dev = await register("Dev", "9876500004");

const wardId = (await req("POST", "/beds/wards", { name: "Medical Ward A", code: "MWA", type: "general", departmentId: med.id }, adminToken)).data.id;
const roomId = (await req("POST", "/beds/rooms", { wardId, number: "101", type: "general" }, adminToken)).data.id;
await req("POST", "/beds/bulk", { roomId, prefix: "A", from: 1, to: 3 }, adminToken);
const beds = (await req("GET", `/beds?wardId=${wardId}&limit=10`, null, adminToken)).data;
await req("POST", "/admissions", { patientId: anita.id, bedId: beds[0].id, reason: "Community acquired pneumonia" }, doctor.token);
await req("POST", "/appointments/walk-in", { patientId: dev.id, doctorId: doctor.id, reason: "Fever since morning" }, reception.token);

async function recommend(patientId, reason) {
  const consult = (await req("POST", "/consultations", { patientId, type: "opd" }, doctor.token)).data;
  await req("PATCH", `/consultations/${consult.id}`, {
    chiefComplaint: "Breathless on exertion",
    diagnoses: [{ description: "Heart failure", type: "provisional", isPrimary: true }],
    admissionRecommended: true,
    admissionReason: reason,
  }, doctor.token);
  await req("POST", `/consultations/${consult.id}/sign`, null, doctor.token);
  return consult.consultationNumber;
}
const chitraRequest = await recommend(chitra.id, "Needs IV diuretics and monitoring");
const bhavnaRequest = await recommend(bhavna.id, "Observation overnight");

console.log("Seeded: an admission, a walk-in and two recommendations to admit\n");

// ---------------------------------------------------------------------------
const web = http.createServer((rq, rs) => {
  const url = decodeURIComponent((rq.url || "/").split("?")[0]);
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

async function newPage({ clock = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const p = await ctx.newPage();
  if (clock) await p.clock.install();
  p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  p.on("pageerror", (e) => consoleErrors.push(String(e)));
  p.on("response", (r) => { if (r.status() >= 400) httpFailures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
  await p.route("**/socket.io/**", (route) => route.abort());
  await p.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${API}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  return p;
}
const signIn = async (p, identifier, password) => {
  await p.goto(WEB, { waitUntil: "networkidle" });
  await p.waitForTimeout(1300);
  await p.getByTestId("login-email").fill(identifier);
  await p.getByTestId("login-password").fill(password);
  await p.getByTestId("login-submit").click();
  await p.waitForTimeout(2600);
};
const go = async (p, route, wait = 2400) => {
  await p.goto(`${WEB}${route}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(wait);
};
const body = (p) => p.innerText("body");
const pathOf = (p) => new URL(p.url()).pathname;

async function download(p, testId) {
  const [file] = await Promise.all([
    p.waitForEvent("download", { timeout: 10_000 }).catch(() => null),
    p.getByTestId(testId).click(),
  ]);
  if (!file) return { name: "", bytes: Buffer.alloc(0) };
  const saved = path.join(os.tmpdir(), `hms-verify-${Date.now()}-${file.suggestedFilename()}`);
  await file.saveAs(saved);
  const bytes = fs.readFileSync(saved);
  fs.rmSync(saved, { force: true });
  return { name: file.suggestedFilename(), bytes };
}

const desk = await newPage();
let current = desk;
let text;

try {
  // =========================================================================
  console.log("US-01 / US-05 — reception signs in with an employee ID; the cards open their lists\n");

  await signIn(desk, "rec001", reception.password);
  check(await desk.getByTestId("dashboard").isVisible(), "the employee ID on the badge signs in, whatever its case");
  text = await desk.getByTestId("tile-patients").innerText();
  check(/Total patients\s*4/.test(text), "the dashboard counts total patients", text.replace(/\s+/g, " "));
  text = await desk.getByTestId("tile-opd").innerText();
  check(/OPD patients now\s*1/.test(text) && text.includes("1 waiting"), "and the OPD patients waiting now", text.replace(/\s+/g, " "));
  check((await desk.getByTestId("tile-appointments").innerText()).includes("Today's appointments"), "and today's appointments");
  check((await desk.getByTestId("tile-inpatients").count()) === 0, "but no inpatient figures for reception");
  await desk.screenshot({ path: path.join(SHOTS, "stories-1-dashboard.png") });

  await desk.getByTestId("tile-opd").click();
  await desk.waitForTimeout(2200);
  check(pathOf(desk).endsWith("/opd/queue"), "the OPD card opens the OPD queue", pathOf(desk));
  await go(desk, "/dashboard");
  await desk.getByTestId("tile-patients").click();
  await desk.waitForTimeout(2600);
  console.log(`  (patients card landed on ${desk.url()})`);
  check(/\/patients\/?$/.test(pathOf(desk)) || (await desk.getByTestId("patients-screen").count()) > 0, "the patients card opens patient search", pathOf(desk));

  // =========================================================================
  console.log("\nUS-17 — the doctor's recommendations reach the admission desk\n");

  const clinic = await newPage();
  current = clinic;
  await signIn(clinic, doctor.email, doctor.password);
  check((await clinic.getByTestId("tile-appointments").innerText()).includes("My appointments today"), "a doctor's appointment card is their own day");
  text = await clinic.getByTestId("tile-admission-requests").innerText();
  check(/Waiting for a bed\s*2/.test(text), "two recommendations wait for a bed", text.replace(/\s+/g, " "));
  await clinic.getByTestId("tile-admission-requests").click();
  await clinic.waitForTimeout(2600);
  check(pathOf(clinic).endsWith("/ipd/patients"), "the card opens the admitted patients board", pathOf(clinic));
  text = await clinic.getByTestId("admission-requests").innerText();
  check(text.includes("2 waiting for a bed") && text.includes("Needs IV diuretics and monitoring") && text.includes("Heart failure"), "the board lists them with the doctor's reason and diagnosis");
  await clinic.screenshot({ path: path.join(SHOTS, "stories-2-requests.png") });

  await clinic.getByTestId(`request-close-${bhavnaRequest}`).click();
  await clinic.waitForTimeout(500);
  check(await clinic.getByTestId("request-close-submit").isDisabled(), "a recommendation cannot be closed without a note");
  await clinic.getByTestId("request-close-note").fill("Chose to go home, will return if worse");
  await clinic.waitForTimeout(300);
  await clinic.getByTestId("request-close-submit").click();
  await clinic.waitForTimeout(2600);
  text = await clinic.getByTestId("admission-requests").innerText();
  check(text.includes("1 waiting for a bed") && !text.includes("Observation overnight"), "closed with a reason, it leaves the list");

  await clinic.getByTestId(`request-admit-${chitraRequest}`).click();
  await clinic.waitForTimeout(2400);
  check(pathOf(clinic).endsWith("/ipd/admit"), "Admit opens the admission form", pathOf(clinic));
  check((await clinic.getByTestId("chosen-patient").innerText()).includes("Chitra Case"), "with the patient chosen");
  check((await clinic.getByTestId("admit-reason").inputValue()) === "Needs IV diuretics and monitoring", "and the doctor's reason filled in");

  // =========================================================================
  console.log("\nUS-05 / US-39 / US-41 — administration: counts, doctor activity, Excel and PDF\n");

  const office = await newPage();
  current = office;
  await signIn(office, "ADM001", "AdminPassword123");
  await office.getByTestId("tile-patients").click();
  await office.waitForTimeout(2600);
  check(pathOf(office).endsWith("/reports"), "administration's patients card opens the registrations report, not a patient list", pathOf(office));
  check(/Registered\s*4/.test(await office.getByTestId("report-summary").innerText()), "which counts the four registrations");

  await office.getByTestId("report-chip-doctor_activity").click();
  await office.waitForTimeout(2600);
  text = await office.getByTestId("report-summary").innerText();
  check(/Consultations signed\s*2/.test(text), "doctor activity counts the consultations signed", text.replace(/\s+/g, " ").slice(0, 160));
  text = await office.getByTestId("report-table").innerText();
  check(text.includes("Rajesh Rao") && text.includes("Farah Rao"), "per doctor, idle doctors included");
  for (const name of ["Anita", "Bhavna", "Chitra"]) check(!(await body(office)).includes(`${name} Case`), `no patient named in the report (${name})`);
  await office.screenshot({ path: path.join(SHOTS, "stories-3-doctor-activity.png") });

  const xlsx = await download(office, "report-export-xlsx");
  check(/^doctor_activity_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.xlsx$/.test(xlsx.name), "the report downloads as an Excel file", xlsx.name || "no download");
  let sheetText = "";
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.bytes);
    sheetText = workbook.getWorksheet("Summary").getSheetValues().flat().filter(Boolean).join(" ");
    check(workbook.getWorksheet("Table").getRow(2).getCell(1).value === "Rajesh Rao", "a real workbook, with the table in it");
  } catch (err) {
    check(false, "a real workbook, with the table in it", err.message);
  }
  check(sheetText.includes("Doctor activity") && sheetText.includes("City General Hospital"), "headed with the report and the hospital");

  const pdf = await download(office, "report-export-pdf");
  check(/^doctor_activity_.*\.pdf$/.test(pdf.name) && pdf.bytes.subarray(0, 5).toString("latin1") === "%PDF-", "and as a PDF", pdf.name || "no download");

  // =========================================================================
  console.log("\nUS-04 — roles and permissions\n");

  await go(office, "/admin/roles");
  check(await office.getByTestId("roles-screen").isVisible(), "the roles screen opens from its own address");
  const locked = office.getByTestId("role-permission-record.view");
  check((await locked.getAttribute("aria-disabled")) === "true", "reception cannot be given the medical record");
  check((await locked.innerText()).includes("Not in this role's standard set"), "and the box says why");

  await office.getByTestId("role-tab-billing").click();
  await office.waitForTimeout(1200);
  check((await req("GET", "/beds/board", null, billing.token)).status === 403, "billing staff start without the bed board");
  await office.getByTestId("role-permission-beds.view").click();
  await office.waitForTimeout(300);
  check((await office.getByTestId("role-diff").innerText()).includes("Adding"), "the change is spelled out before it is saved");
  await office.getByTestId("role-apply-staff").click();
  await office.getByTestId("role-save").click();
  await office.waitForTimeout(2600);
  text = await office.getByTestId("role-saved").innerText();
  check(text.includes("Applied to the 1 person"), "saved and applied to the one person in the role", text);
  check((await req("GET", "/beds/board", null, billing.token)).status === 200, "who can open the bed board from their next request");
  check((await office.getByTestId("role-origin").innerText()).includes("Changed for this hospital"), "the role is marked as changed");
  await office.screenshot({ path: path.join(SHOTS, "stories-4-roles.png") });

  await office.getByTestId("role-reset").click();
  await office.waitForTimeout(600);
  await office.getByRole("button", { name: "Yes, reset" }).click();
  await office.waitForTimeout(2600);
  check((await office.getByTestId("role-origin").innerText()).includes("standard set"), "and resets to the standard set");

  // =========================================================================
  console.log("\nUS-23 — a nurse's ward\n");

  await go(office, "/admin/users");
  await office.getByTestId("user-row-NUR001").click();
  await office.waitForTimeout(2600);
  await office.getByTestId("user-ward-MWA").click();
  await office.getByTestId("user-save-wards").click();
  await office.waitForTimeout(2400);
  check(await office.getByTestId("user-wards-saved").isVisible(), "administration allocates the nurse to Medical Ward A");

  const ward = await newPage();
  current = ward;
  await signIn(ward, nurse.employeeId, nurse.password);
  text = await ward.getByTestId("tile-my-patients").innerText();
  check(/My patients\s*1/.test(text), "the nurse's dashboard counts the ward's patient", text.replace(/\s+/g, " "));
  await ward.getByTestId("tile-my-patients").click();
  await ward.waitForTimeout(2600);
  check((await body(ward)).includes("Anita Case"), "and the ward list shows her, though nobody allocated her by name");
  await ward.screenshot({ path: path.join(SHOTS, "stories-5-ward.png") });

  // =========================================================================
  console.log("\nUS-01 — the idle timeout\n");

  await go(office, "/admin/config");
  await office.getByTestId("hospital-sessionIdleMinutes").fill("3");
  await office.getByTestId("hospital-save").click();
  await office.waitForTimeout(800);
  // "minutes" is only in the error; the field's hint says "Between 5 and 480." too.
  check((await body(office)).includes("Between 5 and 480 minutes"), "a timeout under five minutes is refused on the form");
  await office.getByTestId("hospital-sessionIdleMinutes").fill("5");
  await office.getByTestId("hospital-save").click();
  await office.waitForTimeout(2400);
  check(await office.getByTestId("hospital-saved").isVisible(), "five minutes is saved");

  const idle = await newPage({ clock: true });
  current = idle;
  await signIn(idle, nurse.email, nurse.password);
  check(await idle.getByTestId("dashboard").isVisible(), "a nurse signs in on a shared computer");
  await idle.clock.fastForward("04:05");
  await idle.waitForTimeout(1500);
  check(await idle.getByTestId("idle-warning").isVisible(), "four minutes untouched, the screen warns");
  check((await idle.getByTestId("idle-warning").innerText()).includes("signs out in"), "and counts down");
  await idle.screenshot({ path: path.join(SHOTS, "stories-6-idle-warning.png") });
  await idle.getByTestId("idle-stay").click();
  await idle.waitForTimeout(800);
  check((await idle.getByTestId("idle-warning").count()) === 0, "Stay signed in keeps the session");
  check(await idle.getByTestId("dashboard").isVisible(), "on the screen the nurse was using");

  await idle.clock.fastForward("05:02");
  await idle.waitForTimeout(2500);
  check(await idle.getByTestId("login-submit").isVisible(), "left alone past the timeout, the screen signs out");
  text = await idle.getByTestId("login-session-notice").innerText();
  check(text.includes("5 minutes without activity"), "and the sign-in screen says why", text);
  check(!(await body(idle)).includes("Anita Case"), "with nothing of the last session left on screen");

  // -- Health ----------------------------------------------------------------
  console.log(`\n  (HTTP non-2xx seen: ${httpFailures.join(", ") || "none"})\n`);
  const jsErrors = consoleErrors.filter((e) => !/Failed to load resource/i.test(e));
  check(jsErrors.length === 0, "no JavaScript errors", jsErrors.slice(0, 2).join(" | "));
  check(httpFailures.length === 0, "no HTTP failures", httpFailures.join(", "));
} catch (err) {
  console.error("\nJourney threw:", err.message);
  failures.push(`exception: ${err.message}`);
  await current.screenshot({ path: path.join(SHOTS, "stories-FAILURE.png") }).catch(() => {});
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
console.log("\nThe v1.0 user story gaps work end to end. Screenshots in docs/shots/\n");
