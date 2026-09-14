/**
 * Phase 7 gate — billing and payments, in a real browser.
 *
 * What only a browser shows:
 *  - the billing screen compiles charges with nothing to type an amount into,
 *    and nothing clinical on it;
 *  - an unpriced medicine stops finalisation until administration prices it;
 *  - a discount waits for administration's approval, on a different login;
 *  - once finalised, the charge controls are gone, and only payment moves;
 *  - a payment above the balance cannot be submitted; the receipt reads the
 *    amount back in words.
 *
 *   node tools/verifyBilling.mjs
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
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".svg": "image/svg+xml",
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

console.log("\nStarting the API…");
const { MongoMemoryReplSet } = await imp(BACK, "node_modules", "mongodb-memory-server", "index.js");
const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
const mongoUri = replSet.getUri();

const API_PORT = 5201;
const secrets = {
  JWT_ACCESS_SECRET: "verify-access-secret-not-real",
  JWT_REFRESH_SECRET: "verify-refresh-secret-not-real",
  JWT_ADMIN_SECRET: "verify-admin-secret-not-real",
};
const api = spawn(process.execPath, ["server.js"], {
  cwd: BACK,
  env: { ...process.env, ...secrets, NODE_ENV: "test", PORT: String(API_PORT), MONGODB_URI: mongoUri, BCRYPT_ROUNDS: "4", CORS_ORIGIN: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let apiLog = "";
api.stdout.on("data", (d) => (apiLog += d));
api.stderr.on("data", (d) => (apiLog += d));
const API = `http://127.0.0.1:${API_PORT}`;
for (let waited = 0; ; waited += 300) {
  try {
    if ((await fetch(`${API}/health`)).ok) break;
  } catch { /* not up */ }
  if (waited > 40_000) throw new Error(`API did not start.\n${apiLog}`);
  await new Promise((r) => setTimeout(r, 300));
}
console.log(`API ready on ${API}`);

process.env.MONGODB_URI = mongoUri;
Object.assign(process.env, secrets);
process.env.BCRYPT_ROUNDS = "4";

const mongoose = (await imp(BACK, "node_modules", "mongoose", "index.js")).default;
await mongoose.connect(mongoUri);
const { HospitalModel } = await imp(BACK, "src", "modules", "hospital", "hospital.model.js");
const { UserModel, hashPassword } = await imp(BACK, "src", "modules", "user", "user.model.js");
const { DepartmentModel } = await imp(BACK, "src", "modules", "department", "department.model.js");
const { defaultPermissionsFor, ROLES } = await imp(BACK, "src", "config", "roles.js");

const hospital = await HospitalModel.create({
  name: "City General Hospital", code: "CGH", approvalStatus: "approved", approvedAt: new Date(), isActive: true,
  timezone: "Asia/Kolkata", gstin: "29ABCDE1234F1Z5", address: { line1: "12 MG Road", city: "Bengaluru" },
});
await UserModel.create({
  hospitalId: hospital._id, employeeId: "ADM001", firstName: "Asha", lastName: "Menon", email: "admin@cgh.test",
  passwordHash: await hashPassword("AdminPassword123"), role: ROLES.ADMIN, permissions: defaultPermissionsFor(ROLES.ADMIN),
  isActive: true, mustChangePassword: false,
});

