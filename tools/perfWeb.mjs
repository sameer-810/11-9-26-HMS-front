/**
 * web bundle size, and cold-load time to the sign-in screen served gzipped under
 * lighthouse mobile throttling (150 ms rtt, 1.6 Mbps down, 750 kbps up, 4x cpu).
 *
 *   npm run build:web && node tools/perfWeb.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
// PERF_WEB_DIST lets a measurement use its own export without touching the dist/
// other checks may be serving.
const DIST = process.env.PERF_WEB_DIST ? path.resolve(process.env.PERF_WEB_DIST) : path.resolve(here, "..", "dist");
const RUNS = Number(process.env.PERF_WEB_RUNS || 5);

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg", ".ttf"]);

if (!fs.existsSync(DIST)) {
  console.error("No dist/. Run `npm run build:web` first.");
  process.exit(1);
}

// ---- Bundle size -----------------------------------------------------------
const jsDir = path.join(DIST, "_expo", "static", "js", "web");
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
let rawTotal = 0;
let gzipTotal = 0;
console.log("\nWeb bundle (dist/_expo/static/js/web)");
for (const name of fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"))) {
  const buf = fs.readFileSync(path.join(jsDir, name));
  const gz = zlib.gzipSync(buf, { level: 9 }).length;
  rawTotal += buf.length;
  gzipTotal += gz;
  console.log(`  ${name.padEnd(48)} raw ${kb(buf.length).padStart(11)}   gzip ${kb(gz).padStart(10)}`);
}
console.log(`  ${"total".padEnd(48)} raw ${kb(rawTotal).padStart(11)}   gzip ${kb(gzipTotal).padStart(10)}`);

// ---- Throttled first load ----------------------------------------------------
const cache = new Map();
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let file = path.join(DIST, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  const ext = path.extname(file).toLowerCase();
  const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  if (gzip && !cache.has(file)) cache.set(file, zlib.gzipSync(fs.readFileSync(file)));
  const body = gzip ? cache.get(file) : fs.readFileSync(file);
  res.writeHead(200, {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    ...(gzip ? { "Content-Encoding": "gzip" } : {}),
    "Content-Length": body.length,
  });
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const timings = [];
try {
  for (let run = 0; run < RUNS; run += 1) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    let transferred = 0;
    cdp.on("Network.loadingFinished", (e) => {
      transferred += e.encodedDataLength;
    });

    const started = Date.now();
    await page.goto(base, { waitUntil: "commit" });
    // The sign-in form is interactive once its password field exists.
    await page.waitForSelector('input[type="password"]', { state: "visible", timeout: 120_000 });
    const loginVisibleMs = Date.now() - started;
    const paint = await page.evaluate(() =>
      Object.fromEntries(performance.getEntriesByType("paint").map((p) => [p.name, Math.round(p.startTime)])),
    );
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return n ? { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : {};
    });
    timings.push({ loginVisibleMs, ...paint, ...nav, transferredKb: Math.round(transferred / 1024) });
    console.log(`  run ${run + 1}: sign-in form visible ${loginVisibleMs} ms · FCP ${paint["first-contentful-paint"] ?? "?"} ms · ${Math.round(transferred / 1024)} KB transferred`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

const sorted = timings.map((t) => t.loginVisibleMs).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
console.log(`\nTime to sign-in screen (Lighthouse mobile throttling, ${RUNS} cold runs): median ${median} ms, worst ${sorted.at(-1)} ms`);
console.log(JSON.stringify({ bundle: { rawBytes: rawTotal, gzipBytes: gzipTotal }, timings, medianLoginVisibleMs: median }));
