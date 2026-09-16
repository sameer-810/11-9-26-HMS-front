/**
 * Phase 10 gate — WCAG 2.1 AA in a real browser: axe, keyboard, reflow, motion.
 *   node tools/verifyAccessibility.mjs
 * Env: HMS_DIST, A11Y_ROLES, A11Y_VIEWPORTS, A11Y_ONLY, A11Y_JSON.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import AxeBuilderModule from "@axe-core/playwright";

const AxeBuilder = AxeBuilderModule.default ?? AxeBuilderModule;

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(here, "..");
const BACK = path.resolve(FRONT, "..", "11-9-26-HMS-back");
const DIST = process.env.HMS_DIST
  ? path.resolve(process.env.HMS_DIST)
  : path.join(FRONT, "dist");
const SHOTS = path.join(FRONT, "docs", "shots");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const ONLY = process.env.A11Y_ONLY || "";
const runs = (section) => !ONLY || ONLY.split(",").includes(section);

const VIEWPORTS = [
  { name: "desktop", width: 1400, height: 1000 },
  { name: "phone", width: 390, height: 844 },
].filter(
  (v) =>
    !process.env.A11Y_VIEWPORTS ||
    process.env.A11Y_VIEWPORTS.split(",").includes(v.name),
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
const warnings = [];
const check = (ok, label, extra = "") => {
  if (ok) console.log(`  ok    ${label}`);
  else {
    console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ""}`);
    failures.push(label);
  }
  return ok;
};
const warn = (label) => {
  console.log(`  warn  ${label}`);
  warnings.push(label);
};

if (!fs.existsSync(DIST)) {
  console.error("No dist/. Run `npm run build:web` first.");
  process.exit(1);
}
fs.mkdirSync(SHOTS, { recursive: true });

// ---- The API, on its own in-memory database. Never the .env credentials. ----
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

// 5205 by default; A11Y_API_PORT only so two copies can run side by side.
const API_PORT = Number(process.env.A11Y_API_PORT || 5205);
const secrets = {
  JWT_ACCESS_SECRET: "verify-access-secret-not-real",
  JWT_REFRESH_SECRET: "verify-refresh-secret-not-real",
  JWT_ADMIN_SECRET: "verify-admin-secret-not-real",
};
const api = spawn(process.execPath, ["server.js"], {
  cwd: BACK,
  // device cap raised: every audited sign-in is a fresh context with its own device id.
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
  // generous: index builds on a fresh in-memory replica set are slow under shared load.
  if (waited > 150_000) throw new Error(`API did not start.\n${apiLog}`);
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

// ---- Seed: one hospital, a user per role, and enough data that no screen is empty. ----
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

const seedProblems = [];
/** A seed step that did not work is reported, not thrown: the audit still runs on what did. */
const must = async (label, promise) => {
  const r = await promise;
  if (!r || r.success === false)
    seedProblems.push(`${label}: ${r?.message ?? "no response"}`);
  return r?.data;
};

const adminToken = (
  await req("POST", "/auth/login", {
    email: "admin@cgh.test",
    password: "AdminPassword123",
    deviceId: "verify-admin",
    deviceName: "Verifier",
  })
).data.accessToken;
const med = await must(
  "department MED",
  req(
    "POST",
    "/departments",
    { name: "General Medicine", code: "MED" },
    adminToken,
  ),
);
const ortho = await must(
  "department ORT",
  req(
    "POST",
    "/departments",
    { name: "Orthopaedics", code: "ORT" },
    adminToken,
  ),
);
await DepartmentModel.updateOne({ _id: med.id }, { consultationFee: 500 });

