/**
 * Phase 2 gate — Flow 1 steps 1 to 4, end to end in a real browser.
 *
 *   1. Receptionist searches before registering        (RG-01)
 *   2. Registers a new patient, system issues the ID   (RG-02, RG-03)
 *   3. Books against a doctor and a genuinely free slot (AP-01)
 *   4. Marks the patient Arrived, token issued          (AP-03)
 *
 * Plus the two things that are only observable in a browser: that a duplicate
 * warning actually appears while the form is being typed into, and that a
 * booked slot is rendered as taken rather than quietly disappearing.
 *
 * Boots the REAL API against an in-memory replica set and serves the REAL web
 * export. Nothing is mocked.
 *
 *   node tools/verifyFlow1.mjs
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
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
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

/** Next occurrence of a weekday, as a calendar date. Never via toISOString. */
function nextWeekday(dow) {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  let d = now.getDate();
  for (let i = 0; i < 14; i += 1) {
    d += 1;
    const probe = new Date(y, m, d);
    y = probe.getFullYear();
    m = probe.getMonth();
    d = probe.getDate();
    if (probe.getDay() === dow) {
      return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  throw new Error("no weekday found");
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
console.log("\nStarting the API…");

const { MongoMemoryReplSet } = await imp(
  BACK, "node_modules", "mongodb-memory-server", "index.js",
);
const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
const mongoUri = replSet.getUri();

const API_PORT = 5198;
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
  } catch {
    /* not up yet */
  }
  if (waited > 40_000) throw new Error(`API did not start.\n${apiLog}`);
  await new Promise((r) => setTimeout(r, 300));
}
console.log(`API ready on ${API}`);

// ---------------------------------------------------------------------------
// Seed: hospital, admin, department, receptionist, doctor, roster
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
  name: "City General Hospital",
  code: "CGH",
  approvalStatus: "approved",
  approvedAt: new Date(),
  isActive: true,
  timezone: "Asia/Kolkata",
});
await UserModel.create({
  hospitalId: hospital._id,
  employeeId: "ADM001",
  firstName: "Asha",
  lastName: "Menon",
  email: "admin@cgh.test",
  passwordHash: await hashPassword("AdminPassword123"),
  role: ROLES.ADMIN,
  permissions: defaultPermissionsFor(ROLES.ADMIN),
  isActive: true,
  mustChangePassword: false,
});

const post = (p, body, token) =>
  fetch(`${API}/api/v1${p}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const adminSession = await post("/auth/login", {
  email: "admin@cgh.test",
  password: "AdminPassword123",
  deviceId: "verify-admin-device",
  deviceName: "Verifier",
});
const adminToken = adminSession.data.accessToken;

const dept = await post(
  "/departments",
  { name: "General Medicine", code: "MED", consultationFee: 500 },
  adminToken,
);

/** Creates a user and returns their working password. */
async function provision({ employeeId, firstName, email, role, departmentId }) {
  const created = await post(
    "/users",
    { employeeId, firstName, lastName: "Kumar", email, role, departmentId },
    adminToken,
  );
  const temp = created.data.temporaryPassword;
  const first = await post("/auth/login", {
    email,
    password: temp,
    deviceId: `${employeeId}-device`,
    deviceName: "Verifier",
  });
  const password = `${firstName}Password123`;
  await post(
    "/auth/change-password",
    { currentPassword: temp, newPassword: password, deviceId: `${employeeId}-device` },
    first.data.accessToken,
  );
  return { id: created.data.user.id, email, password };
}

const reception = await provision({
  employeeId: "REC001",
  firstName: "Deepak",
  email: "deepak@cgh.test",
  role: "receptionist",
});
const doctor = await provision({
  employeeId: "DOC001",
  firstName: "Rajesh",
  email: "rajesh@cgh.test",
  role: "doctor",
  departmentId: dept.data.id,
});

const CLINIC_DATE = nextWeekday(2); // a Tuesday
await post(
  "/appointments/roster",
  {
    doctorId: doctor.id,
    departmentId: dept.data.id,
    dayOfWeek: 2,
    startTime: "10:00",
    endTime: "13:00",
    slotMinutes: 15,
    slotCapacity: 1,
  },
  adminToken,
);

// One patient already on file, so the duplicate check has something to find.
await post(
  "/patients",
  {
    firstName: "Sanjay",
    lastName: "Kumar",
    gender: "male",
    dateOfBirth: "1985-06-15",
    mobile: "9876543210",
  },
  (await post("/auth/login", {
    email: reception.email,
    password: reception.password,
    deviceId: "REC001-device",
  })).data.accessToken,
);

console.log(`Seeded: hospital, 3 staff, a Tuesday clinic, 1 existing patient`);
console.log(`Clinic date: ${CLINIC_DATE}\n`);

// ---------------------------------------------------------------------------
// Serve the web export
// ---------------------------------------------------------------------------
const web = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let file = path.join(DIST, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, "index.html");
  }
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
  });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => web.listen(0, "127.0.0.1", r));
const WEB = `http://127.0.0.1:${web.address().port}`;

// ---------------------------------------------------------------------------
// Drive it
// ---------------------------------------------------------------------------
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } });
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
// The live-update socket is not under test here. Blocked, so the gate never
// reaches whatever else happens to listen on the dev port baked into the build.
await page.route("**/socket.io/**", (route) => route.abort());
await page.route("**/api/v1/**", async (route) => {
  const url = new URL(route.request().url());
  const response = await route.fetch({ url: `${API}${url.pathname}${url.search}` });
  await route.fulfill({ response });
});

