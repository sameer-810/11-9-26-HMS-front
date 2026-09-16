/**
 * phase 6 gate: pharmacy and inventory in a real browser (expiry entry, locked expired batches,
 * allergy tick, and an allergy recorded mid-dispense blocking the medicine).
 *   node tools/verifyPharmacy.mjs
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

const API_PORT = 5200;
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

// ---------------------------------------------------------------------------
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
const { StockBatchModel } = await imp(
  BACK,
  "src",
  "modules",
  "inventory",
  "inventory.model.js",
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
const pharmacist = await provision({
  employeeId: "PHA001",
  firstName: "Imran",
  email: "imran@cgh.test",
  role: "pharmacy",
});
const store = await provision({
  employeeId: "INV001",
  firstName: "Kavya",
  email: "kavya@cgh.test",
  role: "inventory",
});
const reception = await provision({
  employeeId: "REC001",
  firstName: "Deepak",
  email: "deepak@cgh.test",
  role: "receptionist",
});

const amoxil = await req(
  "POST",
  "/prescriptions/medicines",
  {
    name: "Amoxil",
    genericName: "Amoxicillin",
    ingredients: ["amoxicillin"],
    form: "capsule",
    strength: "500mg",
  },
  adminToken,
);
const amoxItem = await req(
  "POST",
  "/inventory/items",
  {
    code: "AMOX500",
    name: "Amoxil 500mg capsule",
    medicineId: amoxil.data.id,
    unit: "capsule",
    reorderLevel: 20,
  },
  store.token,
);
await req(
  "PATCH",
  `/inventory/items/${amoxItem.data.id}`,
  { unitPrice: 12 },
  adminToken,
);
await req(
  "POST",
  "/inventory/suppliers",
  { name: "MedLine Distributors" },
  store.token,
);

await StockBatchModel.create({
  hospitalId: hospital._id,
  itemId: amoxItem.data.id,
  location: "pharmacy",
  batchNumber: "P-OLD",
  expiryDate: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10),
  quantityOnHand: 50,
});

const mkPatient = async (firstName, mobile) => {
  const p = await req(
    "POST",
    "/patients",
    {
      firstName,
      lastName: "Case",
      gender: "female",
      dateOfBirth: "1975-05-05",
      mobile,
    },
    reception.token,
  );
  await req(
    "PUT",
    `/patients/${p.data.id}/allergies`,
    { allergies: [] },
    doctor.token,
  );
  return p.data;
};
const anita = await mkPatient("Anita", "9876500001");
const bhavna = await mkPatient("Bhavna", "9876500002");

console.log(
  "Seeded: Amoxil in the formulary, a stock item, a supplier and expired stock on the pharmacy shelf\n",
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

async function newPage() {
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
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
  // socket blocked so the gate never reaches whatever listens on the build's baked-in dev port.
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

const signIn = async (p, email, password) => {
  await p.goto(WEB, { waitUntil: "networkidle" });
  await p.waitForTimeout(1300);
  await p.getByTestId("login-email").fill(email);
  await p.getByTestId("login-password").fill(password);
  await p.getByTestId("login-submit").click();
  await p.waitForTimeout(2400);
};
const body = (p) => p.innerText("body");
const choose = async (p, placeholder, option) => {
  await p.getByText(placeholder, { exact: true }).first().click();
  await p.waitForTimeout(500);
  await p.getByText(option, { exact: true }).last().click();
  await p.waitForTimeout(500);
};

const storePage = await newPage();
let text;

try {
  // =========================================================================
  console.log("IN-01 — the store receives a delivery\n");

  await signIn(storePage, store.email, store.password);
  await storePage.goto(`${WEB}/inventory/receive`, {
    waitUntil: "networkidle",
  });
  await storePage.waitForTimeout(2200);

  await choose(storePage, "Choose the supplier", "MedLine Distributors");
  await storePage.getByTestId("receive-invoice").fill("INV-7781");
  await choose(storePage, "Choose the item", "Amoxil 500mg capsule");
  await storePage.getByTestId("receive-batch-0").fill("A1");
  await storePage.getByTestId("receive-expiry-0").fill("03/27");
  await storePage.getByTestId("receive-qty-0").fill("200");
  await storePage.waitForTimeout(400);

  check(
    (await body(storePage)).includes("a two-digit year is not accepted"),
    "IN-01: a two-digit expiry year is refused as it is typed",
  );
  check(
    await storePage.getByTestId("receive-submit").isDisabled(),
    "and the delivery cannot be submitted with it",
  );
  await storePage.screenshot({
    path: path.join(SHOTS, "supply-1-receive-bad-expiry.png"),
  });

  await storePage.getByTestId("receive-expiry-0").fill("03/2030");
  await storePage.waitForTimeout(400);
  check(
    (await body(storePage)).includes("Usable until 31 Mar 2030"),
    "a month-and-year expiry is read back as the last day of the month",
  );

  await storePage.getByTestId("receive-submit").click();
  await storePage.waitForTimeout(2400);
  check(
    /GRN-\d{6} recorded/.test(
      await storePage.getByTestId("receive-success").innerText(),
    ),
    "the receipt is recorded with its goods-received number",
  );

  // =========================================================================
  console.log(
    "\nIN-02 — a transfer to the pharmacy, blocked above what the batch holds\n",
  );

  await storePage.goto(`${WEB}/inventory/issue`, { waitUntil: "networkidle" });
  await storePage.waitForTimeout(2200);
  await storePage.getByTestId("issue-to-pharmacy").click();
  await storePage.getByTestId("issue-received-by").fill("Imran");
  await choose(storePage, "Choose an item", "Amoxil 500mg capsule");
  await storePage.waitForTimeout(1200);
  await choose(storePage, "Add a batch", "Batch A1 · exp 31 Mar 2030");

  await storePage.getByTestId("issue-qty-A1").fill("999");
  await storePage.waitForTimeout(400);
  check(
    (await body(storePage)).includes("Only 200 in this batch"),
    "IN-02: issuing more than the batch holds is refused on screen",
  );
  check(
    await storePage.getByTestId("issue-submit").isDisabled(),
    "and cannot be submitted",
  );

  await storePage.getByTestId("issue-qty-A1").fill("150");
  await storePage.waitForTimeout(300);
  await storePage.getByTestId("issue-submit").click();
  await storePage.waitForTimeout(2400);
  check(
    /ISS-\d{6} recorded/.test(
      await storePage.getByTestId("issue-success").innerText(),
    ),
    "the transfer is recorded",
  );
  await storePage.screenshot({
    path: path.join(SHOTS, "supply-2-transfer.png"),
  });

  await storePage.goto(`${WEB}/inventory`, { waitUntil: "networkidle" });
  await storePage.waitForTimeout(2400);
  check(
    (
      await storePage.getByTestId("item-AMOX500-pharmacy").innerText()
    ).startsWith("150"),
    "the pharmacy now holds 150 usable",
  );
  check(
    (await storePage.getByTestId("item-AMOX500-expired").innerText()) === "50",
    "and the 50 expired are counted separately, never added in",
  );
  await storePage.screenshot({
    path: path.join(SHOTS, "supply-3-inventory.png"),
  });

  // =========================================================================
  console.log("\nPH-01..05 — the pharmacist dispenses\n");

  const rxA = (
    await req(
      "POST",
      "/prescriptions",
      {
        patientId: anita.id,
        urgency: "urgent",
        lines: [
          {
            medicineId: amoxil.data.id,
            dose: "1 cap",
            frequency: "tds",
            durationDays: 5,
          },
        ],
      },
      doctor.token,
    )
  ).data.prescription;

  const counter = await newPage();
  await signIn(counter, pharmacist.email, pharmacist.password);
  await counter.goto(`${WEB}/pharmacy/prescriptions`, {
    waitUntil: "networkidle",
  });
  await counter.waitForTimeout(2400);
  check(
    await counter.getByTestId(`rx-row-${rxA.prescriptionNumber}`).isVisible(),
    "PH-01: the prescription is in the pharmacy queue",
  );
  await counter.screenshot({ path: path.join(SHOTS, "supply-4-queue.png") });

  await counter.getByTestId(`rx-row-${rxA.prescriptionNumber}`).click();
  await counter.waitForTimeout(2600);

  text = await body(counter);
  check(
    text.includes("No known allergies"),
    "PH-03: the allergy status is on the dispensing screen",
  );
  check(
    text.includes("In stock"),
    "PH-02: stock is shown against live pharmacy inventory",
  );
  check(
    (await counter.getByTestId("locked-P-OLD").innerText()).includes(
      "Expired — cannot be selected",
    ),
    "PH-04: the expired batch is on screen, and locked",
  );
  check(
    (await counter.getByTestId("qty-A1").inputValue()) === "15",
    "the usable batch is suggested for the whole course",
  );
  check(
    await counter.getByTestId("dispense-confirm").isDisabled(),
    "PH-03: confirm is disabled until the allergy check is ticked",
  );
  await counter.screenshot({ path: path.join(SHOTS, "supply-5-dispense.png") });

  await counter.getByTestId("dispense-ack").click();
  await counter.waitForTimeout(300);
  check(
    !(await counter.getByTestId("dispense-confirm").isDisabled()),
    "and enabled once it is",
  );
  await counter.getByTestId("dispense-confirm").click();
  await counter.waitForTimeout(2800);

  const success = await counter.getByTestId("dispense-success").innerText();
  check(
    /DSP-\d{6} dispensed/.test(success),
    "PH-05: the dispense is confirmed",
  );
  check(success.includes("batch A1"), "PH-04: with the batch handed over");

  await storePage.goto(`${WEB}/inventory/movements`, {
    waitUntil: "networkidle",
  });
  await storePage.waitForTimeout(2400);
  text = await body(storePage);
  check(
    text.includes(rxA.prescriptionNumber),
    "IN-04: the store's ledger shows the dispense against its prescription number",
  );
  check(!text.includes("Anita"), "and never the patient's name");

  // =========================================================================
  console.log("\nPH-03 — an allergy recorded while the prescription is open\n");

  const rxB = (
    await req(
      "POST",
      "/prescriptions",
      {
        patientId: bhavna.id,
        lines: [
          {
            medicineId: amoxil.data.id,
            dose: "1 cap",
            frequency: "tds",
            durationDays: 5,
          },
        ],
      },
      doctor.token,
    )
  ).data.prescription;

  await counter.goto(`${WEB}/pharmacy/dispense/${rxB.id}`, {
    waitUntil: "networkidle",
  });
  await counter.waitForTimeout(2600);
  check(
    (await body(counter)).includes("No known allergies"),
    "the pharmacist opens it: no known allergies",
  );
  await counter.getByTestId("dispense-ack").click();
  await counter.waitForTimeout(300);
  check(
    !(await counter.getByTestId("dispense-confirm").isDisabled()),
    "and ticks the allergy check",
  );

  // meanwhile the doctor records an allergy while the prescription is open and ticked.
  await req(
    "PUT",
    `/patients/${bhavna.id}/allergies`,
    {
      allergies: [
        {
          substance: "Penicillin",
          severity: "anaphylaxis",
          reaction: "Throat swelling",
          category: "drug",
        },
      ],
    },
    doctor.token,
  );

  await counter.getByTestId("dispense-confirm").click();
  await counter.waitForTimeout(3200);

  text = await body(counter);
  check(
    (await counter.getByTestId("dispense-error").innerText()).includes(
      "allergy list changed",
    ),
    "THE CASE: the dispense is refused — the list she ticked is no longer true",
  );
  check(
    text.includes("Penicillin · anaphylaxis"),
    "the screen reloads with the new allergy",
  );
  check(
    await counter.getByTestId("allergies-changed").isVisible(),
    "and says it changed since the prescription was written",
  );
  check(
    await counter.getByTestId("dispense-blocked-Amoxil").isVisible(),
    "the amoxicillin is locked: the prescriber never considered this allergy",
  );
  check(
    (await counter.getByTestId("dispense-ack").getAttribute("aria-checked")) !==
      "true",
    "and the old tick is gone",
  );
  check(
    await counter.getByTestId("dispense-confirm").isDisabled(),
    "so nothing can be confirmed",
  );
  await counter.screenshot({
    path: path.join(SHOTS, "supply-6-allergy-changed.png"),
  });

  await counter.getByTestId("dispense-ack").click();
  await counter.waitForTimeout(300);
  check(
    await counter.getByTestId("dispense-confirm").isDisabled(),
    "even ticking it again cannot release a blocked medicine",
  );

  await counter.goto(`${WEB}/pharmacy/prescriptions`, {
    waitUntil: "networkidle",
  });
  await counter.waitForTimeout(2400);
  check(
    await counter
      .getByTestId(`rx-allergy-changed-${rxB.prescriptionNumber}`)
      .isVisible(),
    "the queue flags it before anyone opens it again",
  );

  // =========================================================================
  await storePage.goto(`${WEB}/dashboard`, { waitUntil: "networkidle" });
  await storePage.waitForTimeout(2200);
  check(
    (await body(storePage)).includes("Expired on the shelf"),
    "IN-03: the store's dashboard shows expired stock on the shelf",
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
  // the 409 on the changed allergy list is provoked on purpose.
  const unexpected = httpFailures.filter(
    (f) =>
      !/^409 POST \/api\/v1\/pharmacy\/prescriptions\/[0-9a-f]+\/dispense$/.test(
        f,
      ),
  );
  check(
    unexpected.length === 0,
    "no unexpected HTTP failures",
    unexpected.join(", "),
  );
} catch (err) {
  console.error("\nJourney threw:", err.message);
  failures.push(`exception: ${err.message}`);
  await storePage
    .screenshot({ path: path.join(SHOTS, "supply-FAILURE.png") })
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
  "\nPharmacy and inventory work end to end. Screenshots in docs/shots/\n",
);