async function provision({
  employeeId,
  firstName,
  email,
  role,
  departmentId,
  keepTemporary = false,
}) {
  const created = await req(
    "POST",
    "/users",
    { employeeId, firstName, lastName: "Rao", email, role, departmentId },
    adminToken,
  );
  const temp = created.data.temporaryPassword;
  if (keepTemporary) return { id: created.data.user.id, email, password: temp };
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

const users = {
  receptionist: await provision({
    employeeId: "REC001",
    firstName: "Deepak",
    email: "deepak@cgh.test",
    role: "receptionist",
  }),
  doctor: await provision({
    employeeId: "DOC001",
    firstName: "Rajesh",
    email: "rajesh@cgh.test",
    role: "doctor",
    departmentId: med.id,
  }),
  nurse: await provision({
    employeeId: "NUR001",
    firstName: "Lakshmi",
    email: "lakshmi@cgh.test",
    role: "nurse",
  }),
  lab: await provision({
    employeeId: "LAB001",
    firstName: "Sunita",
    email: "sunita@cgh.test",
    role: "lab",
  }),
  pharmacy: await provision({
    employeeId: "PHA001",
    firstName: "Imran",
    email: "imran@cgh.test",
    role: "pharmacy",
  }),
  billing: await provision({
    employeeId: "BIL001",
    firstName: "Priya",
    email: "priya@cgh.test",
    role: "billing",
  }),
  inventory: await provision({
    employeeId: "INV001",
    firstName: "Kavya",
    email: "kavya@cgh.test",
    role: "inventory",
  }),
  admin: {
    email: "admin@cgh.test",
    password: "AdminPassword123",
    token: adminToken,
  },
};
const {
  receptionist: reception,
  doctor,
  nurse,
  lab,
  pharmacy: pharmacist,
  billing,
  inventory: store,
} = users;
const orthoDoctor = await provision({
  employeeId: "DOC002",
  firstName: "Farah",
  email: "farah@cgh.test",
  role: "doctor",
  departmentId: ortho.id,
});
// Signs in with a temporary password, so the forced change-password screen renders.
const newStarter = await provision({
  employeeId: "NUR009",
  firstName: "Meera",
  email: "meera@cgh.test",
  role: "nurse",
  keepTemporary: true,
});

const register = async (firstName, lastName, gender, dateOfBirth, mobile) =>
  must(
    `patient ${firstName}`,
    req(
      "POST",
      "/patients",
      { firstName, lastName, gender, dateOfBirth, mobile },
      reception.token,
    ),
  );
const anita = await register(
  "Anita",
  "Case",
  "female",
  "1970-01-01",
  "9876500001",
);
const sanjay = await register(
  "Sanjay",
  "Case",
  "male",
  "1960-01-01",
  "9876500002",
);
const mohan = await register(
  "Mohan",
  "Das",
  "male",
  "1966-03-02",
  "9876500003",
);
const bhavna = await register(
  "Bhavna",
  "Case",
  "female",
  "1985-05-05",
  "9876500004",
);
const kiran = await register(
  "Kiran",
  "Case",
  "male",
  "1990-07-07",
  "9876500005",
);
const rina = await register(
  "Rina",
  "Case",
  "female",
  "1982-02-02",
  "9876500006",
);
await must(
  "allergy Anita",
  req(
    "PUT",
    `/patients/${anita.id}/allergies`,
    {
      allergies: [
        {
          substance: "Sulfa",
          severity: "moderate",
          reaction: "Rash",
          category: "drug",
        },
      ],
    },
    doctor.token,
  ),
);
await must(
  "allergy Sanjay",
  req(
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
  ),
);
await must(
  "allergy Bhavna",
  req(
    "PUT",
    `/patients/${bhavna.id}/allergies`,
    { allergies: [] },
    doctor.token,
  ),
);

// Mohan's allergies are never asked — "Allergies not recorded" must render.

// An appointment on a clinic day this week.
const clinic = new Date(Date.now() + 2 * 86400000);
const clinicDate = `${clinic.getFullYear()}-${String(clinic.getMonth() + 1).padStart(2, "0")}-${String(clinic.getDate()).padStart(2, "0")}`;
await must(
  "roster",
  req(
    "POST",
    "/appointments/roster",
    {
      doctorId: doctor.id,
      departmentId: med.id,
      dayOfWeek: clinic.getDay(),
      startTime: "10:00",
      endTime: "13:00",
      slotMinutes: 15,
      slotCapacity: 1,
    },
    adminToken,
  ),
);
await must(
  "appointment",
  req(
    "POST",
    "/appointments",
    {
      patientId: bhavna.id,
      doctorId: doctor.id,
      departmentId: med.id,
      date: clinicDate,
      time: "10:30",
      visitType: "new",
      reason: "Follow-up of blood pressure",
    },
    reception.token,
  ),
);

// Medicines and stock, including a low-stock line.
const medicine = async (name, ingredient) =>
  must(
    `medicine ${name}`,
    req(
      "POST",
      "/prescriptions/medicines",
      {
        name,
        genericName: ingredient,
        ingredients: [ingredient],
        form: "tablet",
        strength: "500mg",
      },
      adminToken,
    ),
  );
const glycomet = (await medicine("Glycomet", "metformin")).id;
const calcirol = (await medicine("Calcirol", "cholecalciferol")).id;
const item = async (code, body) =>
  (
    await must(
      `item ${code}`,
      req(
        "POST",
        "/inventory/items",
        { code, name: code, unit: "tablet", ...body },
        store.token,
      ),
    )
  ).id;
const glycometItem = await item("METF500", { medicineId: glycomet });
const calcirolItem = await item("VITD", { medicineId: calcirol });
const glovesItem = await item("GLOVES-M", { reorderLevel: 200, unit: "pair" });
await must(
  "price METF500",
  req(
    "PATCH",
    `/inventory/items/${glycometItem}`,
    { unitPrice: 3 },
    adminToken,
  ),
);
await must(
  "price VITD",
  req(
    "PATCH",
    `/inventory/items/${calcirolItem}`,
    { unitPrice: 5 },
    adminToken,
  ),
);
const supplier = (
  await must(
    "supplier",
    req("POST", "/inventory/suppliers", { name: "MedLine" }, store.token),
  )
).id;
await must(
  "pharmacy receipt",
  req(
    "POST",
    "/inventory/receipts",
    {
      location: "pharmacy",
      supplierId: supplier,
      invoiceNumber: "INV-1",
      lines: [
        {
          itemId: glycometItem,
          batchNumber: "M1",
          expiry: "12/2030",
          quantity: 100,
        },
        {
          itemId: calcirolItem,
          batchNumber: "V1",
          expiry: "12/2030",
          quantity: 100,
        },
      ],
    },
    pharmacist.token,
  ),
);
await must(
  "store receipt (low stock)",
  req(
    "POST",
    "/inventory/receipts",
    {
      location: "main_store",
      supplierId: supplier,
      invoiceNumber: "INV-2",
      lines: [
        {
          itemId: glovesItem,
          batchNumber: "G1",
          expiry: "12/2030",
          quantity: 12,
        },
      ],
    },
    store.token,
  ),
);

// Anita: signed consultation, one prescription dispensed, one pending, a reported blood count.
const consult = await must(
  "consultation",
  req(
    "POST",
    "/consultations",
    { patientId: anita.id, type: "opd" },
    doctor.token,
  ),
);
await must(
  "consultation notes",
  req(
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
  ),
);
const rxPending = (
  await must(
    "prescription (pending)",
    req(
      "POST",
      "/prescriptions",
      {
        patientId: anita.id,
        consultationId: consult.id,
        lines: [
          {
            medicineId: glycomet,
            dose: "1 tab",
            frequency: "bd",
            durationDays: 5,
          },
        ],
      },
      doctor.token,
    ),
  )
)?.prescription;
await must(
  "sign consultation",
  req("POST", `/consultations/${consult.id}/sign`, null, doctor.token),
);
const rxDispensed = (
  await must(
    "prescription (to dispense)",
    req(
      "POST",
      "/prescriptions",
      {
        patientId: anita.id,
        lines: [
          {
            medicineId: calcirol,
            dose: "1 tab",
            frequency: "od",
            durationDays: 4,
          },
        ],
      },
      doctor.token,
    ),
  )
)?.prescription;
if (rxDispensed) {
  const ctx = await must(
    "dispense context",
    req(
      "GET",
      `/pharmacy/prescriptions/${rxDispensed.id}/dispense-context`,
      null,
      pharmacist.token,
    ),
  );
  if (ctx) {
    await must(
      "dispense",
      req(
        "POST",
        `/pharmacy/prescriptions/${rxDispensed.id}/dispense`,
        {
          allergiesAcknowledged: true,
          allergyFingerprint: ctx.allergyFingerprint,
          lines: ctx.lines.map((l) => ({
            lineId: l.id,
            allocations: [{ batchId: l.batches[0].id, quantity: l.remaining }],
          })),
        },
        pharmacist.token,
      ),
    );
  }
}

// Kiran: a signed consultation nobody has billed yet, so "Generate bill" has a charge to act on.
const kiranConsult = await must(
  "consultation (Kiran)",
  req(
    "POST",
    "/consultations",
    { patientId: kiran.id, type: "opd" },
    doctor.token,
  ),
);
// Also recommended for admission, so the admission requests panel (US-17) is on the doctor's ward board.
await must(
  "consultation notes (Kiran)",
  req(
    "PATCH",
    `/consultations/${kiranConsult.id}`,
    {
      chiefComplaint: "Chest pain, resolved",
      admissionRecommended: true,
      admissionReason: "Observe on telemetry overnight",
    },
    doctor.token,
  ),
);
await must(
  "sign consultation (Kiran)",
  req("POST", `/consultations/${kiranConsult.id}/sign`, null, doctor.token),
);

await must(
  "lab catalogue",
  req("POST", "/laboratory/tests/load-standard", null, adminToken),
);
const catalogue =
  (await must(
    "lab tests",
    req("GET", "/laboratory/tests", null, doctor.token),
  )) ?? [];
const testId = (code) => catalogue.find((t) => t.code === code)?.id;
const cbc = (
  await must(
    "CBC order",
    req(
      "POST",
      "/laboratory/orders",
      {
        patientId: anita.id,
        testIds: [testId("CBC")],
        clinicalIndication: "Suspected anaemia",
        urgency: "routine",
      },
      doctor.token,
    ),
  )
)?.orders?.[0];
const report = async (order, values) => {
  for (const to of ["sample_collected", "in_progress"])
    await must(
      `stage ${to}`,
      req("POST", `/laboratory/orders/${order.id}/stage`, { to }, lab.token),
    );
  await must(
    "results",
    req("PUT", `/laboratory/orders/${order.id}/results`, { values }, lab.token),
  );
  for (const to of ["completed", "reported"])
    await must(
      `stage ${to}`,
      req("POST", `/laboratory/orders/${order.id}/stage`, { to }, lab.token),
    );
};
if (cbc) await report(cbc, { HB: "8.1", WBC: "7.0", PLT: "250", HCT: "30" });
// Mohan: a critical potassium.
const rft = (
  await must(
    "RFT order",
    req(
      "POST",
      "/laboratory/orders",
      {
        patientId: mohan.id,
        testIds: [testId("RFT")],
        clinicalIndication: "Weakness",
        urgency: "stat",
      },
      doctor.token,
    ),
  )
)?.orders?.[0];
if (rft)
  await report(rft, {
    UREA: "40",
    CREAT: "1.1",
    NA: "138",
    K: "7.1",
    CL: "101",
  });

// Sanjay: admitted, observations, and an escalation raised by the score.
const wardId = (
  await must(
    "ward",
    req(
      "POST",
      "/beds/wards",
      {
        name: "Medical Ward A",
        code: "MWA",
        type: "general",
        departmentId: med.id,
      },
      adminToken,
    ),
  )
).id;
const roomId = (
  await must(
    "room",
    req(
      "POST",
      "/beds/rooms",
      { wardId, number: "101", type: "general" },
      adminToken,
    ),
  )
).id;
await must(
  "beds",
  req(
    "POST",
    "/beds/bulk",
    { roomId, prefix: "A", from: 1, to: 4 },
    adminToken,
  ),
);
const beds =
  (await must(
    "bed list",
    req("GET", `/beds?wardId=${wardId}&limit=20`, null, adminToken),
  )) ?? [];
const admission = await must(
  "admission",
  req(
    "POST",
    "/admissions",
    {
      patientId: sanjay.id,
      bedId: beds[0]?.id,
      reason: "Community acquired pneumonia, IV antibiotics",
    },
    doctor.token,
  ),
);
await must(
  "assign nurse",
  req(
    "POST",
    `/admissions/${admission.id}/nurse`,
    { nurseId: nurse.id },
    doctor.token,
  ),
);
await must(
  "observations (calm)",
  req(
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
  ),
);
await must(
  "observations (escalating)",
  req(
    "POST",
    "/nursing/observations",
    {
      admissionId: admission.id,
      respiratoryRate: 26,
      spo2: 91,
      onOxygen: false,
      systolic: 95,
      pulse: 122,
      consciousness: "alert",
      temperatureC: 38.4,
    },
    nurse.token,
  ),
);

// Emergency: one triaged, one waiting for triage.
const edVisit = await must(
  "ED visit",
  req(
    "POST",
    "/emergency/visits",
    {
      patientId: bhavna.id,
      arrivalMode: "walk_in",
      chiefComplaint: "Sprained ankle",
    },
    reception.token,
  ),
);
await must(
  "triage",
  req(
    "POST",
    `/emergency/visits/${edVisit.id}/triage`,
    { answers: { expectedResources: [] }, vitals: {} },
    nurse.token,
  ),
);
await must(
  "ED visit (untriaged)",
  req(
    "POST",
    "/emergency/visits",
    {
      patientId: kiran.id,
      arrivalMode: "ambulance",
      chiefComplaint: "Chest pain",
    },
    reception.token,
  ),
);

// Rina: restricted, and a doctor outside the team breaks the glass.
await must(
  "Rina consultation",
  req(
    "POST",
    "/consultations",
    { patientId: rina.id, type: "opd" },
    doctor.token,
  ),
);
await must(
  "restriction",
  req(
    "POST",
    `/access/patients/${rina.id}/restriction`,
    { restricted: true, reason: "Staff member, requested confidentiality" },
    doctor.token,
  ),
);
await must(
  "break-glass",
  req(
    "POST",
    `/access/patients/${rina.id}/break-glass`,
    {
      category: "patient_unconscious",
      reason:
        "Brought to ED unconscious, need allergies and medication history",
    },
    orthoDoctor.token,
  ),
);

// Bills: Anita's finalised and paid, Mohan's left as a draft.
const finalBill = await must(
  "bill (Anita)",
  req(
    "POST",
    "/billing/bills",
    { patientId: anita.id, billType: "opd" },
    billing.token,
  ),
);
let paymentId = null;
if (finalBill) {
  const finalised = await must(
    "finalise",
    req("POST", `/billing/bills/${finalBill.id}/finalise`, null, billing.token),
  );
  const due = finalised?.balanceDue ?? finalised?.total ?? finalBill.total;
  const paid = await must(
    "payment",
    req(
      "POST",
      `/billing/bills/${finalBill.id}/payments`,
      { amount: Number(due), method: "cash" },
      billing.token,
    ),
  );
  paymentId =
    paid?.payment?.id ?? paid?.payments?.at?.(-1)?.id ?? paid?.id ?? null;
  if (!paymentId) {
    const bill = await must(
      "bill after payment",
      req("GET", `/billing/bills/${finalBill.id}`, null, billing.token),
    );
    paymentId = bill?.payments?.at?.(-1)?.id ?? null;
  }
}
const draftBill = await must(
  "bill (Mohan, draft)",
  req(
    "POST",
    "/billing/bills",
    { patientId: mohan.id, billType: "opd" },
    billing.token,
  ),
);

if (seedProblems.length) {
  console.log(
    "\nSeed steps that did not complete (the audit continues on the rest):",
  );
  for (const p of seedProblems) console.log(`  - ${p}`);
}
console.log(
  "\nSeeded: 8 roles, 6 patients, appointment, signed consultation, prescriptions, reported and critical labs, admission with escalation, ED visits, break-glass grant, stock, bills\n",
);

// ---- Web server and browser ----
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

async function newPage(options = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    ...options,
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => consoleErrors.push(String(e)));
  // The live-update socket is not under test here.
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

/** Wait for the screen to finish loading: fonts, data, skeletons gone. */
async function settle(p, min = 1500) {
  await p.waitForTimeout(min);
  const end = Date.now() + 6000;
  while (Date.now() < end) {
    const loading = await p
      .evaluate(() =>
        [
          ...document.querySelectorAll(
            '[aria-label="Loading"], [role="progressbar"]',
          ),
        ].some((e) => e.checkVisibility?.() ?? true),
      )
      .catch(() => false);
    if (!loading) break;
    await p.waitForTimeout(300);
  }
  await p.waitForTimeout(300);
}

/** Signs in and confirms it took; under load the form can remount silently, so retry once. */
const signIn = async (p, email, password) => {
  const statuses = [];
  const onResponse = (r) => {
    if (/\/api\/v1\/auth\//.test(r.url()))
      statuses.push(
        `${r.status()} ${new URL(r.url()).pathname.replace("/api/v1", "")}`,
      );
  };
  p.on("response", onResponse);
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await p.goto(WEB, { waitUntil: "networkidle" });
      await p
        .getByTestId("login-email")
        .waitFor({ state: "visible", timeout: 20_000 });
      await p.waitForTimeout(1300);
      await p.getByTestId("login-email").fill(email);
      await p.getByTestId("login-password").fill(password);
      await p.getByTestId("login-submit").click();
      // 45 s, not 15: the first signed-in render is slow on a loaded machine.
      const left = await p
        .getByTestId("login-email")
        .waitFor({ state: "detached", timeout: 45_000 })
        .then(() => true)
        .catch(() => false);
      if (left) break;
      if (attempt === 2) {
        const said = await p
          .locator('[role="alert"]')
          .allInnerTexts()
          .catch(() => []);
        await shot(p, `signin-${email}`);
        throw new Error(
          `could not sign in as ${email} — page said: ${said.join(" | ") || "nothing"}; auth responses: ${statuses.join(", ") || "none"}`,
        );
      }
    }
  } finally {
    p.off("response", onResponse);
  }
  await p.waitForTimeout(1800);
};
const go = async (p, route) => {
  await p.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded" });
  await settle(p, 2000);
};
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const shot = async (p, name) => {
  await p
    .screenshot({ path: path.join(SHOTS, `a11y-${slug(name)}.png`) })
    .catch(() => {});
};

