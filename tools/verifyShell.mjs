/**
 * Foundation smoke test.
 *
 * Builds nothing and mocks nothing: it serves the real web export, drives it in
 * a real browser and asserts the shell actually renders. A bundle that compiles
 * and then throws on first paint is the failure mode this exists to catch — and
 * `expo export` exits 0 for it.
 *
 *   node tools/verifyShell.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, "..", "dist");
const SHOTS = path.resolve(here, "..", "docs", "shots");

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

if (!fs.existsSync(DIST)) {
  console.error("No dist/. Run `npm run build:web` first.");
  process.exit(1);
}
fs.mkdirSync(SHOTS, { recursive: true });

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let file = path.join(DIST, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, "index.html"); // SPA fallback
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const failures = [];
const check = (ok, label, extra = "") => {
  if (ok) console.log(`  ok    ${label}`);
  else {
    console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ""}`);
    failures.push(label);
  }
};

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
console.log(`\nServing dist at ${base}\n`);

const browser = await chromium.launch();

try {
  for (const vp of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 834, height: 1112 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    console.log(`${vp.name} (${vp.width}x${vp.height})`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();

    const consoleErrors = [];
    const failedRequests = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("requestfailed", (r) => failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));

    await page.goto(base, { waitUntil: "networkidle" });
    // Fonts gate the first render.
    await page.waitForTimeout(1500);

    const text = await page.innerText("body");

    check(text.includes("Sign in"), `${vp.name}: login screen rendered`);
    check(text.includes("HMS") || text.includes("One patient"), `${vp.name}: branding present`);
    check(
      consoleErrors.length === 0,
      `${vp.name}: no console errors`,
      consoleErrors.slice(0, 2).join(" | "),
    );
    check(
      failedRequests.length === 0,
      `${vp.name}: no failed requests`,
      failedRequests.slice(0, 2).join(" | "),
    );

    // The hero pane is desktop-only; the phone layout must not show it.
    if (vp.name === "phone") {
      check(!text.includes("One patient, one record"), "phone: desktop hero suppressed");
    } else if (vp.name === "desktop") {
      check(text.includes("One patient, one record"), "desktop: hero shown");
    }

    // Nothing may scroll sideways — a clinical form that needs horizontal
    // scrolling on a ward tablet is a form that gets filled in wrong.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(overflow <= 1, `${vp.name}: no horizontal overflow`, `${overflow}px`);

    // Every input must carry an accessible name.
    const unlabelled = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input")).filter(
        (el) =>
          !el.getAttribute("aria-label") &&
          !el.getAttribute("placeholder") &&
          !el.labels?.length,
      ).length,
    );
    check(unlabelled === 0, `${vp.name}: all inputs labelled`, `${unlabelled} unlabelled`);

    await page.screenshot({
      path: path.join(SHOTS, `login-${vp.name}.png`),
      fullPage: false,
    });

    await ctx.close();
    console.log("");
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n - ${failures.join("\n - ")}\n`);
  process.exit(1);
}
console.log(`All checks passed. Screenshots in docs/shots/\n`);