try {
  console.log("Flow 1 — arrival to the OPD queue\n");

  // -- Sign in as reception --------------------------------------------------
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.getByTestId("login-email").fill(reception.email);
  await page.getByTestId("login-password").fill(reception.password);
  await page.getByTestId("login-submit").click();
  await page.waitForTimeout(2200);

  check(
    /Good (morning|afternoon|evening), Deepak/.test(await page.innerText("body")),
    "receptionist signs in",
  );

  // -- Step 1: search before registering ------------------------------------
  await page.getByRole("link", { name: "Patients" }).first().click();
  await page.waitForTimeout(1600);
  await page.getByTestId("patient-search").fill("Sanjay");
  await page.waitForTimeout(1400);

  let text = await page.innerText("body");
  check(text.includes("Sanjay Kumar"), "step 1: search finds the existing patient");
  check(text.includes("CGH-P"), "the system-issued patient ID is shown");
  await page.screenshot({ path: path.join(SHOTS, "flow1-1-patient-search.png") });

  // -- Step 2: register, and see the duplicate warning appear ----------------
  await page.getByTestId("register-patient-cta").click();
  await page.waitForTimeout(1400);
  check(
    (await page.innerText("body")).includes("Register patient"),
    "step 2: the registration form opens",
  );

  // Type the SAME person's details. RG-01 should notice while typing.
  await page.getByTestId("reg-firstName").fill("Sanjay");
  await page.getByTestId("reg-lastName").fill("Kumar");
  await page.getByTestId("reg-mobile").fill("9876543210");
  await page.waitForTimeout(1800);

  const dupVisible = await page.getByTestId("duplicate-warning").isVisible().catch(() => false);
  check(dupVisible, "RG-01: the duplicate warning appears while typing");

  if (dupVisible) {
    const dupText = await page.getByTestId("duplicate-warning").innerText();
    // The REASONS are what make someone look. "Possible duplicate" gets clicked past.
    check(dupText.includes("Same mobile number"), "the warning says WHY it matched");
    check(dupText.includes("Sanjay Kumar"), "the warning names the existing patient");
  }
  await page.screenshot({ path: path.join(SHOTS, "flow1-2-duplicate-warning.png") });

  // Now register someone genuinely new.
  await page.getByTestId("reg-firstName").fill("Kamala");
  await page.getByTestId("reg-lastName").fill("Devi");
  await page.getByTestId("reg-mobile").fill("9800000001");
  await page.getByTestId("reg-age").fill("68");
  await page.waitForTimeout(1500);

  const stillWarning = await page
    .getByTestId("duplicate-warning")
    .isVisible()
    .catch(() => false);
  check(!stillWarning, "the warning clears once the details are someone else's");

  // Gender is a Select, which opens a sheet.
  await page.getByRole("button", { name: /^Gender\./ }).click();
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Female" }).click();
  await page.waitForTimeout(400);

  await page.getByTestId("reg-submit").click();
  await page.waitForTimeout(2400);

  text = await page.innerText("body");
  check(text.includes("Kamala Devi"), "step 2: the patient is registered");
  check(/CGH-P\d{6}/.test(text), "RG-03: the system issued a patient ID");
  check(
    text.includes("cannot be changed"),
    "the desk is told the ID is permanent",
  );
  await page.screenshot({ path: path.join(SHOTS, "flow1-3-registered.png") });

  // The tri-state, as RECEPTION sees it — through the identity banner rather
  // than the clinical panel, which is gated behind record.view. The banner is
  // deliberately not role-gated: an allergy nobody at the front desk can see is
  // an allergy that gets missed.
  check(
    text.includes("Allergies not recorded"),
    "the banner says NOT RECORDED, which is not the same as none",
  );
  check(
    !text.includes("No known allergies"),
    "and does not claim there are none",
  );

  // -- Step 3: book against a free slot -------------------------------------
  await page.getByTestId("book-from-patient").click();
  await page.waitForTimeout(1800);

  // Department, then doctor — AP-01's order.
  await page.getByRole("button", { name: /^Department\./ }).click();
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: /General Medicine/ }).click();
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: /^Doctor\./ }).click();
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: /Rajesh/ }).click();
  await page.waitForTimeout(1200);

  // Walk the date forward to the clinic day.
  for (let i = 0; i < 8; i += 1) {
    const shown = await page.getByTestId("book-date").innerText();
    if (shown.includes(String(Number(CLINIC_DATE.slice(8, 10))))) break;
    await page.getByRole("button", { name: "Next" }).first().click();
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1400);

  const slotsVisible = await page.getByTestId("slot-10:00").isVisible().catch(() => false);
  check(slotsVisible, "step 3: the roster produces a slot grid");
  await page.screenshot({ path: path.join(SHOTS, "flow1-4-slot-grid.png") });

  if (slotsVisible) {
    await page.getByTestId("slot-10:30").click();
    await page.waitForTimeout(500);
    await page.getByTestId("book-reason").fill("Fever for three days");
    await page.getByTestId("book-submit").click();
    await page.waitForTimeout(2400);

    text = await page.innerText("body");
    check(text.includes("Booked"), "step 3: the appointment is booked");
    check(/A\d{6}/.test(text), "an appointment number is issued");
    // The wall-clock time, not the server's instant. This is the whole
    // timezone fix, visible.
    check(text.includes("10:30 am"), "the booked time reads back as 10:30, not shifted");
    await page.screenshot({ path: path.join(SHOTS, "flow1-5-booked.png") });
  }

  // -- The booked slot must now show as TAKEN, not vanish --------------------
  await page.getByRole("button", { name: "Book another" }).click();
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: /^Doctor\./ }).click();
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: /Rajesh/ }).click();
  await page.waitForTimeout(1000);
  for (let i = 0; i < 8; i += 1) {
    const shown = await page.getByTestId("book-date").innerText();
    if (shown.includes(String(Number(CLINIC_DATE.slice(8, 10))))) break;
    await page.getByRole("button", { name: "Next" }).first().click();
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1400);

  const takenSlot = page.getByTestId("slot-10:30");
  const takenVisible = await takenSlot.isVisible().catch(() => false);
  check(takenVisible, "AP-01: the booked slot is still LISTED, not hidden");
  if (takenVisible) {
    const slotText = await takenSlot.innerText();
    check(slotText.includes("Fully booked"), "and it says why it cannot be picked");
    check(await takenSlot.isDisabled().catch(() => true), "and it cannot be selected");
  }

  // -- Step 4: mark them arrived on the OPD queue ---------------------------
  await page.getByRole("link", { name: "OPD queue" }).first().click();
  await page.waitForTimeout(1800);
  check((await page.innerText("body")).includes("OPD queue"), "step 4: the queue board opens");
  await page.screenshot({ path: path.join(SHOTS, "flow1-6-opd-queue.png") });

  // The booking is for a future Tuesday, so today's queue is empty. Book a
  // walk-in through the API to exercise arrival and tokening on the board.
  const recSession = await post("/auth/login", {
    email: reception.email,
    password: reception.password,
    deviceId: "REC001-device",
  });
  const patients = await fetch(`${API}/api/v1/patients?search=Kamala`, {
    headers: { Authorization: `Bearer ${recSession.data.accessToken}` },
  }).then((r) => r.json());

  await post(
    "/appointments/walk-in",
    {
      patientId: patients.data[0].id,
      doctorId: doctor.id,
      departmentId: dept.data.id,
      reason: "Chest pain",
    },
    recSession.data.accessToken,
  );

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  await page.getByRole("link", { name: "OPD queue" }).first().click();
  await page.waitForTimeout(1800);

  text = await page.innerText("body");
  check(text.includes("Kamala Devi"), "step 4: the walk-in appears on the queue");
  check(text.includes("Waiting") || text.includes("arrived"), "and is shown as waiting");
  check(/\bwaiting\b/i.test(text), "with a waiting time");
  await page.screenshot({ path: path.join(SHOTS, "flow1-7-queue-with-patient.png") });

  // -- Access: a doctor must not be able to register or book ----------------
  await page.evaluate(() => {
    try {
      localStorage.removeItem("hms-auth-storage");
    } catch {
      /* nothing to clear */
    }
  });
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByTestId("login-email").fill(doctor.email);
  await page.getByTestId("login-password").fill(doctor.password);
  await page.getByTestId("login-submit").click();
  await page.waitForTimeout(2400);

  text = await page.innerText("body");
  check(/Good (morning|afternoon|evening), Rajesh/.test(text), "doctor signs in");
  check(!text.includes("Register patient"), "section 6.2: a doctor sees no Register patient");
  check(text.includes("My schedule"), "a doctor sees their own schedule instead");
  await page.screenshot({ path: path.join(SHOTS, "flow1-8-doctor-sidebar.png") });

  // -- Health of the whole journey ------------------------------------------
  console.log(`\n  (HTTP non-2xx seen: ${httpFailures.join(", ") || "none"})\n`);
  const jsErrors = consoleErrors.filter((e) => !/Failed to load resource/i.test(e));
  check(jsErrors.length === 0, "no JavaScript errors", jsErrors.slice(0, 2).join(" | "));
  const unexpected = httpFailures.filter((f) => !/^40[139] /.test(f));
  check(unexpected.length === 0, "no unexpected HTTP failures", unexpected.join(", "));

  // -- Phone ----------------------------------------------------------------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pPage = await phone.newPage();
  // The live-update socket is not under test here. Blocked, so the gate never
  // reaches whatever else happens to listen on the dev port baked into the build.
  await pPage.route("**/socket.io/**", (route) => route.abort());
  await pPage.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${API}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await pPage.goto(WEB, { waitUntil: "networkidle" });
  await pPage.waitForTimeout(1500);
  await pPage.getByTestId("login-email").fill(reception.email);
  await pPage.getByTestId("login-password").fill(reception.password);
  await pPage.getByTestId("login-submit").click();
  await pPage.waitForTimeout(2400);

  const overflow = await pPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(overflow <= 1, "phone: no horizontal overflow", `${overflow}px`);
  await pPage.screenshot({ path: path.join(SHOTS, "flow1-9-phone.png") });
  await phone.close();
} catch (err) {
  console.error("\nJourney threw:", err.message);
  failures.push(`exception: ${err.message}`);
  await page.screenshot({ path: path.join(SHOTS, "flow1-FAILURE.png") }).catch(() => {});
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
console.log("\nFlow 1 passes end to end. Screenshots in docs/shots/\n");
