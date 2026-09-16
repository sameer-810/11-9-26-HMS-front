/**
 * phase 12 clinical gate — a doctor recommends admission from a consultation, "My patients",
 * bedside transfer and handover permissions, the discharge summary after discharge, and the
 * UI polish (plain status labels, no spec codes, singular copy, medicine names, unit layout).
 * boots the real api on an in-memory replica set (never a real database) and serves a web export.
 *   DIST=<export folder> SHOTS=<screenshot folder> node tools/verifyPhase12Clinical.mjs
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
  process.env.SHOTS || path.join(os.tmpdir(), "hms-phase12-clinical-shots"),
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

const API_PORT = 5243;
// Run from an empty folder so dotenv finds no .env: every setting comes from here.
const apiCwd = fs.mkdtempSync(path.join(os.tmpdir(), "hms-p12-clinical-api-"));
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
// Only the hospital and its first administrator are written directly; everything else goes
// through the API, as a real hospital would set itself up.
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

const adminToken = (
  await req("POST", "/auth/login", {
    email: "admin@cgh.test",
    password: "AdminPassword123",
    deviceId: "verify-admin-device",
    deviceName: "Verifier",
  })
).data.accessToken;

const dept = must(
  await req(
    "POST",
    "/departments",
    { name: "General Medicine", code: "MED" },
    adminToken,
  ),
  "department",
);

async function provision({
  employeeId,
  firstName,
  lastName = "Rao",
  email,
  role,
  departmentId,
}) {
  const created = must(
    await req(
      "POST",
      "/users",
      { employeeId, firstName, lastName, email, role, departmentId },
      adminToken,
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
  departmentId: dept.id,
});
const otherDoctor = await provision({
  employeeId: "DOC002",
  firstName: "Kavya",
  lastName: "Iyer",
  email: "kavya@cgh.test",
  role: "doctor",
  departmentId: dept.id,
});
const nurse = await provision({
  employeeId: "NUR001",
  firstName: "Meera",
  email: "meera@cgh.test",
  role: "nurse",
});
const reception = await provision({
  employeeId: "REC001",
  firstName: "Deepak",
  email: "deepak@cgh.test",
  role: "receptionist",
});
const pharmacist = await provision({
  employeeId: "PHA001",
  firstName: "Farah",
  email: "farah@cgh.test",
  role: "pharmacy",
});

// ---- The ward ---------------------------------------------------------------
const ward = must(
  await req(
    "POST",
    "/beds/wards",
    {
      name: "Medical Ward A",
      code: "MWA",
      type: "general",
      departmentId: dept.id,
    },
    adminToken,
  ),
  "ward",
);
const room = must(
  await req(
    "POST",
    "/beds/rooms",
    { wardId: ward.id, number: "101", type: "general" },
    adminToken,
  ),
  "room",
);
await req(
  "POST",
  "/beds/bulk",
  { roomId: room.id, prefix: "MWA-01-", from: 1, to: 4 },
  adminToken,
);
const beds = must(
  await req("GET", `/beds?wardId=${ward.id}&limit=20`, null, adminToken),
  "beds",
);

// ---- Patients ---------------------------------------------------------------
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
const sunita = await registerPatient(
  "Sunita",
  "Sharma",
  "female",
  "1968-02-11",
);
const ravi = await registerPatient("Ravi", "Kumar", "male", "1959-07-02");
const lakshmi = await registerPatient(
  "Lakshmi",
  "Nair",
  "female",
  "1975-03-19",
);
const arjun = await registerPatient("Arjun", "Das", "male", "1981-12-05");

// Sunita arrives as a walk-in for Dr Rajesh, to be seen in the browser.
const walkIn = must(
  await req(
    "POST",
    "/appointments/walk-in",
    {
      patientId: sunita.id,
      doctorId: doctor.id,
      departmentId: dept.id,
      reason: "Fever and breathlessness",
    },
    reception.token,
  ),
  "walk-in",
);

// Ravi is admitted by Dr Rajesh; Lakshmi and Arjun by Dr Kavya.
const raviAdmission = must(
  await req(
    "POST",
    "/admissions",
    {
      patientId: ravi.id,
      bedId: beds[0].id,
      reason: "Community acquired pneumonia",
    },
    doctor.token,
  ),
  "admit Ravi",
);
const lakshmiAdmission = must(
  await req(
    "POST",
    "/admissions",
    {
      patientId: lakshmi.id,
      bedId: beds[1].id,
      reason: "Diabetic foot infection",
    },
    otherDoctor.token,
  ),
  "admit Lakshmi",
);
must(
  await req(
    "POST",
    "/admissions",
    { patientId: arjun.id, bedId: beds[2].id, reason: "Cellulitis" },
    otherDoctor.token,
  ),
  "admit Arjun",
);

// One escalation, so the strip's wording is exercised in the singular.
const escalated = must(
  await req(
    "POST",
    "/nursing/observations",
    {
      admissionId: raviAdmission.id,
      respiratoryRate: 26,
      spo2: 91,
      onOxygen: false,
      systolic: 95,
      diastolic: 60,
      pulse: 122,
      consciousness: "alert",
      temperatureC: 38.4,
    },
    nurse.token,
  ),
  "escalating observation",
);

// A handover waiting to be taken, on Ravi.
must(
  await req(
    "POST",
    "/nursing/handovers",
    {
      admissionId: raviAdmission.id,
      fromShift: "morning",
      toShift: "evening",
      situation: "Day 1 with pneumonia, NEWS rose this morning.",
      background: "Previously well, IV antibiotics started on admission.",
      assessment: "Febrile and tachycardic, talking in full sentences.",
      recommendation: "Hourly observations and review by the doctor at 16:00.",
    },
    nurse.token,
  ),
  "handover",
);

// Crocin 650 on Ravi's ward prescription.
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
    adminToken,
  ),
  "Crocin 650",
);
const wardRound = must(
  await req(
    "POST",
    "/consultations",
    {
      patientId: ravi.id,
      admissionId: raviAdmission.id,
      type: "ward_round",
    },
    doctor.token,
  ),
  "ward round",
);
const { prescription: rx } = must(
  await req(
    "POST",
    "/prescriptions",
    {
      patientId: ravi.id,
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

const meena = await registerPatient("Meena", "Pillai", "female", "1990-05-14");
const edVisit = must(
  await req(
    "POST",
    "/emergency/visits",
    {
      patientId: meena.id,
      arrivalMode: "walk_in",
      chiefComplaint: "Chest pain since an hour",
    },
    reception.token,
  ),
  "emergency visit",
);

console.log(
  `Seeded: two doctors, a nurse, a pharmacist, three admissions (escalation: ${escalated.escalation?.required ? "yes" : "no"}), a walk-in\n`,
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
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
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
  await p.route("**/api/v1/**", async (route) => {
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
const go = async (p, route, wait = 2600) => {
  await p.goto(`${WEB}${route}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(wait);
};
const body = (p) => p.innerText("body");
const shot = (p, name) =>
  p.screenshot({ path: path.join(SHOTS, `p12-clinical-${name}.png`) });

/** Every unit sits inside its field's border, and no field runs past the viewport. */
const fieldOverflow = (p, prefix) =>
  p.evaluate((pre) => {
    const problems = [];
    const inputs = document.querySelectorAll(`input[data-testid^="${pre}"]`);
    for (const input of inputs) {
      const box = input.parentElement;
      if (!box) continue;
      const b = box.getBoundingClientRect();
      if (b.right > window.innerWidth + 1)
        problems.push(`${input.dataset.testid} past the viewport`);
      for (const child of box.children) {
        const c = child.getBoundingClientRect();
        if (c.right > b.right + 1 || c.left < b.left - 1)
          problems.push(
            `${input.dataset.testid}: "${child.textContent || child.tagName}" outside its field`,
          );
      }
    }
    const pageOverflow =
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth;
    if (pageOverflow > 1) problems.push(`page overflows by ${pageOverflow}px`);
    return { count: inputs.length, problems };
  }, prefix);

