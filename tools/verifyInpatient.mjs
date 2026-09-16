/**
 * phase 4 gate — the ward in a browser: admission and bed state (IP-01/03), NEWS2 scoring and
 * escalation (NU-02/03), drug round (NU-04), SBAR handover (NU-05) and discharge (IP-05).
 * boots the real api on an in-memory replica set and serves the real web export.
 *   node tools/verifyInpatient.mjs
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
    /* not up */
  }
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

const adminToken = (
  await req("POST", "/auth/login", {
    email: "admin@cgh.test",
    password: "AdminPassword123",
    deviceId: "verify-admin-device",
    deviceName: "Verifier",
  })
).data.accessToken;

const dept = await req(
  "POST",
  "/departments",
  { name: "General Medicine", code: "MED" },
  adminToken,
);

async function provision({ employeeId, firstName, email, role, departmentId }) {
  const created = await req(
    "POST",
    "/users",
    { employeeId, firstName, lastName: "Rao", email, role, departmentId },
    adminToken,
  );
  const temp = created.data.temporaryPassword;
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
    id: created.data.user.id,
    email,
    password,
    token: live.data.accessToken,
  };
}

const doctor = await provision({
  employeeId: "DOC001",
  firstName: "Rajesh",
  email: "rajesh@cgh.test",
  role: "doctor",
  departmentId: dept.data.id,
});
const nurse = await provision({
  employeeId: "NUR001",
  firstName: "Meera",
  email: "meera@cgh.test",
  role: "nurse",
});
const nightNurse = await provision({
  employeeId: "NUR002",
  firstName: "Latha",
  email: "latha@cgh.test",
  role: "nurse",
});
const reception = await provision({
  employeeId: "REC001",
  firstName: "Deepak",
  email: "deepak@cgh.test",
  role: "receptionist",
});

// ---- The ward ---------------------------------------------------------------
const ward = await req(
  "POST",
  "/beds/wards",
  {
    name: "Medical Ward A",
    code: "MWA",
    type: "general",
    departmentId: dept.data.id,
  },
  adminToken,
);
const room = await req(
  "POST",
  "/beds/rooms",
  { wardId: ward.data.id, number: "101", type: "general" },
  adminToken,
);
await req(
  "POST",
  "/beds/bulk",
  { roomId: room.data.id, prefix: "A", from: 1, to: 4 },
  adminToken,
);
const bedList = await req(
  `GET`,
  `/beds?wardId=${ward.data.id}&limit=20`,
  null,
  adminToken,
);
const beds = bedList.data;

// ---- The patient ------------------------------------------------------------
const patient = await req(
  "POST",
  "/patients",
  {
    firstName: "Sunita",
    lastName: "Sharma",
    gender: "female",
    dateOfBirth: "1968-02-11",
    mobile: "9876543210",
  },
  reception.token,
);
await req(
  "PUT",
  `/patients/${patient.data.id}/allergies`,
  { allergies: [] },
  doctor.token,
);

const enalapril = await req(
  "POST",
  "/prescriptions/medicines",
  {
    name: "Envas 5",
    genericName: "Enalapril",
    ingredients: ["enalapril"],
    form: "tablet",
    strength: "5mg",
    defaultDose: "1 tab",
    defaultFrequency: "bd",
    defaultDurationDays: 5,
  },
  adminToken,
);

console.log("Seeded: a four-bed ward and one patient waiting to be admitted\n");

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
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await ctx.newPage();

const consoleErrors = [];
const httpFailures = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("response", (r) => {
  if (r.status() >= 400) {
    httpFailures.push(
      `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`,
    );
  }
});