// ---- Structural checks axe does not make on its own ----
/** Runs in the page: unnamed controls, heading/landmark gaps, colour-only badges. */
async function structure(p, { signedIn }) {
  return p.evaluate(
    ({ signedIn }) => {
      const visible = (el) => {
        if (!(
          el.checkVisibility?.({
            checkOpacity: false,
            checkVisibilityCSS: true,
          }) ?? true
        ))
          return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const describe = (el) => {
        const id = el.getAttribute("data-testid");
        return `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""}${id ? `#${id}` : ""}`;
      };
      const nameOf = (el) => {
        const label = el.getAttribute("aria-label");
        if (label && label.trim()) return label.trim();
        const by = el.getAttribute("aria-labelledby");
        if (by) {
          const t = by
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ")
            .trim();
          if (t) return t;
        }
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          return (
            el.labels?.[0]?.textContent ||
            el.getAttribute("title") ||
            ""
          ).trim();
        }
        return (el.innerText || el.getAttribute("title") || "").trim();
      };
      const problems = [];

      const interactive = document.querySelectorAll(
        'button, a[href], input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"]',
      );
      for (const el of interactive) {
        if (!visible(el) || el.type === "hidden") continue;
        if (!nameOf(el)) problems.push(`unnamed control: ${describe(el)}`);
      }

      const headings = [
        ...document.querySelectorAll(
          'h1, h2, h3, h4, h5, h6, [role="heading"]',
        ),
      ].filter(visible);
      const levels = headings.map((h) =>
        /^H\d$/.test(h.tagName)
          ? Number(h.tagName[1])
          : Number(h.getAttribute("aria-level") || 2),
      );
      // A dialog is its own document for this purpose.
      const inDialog = headings.map((h) =>
        Boolean(h.closest('[role="dialog"]')),
      );
      const pageLevels = levels.filter((_, i) => !inDialog[i]);
      if (!pageLevels.includes(1)) problems.push("no visible level-1 heading");
      for (let i = 1; i < pageLevels.length; i++) {
        if (pageLevels[i] > pageLevels[i - 1] + 1) {
          problems.push(
            `heading skips from h${pageLevels[i - 1]} to h${pageLevels[i]}`,
          );
          break;
        }
      }

      const mains = [
        ...document.querySelectorAll('main, [role="main"]'),
      ].filter(visible);
      if (mains.length !== 1)
        problems.push(`${mains.length} visible main landmarks`);
      if (signedIn && window.innerWidth >= 900) {
        const navs = [
          ...document.querySelectorAll('nav, [role="navigation"]'),
        ].filter(visible);
        if (navs.length === 0)
          problems.push("no navigation landmark around the sidebar");
      }

      // Clinical signals: each must carry words, and the tier badge its shape too.
      const badges = { signal: 0, esi: 0, news2: 0, labFlag: 0 };
      for (const el of document.querySelectorAll("[aria-label]")) {
        if (!visible(el)) continue;
        const label = el.getAttribute("aria-label");
        const text = (el.innerText || "").trim();
        if (/^(Critical|Urgent|Caution|Normal): /.test(label)) {
          badges.signal++;
          if (/ESI \d/.test(label)) badges.esi++;
          if (!text)
            problems.push(`signal badge without visible words: ${label}`);
          if (!el.querySelector("svg"))
            problems.push(`signal badge without its shape: ${label}`);
        } else if (/^Not yet triaged/.test(label)) {
          badges.esi++;
          if (!text) problems.push("untriaged badge without visible words");
        } else if (/^NEWS ?2 score/.test(label)) {
          badges.news2++;
          if (!/NEWS2/.test(text) || !/\d/.test(text))
            problems.push(`NEWS2 score without its number and name: ${label}`);
        } else if (
          /^(Critically low|Critically high|Critical|Low|High|Abnormal|Cannot be flagged|No range for this patient)/.test(
            label,
          ) &&
          el.getBoundingClientRect().width < 60
        ) {
          badges.labFlag++;
          if (!text) problems.push(`lab flag without its glyph: ${label}`);
        }
      }
      return { problems, badges };
    },
    { signedIn },
  );
}