const doctorPage = await newPage();
const nursePage = await newPage();

try {
  // =========================================================================
  console.log("Recommend admission from the consultation\n");

  await signIn(doctorPage, doctor);
  await go(doctorPage, "/doctor/appointments");
  await doctorPage.getByTestId(`see-${walkIn.appointmentNumber}`).click();
  await doctorPage.waitForTimeout(3200);

  let text = await body(doctorPage);
  check(
    text.includes("Sunita Sharma") &&
      (await doctorPage.getByTestId("consultation-screen").count()) > 0,
    "the doctor opens Sunita's consultation from the schedule",
  );
  check(
    text.includes("In consultation"),
    'the patient banner reads "In consultation"',
  );
  check(
    !/in_consultation|\barrived\b|\bregistered\b/.test(text),
    "no raw status codes on the consultation screen",
  );

  await doctorPage
    .getByTestId("cc-field")
    .fill("Fever for four days, now breathless at rest.");
  await doctorPage.getByTestId("recommend-admission").click();
  await doctorPage.waitForTimeout(500);
  check(
    (await doctorPage.getByTestId("admission-reason").count()) > 0,
    "ticking Recommend admission asks for a reason",
  );
  check(
    (await doctorPage
      .getByTestId("recommend-admission")
      .getAttribute("aria-checked")) === "true",
    "and the tick is announced to assistive technology",
  );

  // Without a reason the note is not signed.
  await doctorPage.getByTestId("sign-consultation").click();
  await doctorPage.waitForTimeout(700);
  await doctorPage.getByText("Sign it", { exact: true }).click();
  await doctorPage.waitForTimeout(1500);
  text = await body(doctorPage);
  check(
    text.includes("Say why this patient should be admitted") &&
      !text.includes("Consultation (signed)"),
    "signing with the box ticked but no reason is stopped, with the reason why",
  );
  await shot(doctorPage, "1-reason-required");

  await doctorPage
    .getByTestId("admission-reason")
    .fill("Hypoxic on air, needs oxygen and IV antibiotics.");
  await doctorPage.getByTestId("sign-consultation").click();
  await doctorPage.waitForTimeout(700);
  await doctorPage.getByText("Sign it", { exact: true }).click();
  await doctorPage.waitForTimeout(3000);

  text = await body(doctorPage);
  check(
    text.includes("Consultation (signed)"),
    "the consultation is signed once the reason is given",
  );
  check(
    text.includes("Admission recommended") &&
      text.includes("Hypoxic on air, needs oxygen"),
    "the signed note shows the recommendation with its reason, read-only",
  );
  check(
    (await doctorPage.getByTestId("recommend-admission").count()) === 0,
    "and the recommendation can no longer be changed",
  );
  await shot(doctorPage, "2-signed-recommendation");

  const requests = await req("GET", "/admissions/requests", null, doctor.token);
  check(
    (requests.data ?? []).some(
      (r) => r.patient?.id === sunita.id && r.reason.includes("Hypoxic on air"),
    ),
    "the API holds the recommendation with its reason",
  );

  await go(doctorPage, "/ipd/patients");
  text = await body(doctorPage);
  check(
    text.includes("1 waiting for a bed") && text.includes("Sunita Sharma"),
    'Sunita is on the ward\'s "waiting for a bed" list',
  );
  check(
    text.includes("1 patient needs review") &&
      !text.includes("1 patient need review"),
    'a single escalation reads "1 patient needs review"',
  );
  await shot(doctorPage, "3-waiting-for-a-bed");

  // =========================================================================
  console.log("\nThe doctor's My patients\n");

  await go(doctorPage, "/doctor/patients");
  text = await body(doctorPage);
  check(
    (await doctorPage.getByTestId("doctor-my-patients").count()) > 0,
    "My patients opens the doctor's patient list, not the schedule",
  );
  check(text.includes("Ravi Kumar"), "listing the patient they admitted");
  check(
    !text.includes("Lakshmi Nair") && !text.includes("Arjun Das"),
    "and not patients admitted by another doctor",
  );
  await shot(doctorPage, "4-my-patients");

  await doctorPage
    .getByTestId(`admission-${raviAdmission.admissionNumber}`)
    .click();
  await doctorPage.waitForTimeout(2800);
  text = await body(doctorPage);
  check(
    text.includes("Observation trend") && text.includes("Ravi Kumar"),
    "a row opens the bedside chart",
  );

  const otherDoctorPage = await newPage();
  await signIn(otherDoctorPage, otherDoctor);
  await go(otherDoctorPage, "/doctor/patients");
  text = await body(otherDoctorPage);
  check(
    text.includes("Lakshmi Nair") &&
      text.includes("Arjun Das") &&
      !text.includes("Ravi Kumar"),
    "the other doctor sees only their own two",
  );
  await otherDoctorPage.context().close();

  // =========================================================================
  console.log("\nBedside: transfer, handover buttons, raw codes\n");

  await go(doctorPage, `/ipd/patients/${raviAdmission.id}`);
  text = await body(doctorPage);
  check(text.includes("Admitted"), 'the bedside banner reads "Admitted"');
  check(!/in_consultation/.test(text), "no raw status codes on the bedside");

  await doctorPage.getByTestId("open-transfer").click();
  await doctorPage.waitForTimeout(1200);
  const form = doctorPage.getByTestId("transfer-form");
  check(
    (await form.count()) > 0 && (await form.isVisible()),
    "the header Transfer button opens the move-to-another-bed form",
  );
  const formBox = await form.boundingBox().catch(() => null);
  check(
    Boolean(formBox) && formBox.y >= 0 && formBox.y < 1000,
    "and scrolls it into view",
    formBox ? `top at ${Math.round(formBox.y)}px` : "no box",
  );
  await shot(doctorPage, "5-transfer-form");

  await doctorPage
    .getByText("Notes & handover", { exact: true })
    .first()
    .click();
  await doctorPage.waitForTimeout(1600);
  check(
    (await doctorPage.getByTestId("sbar-panel").count()) > 0,
    "the doctor can read the handover panel",
  );
  check(
    (await doctorPage.getByTestId("sbar-open").count()) === 0,
    'a doctor is not offered "Give shift handover"',
  );
  check(
    (await doctorPage.locator('[data-testid^="receive-handover-"]').count()) ===
      0,
    'nor "I have taken this handover"',
  );
  await shot(doctorPage, "6-doctor-handover");

  await signIn(nursePage, nurse);
  await go(nursePage, `/nursing/patients/${raviAdmission.id}`);
  await nursePage
    .getByText("Notes & handover", { exact: true })
    .first()
    .click();
  await nursePage.waitForTimeout(1600);
  check(
    (await nursePage.getByTestId("sbar-open").count()) > 0,
    'a nurse is offered "Give shift handover"',
  );
  check(
    (await nursePage.locator('[data-testid^="receive-handover-"]').count()) > 0,
    'and "I have taken this handover"',
  );
  text = await body(nursePage);
  check(text.includes("Morning → Evening"), "shifts read as words, not codes");
  await shot(nursePage, "7-nurse-handover");

  // ---- Medicine names --------------------------------------------------------
  await nursePage.getByText("Drug round", { exact: true }).first().click();
  await nursePage.waitForTimeout(2400);
  text = await body(nursePage);
  check(
    text.includes("Crocin 650 mg") && !text.includes("Crocin 650 650"),
    'the drug round reads "Crocin 650 mg", not "Crocin 650 650 mg"',
  );
  await shot(nursePage, "8-drug-round");

  const pharmacyPage = await newPage();
  await signIn(pharmacyPage, pharmacist);
  await go(pharmacyPage, `/pharmacy/dispense/${rx.id}`, 3000);
  text = await body(pharmacyPage);
  check(
    text.includes("Crocin 650 mg") && !text.includes("Crocin 650 650"),
    'the dispense screen reads "Crocin 650 mg"',
  );
  await shot(pharmacyPage, "9-dispense");
  await pharmacyPage.context().close();

  // ---- Observations: the score once, and units inside their fields ----------
  await go(nursePage, `/nursing/patients/${lakshmiAdmission.id}`);
  await nursePage.getByText("Record obs", { exact: true }).first().click();
  await nursePage.waitForTimeout(900);

  let layout = await fieldOverflow(nursePage, "obs-");
  check(
    layout.count >= 6 && layout.problems.length === 0,
    "desktop: every observation unit sits inside its field",
    layout.problems.join("; ") || `${layout.count} fields`,
  );

  await nursePage.getByTestId("obs-respiratoryRate").fill("16");
  await nursePage.getByTestId("obs-spo2").fill("97");
  await nursePage.getByTestId("obs-systolic").fill("124");
  await nursePage.getByTestId("obs-diastolic").fill("78");
  await nursePage.getByTestId("obs-pulse").fill("76");
  await nursePage.getByTestId("obs-temperatureC").fill("36.9");
  await nursePage.getByTestId("obs-air").click();
  await nursePage.getByTestId("obs-acvpu-alert").click();
  await nursePage.getByTestId("obs-submit").click();
  await nursePage.waitForTimeout(3200);

  const scoreCaptions = await nursePage
    .getByText("NEWS2", { exact: true })
    .count();
  check(
    scoreCaptions === 1,
    "after recording, the NEWS2 score is shown once, not twice",
    `${scoreCaptions} score cards`,
  );
  await shot(nursePage, "10-obs-recorded");

  const phonePage = await newPage({ width: 390, height: 844 });
  await signIn(phonePage, nurse);
  await go(phonePage, `/nursing/patients/${lakshmiAdmission.id}`);
  await phonePage.getByText("Record obs", { exact: true }).first().click();
  await phonePage.waitForTimeout(1000);
  layout = await fieldOverflow(phonePage, "obs-");
  check(
    layout.count >= 6 && layout.problems.length === 0,
    "390px phone: the observation form does not overflow and no unit escapes its field",
    layout.problems.join("; ") || `${layout.count} fields`,
  );
  await shot(phonePage, "11-obs-phone");
  await phonePage.context().close();

  // =========================================================================
  console.log("\nEmergency board and triage vitals\n");

  await go(nursePage, "/emergency");
  const edCell = nursePage
    .getByTestId(`ed-row-${edVisit.visitNumber}`)
    .getByText(edVisit.visitNumber, { exact: true });
  const clipped = await edCell
    .evaluate((el) => el.scrollWidth - el.clientWidth)
    .catch(() => null);
  check(
    clipped !== null && clipped <= 1,
    `the board's Visit column shows "${edVisit.visitNumber}" in full`,
    clipped === null ? "cell not found" : `${clipped}px clipped`,
  );
  await shot(nursePage, "12-emergency-board");

  await nursePage.getByTestId(`ed-row-${edVisit.visitNumber}`).click();
  await nursePage.waitForTimeout(2400);
  layout = await fieldOverflow(nursePage, "triage-vital-");
  check(
    layout.count >= 5 && layout.problems.length === 0,
    "desktop: triage vital units sit inside their fields",
    layout.problems.join("; ") || `${layout.count} fields`,
  );
  await shot(nursePage, "13-triage-vitals");

  const edPhone = await newPage({ width: 390, height: 844 });
  await signIn(edPhone, nurse);
  await go(edPhone, `/emergency/visits/${edVisit.id}`);
  layout = await fieldOverflow(edPhone, "triage-vital-");
  check(
    layout.count >= 5 && layout.problems.length === 0,
    "390px phone: triage vitals do not overflow",
    layout.problems.join("; ") || `${layout.count} fields`,
  );
  await shot(edPhone, "14-triage-phone");
  await edPhone.context().close();

  // =========================================================================
  console.log("\nAdmit screen copy\n");

  await go(doctorPage, "/ipd/admit");
  text = await body(doctorPage);
  check(
    text.includes("Admit a patient") && !text.includes("IP-01"),
    '"Admit a patient" shows plain copy, not "IP-01"',
  );
  check(
    !/\b(IP|AP|BL|OP|NU)-0\d\b/.test(text),
    "and no other spec codes are visible",
  );
  await shot(doctorPage, "15-admit");

  // =========================================================================
  console.log("\nDischarge, then reopen\n");

  await go(doctorPage, `/ipd/patients/${raviAdmission.id}/discharge`);
  await doctorPage
    .getByTestId("discharge-summary")
    .fill(
      "Admitted with community acquired pneumonia. IV antibiotics for three days, then oral. Afebrile for 48 hours.",
    );
  await doctorPage
    .getByTestId("discharge-medication")
    .fill("Amoxicillin 500 mg three times a day for 4 days.");
  await doctorPage
    .getByTestId("discharge-followup")
    .fill("Chest clinic in two weeks. Return if breathless.");
  await doctorPage
    .getByTestId("discharge-diagnosis")
    .fill("Community acquired pneumonia, resolving");
  await doctorPage.waitForTimeout(400);
  await doctorPage.getByTestId("discharge-submit").click();
  await doctorPage.waitForTimeout(3200);

  await go(doctorPage, `/ipd/patients/${raviAdmission.id}/discharge`);
  text = await body(doctorPage);
  check(
    (await doctorPage.getByTestId("discharge-summary-view").count()) > 0 &&
      !text.includes("Already discharged"),
    "reopening a discharged admission shows the recorded summary",
  );
  check(
    text.includes("IV antibiotics for three days") &&
      text.includes("Amoxicillin 500 mg") &&
      text.includes("Chest clinic in two weeks") &&
      text.includes("Community acquired pneumonia, resolving"),
    "with the summary, medication, follow-up and diagnosis",
  );
  check(
    text.includes("Routine discharge") && text.includes("by Rajesh"),
    "the type of discharge and who discharged",
  );
  check(
    (await doctorPage.getByTestId("print-discharge-summary").count()) > 0,
    "and a Print summary button",
  );
  check(
    (await doctorPage.getByTestId("discharge-submit").count()) === 0,
    "nothing on it can be edited",
  );
  await shot(doctorPage, "16-discharge-summary");

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
  await shot(doctorPage, "FAILURE").catch(() => {});
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
