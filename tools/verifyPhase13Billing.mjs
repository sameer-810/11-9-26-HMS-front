/**
 * phase 13 gate — correcting a finalised bill: credit notes and their approval, refunds and
 * the refund slip, the printed A4 invoice, the bills list badges and the approvals tile, in a
 * real browser against a live API on an in-memory mongo.
 *
 *   DIST=path/to/web-build SHOTS=path/to/shots node tools/verifyPhase13Billing.mjs
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
  process.env.SHOTS || path.join(os.tmpdir(), "hms-phase13-billing-shots"),
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
const RUN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "hms-phase13-billing-"));
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

const API_PORT = 5251;
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
const { DepartmentModel } = await imp(
  BACK,
  "src",
  "modules",
  "department",
  "department.model.js",
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
  gstin: "29ABCDE1234F1Z5",
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
await DepartmentModel.updateOne({ _id: med.id }, { consultationFee: 500 });

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
  departmentId: med.id,
});
const billing = await provision({
  employeeId: "BIL001",
  firstName: "Priya",
  email: "priya@cgh.test",
  role: "billing",
});
const reception = await provision({
  employeeId: "REC001",
  firstName: "Deepak",
  email: "deepak@cgh.test",
  role: "receptionist",
});

const anita = (
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
const consult = (
  await req(
    "POST",
    "/consultations",
    { patientId: anita.id, type: "opd" },
    doctor.token,
  )
).data;
await req(
  "PATCH",
  `/consultations/${consult.id}`,
  {
    chiefComplaint: "Tiredness and thirst",
    diagnoses: [
      {
        description: "Type 2 diabetes mellitus",
        type: "provisional",
        isPrimary: true,
      },
    ],
  },
  doctor.token,
);
const signed = await req(
  "POST",
  `/consultations/${consult.id}/sign`,
  null,
  doctor.token,
);
await req(
  "POST",
  "/billing/tariff",
  { code: "DRESS", name: "Wound dressing", category: "procedure", price: 150 },
  adminToken,
);
await req(
  "PUT",
  "/billing/settings",
  { receiptFooter: "Thank you for choosing City General." },
  adminToken,
);
if (signed.status >= 400) throw new Error(`Seeding failed: ${signed.status}`);

console.log(
  "Seeded: a ₹500 department fee, a signed consultation, a ₹150 tariff service, billing, admin and reception\n",
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
    timezoneId: TZ,
  });
  // Test hook: record print jobs on window.__hmsLastPrint instead of printing them.
  await ctx.addInitScript(() => {
    globalThis.__HMS_TEST_PRINT__ = true;
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
const go = async (p, route, wait = 2600) => {
  await p.goto(`${WEB}${route}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(wait);
};
const shot = (p, name) =>
  p.screenshot({
    path: path.join(SHOTS, `phase13-billing-${name}.png`),
    fullPage: true,
  });
const textOf = (p, testId) =>
  p
    .getByTestId(testId)
    .first()
    .innerText()
    .catch(() => "");
const visible = (p, testId) =>
  p
    .getByTestId(testId)
    .first()
    .isVisible()
    .catch(() => false);
const flat = (s) => String(s).replace(/\s+/g, " ").trim();

/** Presses a print button and returns the job the app would have printed. */
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

const counter = await newPage();
let current = counter;
let text;
let billId;
let billNumber;