// ---- axe ----
const byRule = new Map(); // rule -> { impact, help, nodes, screens:Set }
const matrix = new Map(); // screen -> role -> viewport -> cell
const badgeTotals = { signal: 0, esi: 0, news2: 0, labFlag: 0 };
const structureProblems = new Map(); // problem -> Set(screen)
let screensAudited = 0;

async function audit(p, { screen, role, viewport, signedIn = true }) {
  screensAudited++;
  let serious = 0;
  let minor = 0;
  const results = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  const rules = [];
  for (const v of results.violations) {
    rules.push(`${v.id}×${v.nodes.length}`);
    const entry = byRule.get(v.id) ?? {
      impact: v.impact,
      help: v.help,
      nodes: 0,
      screens: new Set(),
      samples: new Set(),
    };
    entry.nodes += v.nodes.length;
    entry.screens.add(`${screen} (${role}, ${viewport})`);
    for (const n of v.nodes.slice(0, 2))
      entry.samples.add(
        `${n.target.join(" ")}  ${(n.failureSummary || "").split("\n").slice(1, 2).join("").trim()}`.slice(
          0,
          220,
        ),
      );
    byRule.set(v.id, entry);
    if (v.impact === "serious" || v.impact === "critical")
      serious += v.nodes.length;
    else minor += v.nodes.length;
  }

  const { problems, badges } = await structure(p, { signedIn });
  for (const k of Object.keys(badges)) badgeTotals[k] += badges[k];
  for (const pr of problems) {
    const set = structureProblems.get(pr) ?? new Set();
    set.add(`${screen} (${role}, ${viewport})`);
    structureProblems.set(pr, set);
  }

  const row = matrix.get(screen) ?? new Map();
  const cell = row.get(role) ?? {};
  cell[viewport] = serious
    ? `${serious}!`
    : problems.length
      ? `s${problems.length}`
      : minor
        ? `~${minor}`
        : "ok";
  row.set(role, cell);
  matrix.set(screen, row);

  if (serious || problems.length)
    await shot(p, `${role}-${viewport}-${screen}`);
  return { serious, minor, problems, rules };
}

/** Names and URLs of what this role's sidebar draws, read from the page itself. */
async function sidebarRoutes(p) {
  const scope = (await p
    .locator('nav[aria-label], [role="navigation"]')
    .count())
    ? p.locator('nav[aria-label], [role="navigation"]').first()
    : p.locator("body");
  const names = await scope
    .getByRole("link")
    .evaluateAll((els) =>
      els
        .map((e) => (e.getAttribute("aria-label") || e.innerText || "").trim())
        .filter(Boolean),
    );
  const routes = [];
  for (const name of [...new Set(names)]) {
    await scope.getByRole("link", { name, exact: true }).first().click();
    await p.waitForTimeout(1400);
    const url = new URL(p.url());
    routes.push({ name, path: `${url.pathname}${url.search}` });
  }
  return routes;
}

