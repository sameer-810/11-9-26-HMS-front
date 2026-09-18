/**
 * phase 13 wards gate — fluid intake and the 24-hour balance (online and queued offline),
 * NEWS2 Scale 2, assigning a nurse by name, bed history, the transfer list's single-sex wards,
 * reserving a bed, the shift handover screen and a doctor printing a prescription.
 * boots the real api on an in-memory replica set (never a real database) and serves a web export.
 *   DIST=<export folder> SHOTS=<screenshot folder> node tools/verifyPhase13Wards.mjs
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
const DIST = path.resolve(FRONT, process.env.DIST || "dist");
const SHOTS = path.resolve(
  process.env.SHOTS || path.join(os.tmpdir(), "hms-phase13-wards-shots"),
);

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
let passed = 0;
const check = (ok, label, extra = "") => {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ""}`);
    failures.push(label);
  }
};

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error(`No web export at ${DIST}. Set DIST or run an export first.`);
  process.exit(1);
}
fs.mkdirSync(SHOTS, { recursive: true });

// ---------------------------------------------------------------------------
console.log("\nStarting the API…");

const { MongoMemoryReplSet } = await imp(
  BACK,
  "node_modules",
  "mongodb-memory-server",
  "index.js",
);
const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
const mongoUri = replSet.getUri();

const SECRETS = {
  JWT_ACCESS_SECRET: "verify-access-secret-not-real",
  JWT_REFRESH_SECRET: "verify-refresh-secret-not-real",
  JWT_ADMIN_SECRET: "verify-admin-secret-not-real",
  BCRYPT_ROUNDS: "4",
};

const API_PORT = 5252;
// Run from an empty folder so dotenv finds no .env: every setting comes from here.
const apiCwd = fs.mkdtempSync(path.join(os.tmpdir(), "hms-p13-wards-api-"));
const api = spawn(process.execPath, [path.join(BACK, "server.js")], {
  cwd: apiCwd,
  env: {
    ...process.env,
    ...SECRETS,
    NODE_ENV: "test",
    PORT: String(API_PORT),
    MONGODB_URI: mongoUri,
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
    /* not up */
  }
  if (waited > 40_000) throw new Error(`API did not start.\n${apiLog}`);
  await new Promise((r) => setTimeout(r, 300));
}
console.log(`API ready on ${API}`);

// ---------------------------------------------------------------------------
// Only the hospital and its first administrator are written directly; the rest goes through the API.
process.env.MONGODB_URI = mongoUri;
for (const [k, v] of Object.entries(SECRETS)) process.env[k] = v;

const mongoose = (await imp(BACK, "node_modules", "mongoose", "index.js"))
  .default;
await mongoose.connect(mongoUri);
const { HospitalModel } = await imp(
  BACK,
  "src",
  "modules",
  "hospital",
  "hospital.model.js",
);
const { UserModel, hashPassword } = await imp(
  BACK,
  "src",
  "modules",
  "user",
  "user.model.js",
);
const { defaultPermissionsFor, ROLES } = await imp(
  BACK,
  "src",
  "config",
  "roles.js",
);

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

