/**
 * phase 12 gate — the front desk's missing moves: walk-ins, moving an appointment, the
 * navigation dead ends, editing a patient, restricting a record, and signed-in devices.
 * Real browser, live API, in-memory mongo.
 *
 *   DIST=path/to/web-export SHOTS=path/for/screenshots node tools/verifyPhase12Desk.mjs
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
const SHOTS =
  process.env.SHOTS || path.join(os.tmpdir(), "hms-verify", "phase12-desk");
const TZ = "Asia/Kolkata";

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

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error(`No web export at ${DIST}. Build one and pass DIST=…`);
  process.exit(1);
}
fs.mkdirSync(SHOTS, { recursive: true });

/** Calendar date in the hospital's zone, and the day after. */
const calendarDate = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const TODAY = calendarDate(new Date());
const TOMORROW = calendarDate(new Date(Date.now() + 86_400_000));

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

const API_PORT = 5242;
const secrets = {
  JWT_ACCESS_SECRET: "verify-access-secret-not-real",
  JWT_REFRESH_SECRET: "verify-refresh-secret-not-real",
  JWT_ADMIN_SECRET: "verify-admin-secret-not-real",
};
const api = spawn(process.execPath, ["server.js"], {
  cwd: BACK,
  env: {
    ...process.env,
    ...secrets,
    NODE_ENV: "test",
    PORT: String(API_PORT),
    MONGODB_URI: mongoUri,
    BCRYPT_ROUNDS: "4",
    CORS_ORIGIN: "",
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
  } catch {
    /* not up */
  }
  if (waited > 40_000) {
    api.kill("SIGTERM");
    await replSet.stop().catch(() => {});
    throw new Error(`API did not start.\n${apiLog}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}
console.log(`API ready on ${API}`);

process.env.MONGODB_URI = mongoUri;
Object.assign(process.env, secrets);
process.env.BCRYPT_ROUNDS = "4";

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
  timezone: TZ,
  address: { line1: "12 MG Road", city: "Bengaluru" },
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
  }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

const adminToken = (
  await req("POST", "/auth/login", {
    email: "admin@cgh.test",
    password: "AdminPassword123",
    deviceId: "verify-admin",
    deviceName: "Verifier",
  })
).data.accessToken;
const med = (
  await req(
    "POST",
    "/departments",
    { name: "General Medicine", code: "MED" },
    adminToken,
  )
).data;

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
    employeeId,
    email,
    password,
    token: live.data.accessToken,
    refreshToken: live.data.refreshToken,
  };
}

const doctor = await provision({
  employeeId: "DOC001",
  firstName: "Rajesh",
  email: "rajesh@cgh.test",
  role: "doctor",
  departmentId: med.id,
});
const otherDoctor = await provision({
  employeeId: "DOC002",
  firstName: "Farah",
  email: "farah@cgh.test",
  role: "doctor",
  departmentId: med.id,
});
const reception = await provision({
  employeeId: "REC001",
  firstName: "Deepak",
  email: "deepak@cgh.test",
  role: "receptionist",
});
const secondDesk = await provision({
  employeeId: "REC002",
  firstName: "Meera",
  email: "meera@cgh.test",
  role: "receptionist",
});
// Only the browser sign-ins should be on Meera's device list.
await req("POST", "/auth/logout", { refreshToken: secondDesk.refreshToken });

// Rajesh is in clinic every day, from a roster that started well before today.
for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
  const row = await req(
    "POST",
    "/appointments/roster",
    {
      doctorId: doctor.id,
      departmentId: med.id,
      dayOfWeek,
      startTime: "00:00",
      endTime: "23:30",
      slotMinutes: 30,
      slotCapacity: 1,
      effectiveFrom: "2020-01-01",
    },
    adminToken,
  );
  if (row.status !== 201) throw new Error(`Roster: ${JSON.stringify(row)}`);
}

const register = async (firstName, mobile) =>
  (
    await req(
      "POST",
      "/patients",
      {
        firstName,
        lastName: "Case",
        gender: "female",
        dateOfBirth: "1970-01-01",
        mobile,
      },
      reception.token,
    )
  ).data;
const anita = await register("Anita", "9876500001");
const bhavna = await register("Bhavna", "9876500002");
const chitra = await register("Chitra", "9876500003");

const book = async (patientId, time) => {
  const res = await req(
    "POST",
    "/appointments",
    { patientId, doctorId: doctor.id, date: TOMORROW, time },
    reception.token,
  );
  if (res.status !== 201) throw new Error(`Booking: ${JSON.stringify(res)}`);
  return res.data;
};
const bhavnaVisit = await book(bhavna.id, "10:00");
// Rajesh's booking with Chitra makes him her treating team; Farah has none.
await book(chitra.id, "12:00");

console.log(
  `Seeded: a roster every day, three patients. Tomorrow is ${TOMORROW}\n`,
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

async function newPage({ watchHttp = true } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    timezoneId: TZ,
  });
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  p.on("pageerror", (e) => consoleErrors.push(String(e)));
  p.on("response", (r) => {
    if (watchHttp && r.status() >= 400)
      httpFailures.push(
        `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`,
      );
  });
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
const visible = (locator) =>
  locator
    .first()
    .isVisible()
    .catch(() => false);
const textOf = (locator) =>
  locator
    .first()
    .innerText()
    .catch(() => "");
const shot = (p, name) =>
  p.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => {});

const desk = await newPage();
let current = desk;
let text;

try {
  // =========================================================================
  console.log("Walk-in — reception adds one from the OPD queue\n");

  await signIn(desk, reception.email, reception.password);
  await go(desk, "/opd/queue");
  check(await visible(desk.getByTestId("opd-queue")), "the OPD queue opens");
  check(
    await visible(desk.getByTestId("walkin-cta")),
    "reception is offered Add walk-in",
  );
  await desk.getByTestId("walkin-cta").click();
  await desk.waitForTimeout(900);
  check(
    await visible(desk.getByTestId("walkin-sheet")),
    "which asks for the patient, doctor and reason",
  );
  await desk.getByTestId("walkin-patient-search").fill("Anita");
  await desk.waitForTimeout(1800);
  await desk
    .getByTestId(`walkin-result-${anita.patientId}`)
    .getByRole("button")
    .click();
  await desk.waitForTimeout(700);
  check(
    (await textOf(desk.getByTestId("walkin-patient"))).includes("Anita Case"),
    "the search finds the patient",
  );
  text = await textOf(desk.getByTestId(`walkin-doctor-${doctor.id}`));
  check(
    text.includes("In clinic today"),
    "the doctor list says who is in clinic today",
    text.replace(/\s+/g, " "),
  );
  text = await textOf(desk.getByTestId(`walkin-doctor-${otherDoctor.id}`));
  check(
    text.includes("Not in clinic today"),
    "and who is not",
    text.replace(/\s+/g, " "),
  );
  check(
    await desk.getByTestId("walkin-submit").isDisabled(),
    "nothing is added before a doctor is chosen",
  );
  await desk.getByTestId(`walkin-doctor-${doctor.id}`).click();
  await desk.getByTestId("walkin-reason").fill("Fever since morning");
  await desk.waitForTimeout(300);
  await shot(desk, "p12desk-1-walkin-form");
  await desk.getByTestId("walkin-submit").click();
  await desk.waitForTimeout(2600);
  text = (await textOf(desk.getByTestId("walkin-token"))).trim();
  check(text === "1", "the walk-in is issued token 1", text);
  await shot(desk, "p12desk-2-walkin-token");
  await desk.getByTestId("walkin-done").click();
  await desk.waitForTimeout(2200);

  const queue = (
    await req("GET", `/appointments/queue?date=${TODAY}`, null, reception.token)
  ).data;
  const walkIn = queue.find((a) => a.patient?.id === anita.id);
  check(
    walkIn?.status === "arrived" &&
      walkIn?.tokenNumber === 1 &&
      walkIn?.visitType === "walk_in",
    "the API has them arrived, as a walk-in, with token 1",
    JSON.stringify(walkIn && { s: walkIn.status, t: walkIn.tokenNumber }),
  );
  const row = desk.getByTestId(`queue-row-${walkIn?.appointmentNumber}`);
  text = await textOf(row);
  check(
    text.includes("Anita Case") &&
      /arrived/i.test(text) &&
      /(^|\s)1(\s|$)/.test(text),
    "and the queue shows them waiting with their token",
    text.replace(/\s+/g, " "),
  );
  await shot(desk, "p12desk-3-queue");

  // =========================================================================
  console.log("\nDead ends — the OPD card, and the booking confirmation\n");

  await row.click();
  await desk.waitForTimeout(2400);
  check(
    (await visible(desk.getByTestId("patient-detail"))) &&
      (await desk.innerText("body")).includes("Anita Case"),
    "an OPD card opens the patient's page",
  );
  check(
    await visible(desk.getByTestId("walkin-from-patient")),
    "whose page offers Walk-in to OPD",
  );
  check(
    (await desk.getByTestId("record-access").count()) === 0,
    "but no record restriction for reception",
  );

  await desk.getByTestId("book-from-patient").click();
  await desk.waitForTimeout(1800);
  await desk.getByRole("button", { name: /^Doctor\./ }).click();
  await desk.waitForTimeout(500);
  await desk.getByRole("menuitem", { name: /Rajesh/ }).click();
  await desk.waitForTimeout(900);
  await desk.getByRole("button", { name: "Next" }).first().click();
  await desk.waitForTimeout(1800);
  await desk.getByTestId("slot-14:00").click();
  await desk.waitForTimeout(300);
  await desk.getByTestId("book-submit").click();
  await desk.waitForTimeout(2600);
  check(
    await visible(desk.getByTestId("appointment-booked")),
    "booking from the patient's page confirms",
  );
  await desk.getByTestId("booked-back").click();
  await desk.waitForTimeout(2600);
  check(
    await visible(desk.getByTestId("appointments-screen")),
    "Back to appointments opens the appointments list",
  );
  check(
    (await textOf(desk.getByTestId("appointments-date"))).includes("Tomorrow"),
    "on the day just booked",
  );

  // =========================================================================
  console.log("\nMove — reception reschedules a booked appointment\n");

  await go(desk, "/appointments");
  await desk.getByRole("button", { name: "Next" }).first().click();
  await desk.waitForTimeout(2200);
  await desk.getByTestId(`move-${bhavnaVisit.appointmentNumber}`).click();
  await desk.waitForTimeout(2400);
  check(
    await visible(desk.getByTestId("reschedule-screen")),
    "Move opens the reschedule screen",
  );
  text = await textOf(desk.getByTestId("reschedule-current"));
  check(
    text.includes("10:00 am") && text.includes("Bhavna Case"),
    "showing the appointment as it is booked now",
    text.replace(/\s+/g, " "),
  );
  check(
    await desk.getByTestId("slot-10:00").isDisabled(),
    "its own slot shows as taken",
  );
  await desk.getByTestId("slot-11:00").click();
  await desk.getByTestId("reschedule-reason").fill("Patient asked for later");
  await desk.waitForTimeout(300);
  await shot(desk, "p12desk-4-move");
  await desk.getByTestId("reschedule-submit").click();
  await desk.waitForTimeout(2600);
  text = await textOf(desk.getByTestId("reschedule-new-when"));
  check(
    text.includes("11:00 am") && text.includes("Tomorrow"),
    "the new time is shown after saving",
    text,
  );
  await desk.getByTestId("reschedule-back").click();
  await desk.waitForTimeout(2600);
  text = await desk.innerText("body");
  check(
    (await visible(desk.getByTestId("appointments-screen"))) &&
      (await textOf(desk.getByTestId("appointments-date"))).includes(
        "Tomorrow",
      ),
    "back on the appointments list, on that day",
  );
  check(
    text.includes("11:00 am") && text.includes("Bhavna Case"),
    "which lists Bhavna at the new time",
  );
  await shot(desk, "p12desk-5-moved");
  const day = (
    await req(
      "GET",
      `/appointments/availability?doctorId=${doctor.id}&date=${TOMORROW}`,
      null,
      reception.token,
    )
  ).data;
  const slotAt = (t) => day.slots.find((s) => s.time === t);
  check(
    slotAt("10:00")?.available === true && slotAt("11:00")?.available === false,
    "the old slot is free again and the new one taken",
  );

  // =========================================================================
  console.log("\nRegister from the sidebar, then edit the details\n");

  await go(desk, "/dashboard");
  await desk.getByRole("link", { name: "Register patient" }).first().click();
  await desk.waitForTimeout(1800);
  await desk.getByTestId("reg-firstName").fill("Kamala");
  await desk.getByTestId("reg-lastName").fill("Devi");
  await desk.getByTestId("reg-mobile").fill("9800000001");
  await desk.getByTestId("reg-age").fill("68");
  await desk.getByRole("button", { name: /^Gender\./ }).click();
  await desk.waitForTimeout(500);
  await desk.getByRole("menuitem", { name: "Female" }).click();
  await desk.waitForTimeout(1600);
  await desk.getByTestId("reg-submit").click();
  await desk.waitForTimeout(3000);
  text = await desk.innerText("body");
  check(
    (await visible(desk.getByTestId("patient-detail"))) &&
      text.includes("Kamala Devi"),
    "registering from the sidebar lands on the new patient's page",
  );
  check(
    text.includes("Registered") && /CGH-P\d{6}/.test(text),
    "with the Registered banner and the issued ID",
  );
  await shot(desk, "p12desk-6-registered");

  await desk.getByTestId("edit-patient").click();
  await desk.waitForTimeout(2200);
  check(
    await visible(desk.getByTestId("edit-patient-screen")),
    "Edit details opens",
  );
  check(
    (await desk.getByTestId("edit-mobile").inputValue()) === "9800000001" &&
      (await desk.getByTestId("edit-firstName").inputValue()) === "Kamala",
    "pre-filled with the record",
  );
  await desk.getByTestId("edit-mobile").fill("12345");
  await desk.getByTestId("edit-submit").click();
  await desk.waitForTimeout(900);
  check(
    (await desk.innerText("body")).includes("Enter a 10-digit mobile number"),
    "a bad mobile number is refused on the form",
  );
  await desk.getByTestId("edit-mobile").fill("9800000099");
  await desk.waitForTimeout(300);
  await desk.getByTestId("edit-submit").click();
  await desk.waitForTimeout(2800);
  check(
    await visible(desk.getByTestId("patient-updated")),
    "saving returns to the patient's page",
  );
  check(
    (await textOf(desk.getByTestId("patient-mobile"))).trim() === "9800000099",
    "which shows the new mobile",
  );
  await shot(desk, "p12desk-7-edited");

  await desk.getByTestId("walkin-from-patient").click();
  await desk.waitForTimeout(1200);
  check(
    (await textOf(desk.getByTestId("walkin-patient"))).includes("Kamala Devi"),
    "Walk-in to OPD from her page already knows the patient",
  );
  await desk.getByTestId(`walkin-doctor-${doctor.id}`).click();
  await desk.getByTestId("walkin-submit").click();
  await desk.waitForTimeout(2600);
  text = (await textOf(desk.getByTestId("walkin-token"))).trim();
  check(text === "2", "and issues the next token", text);
  await desk.getByTestId("walkin-done").click();
  await desk.waitForTimeout(800);

  await desk.getByRole("link", { name: "Register patient" }).first().click();
  await desk.waitForTimeout(1500);
  check(
    (await desk.getByTestId("reg-firstName").inputValue()) === "",
    "and the sidebar's form is empty for the next patient",
  );

  // =========================================================================
  console.log("\nRestricted record — a doctor restricts, another is stopped\n");

  const clinic = await newPage();
  current = clinic;
  await signIn(clinic, doctor.email, doctor.password);
  await go(clinic, "/patients");
  await clinic.getByTestId("patient-search").fill("Chitra");
  await clinic.waitForTimeout(1800);
  await clinic.getByText("Chitra Case").first().click();
  await clinic.waitForTimeout(2600);
  check(
    await visible(clinic.getByTestId("record-access")),
    "the doctor sees Record access on the patient's page",
  );
  check(
    (await clinic.getByTestId("edit-patient").count()) === 0,
    "but not Edit details",
  );
  check(
    (await textOf(clinic.getByTestId("record-access-status"))).includes(
      "Not restricted",
    ),
    "the record starts unrestricted",
  );
  await clinic.getByTestId("restrict-record").click();
  await clinic.waitForTimeout(500);
  await clinic.getByTestId("restrict-reason").fill("Too short");
  await clinic.waitForTimeout(300);
  check(
    await clinic.getByTestId("restrict-submit").isDisabled(),
    "a restriction needs a real reason",
  );
  await clinic
    .getByTestId("restrict-reason")
    .fill("Hospital employee; asked that her record be kept private");
  await clinic.waitForTimeout(300);
  await shot(clinic, "p12desk-8-restrict");
  await clinic.getByTestId("restrict-submit").click();
  await clinic.waitForTimeout(2600);
  check(
    (await textOf(clinic.getByTestId("record-access-status"))).includes(
      "Restricted to the treating team",
    ),
    "restricted, and the card says so",
  );

  const outsider = await newPage();
  current = outsider;
  await signIn(outsider, otherDoctor.email, otherDoctor.password);
  await go(outsider, "/scan");
  await outsider.getByTestId("scan-input").fill(chitra.patientId);
  await outsider.getByTestId("scan-submit").click();
  await outsider.waitForTimeout(3000);
  check(
    (await visible(outsider.getByTestId("record-restricted"))) &&
      (await visible(outsider.getByTestId("breakglass-reason"))),
    "a doctor outside the care team who scans her ID is asked to break the glass",
  );
  await shot(outsider, "p12desk-9-break-glass");
  await go(outsider, `/patients/${chitra.id}/record`);
  check(
    await visible(outsider.getByTestId("record-restricted")),
    "and so is the direct record address",
  );

  current = clinic;
  await clinic.getByTestId("unrestrict-record").click();
  await clinic.waitForTimeout(700);
  await clinic
    .getByRole("button", { name: "Remove restriction", exact: true })
    .last()
    .click();
  await clinic.waitForTimeout(2600);
  check(
    (await textOf(clinic.getByTestId("record-access-status"))).includes(
      "Not restricted",
    ),
    "the first doctor removes the restriction",
  );
  current = outsider;
  await go(outsider, `/patients/${chitra.id}/record`, 3000);
  check(
    (await visible(outsider.getByTestId("medical-record"))) &&
      (await outsider.getByTestId("record-restricted").count()) === 0,
    "after which the other doctor opens the record normally",
  );

  // =========================================================================
  console.log("\nSigned-in devices — My profile\n");

  const laptop = await newPage();
  current = laptop;
  await signIn(laptop, secondDesk.email, secondDesk.password);
  // The other context is signed out on purpose; its 401s are expected.
  const tablet = await newPage({ watchHttp: false });
  await signIn(tablet, secondDesk.email, secondDesk.password);
  check(
    await visible(tablet.getByTestId("dashboard")),
    "the same person is signed in on a second browser",
  );

  await go(laptop, "/profile");
  check(
    await visible(laptop.getByTestId("profile-sessions")),
    "My profile has Where you're signed in",
  );
  check(
    (await laptop.locator('[data-testid^="session-row-"]').count()) === 2,
    "listing both devices",
    String(await laptop.locator('[data-testid^="session-row-"]').count()),
  );
  check(
    (await laptop.getByTestId("session-current").count()) === 1,
    "with this one marked This device",
  );
  await shot(laptop, "p12desk-10-sessions");
  const signOutOther = laptop.locator('[data-testid^="session-sign-out-"]');
  check(
    (await signOutOther.count()) === 1,
    "Sign out is offered for the other",
  );
  await signOutOther.first().click();
  await laptop.waitForTimeout(700);
  await laptop
    .getByRole("button", { name: "Sign out", exact: true })
    .last()
    .click();
  await laptop.waitForTimeout(2400);
  check(
    await visible(laptop.getByTestId("sessions-notice")),
    "the desk is told the device was signed out",
  );
  check(
    (await laptop.locator('[data-testid^="session-row-"]').count()) === 1,
    "and only this device is left",
  );

  current = tablet;
  await go(tablet, "/dashboard", 3500);
  check(
    await visible(tablet.getByTestId("login-submit")),
    "the other browser is back at the sign-in screen",
  );
  current = laptop;
  await go(laptop, "/dashboard");
  check(
    await visible(laptop.getByTestId("dashboard")),
    "while this one stays signed in",
  );

  // -- Health ----------------------------------------------------------------
  // The outsider's refusals are the point of the restriction check.
  const unexpected = httpFailures.filter(
    (f) => !/^403 GET \/api\/v1\/(records|consultations\/context)\//.test(f),
  );
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
  check(
    unexpected.length === 0,
    "no unexpected HTTP failures",
    unexpected.join(", "),
  );
} catch (err) {
  console.error("\nJourney threw:", err.message);
  failures.push(`exception: ${err.message}`);
  await shot(current, "p12desk-FAILURE");
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
console.log(
  `\nThe front desk's phase 12 moves work end to end. Screenshots in ${SHOTS}\n`,
);