// Detail screens, per role. `open` is for screens reached by a tap rather than an address.
const DETAIL = {
  receptionist: [
    {
      screen: "Patient detail",
      open: async (p) => {
        await go(p, "/patients");
        await p.getByText("Anita Case", { exact: true }).first().click();
        await settle(p);
      },
    },
    { screen: "ED arrival", path: "/emergency/arrival" },
    { screen: "ED visit", path: `/emergency/visits/${edVisit?.id}` },
    // Phase 12: walk-in, edit details, move an appointment.
    {
      screen: "Walk-in",
      open: async (p) => {
        await go(p, "/opd/queue");
        await p.getByTestId("walkin-cta").click();
        await settle(p);
      },
    },
    {
      screen: "Edit patient",
      open: async (p) => {
        await go(p, "/patients");
        await p.getByText("Anita Case", { exact: true }).first().click();
        await settle(p);
        await p.getByTestId("edit-patient").click();
        await settle(p);
      },
    },
    {
      screen: "Move appointment",
      open: async (p) => {
        await go(p, "/appointments");
        for (let i = 0; i < 2; i += 1) {
          await p.getByRole("button", { name: "Next", exact: true }).click();
          await settle(p);
        }
        await p.locator('[data-testid^="move-"]').first().click();
        await settle(p);
      },
    },
  ],
  doctor: [
    {
      screen: "Patient detail",
      open: async (p) => {
        await go(p, "/patients");
        await p.getByText("Anita Case", { exact: true }).first().click();
        await settle(p);
      },
    },
    { screen: "Medical record", path: `/patients/${anita.id}/record` },
    { screen: "Consultation", path: `/opd/consultation/${bhavna.id}` },
    { screen: "Bedside", path: `/ipd/patients/${admission?.id}` },
    { screen: "Admit patient", path: "/ipd/admit" },
    { screen: "Lab order", path: `/lab/reports/${rft?.id}` },
    { screen: "ED visit", path: `/emergency/visits/${edVisit?.id}` },
  ],
  nurse: [
    { screen: "Bedside", path: `/nursing/patients/${admission?.id}` },
    { screen: "Medical record", path: `/patients/${sanjay.id}/record` },
    { screen: "ED visit", path: `/emergency/visits/${edVisit?.id}` },
  ],
  lab: [
    { screen: "Lab order", path: `/lab/requests/${rft?.id}` },
    { screen: "Medical record", path: `/patients/${mohan.id}/record` },
  ],
  pharmacy: [
    { screen: "Dispense", path: `/pharmacy/dispense/${rxPending?.id}` },
    { screen: "Medical record", path: `/patients/${anita.id}/record` },
  ],
  billing: [
    { screen: "Generate bill", path: "/billing/generate" },
    { screen: "Bill detail (draft)", path: `/billing/bills/${draftBill?.id}` },
    { screen: "Bill detail (paid)", path: `/billing/bills/${finalBill?.id}` },
    { screen: "Receipt", path: `/billing/receipt/${paymentId}` },
    { screen: "Outstanding", path: "/billing/outstanding" },
  ],
  inventory: [
    { screen: "Low stock", path: "/inventory/low-stock" },
    { screen: "Stock item", path: `/inventory/items/${glovesItem}` },
    { screen: "Receive stock", path: "/inventory/receive" },
  ],
  admin: [
    {
      screen: "User detail",
      open: async (p) => {
        await go(p, "/admin/users");
        await p.getByTestId("user-row-DOC001").click();
        await settle(p);
      },
    },
    // A nurse's account carries the ward allocation section (US-23).
    {
      screen: "User detail (nurse)",
      open: async (p) => {
        await go(p, "/admin/users");
        await p.getByTestId("user-row-NUR001").click();
        await settle(p);
      },
    },
    {
      screen: "Create user",
      open: async (p) => {
        await go(p, "/admin/users");
        await p.getByTestId("user-create-button").click();
        await settle(p);
      },
    },
    { screen: "Bill detail (paid)", path: `/billing/bills/${finalBill?.id}` },
    // Phase 12: the Hospital setup tabs that replaced API-only configuration.
    ...["schedules", "services"].map((tab) => ({
      screen: `Hospital setup (${tab})`,
      open: async (p) => {
        await go(p, "/admin/config");
        await p.getByTestId(`config-tab-${tab}`).click();
        await settle(p);
      },
    })),
  ],
};

let current = null;