const req = (method, p, body, token) =>
  fetch(`${API}/api/v1${p}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then((r) => r.json());

const must = (res, what) => {
  if (!res?.success && !res?.data) {
    throw new Error(`Seeding failed at ${what}: ${JSON.stringify(res)}`);
  }
  return res.data;
};

const admin = { email: "admin@cgh.test", password: "AdminPassword123" };
admin.token = (
  await req("POST", "/auth/login", {
    ...admin,
    deviceId: "verify-admin-device",
    deviceName: "Verifier",
  })
).data.accessToken;

const dept = must(
  await req(
    "POST",
    "/departments",
    { name: "General Medicine", code: "MED" },
    admin.token,
  ),
  "department",
);

// ---- Wards: one for women only, one mixed ----------------------------------
async function makeWard(name, code, gender, count) {
  const ward = must(
    await req(
      "POST",
      "/beds/wards",
      { name, code, type: "general", gender, departmentId: dept.id },
      admin.token,
    ),
    `ward ${code}`,
  );
  const room = must(
    await req(
      "POST",
      "/beds/rooms",
      { wardId: ward.id, number: "1", type: "general" },
      admin.token,
    ),
    `room ${code}`,
  );
  must(
    await req(
      "POST",
      "/beds/bulk",
      { roomId: room.id, prefix: `${code}-`, from: 1, to: count },
      admin.token,
    ),
    `beds ${code}`,
  );
  const beds = must(
    await req("GET", `/beds?wardId=${ward.id}&limit=20`, null, admin.token),
    `bed list ${code}`,
  );
  const byNumber = Object.fromEntries(beds.map((b) => [b.number, b]));
  return { ward, beds: byNumber };
}
const womens = await makeWard("Women's Ward", "WW", "female", 3);
const general = await makeWard("General Ward", "GW", "mixed", 4);

async function provision({
  employeeId,
  firstName,
  lastName = "Rao",
  email,
  role,
  ...extra
}) {
  const created = must(
    await req(
      "POST",
      "/users",
      { employeeId, firstName, lastName, email, role, ...extra },
      admin.token,
    ),
    `user ${email}`,
  );
  const temp = created.temporaryPassword;
  const first = await req("POST", "/auth/login", {
    email,
    password: temp,
    deviceId: `${employeeId}-device`,
    deviceName: "Verifier",
  });
  const password = `${firstName}Password123`;
  await req(
    "POST",
    "/auth/change-password",
    {
      currentPassword: temp,
      newPassword: password,
      deviceId: `${employeeId}-device`,
    },
    first.data.accessToken,
  );
  const live = await req("POST", "/auth/login", {
    email,
    password,
    deviceId: `${employeeId}-device`,
  });
  return {
    id: created.user.id,
    name: `${firstName} ${lastName}`,
    email,
    password,
    token: live.data.accessToken,
  };
}

const doctor = await provision({
  employeeId: "DOC001",
  firstName: "Rajesh",
  lastName: "Iyer",
  email: "rajesh@cgh.test",
  role: "doctor",
  departmentId: dept.id,
  registrationNumber: "KMC-45821",
});
// Nurse 1 works both wards; nurse 2 has no ward, so only a named allocation reaches her.
const nurse1 = await provision({
  employeeId: "NUR001",
  firstName: "Meera",
  lastName: "Pillai",
  email: "meera@cgh.test",
  role: "nurse",
  wardIds: [womens.ward.id, general.ward.id],
});
const nurse2 = await provision({
  employeeId: "NUR002",
  firstName: "Kiran",
  lastName: "Joseph",
  email: "kiran@cgh.test",
  role: "nurse",
});
const reception = await provision({
  employeeId: "REC001",
  firstName: "Deepak",
  email: "deepak@cgh.test",
  role: "receptionist",
});

async function registerPatient(firstName, lastName, gender, dateOfBirth) {
  const p = must(
    await req(
      "POST",
      "/patients",
      { firstName, lastName, gender, dateOfBirth, mobile: "9876543210" },
      reception.token,
    ),
    `patient ${firstName}`,
  );
  await req(
    "PUT",
    `/patients/${p.id}/allergies`,
    { allergies: [] },
    doctor.token,
  );
  return p;
}
const priya = await registerPatient("Priya", "Shah", "female", "1972-04-02");
const vikram = await registerPatient("Vikram", "Singh", "male", "1956-11-20");

const vikramAdmission = must(
  await req(
    "POST",
    "/admissions",
    {
      patientId: vikram.id,
      bedId: general.beds["GW-1"].id,
      reason: "Exacerbation of COPD",
    },
    doctor.token,
  ),
  "admit Vikram",
);
const priyaAdmission = must(
  await req(
    "POST",
    "/admissions",
    {
      patientId: priya.id,
      bedId: womens.beds["WW-1"].id,
      reason: "Pyelonephritis",
    },
    doctor.token,
  ),
  "admit Priya",
);

// A signed ward-round consultation with a prescription, for printing.
const crocin = must(
  await req(
    "POST",
    "/prescriptions/medicines",
    {
      name: "Crocin 650",
      genericName: "Paracetamol",
      ingredients: ["paracetamol"],
      form: "tablet",
      strength: "650 mg",
      defaultDose: "1 tab",
      defaultFrequency: "tds",
      defaultDurationDays: 3,
    },
    admin.token,
  ),
  "Crocin 650",
);
const wardRound = must(
  await req(
    "POST",
    "/consultations",
    {
      patientId: vikram.id,
      admissionId: vikramAdmission.id,
      type: "ward_round",
    },
    doctor.token,
  ),
  "ward round",
);
must(
  await req(
    "PATCH",
    `/consultations/${wardRound.id}`,
    { chiefComplaint: "Breathless, productive cough" },
    doctor.token,
  ),
  "ward round note",
);
const { prescription: rx } = must(
  await req(
    "POST",
    "/prescriptions",
    {
      patientId: vikram.id,
      consultationId: wardRound.id,
      lines: [
        {
          medicineId: crocin.id,
          dose: "1 tab",
          frequency: "tds",
          durationDays: 3,
        },
      ],
    },
    doctor.token,
  ),
  "prescription",
);
must(
  await req("POST", `/consultations/${wardRound.id}/sign`, null, doctor.token),
  "sign ward round",
);

console.log(
  "Seeded: a doctor, two nurses, a women's ward and a mixed ward, two admissions, a signed consultation with a prescription\n",
);

// ---------------------------------------------------------------------------
const web = http.createServer((rq, rs) => {
  const url = decodeURIComponent((rq.url || "/").split("?")[0]);
  let file = path.join(DIST, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
    file = path.join(DIST, "index.html");
  rs.writeHead(200, {
    "Content-Type":
      TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
  });
  fs.createReadStream(file).pipe(rs);
});
await new Promise((r) => web.listen(0, "127.0.0.1", r));
const WEB = `http://127.0.0.1:${web.address().port}`;

const browser = await chromium.launch();
const consoleErrors = [];
const httpFailures = [];

async function newPage(viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  // test hook: record print jobs instead of printing them.
  await ctx.addInitScript(() => {
    globalThis.__HMS_TEST_PRINT__ = true;
  });
  const p = await ctx.newPage();
  p.networkPulled = false;
  p.on("console", (m) => {
    if (m.type() === "error" && !p.networkPulled) consoleErrors.push(m.text());
  });
  p.on("pageerror", (e) => consoleErrors.push(String(e)));
  p.on("response", (r) => {
    if (r.status() >= 400)
      httpFailures.push(
        `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`,
      );
  });
  // the live-update socket is not under test; blocked so the gate never reaches a dev port.
  await p.route("**/socket.io/**", (route) => route.abort());
  // playwright's offline mode does not reach this proxy, so a pulled network is enforced here too.
  await p.route("**/api/v1/**", async (route) => {
    if (p.networkPulled) return route.abort("internetdisconnected");
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${API}${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  return p;
}
const signIn = async (p, who) => {
  await p.goto(WEB, { waitUntil: "networkidle" });
  await p.waitForTimeout(1300);
  await p.getByTestId("login-email").fill(who.email);
  await p.getByTestId("login-password").fill(who.password);
  await p.getByTestId("login-submit").click();
  await p.waitForTimeout(2600);
};
const go = async (p, route, wait = 2800) => {
  await p.goto(`${WEB}${route}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(wait);
};
const body = (p) => p.innerText("body");
const textOf = (p, id) =>
  p
    .getByTestId(id)
    .first()
    .innerText()
    .catch(() => "");
const shot = (p, name) =>
  p.screenshot({ path: path.join(SHOTS, `p13-wards-${name}.png`) });
const until = async (p, fn, ms = 40_000) => {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() > end) return false;
    await p.waitForTimeout(500);
  }
};
async function printJob(p, testId) {
  await p.evaluate(() => {
    window.__hmsLastPrint = undefined;
  });
  await p.getByTestId(testId).click();
  await p.waitForFunction(() => Boolean(window.__hmsLastPrint), null, {
    timeout: 10_000,
  });
  return p.evaluate(() => window.__hmsLastPrint);
}
async function recordObs(p, values) {
  await p.getByText("Record obs", { exact: true }).first().click();
  await p.waitForTimeout(700);
  for (const [id, v] of Object.entries(values))
    await p.getByTestId(`obs-${id}`).fill(String(v));
  await p.getByTestId("obs-air").click();
  await p.getByTestId("obs-acvpu-alert").click();
  await p.getByTestId("obs-submit").click();
  await p.waitForTimeout(2200);
}
const openChart = async (p) => {
  await p.getByText("Chart", { exact: true }).first().click();
  await p.waitForTimeout(1500);
};

const nursePage = await newPage();
const doctorPage = await newPage();

try {
  // =========================================================================
  console.log("Fluid intake and the 24-hour balance\n");

  await signIn(nursePage, nurse1);
  await go(nursePage, `/nursing/patients/${priyaAdmission.id}`);
  check(
    (await textOf(nursePage, "fluid-balance")).includes(
      "Nothing recorded in the last 24 hours",
    ),
    "a chart with no fluids says Nothing recorded, not 0 mL",
  );
  await shot(nursePage, "1-empty-balance");

  await go(nursePage, `/nursing/patients/${vikramAdmission.id}`);
  await nursePage.getByText("Record obs", { exact: true }).first().click();
  await nursePage.waitForTimeout(700);
  check(
    (await nursePage.getByTestId("obs-oralIntakeMl").count()) === 1 &&
      (await nursePage.getByTestId("obs-ivIntakeMl").count()) === 1 &&
      (await nursePage.getByTestId("obs-urineOutputMl").count()) === 1,
    "the observation form asks for oral intake and IV intake beside urine output",
  );
  await recordObs(nursePage, {
    respiratoryRate: 18,
    spo2: 95,
    systolic: 128,
    diastolic: 80,
    pulse: 88,
    temperatureC: 37.1,
    oralIntakeMl: 200,
    ivIntakeMl: 500,
    urineOutputMl: 400,
  });
  await openChart(nursePage);
  const intake = await textOf(nursePage, "fluid-intake");
  const output = await textOf(nursePage, "fluid-output");
  const balance = await textOf(nursePage, "fluid-balance-total");
  check(
    intake.includes("700 mL") &&
      intake.includes("Oral 200 mL") &&
      intake.includes("IV 500 mL"),
    "the balance card shows intake 700 mL (oral 200, IV 500)",
    intake.replace(/\s+/g, " "),
  );
  check(output.includes("400 mL"), "output 400 mL", output);
  check(balance.includes("+300 mL"), "and a balance of +300 mL", balance);
  const trend = await textOf(nursePage, "observation-trend");
  check(
    trend.includes("Oral in") && trend.includes("200 mL") && trend.includes("500 mL"),
    "the chart row shows the intake it was recorded with",
  );
  await shot(nursePage, "2-balance");

  // ---- Offline -------------------------------------------------------------
  nursePage.networkPulled = true;
  await nursePage.context().setOffline(true);
  await nursePage.waitForTimeout(1200);
  await recordObs(nursePage, {
    respiratoryRate: 17,
    spo2: 96,
    systolic: 126,
    pulse: 84,
    temperatureC: 37,
    oralIntakeMl: 150,
    ivIntakeMl: 250,
  });
  check(
    await nursePage
      .getByTestId("observation-queued")
      .isVisible()
      .catch(() => false),
    "offline, a set with intake is saved on this device",
  );
  await openChart(nursePage);
  const pendingRow = await nursePage
    .locator('[data-testid^="pending-observation-"]')
    .first()
    .innerText()
    .catch(() => "");
  check(
    pendingRow.includes("Waiting to send") &&
      pendingRow.includes("150 mL") &&
      pendingRow.includes("250 mL"),
    "the waiting row shows its oral and IV intake",
    pendingRow.replace(/\s+/g, " "),
  );
  check(
    (await textOf(nursePage, "fluid-balance")).includes("not counted until"),
    "and the balance card says the unsent set is not counted yet",
  );
  await shot(nursePage, "3-offline-pending");

  nursePage.networkPulled = false;
  await nursePage.context().setOffline(false);
  const drained = await until(
    nursePage,
    async () =>
      (await nursePage
        .locator('[data-testid^="pending-observation-"]')
        .count()) === 0,
    60_000,
  );
  check(drained, "back online, the queued set is sent");
  const stored = await req(
    "GET",
    `/nursing/observations?admissionId=${vikramAdmission.id}`,
    null,
    nurse1.token,
  );
  const offlineSet = (stored.data ?? []).find(
    (o) => o.vitals?.oralIntakeMl === 150,
  );
  check(
    Boolean(offlineSet) && offlineSet.vitals.ivIntakeMl === 250,
    "and the server holds its oral and IV intake",
  );

  // =========================================================================
  console.log("\nNEWS2 Scale 2\n");

  await signIn(doctorPage, doctor);
  await go(doctorPage, `/ipd/patients/${vikramAdmission.id}`);
  check(
    (await textOf(doctorPage, "news2-scale-current")).includes("Scale 1"),
    "the chart shows the patient on Scale 1",
  );
  await doctorPage.getByTestId("news2-scale-open").click();
  await doctorPage.waitForTimeout(700);
  const form = await textOf(doctorPage, "news2-scale-form");
  check(
    form.includes("hypercapnic respiratory failure") && form.includes("88–92%"),
    "switching explains when Scale 2 is right",
  );
  await doctorPage
    .getByTestId("news2-scale-indication")
    .fill("ABG today: pCO2 7.6 kPa on air, known COPD");
  check(
    (await doctorPage
      .getByTestId("news2-scale-submit")
      .getAttribute("aria-disabled")) === "true",
    "and cannot be done until the confirmation is ticked",
  );
  await doctorPage.getByTestId("news2-scale-confirm").click();
  check(
    (await doctorPage
      .getByTestId("news2-scale-confirm")
      .getAttribute("aria-checked")) === "true",
    "the confirmation is announced as checked",
  );
  await shot(doctorPage, "4-scale2-form");
  await doctorPage.getByTestId("news2-scale-submit").click();
  await doctorPage.waitForTimeout(2500);
  check(
    (await textOf(doctorPage, "news2-scale-current")).includes("Scale 2"),
    "after confirming, the chart shows Scale 2",
  );
  check(
    (await body(doctorPage)).includes("NEWS2 Scale 2"),
    "and the chart header names it",
  );
  const adm = await req(
    "GET",
    `/admissions/${vikramAdmission.id}`,
    null,
    doctor.token,
  );
  check(adm.data?.news2Scale === 2, "the API holds Scale 2");

  // =========================================================================
  console.log("\nAssign a nurse by name\n");

  const nurse2Page = await newPage();
  await signIn(nurse2Page, nurse2);
  await go(nurse2Page, "/nursing/patients");
  check(
    !(await body(nurse2Page)).includes("Vikram Singh"),
    "before, nurse 2 (no ward) does not have Vikram on My ward",
  );

  await doctorPage.getByTestId("assign-nurse-open").click();
  await doctorPage.waitForTimeout(1500);
  await doctorPage.getByText("Choose a nurse", { exact: true }).click();
  await doctorPage.waitForTimeout(600);
  const nurseOptions = await doctorPage.getByRole("menuitem").allInnerTexts();
  check(
    nurseOptions.some((t) => t.includes(nurse1.name)) &&
      nurseOptions.some((t) => t.includes(nurse2.name)),
    "the picker lists both nurses from the API",
    nurseOptions.join(" | "),
  );
  await doctorPage
    .getByRole("menuitem")
    .filter({ hasText: nurse2.name })
    .first()
    .click();
  await doctorPage.waitForTimeout(400);
  await doctorPage.getByTestId("assign-nurse-submit").click();
  await doctorPage.waitForTimeout(2500);
  check(
    (await textOf(doctorPage, "assigned-nurse-name")).includes(nurse2.name),
    "the doctor assigns nurse 2 and the chart names her",
  );
  await shot(doctorPage, "5-assigned-nurse");

  await go(nurse2Page, "/nursing/patients");
  check(
    (await body(nurse2Page)).includes("Vikram Singh"),
    "nurse 2 now sees Vikram on My ward",
  );
  await shot(nurse2Page, "6-nurse2-my-ward");

  // =========================================================================
  console.log("\nTransfer list and bed history\n");

  await doctorPage.getByTestId("open-transfer").click();
  await doctorPage.waitForTimeout(1200);
  await doctorPage.getByText("Choose a free bed", { exact: true }).click();
  await doctorPage.waitForTimeout(900);
  const womensOption = doctorPage
    .getByRole("menuitem")
    .filter({ hasText: "Women's Ward · bed WW-2" })
    .first();
  check(
    (await womensOption.getAttribute("aria-disabled")) === "true" &&
      (await womensOption.innerText()).includes("Female ward"),
    "for a male patient, the women's ward beds are greyed, saying Female ward",
  );
  const mixedOption = doctorPage
    .getByRole("menuitem")
    .filter({ hasText: "General Ward · bed GW-2" })
    .first();
  check(
    (await mixedOption.getAttribute("aria-disabled")) !== "true",
    "while a free bed in the mixed ward can be chosen",
  );
  await shot(doctorPage, "7-transfer-list");
  await mixedOption.click();
  await doctorPage.waitForTimeout(400);
  await doctorPage
    .getByTestId("transfer-reason")
    .fill("Closer to the nursing station for NIV");
  await doctorPage.getByTestId("transfer-submit").click();
  await doctorPage.waitForTimeout(3000);

  const move0 = await textOf(doctorPage, "bed-movement-0");
  const move1 = await textOf(doctorPage, "bed-movement-1");
  check(
    move0.includes("GW-1") && move0.includes("Admitted") && !move0.includes("now"),
    "bed history lists the admission bed, with its end time",
    move0.replace(/\s+/g, " "),
  );
  check(
    move1.includes("GW-2") &&
      move1.includes("Closer to the nursing station") &&
      move1.includes("now"),
    "then the transfer, with its reason, as the current bed",
    move1.replace(/\s+/g, " "),
  );
  await doctorPage.getByTestId("bed-history").scrollIntoViewIfNeeded();
  await shot(doctorPage, "8-bed-history");

  // =========================================================================
  console.log("\nReserve and release a bed\n");

  const adminPage = await newPage();
  await signIn(adminPage, admin);
  await go(adminPage, "/beds");
  const gw3 = general.beds["GW-3"];
  await adminPage.getByTestId(`bed-reserve-${gw3.id}`).click();
  await adminPage.waitForTimeout(600);
  check(
    (await adminPage.getByTestId("bed-reserve-panel").count()) === 1,
    "an available bed offers Reserve",
  );
  check(
    (await adminPage
      .getByTestId("bed-reserve-submit")
      .getAttribute("aria-disabled")) === "true",
    "and asks what it is held for before reserving",
  );
  await adminPage
    .getByTestId("bed-reserve-note")
    .fill("Post-op from theatre 2");
  await adminPage.getByTestId("bed-reserve-submit").click();
  await adminPage.waitForTimeout(2500);
  check(
    (await textOf(adminPage, `bed-status-${gw3.id}`)).includes("Reserved"),
    "the bed reads Reserved",
  );
  check(
    (await textOf(adminPage, `bed-note-${gw3.id}`)).includes(
      "Post-op from theatre 2",
    ),
    "and the tile shows what it is held for",
  );
  const selectable = await req(
    "GET",
    `/beds/selectable?wardId=${general.ward.id}`,
    null,
    doctor.token,
  );
  const gw3Selectable = (selectable.data ?? []).find((b) => b.id === gw3.id);
  check(
    gw3Selectable && !gw3Selectable.selectable,
    "and it cannot be chosen for an admission while reserved",
  );
  await shot(adminPage, "9-reserved");
  await adminPage.getByTestId(`bed-release-${gw3.id}`).click();
  await adminPage.waitForTimeout(600);
  await adminPage.getByTestId("bed-release-submit").click();
  await adminPage.waitForTimeout(2500);
  check(
    (await textOf(adminPage, `bed-status-${gw3.id}`)).includes("Available"),
    "Release makes it available again",
  );
  await adminPage.context().close();

  // =========================================================================
  console.log("\nShift handover\n");

  await go(nursePage, "/nursing/handover");
  check(
    (await nursePage.getByTestId("shift-handover").count()) === 1,
    "Shift handover opens its own screen, not My ward",
  );
  const vStatus = `handover-status-${vikramAdmission.admissionNumber}`;
  check(
    (await textOf(nursePage, vStatus)).includes("Not yet given this shift"),
    'before an SBAR: "Not yet given this shift"',
    await textOf(nursePage, vStatus),
  );
  check(
    (await body(nursePage)).includes("Priya Shah"),
    "the list is the nurse's own patients",
  );
  await shot(nursePage, "10-handover-none");

  await nursePage
    .getByTestId(`handover-open-${vikramAdmission.admissionNumber}`)
    .click();
  await nursePage.waitForTimeout(2800);
  check(
    (await nursePage.getByTestId("sbar-panel").count()) === 1,
    "a row opens the patient's Notes & handover tab",
  );
  await nursePage.getByTestId("sbar-open").click();
  await nursePage.waitForTimeout(500);
  await nursePage
    .getByTestId("sbar-situation")
    .fill("Day 1 with a COPD exacerbation, on NIV overnight.");
  await nursePage
    .getByTestId("sbar-background")
    .fill("Known COPD, Scale 2 prescribed today after a blood gas.");
  await nursePage
    .getByTestId("sbar-assessment")
    .fill("Settled on NIV, talking in sentences, balance positive.");
  await nursePage
    .getByTestId("sbar-recommendation")
    .fill("Repeat blood gas at 18:00 and review fluids at 20:00.");
  await nursePage.getByTestId("sbar-submit").click();
  await nursePage.waitForTimeout(2500);

  await go(nursePage, "/nursing/handover");
  check(
    (await textOf(nursePage, vStatus)).includes("Given, waiting to be taken"),
    'after the SBAR: "Given, waiting to be taken"',
    await textOf(nursePage, vStatus),
  );
  await shot(nursePage, "11-handover-given");

  const given = await req(
    "GET",
    `/nursing/handovers?admissionId=${vikramAdmission.id}`,
    null,
    nurse2.token,
  );
  must(
    await req(
      "POST",
      `/nursing/handovers/${given.data[0].id}/receive`,
      null,
      nurse2.token,
    ),
    "receive handover",
  );
  await go(nursePage, "/nursing/handover");
  check(
    (await textOf(nursePage, vStatus)).includes(`Taken by ${nurse2.name}`),
    `once received: "Taken by ${nurse2.name}"`,
    await textOf(nursePage, vStatus),
  );
  await shot(nursePage, "12-handover-taken");

  // =========================================================================
  console.log("\nThe doctor prints a prescription\n");

  await go(doctorPage, `/patients/${vikram.id}/record`);
  await doctorPage.getByText("Medication", { exact: true }).first().click();
  await doctorPage.waitForTimeout(1200);
  const printId = `print-prescription-${rx.prescriptionNumber}`;
  check(
    (await doctorPage.getByTestId(printId).count()) === 1,
    "the Medication tab offers Print prescription",
  );
  const job = await printJob(doctorPage, printId);
  check(
    job?.html?.includes(rx.prescriptionNumber) &&
      job.html.includes("Crocin 650 mg") &&
      job.html.includes("KMC-45821") &&
      job.html.includes("Vikram Singh"),
    "it prints that prescription, with the prescriber's registration and the patient",
  );
  await shot(doctorPage, "13-record-print");

  await nursePage.goto(`${WEB}/patients/${vikram.id}/record`, {
    waitUntil: "networkidle",
  });
  await nursePage.waitForTimeout(2800);
  await nursePage
    .getByText("Medication", { exact: true })
    .first()
    .click()
    .catch(() => {});
  await nursePage.waitForTimeout(1000);
  check(
    (await nursePage.getByTestId(printId).count()) === 0,
    "a nurse is not offered Print prescription",
  );

  // An outpatient seen from the schedule: prescribed, signed, then printed from the note.
  const anil = await registerPatient("Anil", "Verma", "male", "1988-01-09");
  const walkIn = must(
    await req(
      "POST",
      "/appointments/walk-in",
      {
        patientId: anil.id,
        doctorId: doctor.id,
        departmentId: dept.id,
        reason: "Sore throat",
      },
      reception.token,
    ),
    "walk-in",
  );
  await go(doctorPage, "/doctor/appointments");
  await doctorPage.getByTestId(`see-${walkIn.appointmentNumber}`).click();
  await doctorPage.waitForTimeout(3200);
  await doctorPage.getByTestId("cc-field").fill("Sore throat for two days.");
  await doctorPage.waitForTimeout(2500);
  const anilConsult = must(
    await req("GET", `/consultations?patientId=${anil.id}`, null, doctor.token),
    "anil consultation",
  )[0];
  const { prescription: opdRx } = must(
    await req(
      "POST",
      "/prescriptions",
      {
        patientId: anil.id,
        consultationId: anilConsult.id,
        lines: [
          {
            medicineId: crocin.id,
            dose: "1 tab",
            frequency: "tds",
            durationDays: 3,
          },
        ],
      },
      doctor.token,
    ),
    "outpatient prescription",
  );
  await doctorPage.getByTestId("sign-consultation").click();
  await doctorPage.waitForTimeout(700);
  await doctorPage.getByText("Sign it", { exact: true }).click();
  await doctorPage.waitForTimeout(3500);
  const consultPrint = `consultation-print-${opdRx.prescriptionNumber}`;
  check(
    (await body(doctorPage)).includes("Consultation (signed)") &&
      (await doctorPage.getByTestId(consultPrint).count()) === 1,
    "the signed consultation offers Print prescription too",
  );
  if ((await doctorPage.getByTestId(consultPrint).count()) === 1) {
    const job2 = await printJob(doctorPage, consultPrint);
    check(
      job2?.html?.includes(opdRx.prescriptionNumber) &&
        job2.html.includes("Anil Verma"),
      "and it prints that prescription",
    );
  }
  await shot(doctorPage, "14-consultation-print");
  await nurse2Page.context().close();

  // -- Health ----------------------------------------------------------------
  console.log(
    `\n  (HTTP non-2xx seen: ${[...new Set(httpFailures)].join(", ") || "none"})\n`,
  );
  const jsErrors = consoleErrors.filter(
    (e) => !/Failed to load resource/i.test(e),
  );
  check(
    jsErrors.length === 0,
    "no JavaScript errors",
    jsErrors.slice(0, 2).join(" | "),
  );
  const unexpected = httpFailures.filter((f) => !/^40[139] /.test(f));
  check(
    unexpected.length === 0,
    "no unexpected HTTP failures",
    unexpected.join(", "),
  );
} catch (err) {
  console.error("\nJourney threw:", err.message);
  failures.push(`exception: ${err.message}`);
  await shot(doctorPage, "FAILURE-doctor").catch(() => {});
  await shot(nursePage, "FAILURE-nurse").catch(() => {});
} finally {
  await browser.close();
  web.close();
  api.kill("SIGTERM");
  await mongoose.disconnect().catch(() => {});
  await replSet.stop().catch(() => {});
  fs.rmSync(apiCwd, { recursive: true, force: true });
}

if (failures.length) {
  console.error(
    `\n${passed} ok, ${failures.length} failed:\n - ${failures.join("\n - ")}\n`,
  );
  process.exit(1);
}
console.log(`\n${passed} ok, 0 failed. Screenshots in ${SHOTS}\n`);
