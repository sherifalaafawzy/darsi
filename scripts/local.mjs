#!/usr/bin/env node
/**
 * Darsi on this computer, everything included, for testing: `npm run local -- you@gmail.com`.
 *
 * - The Emulator Suite (project demo-darsi: Auth, Firestore, Functions, Storage). Its data is kept in .emulator-data/
 *   between runs (saved when you stop with Ctrl+C).
 * - The app as it ships (a production build with its service worker, so it works offline once loaded) on
 *   http://localhost:4173, talking to the emulators.
 * - Your account: "Sign in with Google" opens the emulator's account picker; pick the address you gave. It is a
 *   platform admin with a year of Darsi Super and its credits.
 * - The starting courses (npm run seed -- --emulator) on the first run, sample plans (/super/plans), the tutor's voice
 *   relay (ws://localhost:8091), and a stand-in for Paymob and Stripe (scripts/local/payments.mjs), so a purchase runs
 *   end to end with no money.
 * - The tutor answers for real through Vertex AI in darsi-f0685 (config/tutor in the emulator), with your gcloud
 *   application-default login; Google bills those few cents to that project's billing account.
 *
 *   npm run local -- you@gmail.com             build the app, start everything, prepare the data
 *   npm run local -- you@gmail.com --no-build  reuse the last build (apps/web/dist-local)
 *   npm run local -- you@gmail.com --fresh     start from empty emulators (drops .emulator-data/)
 *
 * Needs JDK 21+ (the emulators), `npm ci --prefix functions`, and the courses' media in content/media for videos.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startPayments } from "./local/payments.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
if (!email?.includes("@")) { console.error("Usage: npm run local -- <your Google address> [--no-build] [--fresh]"); process.exit(1); }
const P = "demo-darsi", BUCKET = `${P}.appspot.com`, REGION = "europe-west1", WEB = "http://localhost:4173";
const FN = `http://127.0.0.1:5001/${P}/${REGION}`;
const DATA = join(ROOT, ".emulator-data"), FUNCTIONS = join(ROOT, "functions");
const win = process.platform === "win32";
const children = [];
let payments = null, stopping = false;
/** The emulators' last lines, shown if they stop on their own. */
const emuLog = [];
const step = (s) => console.log(`\n▸ ${s}`);

/* ---------- Before starting ---------- */

/** A JDK 21 or newer for the emulators: the one on PATH, or one installed in the usual places. */
function java() {
  // `java -version` writes to stderr.
  const major = (bin) => Number(/version "(\d+)/.exec(String(spawnSync(bin, ["-version"], { encoding: "utf8" }).stderr ?? ""))?.[1] ?? 0);
  const env = { ...process.env };
  // Java's loopback pipe fails in a temp folder whose path has spaces (docs/FIREBASE.md, emulators).
  if (win && !env.JAVA_TOOL_OPTIONS) env.JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=C:\\Users\\Public";
  if (major("java") >= 21) return env;
  const roots = win ? ["C:/Program Files/Java", "C:/Program Files/Eclipse Adoptium", "C:/Program Files/Microsoft", "C:/Program Files/Zulu"] : ["/usr/lib/jvm", "/Library/Java/JavaVirtualMachines"];
  for (const r of roots.filter(existsSync)) for (const d of readdirSync(r).filter((x) => /jdk|jre/i.test(x)).sort().reverse()) {
    const home = [join(r, d), join(r, d, "Contents/Home")].find((h) => existsSync(join(h, "bin", win ? "java.exe" : "java")));
    // Windows spells it Path; a second PATH key would hide it from the children.
    const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
    if (home && major(join(home, "bin", "java")) >= 21) return { ...env, JAVA_HOME: home, [key]: `${join(home, "bin")}${win ? ";" : ":"}${env[key]}` };
  }
  console.error("The emulators need JDK 21 or newer (https://adoptium.net). Install one and run this again.");
  process.exit(1);
}

/** The emulator's own settings for payments, created once (gitignored): test secrets only, never real keys. */
function localSettings() {
  const env = join(FUNCTIONS, ".env.local"), secrets = join(FUNCTIONS, ".secret.local");
  if (!existsSync(env)) writeFileSync(env, `# The Emulator Suite (npm run local): the payment stand-in on 4799, and the local app after paying.
PAYMOB_PUBLIC_KEY=pk_test_local\nPAYMOB_INTEGRATIONS=1\nPAYMOB_BASE=http://127.0.0.1:4799\nSTRIPE_BASE=http://127.0.0.1:4799\nSITE_URL=${WEB}\n`);
  if (!existsSync(secrets)) writeFileSync(secrets, `PAYMOB_SECRET_KEY=sk_test_local\nPAYMOB_HMAC_SECRET=${randomBytes(16).toString("hex")}
STRIPE_SECRET_KEY=sk_test_local\nSTRIPE_WEBHOOK_SECRET=whsec_${randomBytes(16).toString("hex")}\nGEMINI_API_KEY=unset\n`);
  return secrets;
}

function run(cmd, list, opts = {}) {
  const c = spawn(cmd, list, { cwd: ROOT, stdio: opts.quiet ? ["ignore", "pipe", "pipe"] : "inherit", shell: win, ...opts });
  if (opts.quiet) { c.stdout.on("data", (d) => opts.log?.(String(d))); c.stderr.on("data", (d) => opts.log?.(String(d))); }
  return c;
}
const done = (c) => new Promise((ok, fail) => c.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`exit ${code}`)))));
async function until(what, test, ms = 180_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await test().catch(() => false)) return; await new Promise((r) => setTimeout(r, 1000)); }
  throw new Error(`${what} didn't start within ${ms / 1000} s`);
}

