/**
 * phase 13 gate — hospital setup corrections (wards, rooms, beds), the laboratory test
 * catalogue, patient corrections (clearing an ABHA number, duplicate check on edit) and
 * "install as an app", in a real browser against a live API on an in-memory mongo.
 *
 *   DIST=path/to/web-build SHOTS=path/to/shots node tools/verifyPhase13Setup.mjs
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
  process.env.SHOTS || path.join(os.tmpdir(), "hms-phase13-setup-shots"),
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
const RUN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "hms-phase13-setup-"));
process.chdir(RUN_DIR);

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

const API_PORT = 5253;
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

const must = (res, status, what) => {
  if (res.status !== status)
    throw new Error(`${what}: ${res.status} ${JSON.stringify(res.error)}`);
  return res.data;
};

const adminToken = (
  await req("POST", "/auth/login", {
    email: "admin@cgh.test",
    password: "AdminPassword123",
    deviceId: "verify-admin",
    deviceName: "Verifier",
  })
).data.accessToken;
const med = must(
  await req(
    "POST",
    "/departments",
    { name: "General Medicine", code: "MED" },
    adminToken,
  ),
  201,
  "department",
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

const ward = must(
  await req(
    "POST",
    "/beds/wards",
    {
      name: "Medical Ward A",
      code: "MWA",
      type: "general",
      departmentId: med.id,
      dailyCharge: 1500,
    },
    adminToken,
  ),
  201,
  "ward",
);
const room = must(
  await req(
    "POST",
    "/beds/rooms",
    { wardId: ward.id, number: "MWA-01", type: "general" },
    adminToken,
  ),
  201,
  "room",
);
must(
  await req(
    "POST",
    "/beds/bulk",
    { roomId: room.id, prefix: "MWA-01-", from: 1, to: 2 },
    adminToken,
  ),
  201,
  "beds",
);
const beds = must(
  await req("GET", `/beds?wardId=${ward.id}&limit=10`, null, adminToken),
  200,
  "bed list",
);
const bedA = beds.find((b) => b.number === "MWA-01-1");
const bedB = beds.find((b) => b.number === "MWA-01-2");

const sunita = must(
  await req(
    "POST",
    "/patients",
    {
      firstName: "Sunita",
      lastName: "Sharma",
      gender: "female",
      dateOfBirth: "1991-07-04",
      mobile: "9845023456",
      abhaNumber: "12345678901234",
    },
    reception.token,
  ),
  201,
  "patient A",
);
const kavya = must(
  await req(
    "POST",
    "/patients",
    {
      firstName: "Kavya",
      lastName: "Reddy",
      gender: "female",
      dateOfBirth: "1991-07-04",
      mobile: "9845099999",
    },
    reception.token,
  ),
  201,
  "patient B",
);
must(
  await req(
    "POST",
    "/admissions",
    {
      patientId: sunita.id,
      bedId: bedA.id,
      reason: "Persistent vomiting, needs IV fluids",
    },
    doctor.token,
  ),
  201,
  "admission",
);

console.log(
  "Seeded: admin, reception, a doctor, ward MWA with room MWA-01 and two beds (one occupied), two patients\n",
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
    timezoneId: TZ,
    // Worker caching is checked on its own page at the end.
    serviceWorkers: "block",
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
const flat = (s) => s.replace(/\s+/g, " ");
const shot = (p, name) =>
  p
    .screenshot({ path: path.join(SHOTS, `phase13-setup-${name}.png`) })
    .catch(() => {});
/** Opens the Select inside a wrapper test id and picks an option by its label. */
const pickIn = async (p, wrapperId, option) => {
  await p.getByTestId(wrapperId).getByRole("button").first().click();
  await p.waitForTimeout(500);
  await p.getByText(option, { exact: true }).last().click();
  await p.waitForTimeout(700);
};
const openWards = async (p) => {
  await go(p, "/admin/config");
  await p.getByTestId("config-tab-wards").click();
  await p.waitForTimeout(1800);
  await p.getByTestId("ward-open-MWA").click();
  await p.waitForTimeout(2200);
};

const office = await newPage();
let current = office;
let text;