const req = (method, p, body, token) =>
  fetch(`${API}/api/v1${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then((r) => r.json());

const adminToken = (await req("POST", "/auth/login", { email: "admin@cgh.test", password: "AdminPassword123", deviceId: "verify-admin", deviceName: "Verifier" })).data.accessToken;
const dept = await req("POST", "/departments", { name: "General Medicine", code: "MED" }, adminToken);
await DepartmentModel.updateOne({ _id: dept.data.id }, { consultationFee: 500 });

async function provision({ employeeId, firstName, email, role, departmentId }) {
  const created = await req("POST", "/users", { employeeId, firstName, lastName: "Rao", email, role, departmentId }, adminToken);
  const temp = created.data.temporaryPassword;
  const first = await req("POST", "/auth/login", { email, password: temp, deviceId: `${employeeId}-device`, deviceName: "Verifier" });
  const password = `${firstName}Password123`;
  await req("POST", "/auth/change-password", { currentPassword: temp, newPassword: password, deviceId: `${employeeId}-device` }, first.data.accessToken);
  const live = await req("POST", "/auth/login", { email, password, deviceId: `${employeeId}-device` });
  return { id: created.data.user.id, email, password, token: live.data.accessToken };
}

const doctor = await provision({ employeeId: "DOC001", firstName: "Rajesh", email: "rajesh@cgh.test", role: "doctor", departmentId: dept.data.id });
const lab = await provision({ employeeId: "LAB001", firstName: "Sunita", email: "sunita@cgh.test", role: "lab" });
const pharmacist = await provision({ employeeId: "PHA001", firstName: "Imran", email: "imran@cgh.test", role: "pharmacy" });
const store = await provision({ employeeId: "INV001", firstName: "Kavya", email: "kavya@cgh.test", role: "inventory" });
const billing = await provision({ employeeId: "BIL001", firstName: "Priya", email: "priya@cgh.test", role: "billing" });
const reception = await provision({ employeeId: "REC001", firstName: "Deepak", email: "deepak@cgh.test", role: "receptionist" });

// ---- Anita's visit: consultation, blood test, medicines ---------------------
const anita = (await req("POST", "/patients", { firstName: "Anita", lastName: "Case", gender: "female", dateOfBirth: "1970-01-01", mobile: "9876500001" }, reception.token)).data;
await req("PUT", `/patients/${anita.id}/allergies`, { allergies: [{ substance: "Sulfa", severity: "moderate", reaction: "Rash", category: "drug" }] }, doctor.token);

const consult = (await req("POST", "/consultations", { patientId: anita.id, type: "opd" }, doctor.token)).data;
await req("PATCH", `/consultations/${consult.id}`, { chiefComplaint: "Tiredness and thirst", diagnoses: [{ description: "Type 2 diabetes mellitus", type: "provisional", isPrimary: true }] }, doctor.token);
await req("POST", `/consultations/${consult.id}/sign`, null, doctor.token);

await req("POST", "/laboratory/tests/load-standard", null, adminToken);
const cbcTest = (await req("GET", "/laboratory/tests?search=blood", null, doctor.token)).data.find((t) => t.code === "CBC");
const cbc = (await req("POST", "/laboratory/orders", { patientId: anita.id, testIds: [cbcTest.id], clinicalIndication: "Suspected anaemia", urgency: "routine" }, doctor.token)).data.orders[0];
for (const to of ["sample_collected", "in_progress"]) await req("POST", `/laboratory/orders/${cbc.id}/stage`, { to }, lab.token);
await req("PUT", `/laboratory/orders/${cbc.id}/results`, { values: { HB: "8.1", WBC: "7.0", PLT: "250", HCT: "30" } }, lab.token);
for (const to of ["completed", "reported"]) await req("POST", `/laboratory/orders/${cbc.id}/stage`, { to }, lab.token);

const med = async (name, ingredient) => (await req("POST", "/prescriptions/medicines", { name, genericName: ingredient, ingredients: [ingredient], form: "tablet", strength: "500mg" }, adminToken)).data.id;
const glycomet = await med("Glycomet", "metformin");
const calcirol = await med("Calcirol", "cholecalciferol");
const item = async (code, medicineId) => (await req("POST", "/inventory/items", { code, name: code, medicineId, unit: "tablet" }, store.token)).data.id;
const glycometItem = await item("METF500", glycomet);
const calcirolItem = await item("VITD", calcirol);
await req("PATCH", `/inventory/items/${glycometItem}`, { unitPrice: 3 }, adminToken);
const supplier = (await req("POST", "/inventory/suppliers", { name: "MedLine" }, store.token)).data.id;
await req("POST", "/inventory/receipts", {
  location: "pharmacy", supplierId: supplier, invoiceNumber: "INV-1",
  lines: [{ itemId: glycometItem, batchNumber: "M1", expiry: "12/2030", quantity: 100 }, { itemId: calcirolItem, batchNumber: "V1", expiry: "12/2030", quantity: 100 }],
}, pharmacist.token);
const rx = (await req("POST", "/prescriptions", {
  patientId: anita.id,
  lines: [{ medicineId: glycomet, dose: "1 tab", frequency: "bd", durationDays: 5 }, { medicineId: calcirol, dose: "1 tab", frequency: "od", durationDays: 4 }],
}, doctor.token)).data.prescription;
const ctx = (await req("GET", `/pharmacy/prescriptions/${rx.id}/dispense-context`, null, pharmacist.token)).data;
await req("POST", `/pharmacy/prescriptions/${rx.id}/dispense`, {
  allergiesAcknowledged: true, allergyFingerprint: ctx.allergyFingerprint,
  lines: ctx.lines.map((l) => ({ lineId: l.id, allocations: [{ batchId: l.batches[0].id, quantity: l.remaining }] })),
}, pharmacist.token);

await req("POST", "/billing/tariff", { code: "DRESS", name: "Wound dressing", category: "procedure", price: 150 }, adminToken);

console.log("Seeded: a signed consultation, a reported blood test, two dispensed medicines (one unpriced) and a tariff\n");

// ---------------------------------------------------------------------------
const web = http.createServer((rq, rs) => {
  const url = decodeURIComponent((rq.url || "/").split("?")[0]);
  let file = path.join(DIST, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  rs.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(file).pipe(rs);
});
await new Promise((r) => web.listen(0, "127.0.0.1", r));
const WEB = `http://127.0.0.1:${web.address().port}`;

const browser = await chromium.launch();
const consoleErrors = [];
const httpFailures = [];

async function newPage() {
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx2.newPage();
  p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  p.on("pageerror", (e) => consoleErrors.push(String(e)));
  p.on("response", (r) => { if (r.status() >= 400) httpFailures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
  await p.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${API}${url.pathname}${url.search}` });
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

const counter = await newPage();
let text;

try {
  // =========================================================================
  console.log("BL-01 — the charges are already compiled\n");

  await signIn(counter, billing.email, billing.password);
  await counter.goto(`${WEB}/billing/generate`, { waitUntil: "networkidle" });
  await counter.waitForTimeout(2000);
  await counter.getByTestId("generate-patient-search").fill("Anita");
  await counter.waitForTimeout(1500);
  await counter.getByTestId(`generate-pick-${anita.patientId}`).click();
  await counter.waitForTimeout(2600);

  text = await counter.getByTestId("preview-opd").innerText();
  check(text.includes("Consultation — General Medicine"), "BL-01: the signed consultation is a charge");
  check(text.includes("Complete blood count"), "the reported blood test is a charge");
  check(text.includes("Glycomet 500mg") && text.includes("Calcirol 500mg"), "the dispensed medicines are charges");
  check(text.includes("Not priced"), "an unpriced medicine is marked, not charged as free");
  text = await body(counter);
  check(!text.includes("diabetes") && !text.includes("anaemia"), "section 6.6: no diagnosis or indication on the billing screen");
  check(!text.includes("Sulfa"), "and no allergies");
  await counter.screenshot({ path: path.join(SHOTS, "billing-1-compiled.png") });

  await counter.getByTestId("generate-opd").click();
  await counter.waitForTimeout(2800);
  check((await counter.getByTestId("bill-status").innerText()) === "Draft", "BL-02: the bill is generated as a draft");
  const billId = counter.url().split("/billing/bills/")[1]?.split("?")[0];
  check(Boolean(billId), "the bill has its own address");
  check((await body(counter)).includes("A charge has no price"), "the unpriced charge is called out on the draft");

  // =========================================================================
  console.log("\nBL-02 — the unpriced charge, a service, a removal\n");

  await counter.getByTestId("finalise-open").click();
  await counter.waitForTimeout(600);
  await counter.getByText("Finalise", { exact: true }).last().click();
  await counter.waitForTimeout(2200);
  text = await counter.getByTestId("draft-error").innerText();
  check(text.includes("Calcirol") && text.includes("never charged as free"), "finalising with an unpriced charge is refused, and says why");

  await req("PATCH", `/inventory/items/${calcirolItem}`, { unitPrice: 5 }, adminToken);
  await counter.getByTestId("refresh-bill").click();
  await counter.waitForTimeout(2400);
  check(!(await body(counter)).includes("A charge has no price"), "once priced by administration, a refresh prices the line");
  check((await counter.getByTestId("bill-total").innerText()).includes("900"), "the total is 500 + 350 + 30 + 20");

  await counter.getByText("Choose a service", { exact: true }).click();
  await counter.waitForTimeout(500);
  await counter.getByText("Wound dressing", { exact: true }).last().click();
  await counter.waitForTimeout(400);
  const qty = counter.getByLabel("Quantity").first();
  await qty.fill("2");
  await counter.getByTestId("add-service").click();
  await counter.waitForTimeout(2400);
  check((await counter.getByTestId("bill-total").innerText()).includes("1,200"), "a procedure from the tariff adds its tariff price");

  await counter.getByTestId("remove-Glycomet 500mg").click();
  await counter.waitForTimeout(500);
  await counter.getByTestId("remove-reason").fill("Patient paying for medicines separately");
  await counter.getByTestId("remove-submit").click();
  await counter.waitForTimeout(2400);
  check((await counter.getByTestId("bill-total").innerText()).includes("1,170"), "a charge is removed from the draft with a reason");
  check((await body(counter)).includes("Removed Glycomet 500mg"), "and the removal stays on the bill");

  // =========================================================================
  console.log("\nSection 6.6 — a discount needs someone else's approval\n");

  await counter.getByTestId("discount-amount").fill("200");
  await counter.getByTestId("discount-reason").fill("Senior citizen concession, policy FIN-4");
  await counter.getByTestId("discount-submit").click();
  await counter.waitForTimeout(2400);
  check(await counter.getByTestId("discount-pending").isVisible(), "the discount is requested, not applied");
  check((await counter.getByTestId("bill-total").innerText()).includes("1,170"), "the total does not change until it is approved");
  check((await counter.getByTestId("discount-approve").count()) === 0, "billing is not offered the approval");
  await counter.screenshot({ path: path.join(SHOTS, "billing-2-discount-pending.png") });

  const office = await newPage();
  await signIn(office, "admin@cgh.test", "AdminPassword123");
  await office.goto(`${WEB}/billing/bills/${billId}`, { waitUntil: "networkidle" });
  await office.waitForTimeout(2600);
  check(await office.getByTestId("discount-decision").isVisible(), "administration sees the request with its reason");
  await office.getByTestId("discount-approve").click();
  await office.waitForTimeout(2400);
  check((await office.getByTestId("bill-discount").innerText()).includes("−"), "and approves it");

  // =========================================================================
  console.log("\nSection 7 — finalised: payment, not edits\n");

  await counter.reload({ waitUntil: "networkidle" });
  await counter.waitForTimeout(2600);
  check((await counter.getByTestId("bill-total").innerText()).includes("970"), "the approved discount comes off the total");
  await counter.getByTestId("finalise-open").click();
  await counter.waitForTimeout(600);
  await counter.getByText("Finalise", { exact: true }).last().click();
  await counter.waitForTimeout(2800);
  check((await counter.getByTestId("bill-status").innerText()) === "Finalised", "BL-02: the bill is finalised");
  check((await counter.locator('[data-testid^="remove-"]').count()) === 0, "section 7: every charge control is gone");
  check((await counter.getByTestId("draft-actions").count()) === 0, "no service, discount or refresh is offered");
  await counter.screenshot({ path: path.join(SHOTS, "billing-3-finalised.png") });

  // =========================================================================
  console.log("\nBL-03 — payments\n");

  check((await counter.getByTestId("pay-amount").inputValue()) === "970", "the payment form starts at the balance");
  await counter.getByTestId("pay-amount").fill("5000");
  await counter.waitForTimeout(400);
  check((await body(counter)).includes("More than the balance"), "BL-03: more than the balance is refused on screen");
  check(await counter.getByTestId("pay-submit").isDisabled(), "and cannot be submitted");

  await counter.getByTestId("pay-amount").fill("200");
  await counter.getByTestId("pay-method-card").click();
  await counter.waitForTimeout(300);
  check(await counter.getByTestId("pay-submit").isDisabled(), "a card payment needs its reference");
  await counter.getByTestId("pay-method-cash").click();
  await counter.waitForTimeout(300);
  await counter.getByTestId("pay-submit").click();
  await counter.waitForTimeout(2800);
  check((await counter.getByTestId("bill-status").innerText()) === "Partially paid", "BL-03: a partial payment makes the bill partially paid");
  check((await counter.getByTestId("bill-balance").innerText()).includes("770"), "and the balance falls to 770");

  // BL-05, while it is still owed.
  await counter.goto(`${WEB}/billing/outstanding`, { waitUntil: "networkidle" });
  await counter.waitForTimeout(2400);
  const billRow = counter.locator('[data-testid^="outstanding-BIL-"]').first();
  text = await billRow.innerText();
  check(text.includes("Anita Case") && text.includes("770"), "BL-05: the unpaid bill is outstanding with patient and amount");
  check(text.includes("0 days"), "and its age");
  await counter.screenshot({ path: path.join(SHOTS, "billing-4-outstanding.png") });

  await billRow.click();
  await counter.waitForTimeout(2600);
  await counter.getByTestId("pay-method-upi").click();
  await counter.getByTestId("pay-reference").fill("UPI-88120045");
  await counter.waitForTimeout(300);
  await counter.getByTestId("pay-submit").click();
  await counter.waitForTimeout(2800);
  check((await counter.getByTestId("bill-status").innerText()) === "Paid", "the rest by UPI marks the bill paid");
  check((await counter.getByTestId("payment-form").count()) === 0, "and a paid bill offers no payment form");

  // =========================================================================
  console.log("\nBL-04 — the receipt\n");

  await counter.locator('[data-testid^="receipt-RCP-"]').first().click();
  await counter.waitForTimeout(2400);
  check((await counter.getByTestId("receipt-words").innerText()) === "Rupees Two Hundred Only", "BL-04: the receipt gives the amount in words");
  text = await counter.getByTestId("receipt").innerText();
  check(text.includes("GSTIN 29ABCDE1234F1Z5") && text.includes("City General Hospital"), "with the hospital's name and GSTIN");
  check(!text.includes("Sulfa") && !text.includes("diabetes"), "and nothing clinical");
  await counter.screenshot({ path: path.join(SHOTS, "billing-5-receipt.png") });

  // -- Health ----------------------------------------------------------------
  console.log(`\n  (HTTP non-2xx seen: ${httpFailures.join(", ") || "none"})\n`);
  const jsErrors = consoleErrors.filter((e) => !/Failed to load resource/i.test(e));
  check(jsErrors.length === 0, "no JavaScript errors", jsErrors.slice(0, 2).join(" | "));
  // The refused finalisation is provoked on purpose.
  const unexpected = httpFailures.filter((f) => !/^409 POST \/api\/v1\/billing\/bills\/[0-9a-f]+\/finalise$/.test(f));
  check(unexpected.length === 0, "no unexpected HTTP failures", unexpected.join(", "));
} catch (err) {
  console.error("\nJourney threw:", err.message);
  failures.push(`exception: ${err.message}`);
  await counter.screenshot({ path: path.join(SHOTS, "billing-FAILURE.png") }).catch(() => {});
} finally {
  await browser.close();
  web.close();
  api.kill("SIGTERM");
  await mongoose.disconnect().catch(() => {});
  await replSet.stop().catch(() => {});
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n - ${failures.join("\n - ")}\n`);
  process.exit(1);
}
console.log("\nBilling works end to end. Screenshots in docs/shots/\n");