const proxy = async (p) => {
  // the live-update socket is not under test; blocked so the gate never reaches
  // the dev port baked into the build.
  await p.route("**/socket.io/**", (route) => route.abort());
  await p.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${API}${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
};
await proxy(page);

const signIn = async (p, email, password) => {
  await p.goto(WEB, { waitUntil: "networkidle" });
  await p.waitForTimeout(1300);
  await p.getByTestId("login-email").fill(email);
  await p.getByTestId("login-password").fill(password);
  await p.getByTestId("login-submit").click();
  await p.waitForTimeout(2400);
};

let admissionId = "";

try {
  // =========================================================================
  console.log("IP-01 — the doctor admits her\n");

  await signIn(page, doctor.email, doctor.password);
  check(
    /Good (morning|afternoon|evening), Rajesh/.test(
      await page.innerText("body"),
    ),
    "the doctor signs in",
  );

  await page.goto(`${WEB}/ipd/admit`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);

  await page.getByTestId("admit-patient-search").fill("Sunita");
  await page.waitForTimeout(1500);
  await page.getByTestId(`pick-patient-${patient.data.patientId}`).click();
  await page.waitForTimeout(900);

  const afterPick = await page.innerText("body");
  check(afterPick.includes("Sunita Sharma"), "the patient is chosen");
  check(
    afterPick.includes("No known allergies"),
    "and her allergy status is stated before anyone reaches the drug round",
  );

  await page.getByText("Choose a free bed").click();
  await page.waitForTimeout(800);
  const bedOptions = await page.innerText("body");
  check(
    bedOptions.includes("bed A1") && bedOptions.includes("bed A4"),
    "every bed on the ward is listed, not only the free ones",
  );
  await page.screenshot({ path: path.join(SHOTS, "ipd-1-bed-choice.png") });

  await page.getByText("Medical Ward A · bed A1").first().click();
  await page.waitForTimeout(600);

  await page
    .getByTestId("admit-reason")
    .fill("Community acquired pneumonia. Needs IV antibiotics and oxygen.");
  await page.getByTestId("admit-diagnosis").fill("CAP, right lower lobe");
  await page.waitForTimeout(400);
  await page.getByTestId("admit-submit").click();
  await page.waitForTimeout(3000);

  const bedside = await page.innerText("body");
  check(
    bedside.includes("Sunita Sharma"),
    "the bedside chart opens on the admitted patient",
  );
  check(bedside.includes("bed A1"), "showing where she is");
  check(
    bedside.includes("No observations recorded"),
    "and says plainly that nobody has looked at her yet",
  );
  await page.screenshot({ path: path.join(SHOTS, "ipd-2-bedside-fresh.png") });

  admissionId = page.url().split("/ipd/patients/")[1]?.split("?")[0] ?? "";
  check(
    Boolean(admissionId),
    "the bedside chart has its own address, linkable in a handover",
  );

  // ---- IP-03 ---------------------------------------------------------------
  const bedsNow = await req(
    `GET`,
    `/beds?wardId=${ward.data.id}&limit=20`,
    null,
    adminToken,
  );
  const a1 = bedsNow.data.find((b) => b.number === "A1");
  check(
    a1.status === "occupied",
    "IP-03: the bed became occupied as a consequence of admitting",
  );

  // =========================================================================
  console.log(
    "\nNU-02/NU-03 — the nurse records six survivable-looking numbers\n",
  );

  const nursePage = await (
    await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  ).newPage();
  await proxy(nursePage);
  nursePage.on("pageerror", (e) => consoleErrors.push(String(e)));
  nursePage.on("response", (r) => {
    if (r.status() >= 400) {
      httpFailures.push(
        `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`,
      );
    }
  });

  await signIn(nursePage, nurse.email, nurse.password);
  await nursePage.goto(`${WEB}/nursing/patients/${admissionId}`, {
    waitUntil: "networkidle",
  });
  await nursePage.waitForTimeout(2600);

  await nursePage.getByText("Record obs", { exact: true }).first().click();
  await nursePage.waitForTimeout(900);

  // individually unremarkable readings that together score NEWS2 7 (high risk).
  await nursePage.getByTestId("obs-respiratoryRate").fill("22");
  await nursePage.getByTestId("obs-spo2").fill("94");
  await nursePage.getByTestId("obs-systolic").fill("98");
  await nursePage.getByTestId("obs-diastolic").fill("62");
  await nursePage.getByTestId("obs-pulse").fill("102");
  await nursePage.getByTestId("obs-temperatureC").fill("38.2");
  await nursePage.waitForTimeout(300);

  // Before the last two answers, the form says what is still missing.
  const stillMissing = await nursePage.innerText("body");
  check(
    stillMissing.includes("Still needed for a NEWS2 score"),
    "the form says what is still missing BEFORE the nurse walks away from the bed",
  );
  check(
    stillMissing.includes("air or oxygen") &&
      stillMissing.includes("consciousness"),
    "naming the parameters, not just a count",
  );
  await nursePage.screenshot({
    path: path.join(SHOTS, "ipd-3-obs-incomplete.png"),
  });

  await nursePage.getByTestId("obs-air").click();
  await nursePage.getByTestId("obs-acvpu-alert").click();
  await nursePage.waitForTimeout(400);

  check(
    !(await nursePage.innerText("body")).includes(
      "Still needed for a NEWS2 score",
    ),
    "and stops saying it once the set is complete",
  );

  await nursePage.getByTestId("obs-submit").click();
  await nursePage.waitForTimeout(3000);

  const scored = await nursePage.innerText("body");
  check(
    scored.includes("NEWS2"),
    "the score is shown to the nurse who took the readings",
  );
  check(/\b7\b/.test(scored), "six mediocre numbers add up to 7");
  check(scored.includes("High"), "which is the high-risk band");
  check(
    scored.includes("Continuous monitoring"),
    "and the escalation policy is written out, not left to memory at 4am",
  );
  check(
    scored.includes("critical care competencies"),
    "including who needs to come and see her",
  );
  check(
    scored.includes("This patient has been escalated"),
    "NU-03: she is escalated without anyone ticking a box",
  );
  await nursePage.screenshot({
    path: path.join(SHOTS, "ipd-4-news2-high.png"),
  });

  // =========================================================================
  console.log("\nNU-03 — she is now the first thing on the ward board\n");

  await nursePage.goto(`${WEB}/nursing/patients`, { waitUntil: "networkidle" });
  await nursePage.waitForTimeout(2600);

  const board = await nursePage.innerText("body");
  check(
    board.includes("need review"),
    "the escalation strip is above everything",
  );
  check(board.includes("Sunita Sharma"), "naming her");
  check(board.includes("NEWS2 7"), "with the score that raised it");
  await nursePage.screenshot({
    path: path.join(SHOTS, "ipd-5-escalation-board.png"),
  });

  // The nurse who raised the escalation cannot close it.
  check(
    !board.includes("I have reviewed this patient"),
    "NU-03: the nurse who raised it is not offered the button to close it",
  );

  // =========================================================================
  console.log("\nNU-03 — the doctor reviews her\n");

  await page.goto(`${WEB}/ipd/patients`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);

  const docBoard = await page.innerText("body");
  check(docBoard.includes("need review"), "the doctor sees the escalation");
  check(
    docBoard.includes("I have reviewed this patient"),
    "and IS offered the button, because they can act on it",
  );

  await page.getByText("I have reviewed this patient").first().click();
  await page.waitForTimeout(800);

  check(
    await page.getByTestId("acknowledge-submit").isDisabled(),
    'an empty acknowledgement cannot be submitted — "Reviewed" with nothing after it is the entry that turns up in every incident report',
  );

  await page
    .getByTestId("acknowledge-note")
    .fill(
      "Seen. Sepsis six started, blood cultures sent, IV fluids running. Reviewing in one hour.",
    );
  await page.waitForTimeout(300);
  await page.getByTestId("acknowledge-submit").click();
  await page.waitForTimeout(2800);

  check(
    !(await page.innerText("body")).includes("need review"),
    "once reviewed, she leaves the escalation strip",
  );
  await page.screenshot({ path: path.join(SHOTS, "ipd-6-acknowledged.png") });

  // =========================================================================
  console.log("\nNU-04 — the drug round, and the shift-change double dose\n");

  const consultation = await req(
    "POST",
    "/consultations",
    { patientId: patient.data.id, admissionId, type: "ward_round" },
    doctor.token,
  );
  await req(
    "POST",
    "/prescriptions",
    {
      patientId: patient.data.id,
      consultationId: consultation.data.id,
      lines: [
        {
          medicineId: enalapril.data.id,
          dose: "1 tab",
          frequency: "bd",
          durationDays: 5,
        },
      ],
    },
    doctor.token,
  );

  await nursePage.goto(`${WEB}/nursing/patients/${admissionId}`, {
    waitUntil: "networkidle",
  });
  await nursePage.waitForTimeout(2600);
  await nursePage.getByText("Drug round", { exact: true }).first().click();
  await nursePage.waitForTimeout(2200);

  const round = await nursePage.innerText("body");
  check(round.includes("Envas 5"), "the prescribed drug is on the round");
  check(
    round.includes("08:00") && round.includes("20:00"),
    'NU-04: "bd" is two rounds, at the ward\'s own times',
  );
  await nursePage.screenshot({
    path: path.join(SHOTS, "ipd-7-drug-round.png"),
  });

  const giveButtons = nursePage.getByRole("button", { name: "Give" });
  await giveButtons.first().click();
  await nursePage.waitForTimeout(2400);

  const afterGiving = await nursePage.innerText("body");
  check(
    afterGiving.includes("Given by Meera"),
    "signing for a dose records who gave it",
  );

  // Shift-change double dose: the night nurse must see the dose already signed for.
  const nightPage = await (
    await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  ).newPage();
  await proxy(nightPage);
  nightPage.on("pageerror", (e) => consoleErrors.push(String(e)));

  await signIn(nightPage, nightNurse.email, nightNurse.password);
  await nightPage.goto(`${WEB}/nursing/patients/${admissionId}`, {
    waitUntil: "networkidle",
  });
  await nightPage.waitForTimeout(2600);
  await nightPage.getByText("Drug round", { exact: true }).first().click();
  await nightPage.waitForTimeout(2200);

  const nightRound = await nightPage.innerText("body");
  check(
    nightRound.includes("Given by Meera"),
    "NU-04: the incoming nurse sees the dose is already signed for",
  );
  check(
    !nightRound.includes("Given by Latha"),
    "and it is not attributed to her",
  );
  await nightPage.screenshot({
    path: path.join(SHOTS, "ipd-8-shift-change.png"),
  });

  // The 20:00 dose is refused by the patient — which must be RECORDED.
  const notGiven = nightPage.getByRole("button", { name: "Not given" });
  await notGiven.first().click();
  await nightPage.waitForTimeout(900);

  check(
    await nightPage.getByTestId("omit-submit").isDisabled(),
    "NU-04: an omission cannot be saved without a reason",
  );
  check(
    (
      await nightPage.getByTestId("omit-reason").getAttribute("placeholder")
    )?.includes("next shift has to decide") ?? false,
    "and the form says why it is asking",
  );

  await nightPage
    .getByTestId("omit-reason")
    .fill(
      "Patient declined, says it makes her dizzy when she stands. Doctor informed.",
    );
  await nightPage.waitForTimeout(300);
  await nightPage.getByTestId("omit-submit").click();
  await nightPage.waitForTimeout(2600);

  check(
    (await nightPage.innerText("body")).includes("makes her dizzy"),
    "and the reason is on the chart, where the next shift will read it",
  );

  // =========================================================================
  console.log("\nNU-05 — SBAR handover\n");

  await nursePage.goto(`${WEB}/nursing/patients/${admissionId}`, {
    waitUntil: "networkidle",
  });
  await nursePage.waitForTimeout(2600);
  await nursePage
    .getByText("Notes & handover", { exact: true })
    .first()
    .click();
  await nursePage.waitForTimeout(1400);

  await nursePage.getByTestId("sbar-open").click();
  await nursePage.waitForTimeout(800);

  await nursePage
    .getByTestId("sbar-situation")
    .fill(
      "Day 1 of admission with community acquired pneumonia. NEWS was 7 this morning.",
    );
  await nursePage
    .getByTestId("sbar-background")
    .fill(
      "Previously well. Admitted this morning, IV co-amoxiclav started, sepsis six completed.",
    );
  await nursePage
    .getByTestId("sbar-assessment")
    .fill(
      "Responded to fluids, still febrile. Looks tired but is talking in full sentences.",
    );
  await nursePage.waitForTimeout(400);

  // Recommendation left blank: the SBAR must be refused.
  const partial = await nursePage.innerText("body");
  check(
    partial.includes("SBAR is not complete"),
    "NU-05: an SBAR missing a part is refused",
  );
  check(partial.includes("recommendation"), "and the missing part is named");
  check(
    partial.includes("it is the part the next shift acts on"),
    "with the reason it matters, rather than a red asterisk",
  );
  await nursePage.screenshot({
    path: path.join(SHOTS, "ipd-9-sbar-incomplete.png"),
  });

  await nursePage
    .getByTestId("sbar-recommendation")
    .fill(
      "Hourly observations overnight. Chase the blood cultures at 22:00. Call the doctor if NEWS rises above 5.",
    );
  await nursePage
    .getByTestId("sbar-tasks")
    .fill("Chase blood cultures\nRepeat CRP in the morning");
  await nursePage
    .getByTestId("sbar-alerts")
    .fill("Poor IV access — single cannula in left ACF");
  await nursePage.waitForTimeout(400);
  await nursePage.getByTestId("sbar-submit").click();
  await nursePage.waitForTimeout(2800);

  const given = await nursePage.innerText("body");
  check(
    given.includes("Handover not yet received"),
    "NU-05: a handover nobody has taken is marked as not having happened",
  );
  await nursePage.screenshot({
    path: path.join(SHOTS, "ipd-10-sbar-given.png"),
  });

  // =========================================================================
  console.log("\nIP-05 — discharge\n");

  await page.goto(`${WEB}/ipd/patients/${admissionId}/discharge`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2600);

  const dischargeForm = await page.innerText("body");
  check(
    dischargeForm.includes("These three are required"),
    "IP-05: the three requirements are stated before anyone starts typing",
  );
  check(
    dischargeForm.includes("nothing the next clinician can read"),
    "with the reason, rather than as three red asterisks",
  );

  await page
    .getByTestId("discharge-summary")
    .fill(
      "Admitted with community acquired pneumonia. Treated with IV co-amoxiclav, switched to oral on day 3. Afebrile 48 hours, CRP falling, chest clear on discharge.",
    );
  await page.waitForTimeout(400);
  check(
    (await page.innerText("body")).includes(
      "Still needed: discharge medication",
    ),
    "and the form keeps saying what is left",
  );
  await page.screenshot({
    path: path.join(SHOTS, "ipd-11-discharge-incomplete.png"),
  });

  await page
    .getByTestId("discharge-medication")
    .fill(
      "Amoxicillin 500mg three times a day for 3 more days. Continue enalapril 5mg twice daily.",
    );
  await page
    .getByTestId("discharge-followup")
    .fill(
      "GP review in one week. Return immediately if breathless, confused, or the fever returns.",
    );
  await page
    .getByTestId("discharge-diagnosis")
    .fill("Community acquired pneumonia, resolved");
  await page.waitForTimeout(500);
  await page.getByTestId("discharge-submit").click();
  await page.waitForTimeout(3200);

  const afterDischarge = await page.innerText("body");
  check(
    !afterDischarge.includes("Sunita Sharma") ||
      afterDischarge.includes("Nobody is admitted"),
    "she leaves the ward board on discharge",
  );
  await page.screenshot({
    path: path.join(SHOTS, "ipd-12-after-discharge.png"),
  });

  // IP-03 again, from the other end: the bed is free without anyone freeing it.
  const bedsAfter = await req(
    `GET`,
    `/beds?wardId=${ward.data.id}&limit=20`,
    null,
    adminToken,
  );
  const a1After = bedsAfter.data.find((b) => b.number === "A1");
  check(
    a1After.status === "available",
    "IP-03: discharge freed the bed — nobody typed that either",
  );

  // -- Health ----------------------------------------------------------------
  console.log(
    `\n  (HTTP non-2xx seen: ${httpFailures.join(", ") || "none"})\n`,
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
  await page
    .screenshot({ path: path.join(SHOTS, "ipd-FAILURE.png") })
    .catch(() => {});
} finally {
  await browser.close();
  web.close();
  api.kill("SIGTERM");
  await mongoose.disconnect().catch(() => {});
  await replSet.stop().catch(() => {});
}

if (failures.length) {
  console.error(
    `\n${failures.length} check(s) failed:\n - ${failures.join("\n - ")}\n`,
  );
  process.exit(1);
}
console.log("\nThe ward works end to end. Screenshots in docs/shots/\n");