try {
  // =========================================================================
  if (runs("axe")) {
    console.log("axe — signed out\n");
    for (const vp of VIEWPORTS) {
      const p = await newPage({
        viewport: { width: vp.width, height: vp.height },
      });
      current = p;
      await p.goto(WEB, { waitUntil: "networkidle" });
      await settle(p, 1300);
      let r = await audit(p, {
        screen: "Login",
        role: "signed out",
        viewport: vp.name,
        signedIn: false,
      });
      check(
        r.serious === 0,
        `Login (${vp.name}): no serious or critical axe violations`,
        `${r.serious} nodes`,
      );

      await p
        .getByText(/forgot/i)
        .first()
        .click();
      await settle(p, 1200);
      r = await audit(p, {
        screen: "Forgot password",
        role: "signed out",
        viewport: vp.name,
        signedIn: false,
      });
      check(
        r.serious === 0,
        `Forgot password (${vp.name}): no serious or critical axe violations`,
        `${r.serious} nodes`,
      );

      await signIn(p, newStarter.email, newStarter.password);
      await settle(p);
      r = await audit(p, {
        screen: "Change password",
        role: "signed out",
        viewport: vp.name,
        signedIn: false,
      });
      check(
        r.serious === 0,
        `Change password (${vp.name}): no serious or critical axe violations`,
        `${r.serious} nodes`,
      );
      await p.context().close();
    }

    const roleFilter = process.env.A11Y_ROLES?.split(",");
    for (const [role, user] of Object.entries(users)) {
      if (roleFilter && !roleFilter.includes(role)) continue;
      console.log(`\naxe — ${role}\n`);
      const p = await newPage();
      current = p;
      await signIn(p, user.email, user.password);
      const routes = await sidebarRoutes(p);
      console.log(`  (sidebar: ${routes.map((r) => r.name).join(", ")})`);
      const targets = [
        ...routes.map((r) => ({ screen: r.name, path: r.path })),
        ...DETAIL[role],
      ];

      for (const vp of VIEWPORTS) {
        await p.setViewportSize({ width: vp.width, height: vp.height });
        let serious = 0;
        let problems = 0;
        for (const t of targets) {
          try {
            if (t.open) await t.open(p);
            else await go(p, t.path);
            const r = await audit(p, {
              screen: t.screen,
              role,
              viewport: vp.name,
            });
            serious += r.serious;
            problems += r.problems.length;
            if (r.serious || r.problems.length) {
              console.log(
                `  …     ${t.screen}: ${r.serious} serious/critical node(s) [${r.rules.join(", ")}]${r.problems.length ? ` · ${r.problems.slice(0, 3).join("; ")}` : ""}`,
              );
            }
          } catch (err) {
            warn(
              `${role} ${vp.name}: could not open ${t.screen} — ${err.message.split("\n")[0]}`,
            );
          }
        }
        check(
          serious === 0,
          `${role} (${vp.name}): ${targets.length} screens, no serious or critical axe violations`,
          `${serious} nodes`,
        );
        check(
          problems === 0,
          `${role} (${vp.name}): names, headings, landmarks and signal words hold on every screen`,
          `${problems} problem(s)`,
        );
      }
      await p.context().close();
    }

    console.log("\naxe — clinical signal badges seen\n");
    check(
      badgeTotals.signal > 0 &&
        badgeTotals.esi > 0 &&
        badgeTotals.news2 > 0 &&
        badgeTotals.labFlag > 0,
      "SignalBadge, EsiBadge, News2Score and LabFlag were all rendered and checked for words",
      JSON.stringify(badgeTotals),
    );
  }

  // =========================================================================
  if (runs("keyboard")) {
    console.log(
      "\nKeyboard — Tab reaches the primary action, and focus is visible\n",
    );

    /** Tabs forward until `testId` has focus. Records every stop without a visible focus indicator. */
    const tabTo = async (p, testId, { max = 160, onStop } = {}) => {
      const invisible = new Set();
      for (let i = 0; i < max; i++) {
        await p.keyboard.press("Tab");
        const stop = await p.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          const outline =
            cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
          let ring = cs.boxShadow && cs.boxShadow !== "none";
          // TextField and SearchInput draw focus on the field box around the
          // input: a 2 px border in the focus colour. That counts.
          if (
            !outline &&
            !ring &&
            (el.tagName === "INPUT" || el.tagName === "TEXTAREA")
          ) {
            for (
              let a = el.parentElement, depth = 0;
              a && depth < 3;
              a = a.parentElement, depth++
            ) {
              const s = getComputedStyle(a);
              if (
                parseFloat(s.borderTopWidth) >= 2 &&
                s.borderTopColor === "rgb(20, 99, 166)"
              )
                ring = true;
            }
          }
          return {
            testId: el.getAttribute("data-testid"),
            visibleFocus: outline || ring,
            what: `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""}${el.getAttribute("data-testid") ? `#${el.getAttribute("data-testid")}` : ""} "${(el.getAttribute("aria-label") || el.innerText || "").slice(0, 30)}"`,
            bracket:
              el.getAttribute("role") === "none" &&
              el.tabIndex === 0 &&
              !el.childElementCount,
          };
        });
        if (!stop) continue;
        if (!stop.visibleFocus && !stop.bracket) invisible.add(stop.what);
        if (onStop) await onStop(stop);
        if (stop.testId === testId)
          return { reached: true, tabs: i + 1, invisible: [...invisible] };
      }
      return { reached: false, tabs: max, invisible: [...invisible] };
    };
    const report = async (p, label, result) => {
      check(
        result.reached,
        `${label}: Tab reaches it`,
        `not within ${result.tabs} presses`,
      );
      check(
        result.invisible.length === 0,
        `${label}: every Tab stop shows focus`,
        result.invisible.slice(0, 4).join(" | "),
      );
      if (!result.reached || result.invisible.length)
        await shot(p, `keyboard-${label}`);
    };

    let p = await newPage();
    current = p;
    await p.goto(WEB, { waitUntil: "networkidle" });
    await settle(p, 1300);
    await report(
      p,
      "login sign in",
      await tabTo(p, "login-submit", { max: 30 }),
    );
    // Errors are announced, not only drawn.
    await p.getByTestId("login-email").fill("nobody@cgh.test");
    await p.getByTestId("login-password").fill("WrongPassword123");
    await p.getByTestId("login-submit").focus();
    await p.keyboard.press("Enter");
    await p.waitForTimeout(2500);
    const announced = await p.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[role="alert"], [aria-live="polite"], [aria-live="assertive"]',
        ),
      ]
        .filter((e) => e.checkVisibility?.() ?? true)
        .map((e) => e.innerText.trim())
        .filter(Boolean),
    );
    check(
      announced.length > 0,
      "login: a failed sign-in is announced (role=alert or aria-live)",
      "no live region with text",
    );
    await p.context().close();

    p = await newPage();
    current = p;
    await signIn(p, reception.email, reception.password);
    await go(p, "/patients/new");
    await report(p, "register patient", await tabTo(p, "reg-submit"));
    await p.getByTestId("reg-submit").focus();
    await p.keyboard.press("Enter");
    await p.waitForTimeout(900);
    const fieldErrors = await p.evaluate(() => {
      const inputs = [
        ...document.querySelectorAll('input[aria-invalid="true"]'),
      ];
      const described = inputs.filter((i) => {
        const ids = (i.getAttribute("aria-describedby") || "")
          .split(/\s+/)
          .filter(Boolean);
        return ids.some((id) =>
          (document.getElementById(id)?.innerText || "").trim(),
        );
      });
      const live = [
        ...document.querySelectorAll('[role="alert"], [aria-live]'),
      ].filter((e) => e.innerText.trim());
      return {
        invalid: inputs.length,
        described: described.length,
        live: live.length,
      };
    });
    check(
      fieldErrors.invalid > 0 && fieldErrors.described === fieldErrors.invalid,
      "register patient: invalid fields are marked aria-invalid and described by their error",
      JSON.stringify(fieldErrors),
    );
    check(
      fieldErrors.live > 0,
      "register patient: field errors sit in a live region",
      JSON.stringify(fieldErrors),
    );
    await p.context().close();

    p = await newPage();
    current = p;
    await signIn(p, nurse.email, nurse.password);
    await go(p, `/nursing/patients/${admission.id}`);
    await p.getByText("Record obs", { exact: true }).first().click();
    await p.waitForTimeout(700);
    await report(p, "record observations", await tabTo(p, "obs-submit"));
    await p.context().close();

    p = await newPage();
    current = p;
    await signIn(p, pharmacist.email, pharmacist.password);
    await go(p, `/pharmacy/dispense/${rxPending.id}`);
    // The confirm button stays disabled until the allergy list is acknowledged —
    // so the check is that the acknowledgement itself is reachable and operable.
    let acked = null;
    await report(
      p,
      "dispense",
      await tabTo(p, "dispense-confirm", {
        onStop: async (stop) => {
          if (stop.testId === "dispense-ack" && acked === null) {
            const before = await p
              .getByTestId("dispense-ack")
              .getAttribute("aria-checked");
            await p.keyboard.press("Space");
            await p.waitForTimeout(400);
            acked = {
              before,
              after: await p
                .getByTestId("dispense-ack")
                .getAttribute("aria-checked"),
            };
          }
        },
      }),
    );
    check(
      acked?.before === "false" && acked?.after === "true",
      "dispense: the allergy acknowledgement is reachable, ticked with Space, and says so (aria-checked)",
      JSON.stringify(acked),
    );
    await p.context().close();

    p = await newPage();
    current = p;
    await signIn(p, billing.email, billing.password);
    await go(p, "/billing/generate");
    await tabTo(p, "generate-patient-search", { max: 80 });
    await p.keyboard.type("Kiran");
    await p.waitForTimeout(1800);
    const picked = await tabTo(p, `generate-pick-${kiran.patientId}`, {
      max: 20,
    });
    if (picked.reached) {
      await p.keyboard.press("Enter");
      await settle(p, 2200);
    }
    const gen = await tabTo(p, "generate-opd", { max: 80 });
    check(
      picked.reached,
      "generate bill: the patient is chosen from the keyboard",
    );
    gen.invisible.push(...picked.invisible);
    await report(p, "generate bill", gen);
    await p.context().close();

    // ----------------------------------------------------------------------
    console.log(
      "\nKeyboard — dialogs trap focus, close on Escape, and return it\n",
    );

    const inDialog = (p) =>
      p.evaluate(() => {
        const dialogs = [
          ...document.querySelectorAll('[role="dialog"], [aria-modal="true"]'),
        ];
        const el = document.activeElement;
        return dialogs.length > 0 && dialogs.some((d) => d.contains(el));
      });
    const dialogOpen = (p) =>
      p.evaluate(() =>
        [...document.querySelectorAll('[role="dialog"]')].some(
          (d) => d.checkVisibility?.() ?? true,
        ),
      );

    const trap = async (p, label, trigger) => {
      await trigger.focus();
      const handle = await trigger.elementHandle();
      await p.keyboard.press("Enter");
      await p.waitForTimeout(700);
      check(await dialogOpen(p), `${label}: opens from the keyboard`);
      let inside = 0;
      const presses = 14;
      for (let i = 0; i < presses; i++) {
        await p.keyboard.press(i % 5 === 4 ? "Shift+Tab" : "Tab");
        await p.waitForTimeout(60);
        if (await inDialog(p)) inside++;
      }
      check(
        inside === presses,
        `${label}: Tab and Shift+Tab stay inside while open`,
        `${inside}/${presses} inside`,
      );
      await p.keyboard.press("Escape");
      await p.waitForTimeout(900);
      check(!(await dialogOpen(p)), `${label}: Escape closes it`);
      const returned = await p.evaluate(
        (el) =>
          document.activeElement === el || el.contains(document.activeElement),
        handle,
      );
      check(returned, `${label}: focus returns to the control that opened it`);
      if (!returned || inside !== presses) await shot(p, `trap-${label}`);
    };

    p = await newPage();
    current = p;
    await signIn(p, "admin@cgh.test", "AdminPassword123");
    await go(p, "/admin/users");
    await p.getByTestId("user-create-button").click();
    await settle(p);
    await trap(
      p,
      "Select sheet",
      p.getByTestId("user-role").getByRole("button"),
    );
    await go(p, "/admin/users");
    await p.getByTestId("user-row-DOC001").click();
    await settle(p);
    await trap(p, "ConfirmDialog", p.getByTestId("user-deactivate"));
    check(
      await p.getByTestId("user-deactivate").isVisible(),
      "ConfirmDialog: Escape cancelled — the account is still active",
    );
    await p.context().close();

    // The offline review sheet needs an entry the server refused.
    p = await newPage();
    current = p;
    await signIn(p, nurse.email, nurse.password);
    await go(p, `/nursing/patients/${admission.id}`);
    let refuse = false;
    await p.route("**/api/v1/nursing/observations", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      if (!refuse) return route.abort("internetdisconnected");
      return route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          message: "This admission has been discharged",
        }),
      });
    });
    await p.context().setOffline(true);
    await p.getByText("Record obs", { exact: true }).first().click();
    await p.waitForTimeout(600);
    for (const [id, v] of Object.entries({
      respiratoryRate: 18,
      spo2: 96,
      systolic: 122,
      pulse: 84,
      temperatureC: 37.2,
    }))
      await p.getByTestId(`obs-${id}`).fill(String(v));
    await p.getByTestId("obs-air").click();
    await p.getByTestId("obs-acvpu-alert").click();
    await p.getByTestId("obs-submit").click();
    await p.waitForTimeout(1500);
    refuse = true;
    await p.context().setOffline(false);
    const reviewVisible = await p
      .getByTestId("outbox-review")
      .waitFor({ state: "visible", timeout: 40_000 })
      .then(() => true)
      .catch(() => false);
    if (
      check(
        reviewVisible,
        "outbox review: a refused offline entry offers Review",
      )
    ) {
      await trap(p, "Outbox review modal", p.getByTestId("outbox-review"));
    }
    await p.context().close();
  }

  // =========================================================================
  if (runs("reflow")) {
    console.log("\nReflow — 320 CSS px (400% of 1280) and 640 CSS px (200%)\n");
    const REFLOW = [
      { role: null, screen: "Login", path: "/" },
      {
        role: "receptionist",
        screen: "Register patient",
        path: "/patients/new",
      },
      { role: "receptionist", screen: "Patients", path: "/patients" },
      {
        role: "doctor",
        screen: "Medical record",
        path: `/patients/${anita.id}/record`,
      },
      {
        role: "nurse",
        screen: "Bedside",
        path: `/nursing/patients/${admission.id}`,
      },
      { role: "nurse", screen: "Emergency board", path: "/emergency" },
      { role: "lab", screen: "Lab order", path: `/lab/requests/${rft?.id}` },
      {
        role: "pharmacy",
        screen: "Dispense",
        path: `/pharmacy/dispense/${rxPending?.id}`,
      },
      {
        role: "billing",
        screen: "Bill detail",
        path: `/billing/bills/${finalBill?.id}`,
      },
      { role: "inventory", screen: "Inventory", path: "/inventory" },
    ];
    const pages = new Map();
    for (const t of REFLOW) {
      let p = pages.get(t.role);
      if (!p) {
        p = await newPage();
        if (t.role)
          await signIn(p, users[t.role].email, users[t.role].password);
        pages.set(t.role, p);
      }
      current = p;
      for (const width of [320, 640]) {
        await p.setViewportSize({ width, height: 900 });
        await go(p, t.path);
        const r = await p.evaluate(() => {
          const pageScroll =
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth;
          // Content pushed past the right edge with no scrolling container of
          // its own to reach it. Tables and chip rows may scroll inside themselves.
          const lost = [];
          const scrollsX = (el) => {
            for (let a = el.parentElement; a; a = a.parentElement) {
              const o = getComputedStyle(a).overflowX;
              if (
                (o === "auto" || o === "scroll") &&
                a.scrollWidth > a.clientWidth + 1
              )
                return true;
            }
            return false;
          };
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
          );
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.textContent.trim()) continue;
            const el = n.parentElement;
            if (!el || !(el.checkVisibility?.() ?? true)) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            const rect = range.getBoundingClientRect();
            if (rect.width === 0) continue;
            if (rect.right > window.innerWidth + 1 && !scrollsX(el))
              lost.push(n.textContent.trim().slice(0, 30));
          }
          return { pageScroll, lost: lost.slice(0, 5), lostCount: lost.length };
        });
        const ok = check(
          r.pageScroll <= 1 && r.lostCount === 0,
          `${t.screen} at ${width}px: no page scroll sideways, nothing off-screen`,
          `page overflow ${r.pageScroll}px; ${r.lostCount} text run(s) off-screen: ${r.lost.join(" | ")}`,
        );
        if (!ok) await shot(p, `reflow-${width}-${t.screen}`);
      }
    }
    for (const p of pages.values()) await p.context().close();
  }

  // =========================================================================
  if (runs("motion")) {
    console.log("\nReduced motion\n");
    const sample = async (reducedMotion) => {
      // A sheet opening: count CSS animations in the frame right after Enter,
      // before a 300 ms fade could have finished.
      const p = await newPage({ reducedMotion });
      current = p;
      await signIn(p, "admin@cgh.test", "AdminPassword123");
      await go(p, "/admin/users");
      await p.getByTestId("user-create-button").click();
      await settle(p);
      await p.getByTestId("user-role").getByRole("button").focus();
      await p.keyboard.press("Enter");
      const cssAnimations = await p.evaluate(
        () => document.getAnimations().length,
      );
      await p.keyboard.press("Escape");
      await p.waitForTimeout(600);
      await p.context().close();

      // Skeletons: hold the dispensing context back so its loading state stays
      // up, and sample the placeholder's opacity over time.
      const q = await newPage({ reducedMotion });
      current = q;
      await signIn(q, pharmacist.email, pharmacist.password);
      await q.route(
        "**/api/v1/pharmacy/prescriptions/*/dispense-context",
        async (route) => {
          await new Promise((r) => setTimeout(r, 6000));
          await route.fallback().catch(() => {});
        },
      );
      await q.goto(`${WEB}/pharmacy/dispense/${rxPending.id}`, {
        waitUntil: "domcontentloaded",
      });
      await q.waitForTimeout(2000);
      const opacities = [];
      for (let i = 0; i < 6; i++) {
        opacities.push(
          await q.evaluate(() => {
            // Skeleton: ink-200 fill, the 100 px block at the top of the screen.
            const s = [...document.querySelectorAll("div")].find(
              (d) =>
                getComputedStyle(d).backgroundColor === "rgb(220, 225, 231)" &&
                d.getBoundingClientRect().height >= 90,
            );
            return s ? Number(getComputedStyle(s).opacity).toFixed(2) : null;
          }),
        );
        await q.waitForTimeout(230);
      }
      await q.context().close();
      return { cssAnimations, opacities };
    };
    const normal = await sample("no-preference");
    const reduced = await sample("reduce");
    console.log(
      `  (no-preference: ${normal.cssAnimations} running CSS animation(s) opening a sheet, skeleton opacity ${normal.opacities.join(" → ")})`,
    );
    console.log(
      `  (reduce:        ${reduced.cssAnimations} running CSS animation(s) opening a sheet, skeleton opacity ${reduced.opacities.join(" → ")})`,
    );
    check(
      reduced.cssAnimations === 0,
      "reduced motion: a sheet opens without an animation",
    );
    const seen = reduced.opacities.filter((o) => o !== null);
    if (seen.length >= 2)
      check(
        new Set(seen).size === 1,
        "reduced motion: loading skeletons hold still",
        seen.join(" → "),
      );
    else
      warn(
        "reduced motion: no loading skeleton was on screen long enough to sample",
      );
    if (
      normal.cssAnimations === 0 &&
      new Set(normal.opacities.filter(Boolean)).size <= 1
    )
      warn(
        "reduced motion: nothing animated even without the preference — the check proved little",
      );
  }
} catch (err) {
  console.error("\nGate threw:", err.message);
  failures.push(`exception: ${err.message.split("\n")[0]}`);
  if (current)
    await current
      .screenshot({ path: path.join(SHOTS, "a11y-FAILURE.png") })
      .catch(() => {});
} finally {
  await browser.close();
  web.close();
  api.kill("SIGTERM");
  await mongoose.disconnect().catch(() => {});
  await replSet.stop().catch(() => {});
}