/**
 * Whether nothing answers on this port, over IPv4 or IPv6. (A bind test isn't enough on Windows: 127.0.0.1:8080 can be
 * bound while another program listens on 0.0.0.0:8080, and the browser then reaches that program.)
 */
const answers = (port, host) => new Promise((ok) => { const s = connect({ port, host, timeout: 500 }, () => { s.destroy(); ok(true); }).once("error", () => ok(false)).once("timeout", () => { s.destroy(); ok(false); }); });
const free = async (port) => !(await answers(port, "127.0.0.1")) && !(await answers(port, "::1"));

/**
 * firebase.json with Firestore on a free port: 8080, or 8085 when another program holds 8080 (Laragon's nginx, say).
 * Written next to firebase.json (gitignored) so the rules paths still resolve.
 */
async function emulatorConfig() {
  let pick = 8080;
  if (!(await free(8080))) { pick = 0; for (const p of [8085, 8086, 8087, 8088]) if (await free(p)) { pick = p; break; } }
  if (!pick) { console.error("Ports 8080 and 8085–8088 are all taken; free one for the Firestore emulator."); process.exit(1); }
  for (const [what, p] of [["Auth", 9099], ["Functions", 5001], ["Storage", 9199], ["the emulator UI", 4000], ["the app", 4173], ["the voice relay", 8091], ["the payment stand-in", 4799]]) {
    if (!(await free(p))) { console.error(`Port ${p} (${what}) is taken. Stop whatever uses it (an earlier \`npm run local\`?) and try again.`); process.exit(1); }
  }
  const cfg = JSON.parse(readFileSync(join(ROOT, "firebase.json"), "utf8"));
  cfg.emulators.firestore.port = pick;
  writeFileSync(join(ROOT, "firebase.local.json"), JSON.stringify(cfg, null, 2));
  if (pick !== 8080) console.log(`  Firestore on port ${pick} (8080 is taken)`);
  return pick;
}

/* ---------- The data ---------- */

const PLANS = [
  { id: "super_monthly", name: { en: "Super monthly", ar: "سوبر شهري" }, kind: "individual", period: "month", prices: { EGP: 149, USD: 4.99 }, credits: 300, active: true },
  { id: "super_yearly", name: { en: "Super yearly", ar: "سوبر سنوي" }, kind: "individual", period: "year", prices: { EGP: 1490, USD: 49 }, credits: 3600, active: true },
  { id: "super_seat", name: { en: "Super seat", ar: "مقعد سوبر" }, kind: "seat", period: "year", prices: { EGP: 600, USD: 20 }, credits: 2000, active: true },
  { id: "pack_500", name: { en: "500 credits", ar: "٥٠٠ رصيد" }, kind: "credits", period: "month", prices: { EGP: 129, USD: 2.99 }, credits: 500, active: true },
];