try {
  // =========================================================================
  console.log("A finalised, fully paid bill\n");

  await signIn(counter, billing.email, billing.password);
  await go(counter, "/billing/generate", 2000);
  await counter.getByTestId("generate-patient-search").fill("Anita");
  await counter.waitForTimeout(1500);
  await counter.getByTestId(`generate-pick-${anita.patientId}`).click();
  await counter.waitForTimeout(2600);
  await counter.getByTestId("generate-opd").click();
  await counter.waitForTimeout(2800);
  billId = counter.url().split("/billing/bills/")[1]?.split(/[?#]/)[0];
  check(
    (await textOf(counter, "bill-status")) === "Draft" && Boolean(billId),
    "billing generates a draft bill",
  );
  billNumber = (await req("GET", `/billing/bills/${billId}`, null, billing.token))
    .data.billNumber;

  text = flat(await counter.innerText("body"));
  check(
    (await counter.getByTestId("print-invoice").isDisabled()) &&
      text.includes("A draft can still change. Finalise the bill to print its invoice."),
    "a draft's invoice cannot be printed, and it says why",
  );
  check(
    (await counter.getByTestId("credit-note-form").count()) === 0,
    "a draft offers no credit note",
  );

  await counter.getByText("Choose a service", { exact: true }).click();
  await counter.waitForTimeout(500);
  await counter.getByText("Wound dressing", { exact: true }).last().click();
  await counter.waitForTimeout(400);
  await counter.getByTestId("add-service").click();
  await counter.waitForTimeout(2400);
  check(
    (await textOf(counter, "bill-total")).includes("650"),
    "consultation ₹500 and dressing ₹150 make ₹650",
    await textOf(counter, "bill-total"),
  );

  await counter.getByTestId("finalise-open").click();
  await counter.waitForTimeout(600);
  await counter.getByText("Finalise", { exact: true }).last().click();
  await counter.waitForTimeout(2800);
  check(
    (await textOf(counter, "bill-status")) === "Finalised",
    "billing finalises it",
  );
  check(
    (await counter.getByTestId("pay-amount").inputValue()) === "650",
    "the payment form starts at the full balance",
  );
  await counter.getByTestId("pay-submit").click();
  await counter.waitForTimeout(2800);
  check(
    (await textOf(counter, "bill-status")) === "Paid" &&
      (await textOf(counter, "bill-balance")).includes("0.00"),
    "and records full payment in cash",
  );
  check(
    (await counter.getByTestId("bill-refund-due").count()) === 0 &&
      (await counter.getByTestId("refund-form").count()) === 0,
    "nothing is owed back yet",
  );

  await go(counter, "/billing/bills");
  check(
    (await counter.getByTestId(`bill-row-${billNumber}`).count()) === 1 &&
      (await counter.getByTestId(`bill-badge-credit-${billNumber}`).count()) ===
        0 &&
      (await counter.getByTestId(`bill-badge-refund-${billNumber}`).count()) ===
        0,
    "the paid bill is listed with no badges",
  );

  // =========================================================================
  console.log("\nBilling asks for a credit note\n");

  await go(counter, `/billing/bills/${billId}`);
  text = flat(await textOf(counter, "credit-note-form"));
  check(
    text.includes("Correct this bill") &&
      text.includes("The charges on a finalised bill never change") &&
      text.includes("lowers what the patient owes"),
    "a finalised bill offers “Correct this bill”, and says the charges never change",
    text,
  );

  await counter.getByTestId("credit-note-amount").fill("1000");
  await counter.getByTestId("credit-note-reason").fill("wrong");
  await counter.waitForTimeout(400);
  text = flat(await textOf(counter, "credit-note-form"));
  check(
    (await counter.getByTestId("credit-note-submit").isDisabled()) &&
      text.includes("can still be credited on this bill") &&
      text.includes("at least 10 characters"),
    "more than the bill, and a too-short reason, are refused on the form",
    text,
  );

  await counter.getByTestId("credit-note-amount").fill("150");
  await counter
    .getByTestId("credit-note-reason")
    .fill("Wound dressing charged but not done");
  await counter.waitForTimeout(300);
  check(
    !(await counter.getByTestId("credit-note-submit").isDisabled()),
    "a valid amount and reason can be sent",
  );
  await counter.getByTestId("credit-note-submit").click();
  await counter.waitForTimeout(2800);
  const crn = (await req("GET", `/billing/bills/${billId}`, null, billing.token))
    .data.creditNotes[0];
  check(
    /^CRN-\d{6}$/.test(crn?.creditNoteNumber ?? ""),
    "a CRN- number is issued",
    crn?.creditNoteNumber,
  );
  text = flat(await textOf(counter, `credit-note-${crn?.creditNoteNumber}`));
  check(
    text.includes("Waiting for approval") &&
      text.includes("₹150.00") &&
      text.includes("Wound dressing charged but not done") &&
      text.includes("Asked by Priya Rao"),
    "the credit note shows as waiting, with amount, reason and who asked",
    text,
  );
  check(
    await visible(counter, "credit-note-waiting"),
    "and the form says another cannot be asked for until it is decided",
  );
  check(
    (await textOf(counter, "bill-total")).includes("650") &&
      (await counter.getByTestId("bill-net-total").count()) === 0,
    "the total does not change while it waits",
  );
  check(
    (await counter.getByTestId("credit-note-approve").count()) === 0,
    "billing is not offered Approve",
  );
  const selfDecide = await req(
    "POST",
    `/billing/bills/${billId}/credit-notes/${crn.id}/decision`,
    { approve: true },
    billing.token,
  );
  check(selfDecide.status === 403, "and the API refuses billing's approval");
  await shot(counter, "1-credit-note-waiting");

  await go(counter, "/billing/bills");
  check(
    await visible(counter, `bill-badge-credit-${billNumber}`),
    "the bills list marks the bill “Credit note waiting”",
    flat(await textOf(counter, `bill-row-${billNumber}`)),
  );

  // =========================================================================
  console.log("\nAdministration decides\n");

  const office = await newPage();
  current = office;
  await signIn(office, "admin@cgh.test", "AdminPassword123");
  await go(office, "/dashboard");
  text = flat(await textOf(office, "tile-billing-approvals"));
  check(
    text.includes("Waiting for approval") &&
      /\b1\b/.test(text) &&
      text.includes("discounts and credit notes"),
    "the admin dashboard shows 1 waiting for approval",
    text,
  );
  await shot(office, "2-approvals-tile");
  await office.getByTestId("tile-billing-approvals").click();
  await office.waitForTimeout(2600);
  check(
    (await visible(office, "bills-screen")) &&
      (await visible(office, "bills-approvals-hint")),
    "the tile opens Bills and explains where the waiting ones are",
  );

  await go(office, `/billing/bills/${billId}`);
  check(
    await visible(office, "credit-note-decision"),
    "the approver sees the credit note with Approve and Reject",
  );
  check(
    (await office.getByTestId("credit-note-form").count()) === 0 &&
      (await office.getByTestId("refund-form").count()) === 0,
    "and is not offered billing's own actions",
  );
  await office
    .getByTestId("credit-note-decision-note")
    .fill("Confirmed with the ward");
  await office.getByTestId("credit-note-approve").click();
  await office.waitForTimeout(2800);
  check(
    (await textOf(office, "bill-credited")).includes("150") &&
      (await textOf(office, "bill-net-total")).includes("500"),
    "once approved, the credit note comes off: net total ₹500",
    `${await textOf(office, "bill-credited")} / ${await textOf(office, "bill-net-total")}`,
  );
  check(
    (await textOf(office, "bill-refund-due")).includes("150"),
    "and ₹150 shows as refund due",
    await textOf(office, "bill-refund-due"),
  );
  text = flat(await textOf(office, `credit-note-${crn.creditNoteNumber}`));
  check(
    text.includes("Approved") &&
      text.includes("Approved by Asha Menon") &&
      text.includes("Confirmed with the ward"),
    "the credit note records who approved it, and the note",
    text,
  );
  await shot(office, "3-approved");

  await go(office, "/dashboard");
  text = flat(await textOf(office, "tile-billing-approvals"));
  check(/\b0\b/.test(text), "the approvals tile falls back to 0", text);

  // =========================================================================
  console.log("\nBilling pays the money back\n");

  current = counter;
  await go(counter, "/billing/bills");
  check(
    (await visible(counter, `bill-badge-refund-${billNumber}`)) &&
      (await textOf(counter, `bill-badge-refund-${billNumber}`)).includes(
        "150",
      ) &&
      (await counter.getByTestId(`bill-badge-credit-${billNumber}`).count()) ===
        0,
    "the list now marks “Refund due ₹150”, and the credit note is no longer waiting",
    flat(await textOf(counter, `bill-row-${billNumber}`)),
  );

  await go(counter, `/billing/bills/${billId}`);
  text = flat(await textOf(counter, "refund-form"));
  check(
    text.includes("Pay back ₹150.00"),
    "billing is offered “Pay back ₹150.00”",
    text,
  );
  await counter.getByTestId("refund-method-upi").click();
  await counter.getByTestId("refund-reason").fill("Credit note for dressing");
  await counter.waitForTimeout(400);
  text = flat(await textOf(counter, "refund-form"));
  check(
    (await counter.getByTestId("refund-submit").isDisabled()) &&
      text.includes("Needed for anything but cash"),
    "a UPI refund without its reference is blocked, and says why",
    text,
  );
  check(
    (await counter.getByTestId("refund-method-upi").getAttribute("aria-checked")) ===
      "true",
    "the chosen method reads as checked",
  );
  await counter.getByTestId("refund-amount").fill("200");
  await counter.getByTestId("refund-reference").fill("UPI-4471");
  await counter.waitForTimeout(300);
  check(
    (await counter.getByTestId("refund-submit").isDisabled()) &&
      flat(await textOf(counter, "refund-form")).includes(
        "Only ₹150.00 is owed back",
      ),
    "more than is owed back is refused on the form",
  );
  await counter.getByTestId("refund-amount").fill("150");
  await counter.waitForTimeout(300);
  await counter.getByTestId("refund-submit").click();
  await counter.waitForTimeout(2800);
  const rfd = (await req("GET", `/billing/bills/${billId}`, null, billing.token))
    .data.refunds?.[0];
  check(
    /^RFD-\d{6}$/.test(rfd?.refundNumber ?? ""),
    "the refund is recorded with an RFD- number",
    rfd?.refundNumber,
  );
  text = flat(await textOf(counter, `refund-${rfd?.refundNumber}`));
  check(
    text.includes("₹150.00") && text.includes("UPI") && text.includes("UPI-4471"),
    "and listed on the bill with amount, method and reference",
    text,
  );
  check(
    (await counter.getByTestId("bill-refund-due").count()) === 0 &&
      (await counter.getByTestId("refund-form").count()) === 0 &&
      (await textOf(counter, "bill-refunded")).includes("150"),
    "refund due is gone and ₹150 shows as refunded",
  );
  await shot(counter, "4-refunded");

  await go(counter, "/billing/bills");
  check(
    (await counter.getByTestId(`bill-row-${billNumber}`).count()) === 1 &&
      (await counter.getByTestId(`bill-badge-refund-${billNumber}`).count()) ===
        0,
    "the refund badge leaves the list",
  );

  // =========================================================================
  console.log("\nRefund slip and printed invoice\n");

  await go(counter, `/billing/bills/${billId}`);
  await counter.getByTestId(`refund-slip-${rfd.refundNumber}`).click();
  await counter.waitForTimeout(2800);
  text = await textOf(counter, "refund-slip-words");
  check(
    /One Hundred (and )?Fifty/.test(text),
    "the refund slip opens with the amount in words",
    text,
  );
  text = flat(await textOf(counter, "refund-slip"));
  check(
    text.includes(rfd.refundNumber) &&
      text.includes("₹150.00") &&
      text.includes("Signature of patient or representative") &&
      text.includes("I received ₹150.00") &&
      text.includes("GSTIN 29ABCDE1234F1Z5"),
    "with the refund number, the hospital, and a line for the patient to sign",
    text,
  );
  check(
    !text.includes("diabetes") && !text.includes("Tiredness"),
    "and nothing clinical",
  );
  check(
    await visible(counter, "print-refund-slip"),
    "the slip has a Print button",
  );
  await shot(counter, "5-refund-slip");

  await go(counter, `/billing/bills/${billId}`);
  const job = await printJob(counter, "print-invoice");
  const doc = job?.html ?? "";
  check(
    job?.widthMm === 210 && job?.heightMm === 297,
    "“Print invoice” produces an A4 document",
    `${job?.widthMm} × ${job?.heightMm}`,
  );
  check(
    doc.includes('data-print-document="invoice"') &&
      doc.includes(`data-field="billNumber">${billNumber}<`),
    "the invoice carries the bill number",
  );
  check(
    doc.includes('data-field="netTotal">₹500.00<') &&
      doc.includes('data-field="credited">− ₹150.00<') &&
      doc.includes('data-field="refunded">₹150.00<') &&
      doc.includes('data-field="balanceDue">₹0.00<'),
    "and the net total, credit notes, refund and balance",
  );
  check(
    doc.includes("GSTIN 29ABCDE1234F1Z5") &&
      doc.includes("12 MG Road, Bengaluru") &&
      doc.includes("Thank you for choosing City General.") &&
      doc.includes("Wound dressing") &&
      doc.includes(crn.creditNoteNumber),
    "with the letterhead, the itemised charges, the credit note and the receipt footer",
  );
  const printedBody = doc.slice(doc.indexOf("<body"));
  check(
    !printedBody.includes("diabetes") &&
      !printedBody.includes("Tiredness") &&
      !/allerg/i.test(printedBody),
    "and no diagnosis or other clinical text",
  );
  fs.writeFileSync(path.join(SHOTS, "phase13-billing-invoice.html"), doc);
  const preview = await browser.newPage();
  await preview.setContent(doc);
  await preview.screenshot({
    path: path.join(SHOTS, "phase13-billing-6-invoice.png"),
    fullPage: true,
  });
  await preview.close();

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
  check(
    httpFailures.length === 0,
    "no unexpected HTTP failures",
    httpFailures.join(", "),
  );
} catch (err) {
  console.error("\nJourney threw:", err.message);
  failures.push(`exception: ${err.message}`);
  await current
    .screenshot({ path: path.join(SHOTS, "phase13-billing-FAILURE.png") })
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

if (failures.length) {
  console.error(
    `\n${failures.length} check(s) failed:\n - ${failures.join("\n - ")}\n`,
  );
  process.exit(1);
}
console.log(
  `\nPhase 13 billing corrections work end to end. Screenshots in ${SHOTS}\n`,
);
