/**
 * phase 9 gate: with the network pulled the app reloads, charts and queues, then drains on
 * reconnect without duplicates; sign-out clears saved records.
 *   node tools/verifyOffline.mjs
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
// HMS_DIST points the gate at another export folder, so it can run beside another gate's build.
const DIST = process.env.HMS_DIST
  ? path.resolve(process.env.HMS_DIST)
  : path.join(FRONT, "dist");
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
if (!fs.existsSync(path.join(DIST, "sw.js"))) {
  console.error("dist/ has no sw.js — rebuild with `npm run build:web`.");
  process.exit(1);
}
fs.mkdirSync(SHOTS, { recursive: true });

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

const API_PORT = 5203;
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
const { BedModel } = await imp(BACK, "src", "modules", "ward", "ward.model.js");
const { ObservationModel } = await imp(
  BACK,
  "src",
  "modules",
  "nursing",
  "nursing.model.js",
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
  }).then((r) => r.json());

const adminToken = (
  await req("POST", "/auth/login", {
    email: "admin@cgh.test",
    password: "AdminPassword123",
    deviceId: "verify-admin",
    deviceName: "Verifier",
  })
).data.accessToken;
const dept = (
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
const nurse = await provision({
  employeeId: "NUR001",
  firstName: "Lakshmi",
  email: "lakshmi@cgh.test",
  role: "nurse",
});
const reception = await provision({
  employeeId: "REC001",
  firstName: "Deepak",
  email: "deepak@cgh.test",
  role: "receptionist",
});

const wardId = (
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
  )
).data.id;
const roomId = (
  await req(
    "POST",
    "/beds/rooms",
    { wardId, number: "101", type: "general" },
    adminToken,
  )
).data.id;
await req(
  "POST",
  "/beds/bulk",
  { roomId, prefix: "A", from: 1, to: 2 },
  adminToken,
);
const bed = await BedModel.findOne({ wardId });

const sanjay = (
  await req(
    "POST",
    "/patients",
    {
      firstName: "Sanjay",
      lastName: "Case",
      gender: "male",
      dateOfBirth: "1960-01-01",
      mobile: "9876543210",
    },
    reception.token,
  )
).data;
await req(
  "PUT",
  `/patients/${sanjay.id}/allergies`,
  {
    allergies: [
      {
        substance: "Penicillin",
        severity: "severe",
        reaction: "Anaphylaxis",
        category: "drug",
      },
    ],
  },
  doctor.token,
);
const admission = (
  await req(
    "POST",
    "/admissions",
    {
      patientId: sanjay.id,
      bedId: String(bed._id),
      reason: "Community acquired pneumonia, IV antibiotics",
    },
    doctor.token,
  )
).data;
await req(
  "POST",
  `/admissions/${admission.id}/nurse`,
  { nurseId: nurse.id },
  doctor.token,
);
await req(
  "POST",
  "/nursing/observations",
  {
    admissionId: admission.id,
    respiratoryRate: 16,
    spo2: 97,
    onOxygen: false,
    systolic: 124,
    pulse: 78,
    consciousness: "alert",
    temperatureC: 37.1,
  },
  nurse.token,
);

console.log(
  "Seeded: an admitted patient with a penicillin allergy and one set of observations\n",
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
const context = await browser.newContext({
  viewport: { width: 1400, height: 1000 },
});
const consoleErrors = [];
const httpFailures = [];
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("response", (r) => {
  if (r.status() >= 400)
    httpFailures.push(
      `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`,
    );
});
// playwright's offline mode does not reach this proxy — it forwards from the
// test process, which is still online, so the pull is enforced here too.
let networkPulled = false;
// socket blocked so the gate never reaches whatever listens on the build's baked-in dev port.
await page.route("**/socket.io/**", (route) => route.abort());
await page.route("**/api/v1/**", async (route) => {
  if (networkPulled) return route.abort("internetdisconnected");
  const url = new URL(route.request().url());
  const response = await route.fetch({
    url: `${API}${url.pathname}${url.search}`,
  });
  await route.fulfill({ response });
});

const body = () => page.innerText("body");
const go = async (route, wait = 2600) => {
  await page.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(wait);
};
const recordUrl = `/patients/${sanjay.id}/record`;
const bedsideUrl = `/nursing/patients/${admission.id}`;
const until = async (fn, ms = 40_000) => {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() > end) return false;
    await page.waitForTimeout(500);
  }
};

async function chartObservations(values) {
  await page.getByText("Record obs", { exact: true }).click();
  await page.waitForTimeout(600);
  for (const [id, v] of Object.entries(values))
    await page.getByTestId(`obs-${id}`).fill(String(v));
  await page.getByTestId("obs-air").click();
  await page.getByTestId("obs-acvpu-alert").click();
  await page.getByTestId("obs-submit").click();
  await page.waitForTimeout(1500);
}

try {
  // =========================================================================
  console.log("Online — the nurse opens the chart and the record\n");

  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.waitForTimeout(1300);
  await page.getByTestId("login-email").fill(nurse.email);
  await page.getByTestId("login-password").fill(nurse.password);
  await page.getByTestId("login-submit").click();
  await page.waitForTimeout(2400);

  await go(bedsideUrl);
  check(
    (await body()).includes("Sanjay Case"),
    "the bedside chart opens online",
  );
  await go(recordUrl);
  check(
    (await body()).includes("Penicillin"),
    "the record opens online, with the allergy",
  );

  const workerReady = await page.evaluate(() =>
    Promise.race([
      navigator.serviceWorker.ready.then(() => true),
      new Promise((r) => setTimeout(() => r(false), 10000)),
    ]),
  );
  check(workerReady, "the service worker is installed");
  // wait for the worker to take the bundle and fonts, and the mirror to write.
  await page.waitForTimeout(6500);
  const mirrored = await page.evaluate(
    () =>
      Object.keys(localStorage).filter((k) => k.startsWith("hms-mirror:"))
        .length,
  );
  check(mirrored === 1, "what the nurse opened is saved on this device");

  // =========================================================================
  console.log("\nThe network is pulled\n");

  networkPulled = true;
  await context.setOffline(true);
  await page
    .goto(`${WEB}${recordUrl}`, { waitUntil: "domcontentloaded" })
    .catch(() => {});
  await page.waitForTimeout(4000);
  let text = await body();
  check(
    text.includes("Sanjay Case"),
    "a reload with no connection still opens the app",
  );
  check(
    text.includes("Penicillin") && text.includes("Anaphylaxis"),
    "the record is still readable, allergy and all",
  );
  check(
    (await page.getByTestId("offline-status").innerText()).includes("Offline"),
    "and the screen says it is offline, showing a saved copy",
  );
  await page.screenshot({ path: path.join(SHOTS, "offline-1-record.png") });

  await page
    .goto(`${WEB}${bedsideUrl}`, { waitUntil: "domcontentloaded" })
    .catch(() => {});
  await page.waitForTimeout(3500);
  check(
    (await body()).includes("Observation trend"),
    "the bedside chart is readable offline",
  );

  await chartObservations({
    respiratoryRate: 18,
    spo2: 96,
    systolic: 122,
    pulse: 84,
    temperatureC: 37.2,
  });
  check(
    await page.getByTestId("observation-queued").isVisible(),
    "a nurse can still chart vitals — saved on this device, not sent",
  );
  check(
    (await page.getByTestId("observation-queued-escalate").count()) === 0,
    "a calm set does not cry wolf",
  );

  await page.waitForTimeout(1200); // two sets a moment apart, so their order is unambiguous
  await chartObservations({
    respiratoryRate: 26,
    spo2: 91,
    systolic: 95,
    pulse: 122,
    temperatureC: 38.4,
  });
  text = await page.getByTestId("observation-queued-escalate").innerText();
  check(
    text.includes("Escalate in person now") && /NEWS2 1\d/.test(text),
    "a worrying set says escalate in person — the board cannot see it yet",
    text.slice(0, 90),
  );
  await page.screenshot({
    path: path.join(SHOTS, "offline-2-queued-escalate.png"),
  });

  await page.getByText("Notes & handover", { exact: true }).click();
  await page.waitForTimeout(600);
  await page
    .getByTestId("note-text")
    .fill(
      "Patient more breathless, doctor informed by phone during network outage",
    );
  await page.getByTestId("note-submit").click();
  await page.waitForTimeout(1200);
  check(
    await page.getByTestId("note-queued").isVisible(),
    "a nursing note is kept too",
  );
  check(
    (await page.getByTestId("offline-status").innerText()).includes(
      "3 entries waiting to send",
    ),
    "the strip counts three entries waiting",
  );

  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(3500);
  check(
    (await page.locator('[data-testid^="pending-observation-"]').count()) === 2,
    "the queue survives a reload — both sets still waiting on the chart",
  );
  text = await page
    .getByTestId("bedside-pending-score")
    .innerText()
    .catch(() => "");
  check(
    /1\d/.test(text) && text.includes("not yet sent"),
    "the pinned score is the newest set charted here, not the last one filed",
    text.slice(0, 80),
  );
  await page.screenshot({
    path: path.join(SHOTS, "offline-3-pending-chart.png"),
  });

  // =========================================================================
  console.log(
    "\nThe network returns — and the first response is lost on the way back\n",
  );

  let lostOne = false;
  await page.route("**/api/v1/nursing/observations", async (route) => {
    if (route.request().method() !== "POST" || lostOne) return route.fallback();
    lostOne = true;
    const url = new URL(route.request().url());
    // the server receives and stores it; the device never hears back.
    await route.fetch({ url: `${API}${url.pathname}${url.search}` });
    await route.abort("connectionreset");
  });

  networkPulled = false;
  await context.setOffline(false);
  const drained = await until(
    async () => (await page.getByTestId("offline-status").count()) === 0,
    60_000,
  );
  check(drained, "on reconnect the queue drains by itself");
  check(
    lostOne,
    "one write reached the server with its response lost, as staged",
  );

  const listed = (
    await req(
      "GET",
      `/nursing/observations?admissionId=${admission.id}&limit=50`,
      null,
      nurse.token,
    )
  ).data;
  const stored = await ObservationModel.find({ admissionId: admission.id })
    .sort({ recordedAt: 1 })
    .lean();
  check(
    stored.length === 3 && listed.length === 3,
    "no duplicates: one seeded set and the two charted offline",
    `stored ${stored.length}`,
  );
  const offlineSets = stored.filter((o) => o.clientOpId);
  check(
    new Set(offlineSets.map((o) => o.clientOpId)).size === 2,
    "each offline set is one operation",
  );
  check(
    offlineSets.length === 2 &&
      offlineSets[0].respiratoryRate === 18 &&
      offlineSets[1].respiratoryRate === 26,
    "filed in the order they were charted, at the times they were charted",
  );
  const escalations = (
    await req("GET", "/nursing/escalations", null, nurse.token)
  ).data;
  check(
    escalations.some((e) => e.id === String(offlineSets[1]?._id)),
    "the worrying set reached the escalation board once it synced",
  );
  const notes = (
    await req(
      "GET",
      `/nursing/notes?admissionId=${admission.id}`,
      null,
      nurse.token,
    )
  ).data;
  check(
    notes.length === 1 && notes[0].note.includes("network outage"),
    "the note was filed, once",
  );

  await page.goto(`${WEB}${bedsideUrl}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  check(
    (await page.locator('[data-testid^="pending-observation-"]').count()) === 0,
    "the chart shows them as filed, not waiting",
  );
  await page.screenshot({ path: path.join(SHOTS, "offline-4-synced.png") });

  // =========================================================================
  console.log("\nSigning out\n");

  await page
    .getByRole("button", { name: /sign out|log out/i })
    .first()
    .click();
  await page.waitForTimeout(2000);
  const leftBehind = await page.evaluate(
    () =>
      Object.keys(localStorage).filter((k) => k.startsWith("hms-mirror:"))
        .length,
  );
  check(
    leftBehind === 0,
    "signing out removes the saved records from the device",
  );

  // -- Health ----------------------------------------------------------------
  console.log(
    `\n  (HTTP non-2xx seen: ${httpFailures.join(", ") || "none"})\n`,
  );
  // offline, the browser logs every request it could not make — expected here.
  const jsErrors = consoleErrors.filter(
    (e) =>
      !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::ERR_/i.test(e),
  );
  check(
    jsErrors.length === 0,
    "no JavaScript errors",
    jsErrors.slice(0, 2).join(" | "),
  );
  check(httpFailures.length === 0, "no HTTP failures", httpFailures.join(", "));
} catch (err) {
  console.error("\nJourney threw:", err.message);
  failures.push(`exception: ${err.message}`);
  await page
    .screenshot({ path: path.join(SHOTS, "offline-FAILURE.png") })
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
console.log(
  "\nThe record reads and vitals chart with the network pulled, and sync on reconnect. Screenshots in docs/shots/\n",
);
