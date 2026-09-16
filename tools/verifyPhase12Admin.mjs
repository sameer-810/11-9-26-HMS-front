/**
 * phase 12 gate — hospital setup (doctor schedules, services and prices), the formulary,
 * ICU access and per-person permissions, in a real browser against a live API on an
 * in-memory mongo.
 *
 *   DIST=path/to/web-build SHOTS=path/to/shots node tools/verifyPhase12Admin.mjs
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
  process.env.SHOTS || path.join(os.tmpdir(), "hms-phase12-admin-shots"),
);
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
  console.error(
    `No web build at ${DIST}. Set DIST or run \`npm run build:web\`.`,
  );
  process.exit(1);
}
fs.mkdirSync(SHOTS, { recursive: true });

// The API's env loader reads a .env from the working directory; run from an empty one so a
// developer's real database settings can never be picked up.
const RUN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "hms-phase12-admin-"));
process.chdir(RUN_DIR);

/** Calendar date in the hospital's zone, `days` from today. */
function hospitalDate(days = 0) {
  const d = new Date(Date.now() + days * 86_400_000);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
const TODAY = hospitalDate(0);
const TOMORROW = hospitalDate(1);

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

const API_PORT = 5241;
const secrets = {
  JWT_ACCESS_SECRET: "verify-access-secret-not-real",
  JWT_REFRESH_SECRET: "verify-refresh-secret-not-real",
  JWT_ADMIN_SECRET: "verify-admin-secret-not-real",
};
const api = spawn(process.execPath, [path.join(BACK, "server.js")], {
  cwd: RUN_DIR,
  env: {
    ...process.env,
    ...secrets,
    NODE_ENV: "test",
    PORT: String(API_PORT),
    MONGODB_URI: mongoUri,
    BCRYPT_ROUNDS: "4",
    CORS_ORIGIN: "",
    SMTP_HOST: "",
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
  if (waited > 40_000) throw new Error(`API did not start.\n${apiLog}`);
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
  };
}

const doctor = await provision({
  employeeId: "DOC001",
  firstName: "Rajesh",
  email: "rajesh@cgh.test",
  role: "doctor",
  departmentId: med.id,
});
const reception = await provision({
  employeeId: "REC001",
  firstName: "Deepak",
  email: "deepak@cgh.test",
  role: "receptionist",
});
const pharmacist = await provision({
  employeeId: "PHA001",
  firstName: "Meera",
  email: "meera@cgh.test",
  role: "pharmacy",
});
const patient = (
  await req(
    "POST",
    "/patients",
    {
      firstName: "Anita",
      lastName: "Case",
      gender: "female",
      dateOfBirth: "1970-01-01",
      mobile: "9876500001",
    },
    reception.token,
  )
).data;

console.log(
  `Seeded: a doctor, reception, pharmacy and one patient (${TODAY} in ${TZ})\n`,
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
/** Refusals this gate provokes on purpose. */
const expectedFailures = [];

async function newPage() {
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    // The booking screen's "today" is the device's; keep it on the hospital's calendar.
    timezoneId: TZ,
  });
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
const shot = (p, name) =>
  p.screenshot({ path: path.join(SHOTS, `phase12-admin-${name}.png`) });
const pick = async (p, placeholder, option) => {
  await p.getByText(placeholder, { exact: true }).first().click();
  await p.waitForTimeout(500);
  await p.getByText(option, { exact: true }).last().click();
  await p.waitForTimeout(1200);
};
const freeSlots = (p) =>
  p
    .locator(
      '[data-testid^="slot-"]:not([data-testid="slot-grid"]):not([aria-disabled="true"])',
    )
    .count();

const office = await newPage();
let current = office;
let text;

try {
  // =========================================================================
  console.log("Doctor schedules — a session added today is bookable today\n");

  await signIn(office, "ADM001", "AdminPassword123");
  await go(office, "/admin/config");
  text = await office.getByTestId("hospital-plan").innerText();
  check(
    /^Plan: Trial\b/.test(text) && !text.includes("(trial)"),
    "the plan reads as words, not codes",
    text,
  );

  await office.getByTestId("config-tab-schedules").click();
  await office.waitForTimeout(1500);
  check(
    await office.getByTestId("schedules-panel").isVisible(),
    "Hospital setup has a Doctor schedules tab",
  );
  await pick(office, "Choose a doctor", "Rajesh Rao");
  check(
    (await office.getByTestId("sessions-card").innerText()).includes(
      "No clinic sessions yet",
    ),
    "the doctor starts with no sessions",
  );

  const dow = weekday(TODAY);
  const other = (dow + 3) % 7;
  await office.getByTestId("session-create-open").click();
  await office.waitForTimeout(500);
  check(
    (await office.getByTestId("session-create-from").inputValue()) === TODAY,
    "Starts from defaults to today on the hospital clock",
  );
  await office.getByTestId("session-create-start").fill("10:00");
  await office.getByTestId("session-create-end").fill("09:00");
  await office.getByTestId("session-create-submit").click();
  await office.waitForTimeout(500);
  text = await office.getByTestId("session-create").innerText();
  check(
    text.includes("Choose at least one day") &&
      text.includes("Must be after the start"),
    "no day and an end before the start are refused on the form",
  );

  await office.getByTestId(`session-create-day-${dow}`).click();
  await office.getByTestId(`session-create-day-${other}`).click();
  await office.getByTestId("session-create-start").fill("00:00");
  await office.getByTestId("session-create-end").fill("23:59");
  await office.getByTestId("session-create-location").fill("OPD room 4");
  await office.getByTestId("session-create-submit").click();
  await office.waitForTimeout(2600);
  check(
    (await office.getByTestId("session-notice").innerText()).includes(
      "2 sessions added",
    ),
    "two weekdays chosen make two sessions",
  );
  text = await office.getByTestId(`sessions-day-${dow}`).innerText();
  check(
    text.includes("12:00 am – 11:59 pm") &&
      text.includes("15 min slots") &&
      text.includes("1 patient per slot") &&
      text.includes("OPD room 4"),
    "listed under its weekday with slot length, capacity and location",
    text.replace(/\s+/g, " "),
  );
  check(
    (
      await req(
        "GET",
        `/appointments/roster?doctorId=${doctor.id}`,
        null,
        adminToken,
      )
    ).data.length === 2,
    "and saved as two roster rows",
  );
  await shot(office, "1-sessions");

  const desk = await newPage();
  current = desk;
  await signIn(desk, reception.email, reception.password);
  await go(desk, "/appointments");
  await desk.getByTestId("book-cta").click();
  await desk.waitForTimeout(2000);
  await pick(desk, "Choose a doctor", "Rajesh Rao");
  await desk.waitForTimeout(1200);
  const free = await freeSlots(desk);
  check(
    free > 0,
    "reception's booking screen shows free slots for the doctor today",
    `${free} free`,
  );
  await shot(desk, "2-booking-today");

  // A booking today, so a block over it reports the patient affected.
  const day = (
    await req(
      "GET",
      `/appointments/availability?doctorId=${doctor.id}&date=${TODAY}`,
      null,
      reception.token,
    )
  ).data;
  const slot = day.slots.find((s) => s.available);
  const booked = await req(
    "POST",
    "/appointments",
    {
      patientId: patient.id,
      doctorId: doctor.id,
      date: TODAY,
      time: slot.time,
    },
    reception.token,
  );
  check(booked.status === 201, "reception books Anita into today's clinic");

  // =========================================================================
  console.log("\nLeave and extra clinics\n");

  await office.getByTestId("exception-create-open").click();
  await office.waitForTimeout(500);
  await office.getByTestId("exception-type-blocked").click();
  await office.waitForTimeout(300);
  await office.getByTestId("exception-create-start").fill("00:00");
  await office.getByTestId("exception-create-end").fill("23:59");
  await office.getByTestId("exception-create-reason").fill("Theatre list");
  await office.getByTestId("exception-create-submit").click();
  await office.waitForTimeout(2600);
  text = await office
    .getByTestId("exception-affected")
    .innerText()
    .catch(() => "");
  check(
    text.includes("1 booked patient"),
    "blocking time over a booking warns how many patients are affected",
    text.replace(/\s+/g, " "),
  );
  const blocked = await office.getByTestId(`exception-row-${TODAY}`).count();
  check(blocked === 1, "the block is listed for today");
  await shot(office, "3-affected-warning");
  await office
    .getByTestId(`exception-row-${TODAY}`)
    .locator('[data-testid^="exception-remove-"]')
    .click();
  await office.waitForTimeout(500);
  await office.getByRole("button", { name: "Yes, remove" }).click();
  await office.waitForTimeout(2400);
  check(
    (await office.getByTestId(`exception-row-${TODAY}`).count()) === 0,
    "and can be removed again",
  );

  await office.getByTestId("exception-create-open").click();
  await office.waitForTimeout(500);
  await office.getByTestId("exception-create-date").fill(TOMORROW);
  await office.getByTestId("exception-create-submit").click();
  await office.waitForTimeout(2600);
  check(
    await office.getByTestId("exception-notice").isVisible(),
    "whole-day leave for tomorrow is recorded",
  );
  check(
    (
      await office.getByTestId(`exception-row-${TOMORROW}`).innerText()
    ).includes("Whole day"),
    "and listed as a whole day",
  );

  await desk.getByRole("button", { name: "Next", exact: true }).click();
  await desk.waitForTimeout(2400);
  text = await desk.getByTestId("slot-grid").innerText();
  check(
    text.includes("On leave") && (await freeSlots(desk)) === 0,
    "reception's booking screen shows the doctor on leave tomorrow",
    text.replace(/\s+/g, " "),
  );
  await shot(desk, "4-booking-leave");

  // =========================================================================
  console.log("\nServices and prices\n");

  await office.getByTestId("config-tab-services").click();
  await office.waitForTimeout(2000);
  await office.getByTestId("tariff-create-open").click();
  await office.waitForTimeout(400);
  await office.getByTestId("tariff-create-name").fill("Wound dressing, small");
  await office.getByTestId("tariff-create-code").fill("dress-s");
  await office.getByTestId("tariff-create-price").fill("350");
  await office.getByTestId("tariff-create-tax").fill("5");
  await office.getByTestId("tariff-create-submit").click();
  await office.waitForTimeout(2600);
  text = await office
    .getByTestId("tariff-row-DRESS-S")
    .innerText()
    .catch(() => "");
  check(
    text.includes("Wound dressing, small") &&
      text.includes("₹350.00") &&
      text.includes("5% tax"),
    "an added service is listed with its price and tax",
    text.replace(/\s+/g, " "),
  );

  await office.getByTestId("tariff-edit-open-DRESS-S").click();
  await office.waitForTimeout(400);
  await office.getByTestId("tariff-edit-price").fill("425.50");
  await office.getByTestId("tariff-edit-submit").click();
  await office.waitForTimeout(2600);
  text = await office.getByTestId("tariff-price-DRESS-S").innerText();
  check(text.includes("₹425.50"), "its new price shows once edited", text);
  const tariff = (await req("GET", "/billing/tariff", null, adminToken)).data;
  check(
    tariff.find((t) => t.code === "DRESS-S")?.price === 425.5,
    "and is the price billing now charges",
  );

  await office.getByTestId("billing-tax-consultation").fill("12");
  await office.getByTestId("billing-receipt-footer").fill("Thank you.");
  await office.getByTestId("billing-settings-save").click();
  await office.waitForTimeout(2400);
  const settings = (await req("GET", "/billing/settings", null, adminToken))
    .data;
  check(
    (await office.getByTestId("billing-settings-saved").isVisible()) &&
      settings.taxRates.consultation === 12 &&
      settings.receiptFooter === "Thank you.",
    "billing tax rates and the receipt footer save",
  );
  await shot(office, "5-services");

  // =========================================================================
  console.log("\nFormulary\n");

  const counter = await newPage();
  current = counter;
  await signIn(counter, pharmacist.email, pharmacist.password);
  check(
    (await counter
      .getByRole("link", { name: "Formulary", exact: true })
      .count()) > 0,
    "pharmacy has Formulary in the menu",
  );
  check(
    (await desk
      .getByRole("link", { name: "Formulary", exact: true })
      .count()) === 0,
    "reception does not",
  );
  await go(counter, "/pharmacy/formulary");
  check(
    await counter.getByTestId("formulary-screen").isVisible(),
    "the formulary opens at its own address",
  );

  const addZentocin = async () => {
    await counter.getByTestId("formulary-create-open").click();
    await counter.waitForTimeout(500);
    await counter.getByTestId("formulary-create-name").fill("Zentocin");
    await counter.getByTestId("formulary-create-generic").fill("Zentamycin");
    await counter
      .getByTestId("formulary-create-ingredients-input")
      .fill("Zentamycin");
    await counter.getByTestId("formulary-create-ingredients-add").click();
    await counter.getByTestId("formulary-create-strength").fill("250 mg");
    await pick(counter, "No default", "1-0-1");
    await counter.getByTestId("formulary-create-submit").click();
    await counter.waitForTimeout(2600);
  };

  await counter.getByTestId("formulary-create-open").click();
  await counter.waitForTimeout(500);
  await counter.getByTestId("formulary-create-name").fill("Nothing");
  await counter.getByTestId("formulary-create-submit").click();
  await counter.waitForTimeout(500);
  check(
    (await counter.getByTestId("formulary-create").innerText()).includes(
      "List at least one ingredient",
    ),
    "a medicine without ingredients is refused on the form",
  );
  await counter.getByTestId("formulary-create-cancel").click();
  await counter.waitForTimeout(400);

  await addZentocin();
  text = await counter
    .getByTestId("formulary-notice")
    .innerText()
    .catch(() => "");
  check(
    text.includes("Zentocin") && text.includes("added"),
    "pharmacy adds a medicine",
    text,
  );
  let found = (
    await req(
      "GET",
      "/prescriptions/medicines?search=zentocin",
      null,
      doctor.token,
    )
  ).data;
  check(
    found.length === 1 &&
      found[0].ingredients.includes("Zentamycin") &&
      found[0].defaultFrequency === "1-0-1",
    "a doctor finds it when prescribing, with its ingredient and default",
    JSON.stringify(found.map((m) => m.label)),
  );
  await shot(counter, "6-formulary");

  await addZentocin();
  text = await counter
    .getByTestId("formulary-create-error")
    .innerText()
    .catch(() => "");
  check(
    text.includes("already in the formulary"),
    "adding it twice explains it is already there",
    text,
  );
  expectedFailures.push("409 POST /api/v1/prescriptions/medicines");
  await counter.getByTestId("formulary-create-cancel").click();
  await counter.waitForTimeout(400);

  const zentocinRow = counter
    .locator('[data-testid^="medicine-row-"]')
    .filter({ hasText: "Zentocin" });
  await zentocinRow.locator('[data-testid^="medicine-retire-"]').click();
  await counter.waitForTimeout(500);
  check(
    (await counter.innerText("body")).includes(
      "Past prescriptions, dispensing records and stock are not affected",
    ),
    "stopping prescribing asks first and says past prescriptions are unaffected",
  );
  await counter.getByRole("button", { name: "Yes, stop prescribing" }).click();
  await counter.waitForTimeout(2600);
  found = (
    await req(
      "GET",
      "/prescriptions/medicines?search=zentocin",
      null,
      doctor.token,
    )
  ).data;
  check(
    found.length === 0,
    "once retired, the doctor's search no longer finds it",
  );
  check((await zentocinRow.count()) === 0, "and it leaves the formulary list");
  await counter.getByTestId("formulary-show-retired").click();
  await counter.waitForTimeout(2400);
  text = await zentocinRow.innerText().catch(() => "");
  check(
    text.includes("Zentocin") && text.includes("Retired"),
    "Show retired lists it, marked retired",
    text.replace(/\s+/g, " "),
  );
  await shot(counter, "7-formulary-retired");

  // =========================================================================
  console.log("\nICU access and permissions\n");

  current = office;
  await go(office, "/admin/users");
  await office.getByTestId("user-row-DOC001").click();
  await office.waitForTimeout(2600);
  const icuPerm = office.getByTestId("user-permission-icu.access");
  check(
    (await icuPerm.getAttribute("aria-disabled")) === "true" &&
      (await icuPerm.innerText()).includes("Follows the ICU staff switch"),
    "the ICU permission is not directly editable, and says why",
  );
  check(
    (await office.getByTestId("user-permissions-warning").count()) === 0,
    "a doctor's own clinical permissions raise no warning",
  );

  await office.getByTestId("user-edit-icuAuthorized").click();
  await office.getByTestId("user-save-profile").click();
  await office.waitForTimeout(2800);
  check(
    await office.getByTestId("user-profile-saved").isVisible(),
    "administration switches ICU staff on",
  );
  check(
    (await icuPerm.getAttribute("aria-checked")) === "true",
    "and the permission list shows ICU workspace held",
  );
  check(
    (await req("GET", "/admissions?acuity=critical", null, doctor.token))
      .status === 200,
    "the doctor can open the ICU list from their next request",
  );
  const ward = await newPage();
  current = ward;
  await signIn(ward, doctor.email, doctor.password);
  check(
    (await ward.getByRole("link", { name: "ICU", exact: true }).count()) > 0,
    "and sees ICU in the menu when they sign in",
  );
  await shot(ward, "8-icu-menu");
  await ward.context().close();

  current = office;
  await office.getByTestId("user-edit-icuAuthorized").click();
  await office.getByTestId("user-save-profile").click();
  await office.waitForTimeout(2800);
  check(
    (await icuPerm.getAttribute("aria-checked")) === "false",
    "switched off, the permission goes too",
  );
  check(
    (await req("GET", "/admissions?acuity=critical", null, doctor.token))
      .status === 403,
    "and the ICU list is refused",
  );
  const ward2 = await newPage();
  current = ward2;
  await signIn(ward2, doctor.email, doctor.password);
  check(
    (await ward2.getByRole("link", { name: "ICU", exact: true }).count()) === 0,
    "and ICU is gone from their menu",
  );
  await ward2.context().close();

  current = office;
  await office.getByTestId("user-permission-lab_request.create").click();
  await office.waitForTimeout(300);
  check(
    (await office.getByTestId("user-permissions-warning").count()) === 0,
    "unticking a permission the admin does not hold raises no warning",
  );
  await office.getByTestId("user-save-permissions").click();
  await office.waitForTimeout(2600);
  check(
    await office.getByTestId("user-permissions-saved").isVisible(),
    "the doctor's permissions save with one unticked",
    await office
      .getByTestId("user-permissions-error")
      .innerText()
      .catch(() => ""),
  );
  const saved = (await req("GET", `/users/${doctor.id}`, null, adminToken))
    .data;
  check(
    !saved.permissions.includes("lab_request.create") &&
      saved.permissions.includes("prescription.create"),
    "only that one permission is gone",
  );
  const labPerm = office.getByTestId("user-permission-lab_request.create");
  check(
    (await labPerm.getAttribute("aria-disabled")) === "true",
    "and, not held by the admin, it cannot be ticked back",
  );
  await shot(office, "9-permissions");

  // -- Health ----------------------------------------------------------------
  const unexpected = httpFailures.filter((f) => !expectedFailures.includes(f));
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
  await current
    .screenshot({ path: path.join(SHOTS, "phase12-admin-FAILURE.png") })
    .catch(() => {});
} finally {
  await browser.close();
  web.close();
  api.kill("SIGTERM");
  await mongoose.disconnect().catch(() => {});
  await replSet.stop().catch(() => {});
  process.chdir(FRONT);
  fs.rmSync(RUN_DIR, { recursive: true, force: true, maxRetries: 3 });
}

const passed = failures.length === 0;
if (!passed) {
  console.error(
    `\n${failures.length} check(s) failed:\n - ${failures.join("\n - ")}\n`,
  );
  process.exit(1);
}
console.log(
  `\nPhase 12 administration works end to end. Screenshots in ${SHOTS}\n`,
);
