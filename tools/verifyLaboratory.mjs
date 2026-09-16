/**
 * Phase 5 gate (browser, Flow 3): critical values flag while typing, unreported results
 * stay hidden, unacknowledged criticals escalate to a colleague, lab view hides diagnosis.
 *   node tools/verifyLaboratory.mjs
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

const API_PORT = 5199;
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
const { sweep } = await imp(
  BACK,
  "src",
  "modules",
  "laboratory",
  "labEscalation.js",
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
const colleague = await provision({
  employeeId: "DOC002",
  firstName: "Farah",
  email: "farah@cgh.test",
  role: "doctor",
  departmentId: dept.data.id,
});
const lab = await provision({
  employeeId: "LAB001",
  firstName: "Sunita",
  email: "sunita@cgh.test",
  role: "lab",
});
const reception = await provision({
  employeeId: "REC001",
  firstName: "Deepak",
  email: "deepak@cgh.test",
  role: "receptionist",
});

const patient = await req(
  "POST",
  "/patients",
  {
    firstName: "Mohan",
    lastName: "Das",
    gender: "male",
    dateOfBirth: "1966-03-02",
    mobile: "9876543210",
  },
  reception.token,
);
const patientId = patient.data.id;
await req(
  "PUT",
  `/patients/${patientId}/allergies`,
  { allergies: [] },
  doctor.token,
);

await req("POST", "/laboratory/tests/load-standard", null, adminToken);
const catalogue = (await req("GET", "/laboratory/tests", null, doctor.token))
  .data;
const byCode = Object.fromEntries(catalogue.map((t) => [t.code, t]));

// A signed consultation carrying a diagnosis the laboratory must never read.
const consultation = await req(
  "POST",
  "/consultations",
  { patientId, type: "opd" },
  doctor.token,
);
await req(
  "PATCH",
  `/consultations/${consultation.data.id}`,
  {
    chiefComplaint: "Breathless and weak for three days",
    diagnoses: [
      {
        description: "Chronic kidney disease stage 4",
        type: "provisional",
        isPrimary: true,
      },
    ],
    treatmentPlan: "Restrict potassium, review dialysis referral",
  },
  doctor.token,
);
await req(
  "POST",
  `/consultations/${consultation.data.id}/sign`,
  null,
  doctor.token,
);

// A routine test ordered earlier — the stat order placed later must overtake it.
const tsh = (
  await req(
    "POST",
    "/laboratory/orders",
    {
      patientId,
      testIds: [byCode.TSH.id],
      clinicalIndication: "Fatigue and weight gain",
      urgency: "routine",
    },
    doctor.token,
  )
).data.orders[0];

console.log(
  "Seeded: a CKD patient, a signed diagnosis, the standard catalogue and a routine TSH\n",
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
  // Block the live-update socket; it is not under test and may hit a stray dev port.
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

const doc = await newPage();
let rftOrder;

try {
  // =========================================================================
  console.log("LB-01 — the doctor orders from the patient's record\n");

  await signIn(doc, doctor.email, doctor.password);
  await doc.goto(`${WEB}/patients/${patientId}/record`, {
    waitUntil: "networkidle",
  });
  await doc.waitForTimeout(2400);
  await doc.getByText("Lab results", { exact: false }).first().click();
  await doc.waitForTimeout(1200);

  check(
    await doc.getByTestId("order-tests-panel").isVisible(),
    "the order panel is on the patient's record",
  );
  check(
    !(await body(doc)).includes("Patient name"),
    "there is no patient field to type into",
  );

  await doc.getByTestId("lab-test-search").fill("renal");
  await doc.waitForTimeout(700);
  await doc.getByTestId("lab-test-option-RFT").click();
  await doc.getByTestId("lab-test-search").fill("cbc");
  await doc.waitForTimeout(700);
  await doc.getByTestId("lab-test-option-CBC").click();
  await doc.getByTestId("lab-test-search").fill("fasting");
  await doc.waitForTimeout(700);
  await doc.getByTestId("lab-test-option-FBS").click();
  await doc.waitForTimeout(500);

  let text = await body(doc);
  check(
    text.includes("Fasting for 8 to 10 hours"),
    "preparation instructions appear as the test is chosen",
  );
  check(
    !/₹|\bprice\b/i.test(text),
    "no price anywhere in the doctor's ordering panel",
  );
  check(
    await doc.getByTestId("lab-order-submit").isDisabled(),
    "an order without a clinical indication cannot be sent",
  );

  await doc.getByTestId("lab-urgency-stat").click();
  await doc
    .getByTestId("lab-indication")
    .fill(
      "CKD with weakness and breathlessness — check potassium and haemoglobin",
    );
  await doc.waitForTimeout(400);
  await doc.screenshot({ path: path.join(SHOTS, "lab-1-order.png") });
  await doc.getByTestId("lab-order-submit").click();
  await doc.waitForTimeout(2600);

  text = await body(doc);
  check(text.includes("Sent to the laboratory"), "the order is confirmed");
  check(
    text.includes("Waiting for the laboratory") &&
      text.includes("Renal function test"),
    "and listed as waiting on the record",
  );

  // The duplicate pause.
  await doc.getByTestId("lab-test-search").fill("renal");
  await doc.waitForTimeout(700);
  await doc.getByTestId("lab-test-option-RFT").click();
  await doc.getByTestId("lab-indication").fill("Repeat potassium");
  await doc.waitForTimeout(300);
  await doc.getByTestId("lab-order-submit").click();
  await doc.waitForTimeout(2000);
  check(
    await doc.getByTestId("lab-duplicate-warning").isVisible(),
    "LB-01: ordering the same test again pauses with the earlier order",
  );
  check(
    (await body(doc)).includes("ordered") &&
      (await body(doc)).includes("by Rajesh"),
    "naming who ordered it and when",
  );
  await doc.screenshot({ path: path.join(SHOTS, "lab-2-duplicate.png") });
  await doc.getByText("Don't order").click();
  await doc.waitForTimeout(500);

  const inbox = (await req("GET", "/laboratory/inbox", null, doctor.token))
    .data;
  rftOrder = inbox.pending.find((o) => o.test.code === "RFT");
  const cbcOrder = inbox.pending.find((o) => o.test.code === "CBC");
  check(
    inbox.pending.filter((o) => o.test.code === "RFT").length === 1,
    "only one renal panel was actually ordered",
  );

  // =========================================================================
  console.log("\nLB-02/03 — the laboratory works the queue\n");

  const bench = await newPage();
  await signIn(bench, lab.email, lab.password);
  await bench.goto(`${WEB}/lab/requests`, { waitUntil: "networkidle" });
  await bench.waitForTimeout(2400);

  const rows = await bench
    .locator('[data-testid^="lab-row-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  const idx = (n) => rows.indexOf(`lab-row-${n}`);
  check(
    idx(rftOrder.orderNumber) >= 0 && idx(tsh.orderNumber) >= 0,
    "the stat and routine orders are both in the queue",
  );
  check(
    idx(rftOrder.orderNumber) < idx(tsh.orderNumber),
    "LB-02: the newer STAT order sorts above the older routine one",
  );
  await bench.screenshot({ path: path.join(SHOTS, "lab-3-queue.png") });

  await bench.getByTestId(`lab-row-${rftOrder.orderNumber}`).click();
  await bench.waitForTimeout(2200);
  text = await body(bench);
  check(
    text.includes("check potassium and haemoglobin"),
    "Flow 3 step 3: the clinical indication is on the bench",
  );
  check(text.includes("Plain / gel"), "with the container to collect into");

  await bench.getByTestId("advance-sample_collected").click();
  await bench.waitForTimeout(1800);
  check(
    /SMP-\d{6}/.test(await bench.getByTestId("lab-sample-id").innerText()),
    "collecting the sample issues its accession number",
  );
  await bench.getByTestId("advance-in_progress").click();
  await bench.waitForTimeout(1800);

  text = await body(bench);
  check(
    text.includes("3.5 – 5.1 mmol/L"),
    "LB-04: the potassium field shows its range",
  );
  check(
    text.includes("0.7 – 1.3 mg/dL (male"),
    "and the creatinine range is the one for this 60-year-old man",
  );

  await bench.getByTestId("param-UREA-input").fill("112");
  await bench.getByTestId("param-CREAT-input").fill("3.9");
  await bench.getByTestId("param-NA-input").fill("13,6");
  await bench.getByTestId("param-K-input").fill("6.9");
  await bench.waitForTimeout(500);

  check(
    (await bench.getByTestId("param-K-preview").innerText()).includes("HH"),
    "a potassium of 6.9 turns critical as it is typed, before saving",
  );
  check(
    (await body(bench)).includes("Critically high"),
    "and says so in words",
  );
  check(
    (await body(bench)).includes("Not a number"),
    '"13,6" is refused on the spot',
  );
  check(
    await bench.getByTestId("save-results").isDisabled(),
    "and nothing can be saved while it is there",
  );
  await bench.screenshot({
    path: path.join(SHOTS, "lab-4-entry-live-flag.png"),
  });

  await bench.getByTestId("param-NA-input").fill("136");
  await bench.getByTestId("lab-comment").fill("Sample not haemolysed.");
  await bench.waitForTimeout(300);
  await bench.getByTestId("save-results").click();
  await bench.waitForTimeout(2200);
  check(
    (await body(bench)).includes("Critical: Potassium"),
    "saving confirms the critical value from the server",
  );

  // ---- The doctor cannot read bench values ---------------------------------
  await doc.goto(`${WEB}/lab/reports/${rftOrder.id}`, {
    waitUntil: "networkidle",
  });
  await doc.waitForTimeout(2400);
  text = await body(doc);
  check(
    await doc.getByTestId("results-not-reported").isVisible(),
    "a doctor opening an unreported order is told results are not reported yet",
  );
  check(!text.includes("6.9"), "and cannot see the value typed on the bench");

  // ---- Complete and report --------------------------------------------------
  await bench.getByTestId("advance-completed").click();
  await bench.waitForTimeout(2000);
  check(
    await bench.getByTestId("critical-unreported").isVisible(),
    "a completed critical result warns that only the lab knows about it",
  );

  await bench.getByTestId("advance-reported").click();
  await bench.waitForTimeout(900);
  check(
    (await body(bench)).includes("Report a critical result?"),
    "reporting a critical value is confirmed, naming who will be alerted",
  );
  await bench.getByText("Report and alert").click();
  await bench.waitForTimeout(2600);

  text = await body(bench);
  check(
    text.includes("Critical result — not yet acknowledged"),
    "LB-05: the critical result is open once reported",
  );
  check(
    text.includes("ordering doctor"),
    "and the ordering doctor is recorded as notified",
  );
  check(
    (await bench.getByTestId("critical-acknowledge-form").count()) === 0,
    "the laboratory is not offered a way to close its own critical call",
  );

  await bench.getByTestId("critical-call-to").fill("Dr Rajesh");
  await bench.getByTestId("critical-call-readback").click();
  await bench.getByTestId("critical-call-submit").click();
  await bench.waitForTimeout(2000);
  check(
    (await body(bench)).includes("told Dr Rajesh, read back"),
    "the lab records the call and the read-back",
  );
  await bench.screenshot({
    path: path.join(SHOTS, "lab-5-reported-critical.png"),
  });

  // ---- Sample rejection on the CBC -----------------------------------------
  await bench.goto(`${WEB}/lab/requests/${cbcOrder.id}`, {
    waitUntil: "networkidle",
  });
  await bench.waitForTimeout(2200);
  await bench.getByTestId("advance-sample_collected").click();
  await bench.waitForTimeout(1600);
  await bench.getByTestId("reject-sample-open").click();
  await bench.getByTestId("reject-reason").fill("Sample clotted in the tube");
  await bench.waitForTimeout(300);
  await bench.getByTestId("reject-sample-submit").click();
  await bench.waitForTimeout(2000);
  check(
    (await bench.getByTestId("sample-rejections").innerText()).includes(
      "clotted",
    ),
    "LB-03: a rejected sample keeps its reason on the order",
  );
  check(
    await bench.getByTestId("advance-sample_collected").isVisible(),
    "and returns to collection, the one sanctioned step back",
  );

  // =========================================================================
  console.log("\nLB-05 — the doctor's inbox, and escalation to a colleague\n");

  await doc.goto(`${WEB}/lab/reports`, { waitUntil: "networkidle" });
  await doc.waitForTimeout(2600);
  text = await body(doc);
  check(
    await doc.getByTestId("inbox-critical").isVisible(),
    "the critical result is at the top of the doctor's results",
  );
  check(text.includes("Potassium 6.9"), "with the value");
  await doc.screenshot({ path: path.join(SHOTS, "lab-6-inbox-critical.png") });

  // Nobody acknowledged it. Thirty-one minutes pass.
  const escalated = await sweep({ now: new Date(Date.now() + 31 * 60000) });
  check(
    escalated.length === 1,
    "unacknowledged after the window, it escalates",
  );

  const farahPage = await newPage();
  await signIn(farahPage, colleague.email, colleague.password);
  await farahPage.goto(`${WEB}/lab/reports`, { waitUntil: "networkidle" });
  await farahPage.waitForTimeout(2600);
  text = await body(farahPage);
  check(
    text.includes("Mohan Das") && text.includes("Potassium 6.9"),
    "a colleague in the department now sees a result she did not order",
  );
  check(
    text.includes("1 doctor in the department"),
    "and can see how far it has escalated",
  );

  await farahPage.getByTestId(`inbox-open-${rftOrder.orderNumber}`).click();
  await farahPage.waitForTimeout(2400);
  await farahPage.getByTestId("critical-acknowledge-note").fill("seen");
  await farahPage.waitForTimeout(300);
  check(
    await farahPage.getByTestId("critical-acknowledge-submit").isDisabled(),
    'LB-05: "seen" cannot acknowledge a critical result',
  );

  await farahPage
    .getByTestId("critical-acknowledge-note")
    .fill(
      "Patient recalled. ECG done, calcium gluconate and insulin-dextrose given; repeat potassium in 2 hours.",
    );
  await farahPage.waitForTimeout(300);
  await farahPage.getByTestId("critical-acknowledge-submit").click();
  await farahPage.waitForTimeout(2400);
  text = await body(farahPage);
  check(
    text.includes("Acknowledged by Farah"),
    "the colleague acknowledges it with what she is doing",
  );
  await farahPage.screenshot({
    path: path.join(SHOTS, "lab-7-acknowledged.png"),
  });

  await doc.goto(`${WEB}/lab/reports`, { waitUntil: "networkidle" });
  await doc.waitForTimeout(2400);
  check(
    (await doc.getByTestId("inbox-critical").count()) === 0,
    "and it leaves the ordering doctor's critical list",
  );

  // =========================================================================
  console.log("\nLB-05/MR-03 — the record\n");

  await doc.goto(`${WEB}/patients/${patientId}/record`, {
    waitUntil: "networkidle",
  });
  await doc.waitForTimeout(2400);
  await doc.getByText("Lab results", { exact: false }).first().click();
  await doc.waitForTimeout(1200);
  check(
    await doc.getByTestId(`record-lab-${rftOrder.orderNumber}`).isVisible(),
    "the reported result is on the patient's record",
  );
  check(
    (await doc.getByTestId("result-K-flag").first().innerText()).includes("HH"),
    "flagged HH beside the value",
  );
  check(
    (await body(doc)).includes("acknowledged by Farah"),
    "with who acknowledged the critical value",
  );
  await doc.screenshot({ path: path.join(SHOTS, "lab-8-record.png") });

  await bench.goto(`${WEB}/patients/${patientId}/record`, {
    waitUntil: "networkidle",
  });
  await bench.waitForTimeout(2400);
  text = await body(bench);
  check(
    text.includes("Laboratory view"),
    "MR-03: the laboratory is told which view of the record it has",
  );
  check(
    !text.includes("Chronic kidney disease"),
    "section 6.4: and it does not contain the diagnosis",
  );
  check(!text.includes("dialysis referral"), "or the treatment plan");

  await bench.goto(`${WEB}/dashboard`, { waitUntil: "networkidle" });
  await bench.waitForTimeout(2200);
  check(
    (await body(bench)).includes("Tests pending"),
    "the laboratory's dashboard shows pending tests",
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
  // 409 is the duplicate-order pause, which this journey triggers on purpose.
  const unexpected = httpFailures.filter(
    (f) => !/^409 POST \/api\/v1\/laboratory\/orders$/.test(f),
  );
  check(
    unexpected.length === 0,
    "no unexpected HTTP failures",
    unexpected.join(", "),
  );
} catch (err) {
  console.error("\nJourney threw:", err.message);
  failures.push(`exception: ${err.message}`);
  await doc
    .screenshot({ path: path.join(SHOTS, "lab-FAILURE.png") })
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
console.log("\nFlow 3 works end to end. Screenshots in docs/shots/\n");