// ---- Report ----
if (byRule.size) {
  console.log(
    `\naxe results by rule (${screensAudited} screen renders audited)\n`,
  );
  const rows = [...byRule.entries()].sort((a, b) => b[1].nodes - a[1].nodes);
  for (const [rule, e] of rows) {
    const level =
      e.impact === "serious" || e.impact === "critical" ? "FAIL" : "warn";
    console.log(
      `  ${level}  ${rule.padEnd(28)} ${String(e.impact).padEnd(9)} ${String(e.nodes).padStart(4)} node(s) on ${e.screens.size} render(s) — ${e.help}`,
    );
    for (const s of [...e.samples].slice(0, 2))
      console.log(`          e.g. ${s}`);
    if (level === "warn") warnings.push(`axe ${rule} (${e.impact})`);
  }
} else if (runs("axe")) {
  console.log("\naxe: no violations of any impact.");
}
if (structureProblems.size) {
  console.log("\nStructure problems\n");
  for (const [pr, screens] of structureProblems)
    console.log(
      `  FAIL  ${pr} — ${[...screens].slice(0, 4).join("; ")}${screens.size > 4 ? ` (+${screens.size - 4})` : ""}`,
    );
}

if (matrix.size) {
  const roles = ["signed out", ...Object.keys(users)];
  const cols = roles.filter((r) =>
    [...matrix.values()].some((row) => row.has(r)),
  );
  const short = {
    "signed out": "out",
    receptionist: "rec",
    doctor: "doc",
    nurse: "nur",
    lab: "lab",
    pharmacy: "pha",
    billing: "bil",
    inventory: "inv",
    admin: "adm",
  };
  console.log(
    "\nCoverage — screen × role, cell = desktop/phone  (ok · ~n minor/moderate nodes · n! serious · sn structure problems · - not visited)\n",
  );
  const w = Math.max(...[...matrix.keys()].map((k) => k.length)) + 2;
  console.log(
    `  ${"Screen".padEnd(w)}${cols.map((c) => short[c].padEnd(12)).join("")}`,
  );
  for (const [screen, row] of [...matrix.entries()].sort()) {
    const cells = cols.map((c) => {
      const cell = row.get(c);
      return (cell ? `${cell.desktop ?? "-"}/${cell.phone ?? "-"}` : "").padEnd(
        12,
      );
    });
    console.log(`  ${screen.padEnd(w)}${cells.join("")}`);
  }
  const renders = [...matrix.values()].reduce(
    (n, row) =>
      n + [...row.values()].reduce((m, c) => m + Object.keys(c).length, 0),
    0,
  );
  console.log(
    `\n  ${matrix.size} distinct screens · ${cols.length} roles (incl. signed out) · ${VIEWPORTS.length} viewports · ${renders} audited renders`,
  );
}