async function prepare() {
  Object.assign(process.env, { FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIRESTORE_EMULATOR_HOST: `127.0.0.1:${FS}`, FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199" });
  const req = createRequire(join(FUNCTIONS, "package.json"));
  const { initializeApp } = req("firebase-admin/app"), { getAuth } = req("firebase-admin/auth"), { getFirestore, FieldValue } = req("firebase-admin/firestore"), { getStorage } = req("firebase-admin/storage");
  const { claimsFor, grantPlanCredits } = await import(pathToFileURL(join(FUNCTIONS, "lib/billingCore.js")).href);
  initializeApp({ projectId: P, storageBucket: BUCKET });
  const auth = getAuth(), db = getFirestore(), bucket = getStorage().bucket();

  // Prices and the tutor: set once, so changes made in the app (/super/plans) or the emulator UI stay.
  const plans = db.doc("config/plans");
  if (!(await plans.get()).exists) {
    await plans.set({ plans: PLANS, economics: { usdPerCredit: 0.002, egpPerUsd: 50 }, rev: 1, updatedBy: "npm run local" });
    await bucket.file("content/plans.json").save(JSON.stringify({ version: 1, plans: PLANS }), { resumable: false, contentType: "application/json; charset=utf-8", metadata: { cacheControl: "public, max-age=60" } });
    console.log("  sample plans saved (change them on /super/plans)");
  }
  const tutor = db.doc("config/tutor");
  if (!(await tutor.get()).exists) {
    await tutor.set({ backend: "vertex", vertexProject: "darsi-f0685", engine: "direct", on: true });
    console.log("  the tutor: Vertex AI in darsi-f0685, answering directly (config/tutor)");
  }

  // Your account, as Google sign-in would create it, so the emulator's account picker lists it.
  let user = await auth.getUserByEmail(email).catch(() => null);
  if (!user) {
    const uid = `local-${createHash("sha256").update(email).digest("hex").slice(0, 20)}`, name = email.split("@")[0];
    const r = await auth.importUsers([{ uid, email, emailVerified: true, displayName: name, providerData: [{ uid: createHash("sha256").update(`google:${email}`).digest("hex").slice(0, 21), email, displayName: name, providerId: "google.com" }] }]);
    if (r.failureCount) throw r.errors[0].error;
    user = await auth.getUser(uid);
  }
  const until = Date.now() + 365 * 864e5, profile = db.doc(`users/${user.uid}`);
  // Claims first: the subscription's trigger re-reads the role from them.
  await auth.setCustomUserClaims(user.uid, claimsFor("superadmin", null, { plan: "super_yearly", until, source: "subscription" }));
  await db.doc(`subscriptions/${user.uid}`).set({ plan: "super_yearly", status: "active", source: "grant", currentPeriodEnd: until, updatedAt: FieldValue.serverTimestamp() });
  const credits = db.doc(`credits/${user.uid}`);
  if (!((await credits.get()).get("planUntil") > Date.now())) await credits.set(grantPlanCredits(undefined, 3600, until));
  await profile.set({ ...((await profile.get()).exists ? {} : { name: user.displayName ?? email, email, lang: "en", createdAt: FieldValue.serverTimestamp() }),
    role: "superadmin", orgId: null, plan: "super_yearly", planUntil: until, planSource: "subscription", claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  console.log(`  ${email}: platform admin, Darsi Super for a year`);

  const [catalog] = await bucket.file("content/catalog.json").exists();
  return { seeded: catalog };
}

/* ---------- Start ---------- */

const env = java();
const FS = await emulatorConfig();
const secrets = localSettings();
if (args.includes("--fresh")) rmSync(DATA, { recursive: true, force: true });
if (!existsSync(join(FUNCTIONS, "node_modules"))) { step("Installing the functions' packages"); await done(run("npm", ["ci", "--prefix", "functions"])); }
step("Building the functions");
await done(run("npm", ["run", "build", "--prefix", "functions"]));

step("Starting the emulators");
const emu = run("npx", ["firebase", "emulators:start", "--config", "firebase.local.json", "--project", P, "--only", "auth,firestore,functions,storage", ...(existsSync(DATA) ? ["--import", ".emulator-data"] : []), "--export-on-exit", ".emulator-data"],
  { env, quiet: true, log: (t) => { emuLog.push(t); emuLog.splice(0, emuLog.length - 40); } });
children.push(emu);
emu.on("exit", (code) => {
  if (!stopping && code) console.log(`\nThe emulators stopped (exit ${code}). Their last output:\n${emuLog.join("").replace(/^/gm, "  ")}`);
  else console.log("\nThe emulators stopped.");
  shutdown();
});
await until("The emulators", async () => (await fetch(`${FN}/tutorStatus`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{\"data\":{}}" })).status === 401);

step("Preparing the data");
const { seeded } = await prepare();
if (!seeded) {
  step("Publishing the starting courses (first run only; a few minutes)");
  await done(run("node", ["scripts/seed-content.mjs", "--emulator"]));
}

step("Starting the payment stand-in and the tutor's voice relay");
const { paymobHmac } = await import(pathToFileURL(join(FUNCTIONS, "lib/paymentsCore.js")).href);
payments = await startPayments({ secrets, functionsUrl: FN, paymobHmac });
children.push(run("node", ["functions/lib/relay.js"], {
  quiet: true, log: (t) => process.stdout.write(t.replace(/^/gm, "  relay: ")),
  env: { ...process.env, PORT: "8091", GCLOUD_PROJECT: P, FUNCTIONS_EMULATOR: "true", TUTOR_ORIGINS: WEB, GEMINI_API_KEY: "unset",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIRESTORE_EMULATOR_HOST: `127.0.0.1:${FS}`, FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199" },
}));

// Every VITE_ setting is given here, so apps/web/.env.local (the live project) never reaches this build.
const viteEnv = { ...process.env, VITE_FIREBASE_API_KEY: "demo-local", VITE_FIREBASE_AUTH_DOMAIN: `${P}.firebaseapp.com`, VITE_FIREBASE_PROJECT_ID: P, VITE_FIREBASE_STORAGE_BUCKET: BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000", VITE_FIREBASE_APP_ID: "1:000000000000:web:local", VITE_FIREBASE_MEASUREMENT_ID: "", VITE_FUNCTIONS_REGION: REGION,
  VITE_USE_EMULATORS: "true", VITE_FIRESTORE_EMULATOR_PORT: String(FS), VITE_FIREBASE_VAPID_KEY: "", VITE_TUTOR_RELAY: "ws://localhost:8091/live" };
const web = join(ROOT, "apps/web");
// The build knows the Firestore port, so --no-build reuses it only when the port is the same.
const built = join(web, "dist-local/local-port.txt");
if (!args.includes("--no-build") || !existsSync(built) || readFileSync(built, "utf8") !== String(FS)) {
  step("Building the app (apps/web/dist-local)");
  await done(run("npx", ["vite", "build", "--outDir", "dist-local", "--emptyOutDir"], { cwd: web, env: viteEnv }));
  writeFileSync(built, String(FS));
}
step("Serving the app");
children.push(run("npx", ["vite", "preview", "--outDir", "dist-local", "--port", "4173", "--strictPort"], { cwd: web, env: viteEnv, quiet: true, log: () => {} }));
await until("The app", async () => (await fetch(WEB)).ok, 60_000);

console.log(`
Darsi is running on this computer:

  App            ${WEB}
                 Sign in with Google, then pick ${email} in the emulator's window.
                 Platform admin pages: ${WEB}/super  (Darsi Super's switch is on ${WEB}/super/plans)
  Emulator UI    http://127.0.0.1:4000  (data, accounts, logs)
  Payments       pay with the stand-in's Pay button; no money moves
  Offline        once a page has loaded, DevTools → Network → Offline (or stop this) and keep using the app

Ctrl+C stops everything and keeps the data in .emulator-data/.`);

function shutdown() {
  if (stopping) return;
  stopping = true;
  payments?.close();
  // Ctrl+C reaches the children too; the emulators save their data, then exit.
  for (const c of children) if (c !== emu && c.exitCode === null) c.kill();
  if (emu.exitCode !== null) process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", () => { shutdown(); emu.kill(); });
