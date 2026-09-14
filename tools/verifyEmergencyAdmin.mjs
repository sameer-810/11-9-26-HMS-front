/**
 * Phase 8 gate — emergency, break-the-glass, reports and administration, in a
 * real browser.
 *
 * What only a browser shows:
 *  - the board puts the untriaged patient and the sickest patient above the one
 *    who arrived first, and says so with the badge, not just the order;
 *  - the triage form suggests a level from the answers, and an override cannot
 *    be saved without a reason;
 *  - reception registers an unidentified ambulance arrival and never sees the
 *    triage form;
 *  - a restricted record stops a clinician outside the team, the glass breaks
 *    only with a reason, and the record then opens under a countdown banner;
 *  - administration reviews that access, filters reports by date and
 *    department, exports CSV, and sees no patient name in any of it;
 *  - the admin console creates a user and hands over a one-time password.
 *
 *   node tools/verifyEmergencyAdmin.mjs
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

const API_PORT = 5202;
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
const med = (await req("POST", "/departments", { name: "General Medicine", code: "MED" }, adminToken)).data;
const ortho = (await req("POST", "/departments", { name: "Orthopaedics", code: "ORT" }, adminToken)).data;

async function provision({ employeeId, firstName, email, role, departmentId }) {
  const created = await req("POST", "/users", { employeeId, firstName, lastName: "Rao", email, role, departmentId }, adminToken);
  const temp = created.data.temporaryPassword;
  const first = await req("POST", "/auth/login", { email, password: temp, deviceId: `${employeeId}-device`, deviceName: "Verifier" });
  const password = `${firstName}Password123`;
  await req("POST", "/auth/change-password", { currentPassword: temp, newPassword: password, deviceId: `${employeeId}-device` }, first.data.accessToken);
  const live = await req("POST", "/auth/login", { email, password, deviceId: `${employeeId}-device` });
  return { id: created.data.user.id, email, password, token: live.data.accessToken };
}

const doctor = await provision({ employeeId: "DOC001", firstName: "Rajesh", email: "rajesh@cgh.test", role: "doctor", departmentId: med.id });
const orthoDoctor = await provision({ employeeId: "DOC002", firstName: "Farah", email: "farah@cgh.test", role: "doctor", departmentId: ortho.id });
const nurse = await provision({ employeeId: "NUR001", firstName: "Lakshmi", email: "lakshmi@cgh.test", role: "nurse" });
const reception = await provision({ employeeId: "REC001", firstName: "Deepak", email: "deepak@cgh.test", role: "receptionist" });
const billing = await provision({ employeeId: "BIL001", firstName: "Priya", email: "priya@cgh.test", role: "billing" });

const register = async (firstName, mobile) =>
  (await req("POST", "/patients", { firstName, lastName: "Case", gender: "female", dateOfBirth: "1980-01-01", mobile }, reception.token)).data;
const anita = await register("Anita", "9876500001");
const bhavna = await register("Bhavna", "9876500002");
const rina = await register("Rina", "9876500003");

// Anita walked in first, with a sprained ankle, and was triaged ESI 5.
const anitaVisit = (await req("POST", "/emergency/visits", { patientId: anita.id, arrivalMode: "walk_in", chiefComplaint: "Sprained ankle" }, reception.token)).data;
await req("POST", `/emergency/visits/${anitaVisit.id}/triage`, { answers: { expectedResources: [] }, vitals: {} }, nurse.token);

// Rina is a staff member whose record her doctor has restricted.
await req("POST", "/consultations", { patientId: rina.id, type: "opd" }, doctor.token);
await req("POST", `/access/patients/${rina.id}/restriction`, { restricted: true, reason: "Staff member, requested confidentiality" }, doctor.token);

// A ward with beds, for the bed board.
const wardId = (await req("POST", "/beds/wards", { name: "Medical Ward A", code: "MWA", type: "general", departmentId: med.id }, adminToken)).data.id;
const roomId = (await req("POST", "/beds/rooms", { wardId, number: "101", type: "general" }, adminToken)).data.id;
await req("POST", "/beds/bulk", { roomId, prefix: "A", from: 1, to: 3 }, adminToken);

console.log("Seeded: a triaged walk-in, a restricted record and a ward\n");

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

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  p.on("pageerror", (e) => consoleErrors.push(String(e)));
  p.on("response", (r) => { if (r.status() >= 400) httpFailures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
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
const go = async (p, route, wait = 2400) => {
  await p.goto(`${WEB}${route}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(wait);
};
const body = (p) => p.innerText("body");
const rowOrder = async (p) =>
  p.locator('[data-testid^="ed-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("ed-row-", "")));

const desk = await newPage();
let current = desk;
let text;

try {
  // =========================================================================
  console.log("ER — reception registers the arrivals\n");

  await signIn(desk, reception.email, reception.password);
  await go(desk, "/emergency/arrival");
  await desk.getByTestId("register-patient-search").fill("Bhavna");
  await desk.waitForTimeout(1600);
  await desk.locator('[data-testid^="register-pick-"]').first().click();
  await desk.waitForTimeout(500);
  await desk.getByTestId("register-chief-complaint").fill("Chest pain radiating to the left arm");
  await desk.getByTestId("register-submit").click();
  await desk.waitForTimeout(2800);
  text = await desk.getByTestId("ed-visit-facts").innerText();
  const bhavnaNumber = text.match(/ED-\d{6}/)?.[0];
  check(Boolean(bhavnaNumber), "a registered patient's arrival gets an ED number");
  check((await desk.getByTestId("triage-form").count()) === 0, "reception is not offered the triage form");

  await go(desk, "/emergency/arrival");
  await desk.getByTestId("register-kind-unidentified").click();
  await desk.getByTestId("register-gender-male").click();
  await desk.getByTestId("register-approx-age").fill("40");
  await desk.getByTestId("register-mode-ambulance").click();
  await desk.waitForTimeout(400);
  await desk.getByTestId("register-ambulance-service").fill("108");
  await desk.getByTestId("register-chief-complaint").fill("Road traffic accident, unconscious");
  await desk.getByTestId("register-mlc").click();
  await desk.getByTestId("register-submit").click();
  await desk.waitForTimeout(2800);
  text = await desk.getByTestId("ed-visit-facts").innerText();
  const unknownNumber = text.match(/ED-\d{6}/)?.[0];
  check(Boolean(unknownNumber) && (await body(desk)).includes("Unidentified"), "an unidentified ambulance arrival is registered without a name");

  // =========================================================================
  console.log("\nER — the board sorts by acuity\n");

  const ward = await newPage();
  current = ward;
  await signIn(ward, nurse.email, nurse.password);
  await go(ward, "/emergency");
  let order = await rowOrder(ward);
  check(order[order.length - 1] === anitaVisit.visitNumber, "the first arrival, ESI 5, is at the bottom", order.join(", "));
  check((await ward.getByTestId(`ed-esi-${bhavnaNumber}`).innerText()).includes("Triage now"), "an untriaged patient is marked for triage");

  await ward.getByTestId(`ed-row-${bhavnaNumber}`).click();
  await ward.waitForTimeout(2400);
  await ward.getByTestId("triage-q-lifesaving-no").click();
  await ward.waitForTimeout(300);
  await ward.getByTestId("triage-q-highrisk-yes").click();
  await ward.waitForTimeout(1800);
  check((await ward.getByTestId("triage-preview-level").innerText()).includes("ESI 2"), "a high-risk presentation suggests ESI 2");
  await ward.screenshot({ path: path.join(SHOTS, "emergency-1-triage.png") });
  await ward.getByTestId("triage-accept").click();
  await ward.waitForTimeout(300);
  await ward.getByTestId("triage-save").click();
  await ward.waitForTimeout(2600);
  check((await ward.getByTestId("ed-visit-esi").innerText()).includes("ESI 2"), "the nurse accepts it and the attendance is ESI 2");

  await go(ward, "/emergency");
  order = await rowOrder(ward);
  check(
    order.join() === [unknownNumber, bhavnaNumber, anitaVisit.visitNumber].join(),
    "the board reads: untriaged, then ESI 2, then the ESI 5 who arrived first",
    order.join(", "),
  );
  await ward.screenshot({ path: path.join(SHOTS, "emergency-2-board.png") });

  // An override without a reason cannot be saved.
  await ward.getByTestId(`ed-row-${anitaVisit.visitNumber}`).click();
  await ward.waitForTimeout(2400);
  await ward.getByTestId("triage-q-lifesaving-no").click();
  await ward.getByTestId("triage-q-highrisk-no").click();
  await ward.waitForTimeout(1600);
  await ward.getByTestId("triage-level-3").click();
  await ward.waitForTimeout(400);
  check(await ward.getByTestId("triage-save").isDisabled(), "an override cannot be saved without a reason");
  await ward.getByTestId("triage-override-reason").fill("Diabetic, foot is cold and pale below the injury");
  await ward.waitForTimeout(400);
  await ward.getByTestId("triage-save").click();
  await ward.waitForTimeout(2600);
  check((await ward.getByTestId("ed-triage-override").innerText()).includes("suggested"), "the override keeps the algorithm's suggestion beside it");

  await go(desk, `/emergency`);
  check((await desk.getByTestId(`ed-esi-${bhavnaNumber}`).innerText()).includes("ESI 2"), "reception sees the level on the board");

  // =========================================================================
  console.log("\nER — the doctor takes the patient\n");

  const clinic = await newPage();
  current = clinic;
  await signIn(clinic, doctor.email, doctor.password);
  await go(clinic, "/emergency");
  await clinic.getByTestId(`ed-row-${bhavnaNumber}`).click();
  await clinic.waitForTimeout(2400);
  await clinic.getByTestId("ed-take-patient").click();
  await clinic.waitForTimeout(2600);
  check(await clinic.getByTestId("ed-open-consultation").isVisible(), "taking the patient opens an emergency consultation");

  await go(clinic, "/dashboard");
  check((await body(clinic)).includes("In emergency"), "the department shows on the doctor's dashboard");

  // =========================================================================
  console.log("\nBreak-the-glass\n");

  const glass = await newPage();
  current = glass;
  await signIn(glass, orthoDoctor.email, orthoDoctor.password);
  await go(glass, `/patients/${rina.id}/record`, 3000);
  check(await glass.getByTestId("record-restricted").isVisible(), "a clinician outside the team meets the restriction, not the record");
  check((await glass.getByTestId("medical-record").count()) === 0, "and nothing of the record is shown");
  await glass.getByTestId("breakglass-reason").fill("urgent");
  await glass.waitForTimeout(300);
  check(await glass.getByTestId("breakglass-submit").isDisabled(), "the glass does not break without a real reason");
  await glass.screenshot({ path: path.join(SHOTS, "emergency-3-restricted.png") });

  await glass.getByTestId("breakglass-reason").fill("Brought to ED unconscious, need allergies and medication history");
  await glass.waitForTimeout(300);
  await glass.getByTestId("breakglass-submit").click();
  await glass.waitForTimeout(3200);
  check(await glass.getByTestId("medical-record").isVisible(), "with a reason, the record opens");
  text = await glass.getByTestId("breakglass-active").innerText();
  check(text.includes("Emergency access") && /Access ends in (59|60) min/.test(text), "under a banner counting down its sixty minutes", text);
  await glass.screenshot({ path: path.join(SHOTS, "emergency-4-glass-broken.png") });

  // =========================================================================
  console.log("\nAudit — administration reviews the access\n");

  const office = await newPage();
  current = office;
  await signIn(office, "admin@cgh.test", "AdminPassword123");
  await go(office, "/admin/audit");
  await office.getByTestId("audit-breakglass-only").click();
  await office.waitForTimeout(2200);
  text = await office.getByTestId("audit-entries").innerText();
  check(text.includes("EMERGENCY ACCESS") && text.includes("unconscious"), "the audit trail flags emergency access with its reason");

  await office.getByTestId("audit-tab-grants").click();
  await office.waitForTimeout(2200);
  text = await office.getByTestId("grant-rows").innerText();
  check(text.includes("Farah") && text.includes("Awaiting review"), "the grant waits for review, naming who used it");
  const grantId = (await office.locator('[data-testid^="grant-inappropriate-"]').first().getAttribute("data-testid")).replace("grant-inappropriate-", "");
  await office.getByTestId(`grant-inappropriate-${grantId}`).click();
  await office.waitForTimeout(400);
  check(await office.getByTestId(`grant-submit-${grantId}`).isDisabled(), "an inappropriate finding needs a note");
  await office.getByTestId(`grant-appropriate-${grantId}`).click();
  await office.waitForTimeout(2400);
  check((await body(office)).includes("Nothing awaiting review"), "once reviewed, it leaves the queue");
  await office.screenshot({ path: path.join(SHOTS, "emergency-5-review.png") });

  // =========================================================================
  console.log("\nAD-03 — reports\n");

  await go(office, "/reports");
  await office.getByTestId("report-chip-emergency").click();
  await office.waitForTimeout(2400);
  text = await office.getByTestId("report-summary").innerText();
  check(/Arrivals\s*3/.test(text), "the emergency report counts the three arrivals", text.slice(0, 120));
  await office.getByTestId("report-preset-last-7-days").click();
  await office.waitForTimeout(1800);
  check((await body(office)).includes("7 days"), "a date preset changes the range");

  await office.getByTestId("report-department").getByRole("button").click();
  await office.waitForTimeout(500);
  await office.getByRole("menuitem", { name: "General Medicine" }).click();
  await office.waitForTimeout(2400);
  text = await body(office);
  check(text.includes("General Medicine") && text.includes("What the department filter counts"), "a department filter, with what it means");
  check(/Arrivals\s*1/.test(await office.getByTestId("report-summary").innerText()), "and it changes the numbers: one arrival seen in Medicine");
  for (const name of ["Anita", "Bhavna", "Rina"]) check(!text.includes(name), `no patient name in the report (${name})`);
  await office.screenshot({ path: path.join(SHOTS, "emergency-6-report.png") });

  const [download] = await Promise.all([
    office.waitForEvent("download", { timeout: 8000 }).catch(() => null),
    office.getByTestId("report-export-csv").click(),
  ]);
  await office.waitForTimeout(1200);
  const csvName = download?.suggestedFilename() ?? "";
  check(/^emergency_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/.test(csvName), "the report exports as CSV", csvName || "no download");

  const counter = await newPage();
  current = counter;
  await signIn(counter, billing.email, billing.password);
  await go(counter, "/reports");
  check((await counter.getByTestId("report-chip-billing").count()) === 1, "billing staff run the billing report");
  check((await counter.getByTestId("report-chip-emergency").count()) === 0, "and nothing clinical");

  // =========================================================================
  console.log("\nAdmin console\n");

  current = office;
  await go(office, "/admin/users");
  await office.getByTestId("user-create-button").click();
  await office.waitForTimeout(1600);
  await office.getByTestId("user-employeeId").fill("NUR002");
  await office.getByTestId("user-firstName").fill("Meera");
  await office.getByTestId("user-lastName").fill("Iyer");
  await office.getByTestId("user-email").fill("meera@cgh.test");
  await office.getByTestId("user-role").getByRole("button").click();
  await office.waitForTimeout(500);
  await office.getByRole("menuitem", { name: "Nurse" }).click();
  await office.waitForTimeout(500);
  await office.getByTestId("user-create-submit").click();
  await office.waitForTimeout(2800);
  const tempPassword = (await office.getByTestId("user-temp-password").innerText()).trim();
  check(tempPassword.length >= 8, "a new user is created with a one-time temporary password");
  check((await body(office)).includes("This password will not be shown again"), "and told it will not be shown again");
  const firstLogin = await req("POST", "/auth/login", { email: "meera@cgh.test", password: tempPassword, deviceId: "meera-device", deviceName: "Verifier" });
  check(firstLogin.success === true, "the temporary password signs in");
  await office.screenshot({ path: path.join(SHOTS, "admin-1-user-created.png") });

  await office.getByTestId("user-created-open").click();
  await office.waitForTimeout(2400);
  await office.getByTestId("user-deactivate").click();
  await office.waitForTimeout(600);
  await office.getByRole("button", { name: "Yes, deactivate" }).click();
  await office.waitForTimeout(2400);
  check(await office.getByTestId("user-activate").isVisible(), "the account is deactivated from its page");
  const refused = await req("POST", "/auth/login", { email: "meera@cgh.test", password: tempPassword, deviceId: "meera-device", deviceName: "Verifier" });
  check(refused.success !== true, "and a deactivated account cannot sign in");

  await go(office, "/admin/config");
  await office.getByTestId("config-tab-departments").click();
  await office.waitForTimeout(1800);
  check(
    (await office.getByTestId("department-row-MED").count()) === 1 && (await office.getByTestId("department-row-ORT").count()) === 1,
    "hospital setup lists the departments",
  );

  await go(office, "/beds");
  check((await office.getByTestId("bed-MWA-A1").count()) === 1, "the bed board shows the ward's beds");
  await office.locator('[data-testid^="bed-maintenance-"]').first().click();
  await office.waitForTimeout(600);
  await office.getByTestId("bed-maintenance-note").fill("Bed rail broken, awaiting repair");
  await office.getByTestId("bed-maintenance-submit").click();
  await office.waitForTimeout(2400);
  check((await office.getByTestId("beds-notice").innerText()).includes("out of service"), "a bed is taken out of service with a note");
  await office.screenshot({ path: path.join(SHOTS, "admin-2-beds.png") });

  current = counter;
  await go(counter, "/profile");
  check((await counter.getByTestId("profile-role").innerText()).length > 0, "a user sees their own profile");
  await counter.getByTestId("profile-current-password").fill(billing.password);
  await counter.getByTestId("profile-new-password").fill("PriyaNewPassword456");
  await counter.getByTestId("profile-confirm-password").fill("PriyaNewPassword456");
  await counter.getByTestId("profile-change-submit").click();
  await counter.waitForTimeout(2800);
  check(await counter.getByTestId("profile-change-success").isVisible(), "and changes their password");
  const relogin = await req("POST", "/auth/login", { email: billing.email, password: "PriyaNewPassword456", deviceId: "BIL001-device", deviceName: "Verifier" });
  check(relogin.success === true, "the new password signs in");

  // -- Health ----------------------------------------------------------------
  console.log(`\n  (HTTP non-2xx seen: ${httpFailures.join(", ") || "none"})\n`);
  const jsErrors = consoleErrors.filter((e) => !/Failed to load resource/i.test(e));
  check(jsErrors.length === 0, "no JavaScript errors", jsErrors.slice(0, 2).join(" | "));
  // The restricted record is refused on purpose, before the glass is broken.
  const expected = [
    new RegExp(`^403 GET /api/v1/records/${rina.id}$`),
    new RegExp(`^403 GET /api/v1/consultations/context/${rina.id}$`),
  ];
  const unexpected = httpFailures.filter((f) => !expected.some((re) => re.test(f)));
  check(unexpected.length === 0, "no unexpected HTTP failures", unexpected.join(", "));
} catch (err) {
  console.error("\nJourney threw:", err.message);
  failures.push(`exception: ${err.message}`);
  await current.screenshot({ path: path.join(SHOTS, "emergency-FAILURE.png") }).catch(() => {});
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
console.log("\nEmergency, break-the-glass, reports and administration work end to end. Screenshots in docs/shots/\n");