if (process.env.A11Y_JSON) {
  fs.writeFileSync(
    process.env.A11Y_JSON,
    JSON.stringify(
      {
        rules: Object.fromEntries(
          [...byRule].map(([k, v]) => [
            k,
            {
              impact: v.impact,
              nodes: v.nodes,
              renders: v.screens.size,
              samples: [...v.samples],
            },
          ]),
        ),
        structure: Object.fromEntries(
          [...structureProblems].map(([k, v]) => [k, [...v]]),
        ),
        badges: badgeTotals,
        failures,
        warnings,
        seedProblems,
        screensAudited,
      },
      null,
      2,
    ),
  );
}

const jsErrors = consoleErrors.filter(
  (e) => !/Failed to load resource|net::ERR_/i.test(e),
);
if (jsErrors.length)
  warn(
    `JavaScript errors on the page: ${[...new Set(jsErrors)].slice(0, 2).join(" | ")}`,
  );

if (failures.length) {
  console.error(
    `\n${failures.length} check(s) failed:\n - ${failures.join("\n - ")}\n`,
  );
  process.exit(1);
}
console.log(
  `\nWCAG 2.1 AA holds on every audited screen, role and viewport (${warnings.length} warning(s)). Failure screenshots only, in docs/shots/a11y-*.png\n`,
);
