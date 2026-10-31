// Gate 2 (and a browser run of gate 3): Darsi Tiny in Chromium with the CPU throttled 6× through the DevTools protocol
// (Emulation.setCPUThrottlingRate). Builds the test page with Vite into a temporary folder, serves it with the model
// files from apps/web/public/lib, and drives it with Playwright.
//
// Chromium throttles pages only ("Operation is only supported for pages, not workers"), so the gate is measured with the
// engine on the page's main thread: the same code the worker runs. The worker is timed too, unthrottled, and checked for
// streaming, stopping, ending when idle and fine-tuning.
//
//   node tools/tinylm/web/speed.mjs [--rate 6] [--out tools/tinylm/out/speed.json]
//
// Set CHROMIUM_PATH to a chrome.exe if Playwright's own Chromium is not installed.
import { createServer } from "node:http";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
// --lib: a folder holding tinylm/v1/ (a candidate model exported elsewhere); the shipped files by default.
const lib = path.resolve(arg("--lib", path.join(root, "apps/web/public/lib")));
const RATE = Number(arg("--rate", "6"));
const OUT = arg("--out", path.join(root, "tools/tinylm/out/speed.json"));

const dist = await mkdtemp(path.join(tmpdir(), "tinylm-speed-"));
await build({ root: here, configFile: false, logLevel: "warn", build: { outDir: dist, emptyOutDir: true, target: "es2020" }, worker: { format: "es" } });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".bin": "application/octet-stream", ".css": "text/css" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = url.startsWith("/lib/") ? path.join(lib, url.slice(5)) : path.join(dist, url === "/" ? "index.html" : url);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") console.error("page:", m.text()); });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(origin + "/");
await page.waitForFunction(() => window.tinyBench?.ready);
const cdp = await page.context().newCDPSession(page);

// Try to throttle the worker too (attach to it, non-flattened, and send it the same command); the reply is recorded.
const workerThrottle = [];
let msgId = 1000;
await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
const pending = new Map();
cdp.on("Target.receivedMessageFromTarget", ({ message }) => {
  const m = JSON.parse(message);
  if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
cdp.on("Target.attachedToTarget", async ({ sessionId, targetInfo }) => {
  if (targetInfo.type !== "worker") return;
  const id = ++msgId;
  const answer = new Promise((r) => pending.set(id, r));
  await cdp.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method: "Emulation.setCPUThrottlingRate", params: { rate: RATE } }) }).catch((e) => workerThrottle.push({ error: String(e) }));
  workerThrottle.push({ target: targetInfo.title || targetInfo.url, reply: await Promise.race([answer, new Promise((r) => setTimeout(() => r("no reply"), 2000))]) });
});

// --fixtures: the reference.json that goes with --lib's model (export.py --fixtures); the shipped one by default.
const fixtures = path.resolve(arg("--fixtures", path.join(root, "apps/web/tests/tinylm/fixtures")));
const reference = JSON.parse(await readFile(path.join(fixtures, "reference.json"), "utf8")).cases;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const report = { rate: RATE, chromium: browser.version(), date: new Date().toISOString() };

// Warm the JIT unthrottled, as on a phone after the first answer; then the same runs throttled.
report.mainUnthrottled = await page.evaluate(() => window.tinyBench.main(6));
await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });
report.mainThrottled = await page.evaluate(() => window.tinyBench.main(6));
report.parityThrottled = await page.evaluate((c) => window.tinyBench.parity(c), reference.map((c) => ({ prompt: c.prompt, generated: c.generated })));
report.finetune = [];
for (const blocks of [1, 2]) report.finetune.push(await page.evaluate((b) => window.tinyBench.finetune(b, 2), blocks));
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

// The worker (Chromium can't throttle it, see above): streaming speed, ending when idle, stopping, fine-tuning.
report.worker = await page.evaluate(() => window.tinyBench.worker(6));
await page.waitForTimeout(2500);
report.workerEndedWhenIdle = !(await page.evaluate(() => window.tinyBench.running()));
report.workerTargetsAfterIdle = (await cdp.send("Target.getTargets")).targetInfos.filter((t) => t.type === "worker").length;
report.stop = await page.evaluate(() => window.tinyBench.stopTest());
report.workerFinetune = await page.evaluate(() => window.tinyBench.workerFinetune());
report.workerThrottle = workerThrottle;

const rates = (runs) => runs.map((r) => r.tokPerSec);
report.summary = {
  mainThrottledMedianTokPerSec: median(rates(report.mainThrottled)),
  mainThrottledMinTokPerSec: Math.min(...rates(report.mainThrottled)),
  mainUnthrottledMedianTokPerSec: median(rates(report.mainUnthrottled)),
  mainThrottledPrefillMedianTokPerSec: median(report.mainThrottled.map((r) => r.prefillTokPerSec)),
  workerMedianTokPerSec: median(rates(report.worker.runs)),
  workerThrottleApplied: workerThrottle.some((w) => w.reply?.result),
  parityThrottled: report.parityThrottled.every(Boolean),
  gate2: Math.min(...rates(report.mainThrottled)) >= 30,
};
console.log(JSON.stringify(report.summary, null, 1));
await writeFile(OUT, JSON.stringify(report, null, 1));
console.log("full report:", OUT);
await browser.close();
server.close();
await rm(dist, { recursive: true, force: true });
if (!existsSync(OUT)) process.exit(1);
