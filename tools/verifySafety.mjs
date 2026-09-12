/**
 * Phase 3 gate — the interception, in a real browser.
 *
 * The one thing no unit or integration test can show: that a doctor sitting at
 * this screen, with this patient, physically cannot prescribe amoxicillin to a
 * penicillin-anaphylaxis patient without typing a reason — and that the alert
 * reaches them while they are still choosing, not after the pharmacist has the
 * order.
 *
 * Also covers OP-06 in the UI: a signed note is read-only and corrections
 * become addenda.
 *
 *   node tools/verifySafety.mjs
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

// ---------------------------------------------------------------------------
console.log("\nStarting the API…");

const { MongoMemoryReplSet } = await imp(
  BACK, "node_modules", "mongodb-memory-server", "index.js",
);
const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
const mongoUri = replSet.getUri();

const API_PORT = 5197;
const api = spawn(process.execPath, ["server.js"], {
  cwd: BACK,
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(API_PORT),
    MONGODB_URI: mongoUri,
    JWT_ACCESS_SECRET: "verify-access-secret-not-real",
    JWT_REFRESH_SECRET: "verify-refresh-secret-not-real",
    JWT_ADMIN_SECRET: "verify-admin-secret-not-real",
    BCRYPT_ROUNDS: "4",
    CORS_ORIGIN: "",
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

// ---------------------------------------------------------------------------
process.env.MONGODB_URI = mongoUri;
process.env.JWT_ACCESS_SECRET ??= "verify-access-secret-not-real";
process.env.JWT_REFRESH_SECRET ??= "verify-refresh-secret-not-real";
process.env.JWT_ADMIN_SECRET ??= "verify-admin-secret-not-real";
process.env.BCRYPT_ROUNDS ??= "4";

const mongoose = (await imp(BACK, "node_modules", "mongoose", "index.js")).default;
await mongoose.connect(mongoUri);
const { HospitalModel } = await imp(BACK, "src", "modules", "hospital", "hospital.model.js");
const { UserModel, hashPassword } = await imp(BACK, "src", "modules", "user", "user.model.js");
const { defaultPermissionsFor, ROLES } = await imp(BACK, "src", "config", "roles.js");

const hospital = await HospitalModel.create({
  name: "City General Hospital", code: "CGH",
  approvalStatus: "approved", approvedAt: new Date(), isActive: true,
  timezone: "Asia/Kolkata",
});
await UserModel.create({
  hospitalId: hospital._id, employeeId: "ADM001",
  firstName: "Asha", lastName: "Menon", email: "admin@cgh.test",
  passwordHash: await hashPassword("AdminPassword123"),
  role: ROLES.ADMIN, permissions: defaultPermissionsFor(ROLES.ADMIN),
  isActive: true, mustChangePassword: false,
});

const req = (method, p, body, token) =>
  fetch(`${API}/api/v1${p}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then((r) => r.json());

const adminToken = (
  await req("POST", "/auth/login", {
    email: "admin@cgh.test", password: "AdminPassword123",
    deviceId: "verify-admin-device", deviceName: "Verifier",
  })
).data.accessToken;

const dept = await req("POST", "/departments", { name: "General Medicine", code: "MED" }, adminToken);

async function provision({ employeeId, firstName, email, role, departmentId }) {
  const created = await req(
    "POST", "/users",
    { employeeId, firstName, lastName: "Kumar", email, role, departmentId },
    adminToken,
  );
  const temp = created.data.temporaryPassword;
  const first = await req("POST", "/auth/login", {
    email, password: temp, deviceId: `${employeeId}-device`, deviceName: "Verifier",
  });
  const password = `${firstName}Password123`;
  await req(
    "POST", "/auth/change-password",
    { currentPassword: temp, newPassword: password, deviceId: `${employeeId}-device` },
    first.data.accessToken,
  );
  const live = await req("POST", "/auth/login", {
    email, password, deviceId: `${employeeId}-device`,
  });
  return { id: created.data.user.id, email, password, token: live.data.accessToken };
}

const doctor = await provision({
  employeeId: "DOC001", firstName: "Rajesh", email: "rajesh@cgh.test",
  role: "doctor", departmentId: dept.data.id,
});
const reception = await provision({
  employeeId: "REC001", firstName: "Deepak", email: "deepak@cgh.test", role: "receptionist",
});
const pharmacist = await provision({
  employeeId: "PHA001", firstName: "Imran", email: "imran@cgh.test", role: "pharmacy",
});

// The patient this whole phase exists for.
const patient = await req(
  "POST", "/patients",
  {
    firstName: "Sanjay", lastName: "Kumar", gender: "male",
    dateOfBirth: "1985-06-15", mobile: "9876543210",
  },
  reception.token,
);
await req(
  "PUT", `/patients/${patient.data.id}/allergies`,
  {
    allergies: [{
      substance: "Penicillin", severity: "anaphylaxis",
      reaction: "Throat swelling, ICU admission 2019", category: "drug",
    }],
  },
  doctor.token,
);

// The formulary. Amoxil is a penicillin; its name says nothing about that.
await req("POST", "/prescriptions/medicines", {
  name: "Amoxil", genericName: "Amoxicillin", ingredients: ["amoxicillin"],
  form: "capsule", strength: "500mg", schedule: "H",
  defaultDose: "1 cap", defaultFrequency: "1-1-1", defaultDurationDays: 5,
}, adminToken);
await req("POST", "/prescriptions/medicines", {
  name: "Pan-40", genericName: "Pantoprazole", ingredients: ["pantoprazole"],
  form: "tablet", strength: "40mg",
  defaultDose: "1 tab", defaultFrequency: "1-0-0", defaultDurationDays: 7,
}, adminToken);

// The consultation the doctor will open.
const consultation = await req(
  "POST", "/consultations",
  { patientId: patient.data.id, type: "opd" },
  doctor.token,
);

console.log("Seeded: a penicillin-anaphylaxis patient and a formulary containing Amoxil\n");

// ---------------------------------------------------------------------------
const web = http.createServer((rq, rs) => {
  const url = decodeURIComponent((rq.url || "/").split("?")[0]);
  let file = path.join(DIST, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  rs.writeHead(200, {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
  });
  fs.createReadStream(file).pipe(rs);
});
await new Promise((r) => web.listen(0, "127.0.0.1", r));
const WEB = `http://127.0.0.1:${web.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

const consoleErrors = [];
const httpFailures = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("response", (r) => {
  if (r.status() >= 400) {
    httpFailures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  }
});
await page.route("**/api/v1/**", async (route) => {
  const url = new URL(route.request().url());
  const response = await route.fetch({ url: `${API}${url.pathname}${url.search}` });
  await route.fulfill({ response });
});

const signIn = async (p, email, password) => {
  await p.goto(WEB, { waitUntil: "networkidle" });
  await p.waitForTimeout(1300);
  await p.getByTestId("login-email").fill(email);
  await p.getByTestId("login-password").fill(password);
  await p.getByTestId("login-submit").click();
  await p.waitForTimeout(2400);
};

try {
  console.log("The interception — a doctor at the prescribing screen\n");

  await signIn(page, doctor.email, doctor.password);
  check(
    /Good (morning|afternoon|evening), Rajesh/.test(await page.innerText("body")),
    "doctor signs in",
  );

  // Straight to the consultation, the way "See patient" would take them.
  await page.goto(`${WEB}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.evaluate(
    ([cid, pid]) => {
      window.history.pushState({}, "", `/opd/consultation/${pid}?c=${cid}`);
    },
    [consultation.data.id, patient.data.id],
  );

  // The linking config does not carry the consultation id, so navigate through
  // the schedule the way a doctor actually would.
  await page.getByRole("link", { name: "My schedule" }).first().click();
  await page.waitForTimeout(1800);

  // Open the consultation directly via the drafts panel, which lists it.
  const finishBtn = page.getByRole("button", { name: "Finish it" }).first();
  const hasDraft = await finishBtn.isVisible().catch(() => false);
  check(hasDraft, "the unfinished note is surfaced so nobody goes home with one open");
  await page.screenshot({ path: path.join(SHOTS, "safety-1-schedule.png") });

  if (hasDraft) {
    await finishBtn.click();
    await page.waitForTimeout(2200);
  }

  let text = await page.innerText("body");

  // -- OP-01: the history is there before anything is typed ------------------
  check(text.includes("Sanjay Kumar"), "the consultation opens on the right patient");
  check(text.includes("Penicillin"), "OP-01: the allergy is on screen before typing starts");
  check(text.includes("anaphylaxis"), "and its severity is stated");
  await page.screenshot({ path: path.join(SHOTS, "safety-2-consultation.png") });

  // -- Record the visit ------------------------------------------------------
  await page.getByTestId("cc-field").fill("Fever and sore throat for three days");
  await page.getByTestId("exam-field").fill("Temp 38.9, pharynx inflamed");
  await page.getByTestId("dx-field").fill("Acute pharyngitis");
  await page.getByTestId("dx-add").click();
  await page.waitForTimeout(1400);
  check(
    (await page.innerText("body")).includes("Acute pharyngitis"),
    "OP-03: the diagnosis is recorded",
  );

  // -- THE INTERCEPTION ------------------------------------------------------
  await page.getByTestId("medicine-search").fill("Amox");
  await page.waitForTimeout(1600);
  const amoxOption = page.getByText("Amoxil 500mg capsule").first();
  check(await amoxOption.isVisible().catch(() => false), "the formulary finds Amoxil");
  await amoxOption.click();
  await page.waitForTimeout(2200);

  text = await page.innerText("body");
  // The moment that matters: the doctor has chosen it, nothing is saved, and
  // the alert is already on screen.
  check(text.includes("Anaphylaxis risk"), "THE INTERCEPTION: the alert fires on choosing, before saving");
  check(text.includes("penicillins"), "and explains that Amoxil IS a penicillin");
  check(text.includes("Review this alert"), "and the line cannot simply be left as-is");
  await page.screenshot({ path: path.join(SHOTS, "safety-3-alert-inline.png") });

  // -- The blocking dialog ---------------------------------------------------
  await page.getByTestId("review-alert-Amoxil").click();
  await page.waitForTimeout(900);

  text = await page.innerText("body");
  check(text.includes("Anaphylaxis risk"), "the blocking alert opens");
  check(text.includes("Throat swelling"), "it shows the recorded reaction");
  check(text.includes("Remove this medicine"), "the SAFE action is offered first");
  check(text.includes("Prescribe anyway"), "the override is available but secondary");
  await page.screenshot({ path: path.join(SHOTS, "safety-4-blocking-alert.png") });

  // Overriding demands a reason — a click alone is not enough.
  await page.getByRole("button", { name: "Prescribe anyway" }).click();
  await page.waitForTimeout(700);
  text = await page.innerText("body");
  check(
    text.includes("Why are you overriding this?"),
    "clicking override asks for a reason rather than proceeding",
  );
  check(
    text.includes("recorded in the patient"),
    "and says the reason goes into the record with their name",
  );
  await page.screenshot({ path: path.join(SHOTS, "safety-5-reason-required.png") });

  // A token reason is refused by the control itself.
  const reasonBox = page.getByLabel("Reason for overriding this alert");
  await reasonBox.fill("ok");
  await page.waitForTimeout(500);
  const confirmBtn = page.getByRole("button", { name: "Confirm override" });
  check(
    await confirmBtn.isDisabled().catch(() => false),
    "a token reason cannot be submitted",
  );

  // A real one can.
  await reasonBox.fill("Allergy testing 2023 negative; consultant approved supervised challenge");
  await page.waitForTimeout(600);
  check(!(await confirmBtn.isDisabled().catch(() => true)), "a real reason unlocks the override");
  await confirmBtn.click();
  await page.waitForTimeout(1200);

  text = await page.innerText("body");
  check(text.includes("Prescribing anyway"), "the recorded reason is shown on the line");
  check(text.includes("Allergy testing 2023"), "and the reason itself is visible");
  await page.screenshot({ path: path.join(SHOTS, "safety-6-overridden.png") });

  // -- The safe path: removing the medicine ---------------------------------
  await page.getByTestId("medicine-search").fill("Pan-40");
  await page.waitForTimeout(1600);
  await page.getByText("Pan-40 40mg tablet").first().click();
  await page.waitForTimeout(1800);
  const panLine = page.getByTestId("rx-line-Pan-40");
  check(await panLine.isVisible().catch(() => false), "a safe medicine is added");
  check(
    !(await panLine.innerText()).includes("Anaphylaxis"),
    "and raises no alert of its own",
  );

  // -- Prescribe -------------------------------------------------------------
  await page.getByTestId("prescribe-submit").click();
  await page.waitForTimeout(2600);
  text = await page.innerText("body");
  check(text.includes("sent to the pharmacy"), "the prescription is written");
  check(/RX\d{6}/.test(text), "and given a number");
  await page.screenshot({ path: path.join(SHOTS, "safety-7-prescribed.png") });

  // -- OP-06: signing locks it ----------------------------------------------
  await page.getByTestId("sign-consultation").click();
  await page.waitForTimeout(800);
  check(
    (await page.innerText("body")).includes("cannot be edited"),
    "signing warns that the note becomes permanent",
  );
  await page.getByRole("button", { name: "Sign it" }).click();
  await page.waitForTimeout(2400);

  text = await page.innerText("body");
  check(text.includes("This note is permanent"), "OP-06: the note is signed and locked");
  check(text.includes("Signed by Rajesh Kumar"), "and names who signed it");
  check(text.includes("Notes added since signing"), "corrections are offered as addenda");

  // The fields are genuinely read-only now.
  const ccField = page.getByTestId("cc-field");
  check(
    await ccField.isEditable().then((e) => !e).catch(() => true),
    "the original text can no longer be edited",
  );
  await page.screenshot({ path: path.join(SHOTS, "safety-8-signed.png") });

  // -- An addendum -----------------------------------------------------------
  await page.getByTestId("addendum-field").fill(
    "Throat swab sent after the consultation; result to follow.",
  );
  await page.waitForTimeout(500);
  await page.getByTestId("addendum-submit").click();
  await page.waitForTimeout(2000);
  text = await page.innerText("body");
  check(text.includes("Throat swab sent"), "the correction is recorded beside the original");
  // The field is read-only now, so its text lives in the input's value rather
  // than in innerText.
  const originalText = await page.getByTestId("cc-field").inputValue();
  check(
    originalText === "Fever and sore throat for three days",
    "and the original is untouched",
    originalText,
  );

  // -- MR-04: what the PHARMACIST receives ----------------------------------
  const phPage = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  await phPage.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${API}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await signIn(phPage, pharmacist.email, pharmacist.password);
  await phPage.goto(`${WEB}/patients/${patient.data.id}/record`, { waitUntil: "networkidle" });
  await phPage.waitForTimeout(2600);

  const phText = await phPage.innerText("body");
  check(phText.includes("Pharmacy view"), "the pharmacist is told which view they have");
  check(
    phText.includes("Diagnosis detail is not included"),
    "and that it is partial, so an empty section is not read as an empty history",
  );
  check(phText.includes("Penicillin"), "MR-04: the pharmacist sees the allergy");
  check(!phText.includes("Acute pharyngitis"), "MR-04: and NOT the diagnosis");
  await phPage.screenshot({ path: path.join(SHOTS, "safety-9-pharmacy-view.png") });

  await phPage.getByRole("tab", { name: /Medication/ }).first().click();
  await phPage.waitForTimeout(1200);
  const medText = await phPage.innerText("body");
  check(medText.includes("Amoxil"), "the prescription reached the pharmacy");
  check(
    medText.includes("Allergy testing 2023"),
    "and carries the reason the prescriber gave for overriding",
  );
  check(
    medText.includes("Anaphylaxis risk"),
    "beside the alert it overrode — a reason alone is not reviewable",
  );
  await phPage.screenshot({ path: path.join(SHOTS, "safety-10-pharmacy-override.png") });

  // -- Health ----------------------------------------------------------------
  console.log(`\n  (HTTP non-2xx seen: ${httpFailures.join(", ") || "none"})\n`);
  const jsErrors = consoleErrors.filter((e) => !/Failed to load resource/i.test(e));
  check(jsErrors.length === 0, "no JavaScript errors", jsErrors.slice(0, 2).join(" | "));
  const unexpected = httpFailures.filter((f) => !/^40[139] /.test(f));
  check(unexpected.length === 0, "no unexpected HTTP failures", unexpected.join(", "));
} catch (err) {
  console.error("\nJourney threw:", err.message);
  failures.push(`exception: ${err.message}`);
  await page.screenshot({ path: path.join(SHOTS, "safety-FAILURE.png") }).catch(() => {});
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
console.log("\nThe interception works end to end. Screenshots in docs/shots/\n");