try {
  // =========================================================================
  console.log("Wards, rooms and beds can be corrected\n");

  await signIn(office, "ADM001", "AdminPassword123");
  await openWards(office);
  check(
    await visible(office.getByTestId("ward-estate-MWA")),
    "Hospital setup opens the ward's rooms and beds",
  );

  // A free bed: its own charge and oxygen.
  await office.getByTestId("config-bed-MWA-MWA-01-2").click();
  await office.waitForTimeout(600);
  text = await textOf(office.getByTestId("bed-edit-MWA-01-2"));
  check(
    text.includes("A bed's number stays, because admissions and transfers name it"),
    "the bed form says the bed number is fixed, and why",
    flat(text),
  );
  check(
    (await office.getByTestId("bed-edit-MWA-01-2").locator("input").count()) ===
      1,
    "and the only box to type in is the daily charge",
  );
  await office.getByTestId("bed-edit-charge").fill("2500");
  await office.getByTestId("bed-edit-oxygen").click();
  await office.getByTestId("bed-edit-submit").click();
  await office.waitForTimeout(2400);
  check(
    await visible(office.getByTestId("room-saved-MWA-MWA-01")),
    "saving the bed confirms it",
  );
  let bed = must(
    await req("GET", `/beds?wardId=${ward.id}&limit=10`, null, adminToken),
    200,
    "beds",
  ).find((b) => b.id === bedB.id);
  check(
    bed.dailyCharge === 2500 && bed.features.oxygen === true,
    "the API has the bed's ₹2,500 charge and oxygen",
    JSON.stringify({ charge: bed.dailyCharge, features: bed.features }),
  );

  await openWards(office);
  text = await textOf(office.getByTestId("config-bed-MWA-MWA-01-2"));
  check(
    text.includes("O₂") && text.includes("₹2,500.00"),
    "after a reload the bed shows its oxygen and charge",
    flat(text),
  );
  await office.getByTestId("config-bed-MWA-MWA-01-2").click();
  await office.waitForTimeout(600);
  check(
    (await office.getByTestId("bed-edit-charge").inputValue()) === "2500" &&
      (await office
        .getByTestId("bed-edit-oxygen")
        .getAttribute("aria-checked")) === "true",
    "and its edit form starts from the saved values",
  );
  // Blank charge falls back to the room's or the ward's.
  await office.getByTestId("bed-edit-cancel").click();
  await office.waitForTimeout(400);
  await shot(office, "1-bed-saved");

  // The occupied bed cannot be taken out of use.
  await office.getByTestId("config-bed-MWA-MWA-01-1").click();
  await office.waitForTimeout(600);
  await office.getByTestId("bed-edit-active").click();
  await office.getByTestId("bed-edit-submit").click();
  await office.waitForTimeout(2400);
  expectedFailures.push(`409 PATCH /api/v1/beds/${bedA.id}`);
  text = await textOf(office.getByTestId("bed-edit-error"));
  check(
    text.includes("A patient is in bed MWA-01-1") &&
      text.includes("Transfer or discharge them first"),
    "taking the occupied bed out of use is refused in plain words",
    flat(text),
  );
  bed = must(
    await req("GET", `/beds?wardId=${ward.id}&limit=10`, null, adminToken),
    200,
    "beds",
  ).find((b) => b.id === bedA.id);
  check(bed.isActive === true, "and the bed stays in use");
  await shot(office, "2-occupied-refused");
  await office.getByTestId("bed-edit-cancel").click();
  await office.waitForTimeout(400);

  // Room type.
  await office.getByTestId("room-edit-open-MWA-MWA-01").click();
  await office.waitForTimeout(600);
  check(
    (await textOf(office.getByTestId("room-edit-MWA-01"))).includes(
      "keeps its number",
    ),
    "the room form says its number is fixed",
  );
  await pickIn(office, "room-edit-type", "Semi-private");
  await office.getByTestId("room-edit-submit").click();
  await office.waitForTimeout(2400);
  text = await textOf(office.getByTestId("room-summary-MWA-MWA-01"));
  check(
    text.includes("Semi-private"),
    "the room's type changes to semi-private",
    flat(text),
  );
  const rooms = must(
    await req("GET", `/beds/rooms?wardId=${ward.id}`, null, adminToken),
    200,
    "rooms",
  );
  check(rooms[0]?.type === "semi-private", "and the API has it");

  // Ward daily charge.
  await office.getByTestId("ward-edit-open-MWA").click();
  await office.waitForTimeout(700);
  check(
    (await office.getByTestId("ward-edit-charge").inputValue()) === "1500" &&
      (await office.getByTestId("ward-edit-name").inputValue()) ===
        "Medical Ward A",
    "the ward form starts from the ward's details",
  );
  await office.getByTestId("ward-edit-charge").fill("1750");
  await office.getByTestId("ward-edit-submit").click();
  await office.waitForTimeout(2400);
  text = await textOf(office.getByTestId("ward-charge-MWA"));
  check(text.includes("₹1,750.00"), "the ward's daily charge is updated", text);
  const wards = must(
    await req("GET", "/beds/wards", null, adminToken),
    200,
    "wards",
  );
  check(
    wards.find((w) => w.id === ward.id)?.dailyCharge === 1750 &&
      wards.find((w) => w.id === ward.id)?.name === "Medical Ward A",
    "and only the charge changed",
  );
  await shot(office, "3-ward-room");

  // =========================================================================
  console.log("\nLaboratory test catalogue\n");

  await go(office, "/admin/config");
  await office.getByTestId("config-tab-labtests").click();
  await office.waitForTimeout(2000);
  check(
    await visible(office.getByTestId("labtests-load-standard")),
    "an empty catalogue offers the standard one",
  );
  await office.getByTestId("labtests-load-standard").click();
  await office.waitForTimeout(3000);
  check(
    (await textOf(office.getByTestId("labtests-notice"))).includes(
      "standard tests added",
    ),
    "loading it says how many were added",
  );
  text = await textOf(office.getByTestId("labtest-row-CBC"));
  check(
    text.includes("Complete blood count") &&
      text.includes("₹350.00") &&
      text.includes("Whole blood") &&
      text.includes("4 h routine"),
    "CBC is listed with its price, sample and turnaround",
    flat(text),
  );

  await office.getByTestId("labtests-search").fill("lipid");
  await office.waitForTimeout(800);
  check(
    (await office.getByTestId("labtest-row-CBC").count()) === 0,
    "search narrows the list",
  );
  await office.getByTestId("labtests-search").fill("");
  await office.waitForTimeout(800);

  await office.getByTestId("labtest-ranges-open-CBC").click();
  await office.waitForTimeout(500);
  text = await textOf(office.getByTestId("labtest-ranges-CBC"));
  check(
    text.includes("Haemoglobin") &&
      text.includes("Read-only") &&
      text.includes("laboratory lead"),
    "reference ranges are shown read-only, with who changes them",
    flat(text).slice(0, 160),
  );

  await office.getByTestId("labtest-edit-open-CBC").click();
  await office.waitForTimeout(600);
  await office.getByTestId("labtest-edit-price").fill("425");
  await office.getByTestId("labtest-edit-stat").fill("30");
  await office
    .getByTestId("labtest-edit-preparation")
    .fill("No fasting required. Avoid heavy exercise beforehand.");
  await office.getByTestId("labtest-edit-submit").click();
  await office.waitForTimeout(2600);
  text = await textOf(office.getByTestId("labtest-price-CBC"));
  check(text.includes("₹425.00"), "CBC's new price shows once edited", text);
  let catalogue = must(
    await req("GET", "/laboratory/tests", null, adminToken),
    200,
    "tests",
  );
  const cbc = catalogue.find((t) => t.code === "CBC");
  check(
    cbc?.price === 425 &&
      cbc?.targetMinutes?.stat === 30 &&
      cbc?.preparation.includes("heavy exercise"),
    "the API test list has the new price, turnaround and preparation",
    JSON.stringify({ price: cbc?.price, tat: cbc?.targetMinutes }),
  );
  const doctorList = must(
    await req("GET", "/laboratory/tests?search=CBC", null, doctor.token),
    200,
    "doctor tests",
  );
  check(
    doctorList.some((t) => t.code === "CBC") &&
      doctorList.every((t) => !("price" in t)),
    "the doctor can still order CBC, and never sees its price",
  );
  await shot(office, "4-lab-catalogue");

  await office.getByTestId("labtests-create-open").click();
  await office.waitForTimeout(500);
  await office.getByTestId("labtests-create-name").fill("Serum magnesium");
  await office.getByTestId("labtests-create-code").fill("mg");
  await office.getByTestId("labtests-create-category").fill("Biochemistry");
  await office.getByTestId("labtests-create-sample").fill("Serum");
  await office.getByTestId("labtests-create-price").fill("280");
  await office.getByTestId("labtests-create-unit").fill("mg/dL");
  await office.getByTestId("labtests-create-low").fill("2.5");
  await office.getByTestId("labtests-create-high").fill("1.7");
  await office.getByTestId("labtests-create-submit").click();
  await office.waitForTimeout(500);
  check(
    (await textOf(office.getByTestId("labtests-create"))).includes(
      "Must not be below the low end",
    ),
    "a range with its ends swapped is refused on the form",
  );
  await office.getByTestId("labtests-create-low").fill("1.7");
  await office.getByTestId("labtests-create-high").fill("2.2");
  await office.getByTestId("labtests-create-submit").click();
  await office.waitForTimeout(2600);
  catalogue = must(
    await req("GET", "/laboratory/tests", null, adminToken),
    200,
    "tests",
  );
  const mg = catalogue.find((t) => t.code === "MG");
  check(
    mg?.price === 280 &&
      mg?.parameters.length === 1 &&
      mg.parameters[0].unit === "mg/dL" &&
      mg.parameters[0].ranges[0]?.low === 1.7 &&
      mg.parameters[0].ranges[0]?.high === 2.2,
    "a simple one-result test is added with its range",
    JSON.stringify(mg?.parameters?.[0]?.ranges),
  );
  check(
    await visible(office.getByTestId("labtest-row-MG")),
    "and listed in the catalogue",
  );

  // =========================================================================
  console.log("\nPatient corrections\n");

  const desk = await newPage();
  current = desk;
  await signIn(desk, reception.email, reception.password);
  const openPatient = async (search, name) => {
    await go(desk, "/patients", 1800);
    await desk.getByTestId("patient-search").fill(search);
    await desk.waitForTimeout(1600);
    await desk.getByText(name, { exact: true }).first().click();
    await desk.waitForTimeout(2600);
  };

  await openPatient("Sunita", "Sunita Sharma");
  // Known, outside this phase: the wristband button asks for an admitted patient's admission,
  // which reception may not read. Printing still works without the ward and bed.
  expectedFailures.push("403 GET /api/v1/admissions");
  check(
    (await textOf(desk.getByTestId("patient-abha"))).includes("12345678901234"),
    "the patient page shows the ABHA number on file",
  );
  await desk.getByTestId("edit-patient").click();
  await desk.waitForTimeout(2200);
  check(
    (await textOf(desk.getByTestId("edit-patient-screen"))).includes(
      "clear the box to remove a number recorded by mistake",
    ),
    "the edit form says an ABHA number can be removed",
  );
  await desk.getByTestId("edit-abhaNumber").fill("");
  await desk.getByTestId("edit-submit").click();
  await desk.waitForTimeout(2800);
  check(
    await visible(desk.getByTestId("patient-updated")),
    "clearing it saves",
    await textOf(desk.getByTestId("edit-error")),
  );
  check(
    (await textOf(desk.getByTestId("patient-abha"))) === "None recorded",
    "and the patient page shows none",
    await textOf(desk.getByTestId("patient-abha")),
  );
  check(
    must(await req("GET", `/patients/${sunita.id}`, null, reception.token), 200, "patient")
      .abhaNumber === "",
    "the API has no ABHA number for her",
  );
  await shot(desk, "5-abha-cleared");

  await openPatient("Kavya", "Kavya Reddy");
  await desk.getByTestId("edit-patient").click();
  await desk.waitForTimeout(2200);
  await desk.getByTestId("edit-firstName").fill("Sunita");
  await desk.getByTestId("edit-lastName").fill("Sharma");
  await desk.getByTestId("edit-mobile").fill("9845023456");
  await desk.waitForTimeout(1200);
  await desk.getByTestId("edit-submit").click();
  await desk.waitForTimeout(2600);
  expectedFailures.push(`409 PATCH /api/v1/patients/${kavya.id}`);
  text = await textOf(desk.getByTestId("duplicate-warning"));
  check(
    text.includes("Sunita Sharma") &&
      text.includes("already registered") &&
      text.includes(sunita.patientId),
    "a correction that copies another patient shows who it matches",
    flat(text),
  );
  const dialog = desk.getByRole("button", {
    name: "Yes, this is someone else",
  });
  check(await visible(dialog), "and asks before saving it");
  await shot(desk, "6-duplicate-on-edit");
  await dialog.click();
  await desk.waitForTimeout(2800);
  check(
    await visible(desk.getByTestId("patient-updated")),
    '"This is someone else" saves the correction',
    await textOf(desk.getByTestId("edit-error")),
  );
  const edited = must(
    await req("GET", `/patients/${kavya.id}`, null, reception.token),
    200,
    "patient B",
  );
  check(
    edited.firstName === "Sunita" &&
      edited.mobile === "9845023456" &&
      edited.patientId === kavya.patientId,
    "the second record now carries the corrected details, under its own patient ID",
  );

  // =========================================================================
  console.log("\nInstall as an app\n");

  const html = await (await fetch(`${WEB}/`)).text();
  check(
    /<link rel="manifest" href="\/manifest.json"/.test(html),
    "the served page links the web app manifest",
  );
  check(
    /<script src="\/_expo\/static\/js\/web\/[^"]+\.js" defer><\/script>/.test(
      html,
    ),
    "and still loads the app bundle",
  );
  const manifestRes = await fetch(`${WEB}/manifest.json`);
  let manifest = null;
  try {
    manifest = JSON.parse(await manifestRes.text());
  } catch {
    /* reported below */
  }
  check(
    manifestRes.status === 200 && manifest !== null,
    "/manifest.json is served as valid JSON",
  );
  check(
    manifest?.name === "HMS" &&
      manifest?.start_url === "/" &&
      manifest?.display === "standalone" &&
      /^#[0-9A-F]{6}$/i.test(manifest?.theme_color ?? "") &&
      /^#[0-9A-F]{6}$/i.test(manifest?.background_color ?? ""),
    "it names HMS, starts at /, opens standalone, with theme and background colours",
  );
  const icons = manifest?.icons ?? [];
  for (const size of ["192x192", "512x512"]) {
    for (const purpose of ["any", "maskable"]) {
      const icon = icons.find(
        (i) => i.sizes === size && (i.purpose ?? "any") === purpose,
      );
      const res = icon ? await fetch(`${WEB}${icon.src}`) : null;
      const bytes = res ? Buffer.from(await res.arrayBuffer()) : null;
      check(
        res?.status === 200 &&
          bytes.subarray(1, 4).toString() === "PNG" &&
          bytes.readUInt32BE(16) === Number(size.split("x")[0]),
        `a ${size} ${purpose} icon loads as a PNG of that size`,
        icon?.src ?? "missing",
      );
    }
  }

  // Chromium's own reading of the manifest, with the worker allowed this time.
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const pwa = await ctx.newPage();
  current = pwa;
  await pwa.route("**/socket.io/**", (route) => route.abort());
  await pwa.goto(WEB, { waitUntil: "networkidle" });
  const workerReady = await pwa.evaluate(() =>
    Promise.race([
      navigator.serviceWorker.ready.then((r) =>
        r.active ? r.active.scriptURL : "",
      ),
      new Promise((r) => setTimeout(() => r(""), 15000)),
    ]),
  );
  check(
    String(workerReady).endsWith("/sw.js"),
    "the service worker still registers",
    String(workerReady),
  );
  const cdp = await ctx.newCDPSession(pwa);
  const appManifest = await cdp.send("Page.getAppManifest");
  check(
    appManifest.url.endsWith("/manifest.json") &&
      appManifest.errors.length === 0,
    "Chromium reads the manifest without errors",
    JSON.stringify(appManifest.errors),
  );
  await pwa.reload({ waitUntil: "networkidle" });
  await pwa.waitForTimeout(1500);
  const installable = await cdp
    .send("Page.getInstallabilityErrors")
    .catch((e) => ({ installabilityErrors: [{ errorId: String(e) }] }));
  check(
    installable.installabilityErrors.length === 0,
    "and finds nothing stopping it from offering Install app",
    JSON.stringify(installable.installabilityErrors),
  );
  await ctx.close();

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
    .screenshot({ path: path.join(SHOTS, "phase13-setup-FAILURE.png") })
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
const total = failures.length;
if (!passed) {
  console.error(
    `\n${total} check(s) failed:\n - ${failures.join("\n - ")}\n`,
  );
  process.exit(1);
}
console.log(
  `\nPhase 13 setup, patient corrections and install work end to end. Screenshots in ${SHOTS}\n`,
);
