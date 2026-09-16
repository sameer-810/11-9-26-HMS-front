/**
 * phase 1 gate — flow 4 in a browser: admin creates a user, who signs in with the temporary
 * credential, is forced to set a password and lands on a role-built dashboard.
 * boots the real api on an in-memory replica set and serves the real web export.
 *   node tools/verifyFlow4.mjs
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

/** windows esm refuses a bare absolute path; it needs a file:// url. */
const imp = (...segments) => import(pathToFileURL(path.join(...segments)).href);

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

// ---- 1. API ----
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
const api = spawn(process.execPath, ["server.js"], {
  cwd: BACK,
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(API_PORT),
    MONGODB_URI: mongoUri,
    JWT_ACCESS_SECRET: "verify-access-secret-not-real",
    JWT_REFRESH_SECRET: "verify-refresh-secret-not-real",
    JWT_ADMIN_SECRET: "verify-admin-secret-not-real",
    BCRYPT_ROUNDS: "4",
    CORS_ORIGIN: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let apiLog = "";
api.stdout.on("data", (d) => (apiLog += d));
api.stderr.on("data", (d) => (apiLog += d));

const API = `http://127.0.0.1:${API_PORT}`;

async function waitForApi(timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${API}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      throw new Error(`API did not start in ${timeoutMs}ms.\n${apiLog}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}
await waitForApi();
console.log(`API ready on ${API}`);

// seeded directly: there is no public signup route.
// the backend freezes process.env at import, so set these before importing its models.
process.env.MONGODB_URI = mongoUri;
process.env.JWT_ACCESS_SECRET ??= "verify-access-secret-not-real";
process.env.JWT_REFRESH_SECRET ??= "verify-refresh-secret-not-real";
process.env.JWT_ADMIN_SECRET ??= "verify-admin-secret-not-real";
process.env.BCRYPT_ROUNDS ??= "4";

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
});
await UserModel.create({
  hospitalId: hospital._id,
  employeeId: "ADM001",
  firstName: "Asha",
  lastName: "Menon",
  email: "admin@cgh.test",
  passwordHash: await hashPassword("AdminPassword123"),
  role: ROLES.ADMIN,
  designation: "Hospital Administrator",
  permissions: defaultPermissionsFor(ROLES.ADMIN),
  isActive: true,
  mustChangePassword: false,
});
console.log("Seeded: City General Hospital + 1 administrator");

// ---- 2. Serve the web export ----
const web = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let file = path.join(DIST, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, "index.html");
  }
  res.writeHead(200, {
    "Content-Type":
      TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
  });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => web.listen(0, "127.0.0.1", r));
const WEB = `http://127.0.0.1:${web.address().port}`;
console.log(`Web served on ${WEB}\n`);

// ---- 3. Drive it ----
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

const httpFailures = [];
page.on("response", (r) => {
  if (r.status() >= 400)
    httpFailures.push(
      `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`,
    );
});

// the bundle was built with the default api url; point it at this run's api.
await page.addInitScript((apiUrl) => {
  window.__HMS_API__ = apiUrl;
}, `${API}/api/v1`);

// the live-update socket is not under test; blocked so the gate never reaches
// the dev port baked into the build.
await page.route("**/socket.io/**", (route) => route.abort());
await page.route("**/api/v1/**", async (route) => {
  const url = new URL(route.request().url());
  const target = `${API}${url.pathname}${url.search}`;
  const response = await route.fetch({ url: target });
  await route.fulfill({ response });
});

try {
  console.log("Flow 4 — administrator creates a user and that user signs in\n");

  // -- Step 1: administrator signs in ----------------------------------------
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  await page.getByTestId("login-email").fill("admin@cgh.test");
  await page.getByTestId("login-password").fill("AdminPassword123");
  await page.getByTestId("login-submit").click();

  await page.waitForTimeout(2500);
  let text = await page.innerText("body");
  check(
    /Good (morning|afternoon|evening), Asha/.test(text),
    "administrator reaches the dashboard",
  );
  check(text.includes("Hospital Administrator"), "their designation is shown");
  check(
    text.includes("City General Hospital"),
    "the hospital they are signed in to is named",
  );

  await page.screenshot({
    path: path.join(SHOTS, "flow4-1-admin-dashboard.png"),
  });

  check(text.includes("Active staff"), "admin sees the staff figure");
  check(text.includes("Departments"), "admin sees the department figure");

  // -- Step 2: the sidebar is built from the role ----------------------------
  check(
    text.includes("Users & access"),
    "admin sees user management in the sidebar",
  );
  check(
    text.includes("Audit trail"),
    "admin sees the audit trail in the sidebar",
  );
  check(
    !text.includes("Consultation") && !text.includes("My schedule"),
    "admin does NOT see clinical sections",
  );

  // -- Step 3: create a user through the API the UI talks to -----------------
  // created via the endpoint the form calls; this gate proves the handover and forced change.
  const adminLogin = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@cgh.test",
      password: "AdminPassword123",
      deviceId: "verify-admin-device-1",
      deviceName: "Verifier",
    }),
  }).then((r) => r.json());

  const created = await fetch(`${API}/api/v1/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminLogin.data.accessToken}`,
    },
    body: JSON.stringify({
      employeeId: "REC001",
      firstName: "Deepak",
      lastName: "Rao",
      email: "deepak@cgh.test",
      role: "receptionist",
      designation: "Front Desk Executive",
    }),
  }).then((r) => r.json());

  const tempPassword = created?.data?.temporaryPassword;
  check(Boolean(tempPassword), "a temporary credential was issued");

  // -- Step 4: the new employee signs in -------------------------------------
  await page.evaluate(() => {
    try {
      localStorage.removeItem("hms-auth-storage");
    } catch {
      /* nothing to clear */
    }
  });
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await page.getByTestId("login-email").fill("deepak@cgh.test");
  await page.getByTestId("login-password").fill(tempPassword);
  await page.getByTestId("login-submit").click();
  await page.waitForTimeout(2500);

  text = await page.innerText("body");
  check(text.includes("Set your password"), "forced onto the password screen");
  check(
    text.includes("This is required"),
    "told plainly that it is not optional",
  );
  check(
    !text.includes("Good morning, Deepak") && !text.includes("Dashboard"),
    "the app is NOT reachable yet",
  );

  await page.screenshot({
    path: path.join(SHOTS, "flow4-2-forced-password.png"),
  });

  // -- Step 5: set their own password ----------------------------------------
  await page.getByTestId("cp-current").fill(tempPassword);
  await page.getByTestId("cp-new").fill("DeepaksOwnPassword1");
  await page.getByTestId("cp-confirm").fill("DeepaksOwnPassword1");
  await page.getByTestId("cp-submit").click();
  await page.waitForTimeout(2500);

  text = await page.innerText("body");
  check(
    /Good (morning|afternoon|evening), Deepak/.test(text),
    "lands on the dashboard after setting it",
  );

  // -- Step 6: the dashboard and menu are built from THEIR role --------------
  check(text.includes("Front Desk Executive"), "their designation is shown");
  check(text.includes("Patients"), "receptionist sees Patients");
  check(text.includes("Appointments"), "receptionist sees Appointments");
  check(text.includes("OPD queue"), "receptionist sees the OPD queue");
  check(
    !text.includes("Users & access"),
    "receptionist does NOT see user management",
  );
  check(
    !text.includes("Audit trail"),
    "receptionist does NOT see the audit trail",
  );
  check(
    !text.includes("Active staff"),
    "receptionist does NOT see staff figures",
  );
  check(!text.includes("Occupancy"), "receptionist does NOT see bed occupancy");

  await page.screenshot({
    path: path.join(SHOTS, "flow4-3-receptionist-dashboard.png"),
  });

  // -- Step 7: the whole journey is in the audit trail ------------------------
  const audit = await fetch(`${API}/api/v1/audit?limit=100`, {
    headers: { Authorization: `Bearer ${adminLogin.data.accessToken}` },
  }).then((r) => r.json());
  const actions = (audit?.data || []).map((a) => a.action);

  check(actions.includes("user.create"), "audit: the account creation");
  check(actions.includes("auth.login"), "audit: the sign-ins");
  check(
    actions.includes("auth.password.changed"),
    "audit: the password change",
  );

  const createEntry = (audit.data || []).find(
    (a) => a.action === "user.create",
  );
  check(createEntry?.user?.name === "Asha Menon", "audit names who did it");
  check(Boolean(createEntry?.requestId), "audit carries the request id");

  console.log(`
  (HTTP non-2xx seen: ${httpFailures.join(", ") || "none"})
`);

  // expected 401s surface as "Failed to load resource"; only real js errors count.
  const jsErrors = consoleErrors.filter(
    (e) => !/Failed to load resource/i.test(e),
  );
  check(
    jsErrors.length === 0,
    "no JavaScript errors anywhere in the journey",
    jsErrors.slice(0, 2).join(" | "),
  );

  const unexpected = httpFailures.filter((f) => !/^40[13] /.test(f));
  check(
    unexpected.length === 0,
    "no unexpected HTTP failures",
    unexpected.join(", "),
  );

  // -- Step 8: the phone layout of the same journey --------------------------
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const pPage = await phone.newPage();
  // the live-update socket is not under test; blocked so the gate never reaches
  // the dev port baked into the build.
  await pPage.route("**/socket.io/**", (route) => route.abort());
  await pPage.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${API}${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  await pPage.goto(WEB, { waitUntil: "networkidle" });
  await pPage.waitForTimeout(1500);
  await pPage.getByTestId("login-email").fill("deepak@cgh.test");
  await pPage.getByTestId("login-password").fill("DeepaksOwnPassword1");
  await pPage.getByTestId("login-submit").click();
  await pPage.waitForTimeout(2500);

  const pText = await pPage.innerText("body");
  check(
    /Good (morning|afternoon|evening), Deepak/.test(pText),
    "phone: signs in and reaches the dashboard",
  );

  const overflow = await pPage.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  check(overflow <= 1, "phone: no horizontal overflow", `${overflow}px`);

  await pPage.screenshot({
    path: path.join(SHOTS, "flow4-4-phone-dashboard.png"),
  });
  await phone.close();
} catch (err) {
  console.error("\nJourney threw:", err.message);
  failures.push(`exception: ${err.message}`);
  await page
    .screenshot({ path: path.join(SHOTS, "flow4-FAILURE.png") })
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
console.log("\nFlow 4 passes end to end. Screenshots in docs/shots/\n");
