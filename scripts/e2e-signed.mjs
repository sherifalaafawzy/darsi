#!/usr/bin/env node
/**
 * The signed-in browser suite: `npm run e2e:signed -w @darsi/web` (or `node scripts/e2e-signed.mjs`).
 *
 * The plain e2e suite (apps/web/playwright.config.ts) runs no emulators and signs nobody in. This one runs the real
 * functions against the Emulator Suite, on private ports so it never meets `npm run local` (or another checkout's
 * emulators) on 9099/8080/5001/9199:
 *
 *   Auth 9199   Firestore 8185   Functions 5101   Storage 9299   hub 4499   logging 4599   (project demo-darsi-e2e)
 *   the app (a production build pointed at the emulators) on http://localhost:4181
 *   the stand-in school provider (scripts/local/oidc.mjs) on http://127.0.0.1:4796
 *
 * It builds the functions (npm run build --prefix functions), starts the emulators from a config it writes into
 * .emulator-tmp/e2e-signed/ (gitignored; the functions' settings for this run live there too, so functions/.env.local,
 * which `npm run local` owns, is not read), seeds two organizations through the Admin SDK, turns school sign-in's
 * platform switch on through manageSso, builds the app, serves it, runs apps/web/playwright.signed.config.ts and stops
 * everything it started (and only that).
 *
 * The app's build knows only the Firestore port (VITE_FIRESTORE_EMULATOR_PORT); it looks for Auth, Functions and
 * Storage on 9099, 5001 and 9199. The tests move those requests to this run's ports in the browser (e2e/signed/fixtures.ts),
 * so nothing has to listen on the usual ports.
 *
 *   --no-build        reuse the last app build (E2E_BUILD_DIR)
 *   --keep            leave everything running after the tests, to look around or rerun one file with
 *                     `E2E_SIGNED_STATE=<run>/state.json npx playwright test -c playwright.signed.config.ts <file>`;
 *                     Ctrl+C, or a file named "stop" in the run folder, stops it
 *   --no-tests        start and seed everything, run no tests, and keep it up (as --keep)
 *   -- <args>         passed to Playwright (e.g. -- -g "school")
 *
 * Settings: E2E_BUILD_DIR (default .emulator-tmp/e2e-signed/build), E2E_RUN_DIR (default .emulator-tmp/e2e-signed),
 * CHROMIUM_PATH (as for npm run e2e). Needs JDK 21+ (scripts/lib/java.mjs finds one) and `npm ci --prefix functions`.
 *
 * functions/.secret.local: the emulator reads secrets only from the functions' own folder. If it has no SSO_KEYS (the
 * school sign-in key ring), this run adds one for its length and puts the file back as it was afterwards.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { javaEnv } from "./lib/java.mjs";
import { startOidc } from "./local/oidc.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const dash = argv.indexOf("--");
const own = dash < 0 ? argv : argv.slice(0, dash), pwArgs = dash < 0 ? [] : argv.slice(dash + 1);
const win = process.platform === "win32";

export const PORTS = { auth: 9199, firestore: 8185, functions: 5101, storage: 9299, hub: 4499, logging: 4599, eventarc: 9399, tasks: 9599, web: 4181, oidc: 4796 };
const P = "demo-darsi-e2e", BUCKET = `${P}.appspot.com`, REGION = "europe-west1";
const WEB = `http://localhost:${PORTS.web}`, FN = `http://127.0.0.1:${PORTS.functions}/${P}/${REGION}`;
const RUN = resolve(process.env.E2E_RUN_DIR || join(ROOT, ".emulator-tmp", "e2e-signed"));
const BUILD = resolve(process.env.E2E_BUILD_DIR || join(RUN, "build"));
const FUNCTIONS = join(ROOT, "functions"), WEBDIR = join(ROOT, "apps/web");
/** One password for every seeded account: a public test value for the emulators, never a real one. */
const PASSWORD = "E2e-Pass-2026!";

const children = [];
let oidc = null, secretsBackup = null, stopping = false;
const emuLog = [];
const step = (s) => console.log(`\n▸ ${s}`);

/* ---------- Helpers ---------- */

function run(cmd, list, opts = {}) {
  const c = spawn(cmd, list, { cwd: ROOT, stdio: opts.quiet ? ["ignore", "pipe", "pipe"] : "inherit", shell: win, ...opts });
  if (opts.quiet) { c.stdout.on("data", (d) => opts.log?.(String(d))); c.stderr.on("data", (d) => opts.log?.(String(d))); }
  children.push(c);
  return c;
}
const done = (c) => new Promise((ok, fail) => c.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`exit ${code}`)))));
async function until(what, test, ms = 240_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await test().catch(() => false)) return; await new Promise((r) => setTimeout(r, 1000)); }
  throw new Error(`${what} didn't start within ${ms / 1000} s`);
}
const answers = (port, host) => new Promise((ok) => { const s = connect({ port, host, timeout: 500 }, () => { s.destroy(); ok(true); }).once("error", () => ok(false)).once("timeout", () => { s.destroy(); ok(false); }); });
const free = async (port) => !(await answers(port, "127.0.0.1")) && !(await answers(port, "::1"));
/** Kills a child and everything it started (the shell, npx, the emulators' java), and nothing else. */
function killTree(c) {
  if (!c || c.exitCode !== null || !c.pid) return;
  if (win) spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
  else try { process.kill(-c.pid, "SIGTERM"); } catch { c.kill("SIGTERM"); }
}

/* ---------- The emulators' configuration ---------- */

/**
 * firebase.json for this run. Rules by absolute path (the CLI refuses a relative path that leaves the config's folder);
 * the functions' source relative to it (the functions emulator joins it to the folder, so an absolute one on another
 * drive breaks).
 */
function writeConfig() {
  mkdirSync(RUN, { recursive: true });
  const rel = (p) => relative(RUN, p).split("\\").join("/"), abs = (p) => join(ROOT, p).split("\\").join("/");
  const cfg = {
    firestore: { rules: abs("firebase/firestore.rules"), indexes: abs("firebase/firestore.indexes.json") },
    storage: { rules: abs("firebase/storage.rules") },
    // configDir: the functions read this run's .env.<project> from here, not functions/.env.local (npm run local's).
    functions: [{ source: rel(FUNCTIONS), codebase: "default", runtime: "nodejs22", configDir: "." }],
    emulators: {
      auth: { port: PORTS.auth }, firestore: { port: PORTS.firestore }, functions: { port: PORTS.functions }, storage: { port: PORTS.storage },
      hub: { port: PORTS.hub }, logging: { port: PORTS.logging }, ui: { enabled: false }, singleProjectMode: true,
      // The functions start these two by themselves; their default ports (9299 for Eventarc) would meet Storage's here.
      eventarc: { port: PORTS.eventarc }, tasks: { port: PORTS.tasks },
    },
  };
  writeFileSync(join(RUN, "firebase.json"), JSON.stringify(cfg, null, 2));
  // Every parameter the functions declare, so the CLI asks for none. Payments point at a port nothing listens on.
  writeFileSync(join(RUN, `.env.${P}`), [
    "# Written by scripts/e2e-signed.mjs for each run.",
    `SITE_URL=${WEB}`,
    `SSO_CALLBACK=${FN}/ssoCallback/callback`,
    "SSO_SERVICE_ACCOUNT=",
    "SSO_CALLBACK_MIN_INSTANCES=0",
    "PAYMOB_PUBLIC_KEY=pk_test_local", "PAYMOB_INTEGRATIONS=1", "PAYMOB_BASE=http://127.0.0.1:9", "STRIPE_BASE=http://127.0.0.1:9",
    "",
  ].join("\n"));
}

/**
 * The emulator reads secrets from functions/.secret.local only. Every secret the functions declare must be there, or
 * it asks Secret Manager for it (a network call this run must not make). Missing ones are added with test values for
 * this run; the file is put back exactly as it was when the run ends.
 */
function prepareSecrets() {
  const file = join(FUNCTIONS, ".secret.local");
  const saved = join(RUN, "secret.local.before.json");
  if (existsSync(saved)) {
    const { before: was } = JSON.parse(readFileSync(saved, "utf8"));
    if (was === null) rmSync(file, { force: true }); else writeFileSync(file, was);
    rmSync(saved, { force: true });
    console.log("  functions/.secret.local: put back as it was before an earlier run that was stopped outright");
  }
  const before = existsSync(file) ? readFileSync(file, "utf8") : null;
  const text = before ?? "";
  const need = {
    PAYMOB_SECRET_KEY: "sk_test_local", PAYMOB_HMAC_SECRET: randomBytes(16).toString("hex"), STRIPE_SECRET_KEY: "sk_test_local",
    STRIPE_WEBHOOK_SECRET: `whsec_${randomBytes(16).toString("hex")}`, GEMINI_API_KEY: "unset", GITHUB_TOKEN: "unset",
    SSO_KEYS: `'${JSON.stringify({ current: "k1", keys: { k1: randomBytes(32).toString("base64") } })}'`,
  };
  const add = Object.entries(need).filter(([k]) => !new RegExp(`^${k}=`, "m").test(text));
  if (!add.length) return;
  secretsBackup = { file, before };
  // Also on disk: a run that was killed outright (no Ctrl+C) puts the file back at the start of the next one.
  writeFileSync(join(RUN, "secret.local.before.json"), JSON.stringify({ before }));
  writeFileSync(file, `${text.replace(/\n?$/, text ? "\n" : "")}${add.map(([k, v]) => `${k}=${v}`).join("\n")}\n`);
  console.log(`  functions/.secret.local: added ${add.map(([k]) => k).join(", ")} for this run`);
}
function restoreSecrets() {
  if (!secretsBackup) return;
  const { file, before } = secretsBackup;
  secretsBackup = null;
  if (before === null) rmSync(file, { force: true }); else writeFileSync(file, before);
  rmSync(join(RUN, "secret.local.before.json"), { force: true });
}

/* ---------- The data ---------- */

const CODE_SET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => [0, 1, 2].map(() => Array.from({ length: 4 }, () => CODE_SET[randomInt(CODE_SET.length)]).join("")).join("-");

/** Two organizations, each with an admin, a teacher and students, as the functions make them (claims and profile agree). */
async function seed() {
  Object.assign(process.env, {
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${PORTS.auth}`, FIRESTORE_EMULATOR_HOST: `127.0.0.1:${PORTS.firestore}`,
    FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${PORTS.storage}`, GCLOUD_PROJECT: P,
  });
  const req = createRequire(join(FUNCTIONS, "package.json"));
  const { initializeApp } = req("firebase-admin/app"), { getAuth } = req("firebase-admin/auth"), { getFirestore, FieldValue } = req("firebase-admin/firestore");
  const app = initializeApp({ projectId: P, storageBucket: BUCKET }, "e2e-seed");
  const auth = getAuth(app), db = getFirestore(app);

  const person = async (email, name, role, orgId, extra = {}) => {
    const u = await auth.createUser({ email, password: PASSWORD, displayName: name, emailVerified: true });
    await auth.setCustomUserClaims(u.uid, { role, ...(orgId ? { orgId } : {}) });
    await db.doc(`users/${u.uid}`).set({ name, email, role, orgId, lang: "en", active: true, createdAt: FieldValue.serverTimestamp(), createdBy: "e2e-seed", ...extra });
    return { uid: u.uid, email, name, password: PASSWORD };
  };
  const boss = await person("boss@e2e.test", "Platform Boss", "superadmin", null);
  const org = async (id, name, domain) => {
    const invites = { teacher: code(), student: code() };
    await db.doc(`orgs/${id}`).set({ name, type: "school", country: "EG", city: "Cairo", status: "active", createdBy: boss.uid,
      createdAt: FieldValue.serverTimestamp(), reviewedAt: FieldValue.serverTimestamp(), memberCount: 0 });
    await db.doc(`orgs/${id}/private/invites`).set(invites);
    await db.doc(`inviteCodes/${invites.teacher}`).set({ orgId: id, role: "teacher" });
    await db.doc(`inviteCodes/${invites.student}`).set({ orgId: id, role: "student" });
    const admin = await person(`admin@${domain}`, `${name} Admin`, "orgAdmin", id);
    const teacher = await person(`teacher@${domain}`, `${name} Teacher`, "teacher", id);
    const students = [];
    for (const [i, n] of ["Salma Adel", "Youssef Kamal"].entries()) students.push(await person(`student${i + 1}@${domain}`, n, "student", id, { teacherId: teacher.uid, group: "5B" }));
    await db.doc(`orgs/${id}`).update({ memberCount: 2 + students.length });
    return { id, name, invites, admin, teacher, students };
  };
  const org1 = await org("e2eNile", "Nile E2E School", "nile.e2e.test");
  const org2 = await org("e2eDelta", "Delta E2E Academy", "delta.e2e.test");

  // School sign-in's platform switch, as a platform admin turns it on (/super/plans): manageSso writes the setting and
  // republishes content/settings.json, which the app reads.
  const tok = await fetch(`http://127.0.0.1:${PORTS.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: boss.email, password: PASSWORD, returnSecureToken: true }),
  }).then((r) => r.json());
  const sw = await fetch(`${FN}/manageSso`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok.idToken}` }, body: JSON.stringify({ data: { action: "setSwitch", on: true } }) });
  if (!sw.ok) throw new Error(`manageSso setSwitch: ${sw.status} ${await sw.text()}`);
  return { boss, orgs: { org1, org2 } };
}

/* ---------- Start ---------- */

async function main() {
  const env = javaEnv();
  if (!env) { console.error("The emulators need JDK 21 or newer (https://adoptium.net)."); process.exit(1); }
  for (const [what, p] of Object.entries(PORTS)) if (!(await free(p))) { console.error(`Port ${p} (${what}) is taken. Stop whatever uses it and try again.`); process.exit(1); }
  // A private temp folder: the Storage emulator keeps its files in <temp>/firebase/storage, which another emulator wipes.
  const tmp = join(RUN, "tmp"); mkdirSync(tmp, { recursive: true });
  env.TEMP = env.TMP = env.TMPDIR = tmp;
  writeConfig();
  prepareSecrets();

  step("Building the functions");
  await done(run("npm", ["run", "build", "--prefix", "functions"]));

  step("Starting the emulators (private ports)");
  const emu = run("npx", ["firebase", "emulators:start", "--config", join(RUN, "firebase.json"), "--project", P, "--only", "auth,firestore,functions,storage"],
    { env, quiet: true, log: (t) => { emuLog.push(t); emuLog.splice(0, emuLog.length - 60); if (process.env.E2E_VERBOSE) process.stdout.write(t); } });
  emu.on("exit", (c) => { if (!stopping) { console.log(`\nThe emulators stopped (exit ${c}). Their last output:\n${emuLog.join("")}`); shutdown(1); } });
  await until("The emulators", async () => (await fetch(`${FN}/tutorStatus`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{\"data\":{}}" })).status === 401);

  step("Seeding two organizations");
  const data = await seed();
  oidc = await startOidc({ port: PORTS.oidc });
  const state = { web: WEB, fn: FN, project: P, ports: PORTS, password: PASSWORD, oidc: { issuer: oidc.issuer, clientId: oidc.clientId, clientSecret: oidc.clientSecret, domain: "school.test" }, ...data };
  const stateFile = join(RUN, "state.json");
  writeFileSync(stateFile, JSON.stringify(state, null, 2));

  // Every VITE_ setting is given here, so apps/web/.env.local (the live project) never reaches this build.
  const viteEnv = { ...process.env, VITE_FIREBASE_API_KEY: "demo-local", VITE_FIREBASE_AUTH_DOMAIN: `${P}.firebaseapp.com`, VITE_FIREBASE_PROJECT_ID: P,
    VITE_FIREBASE_STORAGE_BUCKET: BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000", VITE_FIREBASE_APP_ID: "1:000000000000:web:e2e",
    VITE_FIREBASE_MEASUREMENT_ID: "", VITE_FUNCTIONS_REGION: REGION, VITE_USE_EMULATORS: "true", VITE_FIRESTORE_EMULATOR_PORT: String(PORTS.firestore),
    VITE_FIREBASE_VAPID_KEY: "", VITE_TUTOR_RELAY: "ws://localhost:9/live", DARSI_LOCAL_BUILD: "1" };
  if (!own.includes("--no-build") || !existsSync(join(BUILD, "index.html"))) {
    step(`Building the app (${BUILD})`);
    await done(run("npx", ["vite", "build", "--outDir", BUILD, "--emptyOutDir"], { cwd: WEBDIR, env: viteEnv }));
  }
  step("Serving the app");
  run("npx", ["vite", "preview", "--outDir", BUILD, "--port", String(PORTS.web), "--strictPort"], { cwd: WEBDIR, env: viteEnv, quiet: true, log: () => {} });
  await until("The app", async () => (await fetch(WEB)).ok, 60_000);

  if (own.includes("--no-tests")) return keep(stateFile, 0);
  step("Running the signed-in suite");
  const pw = run("npx", ["playwright", "test", "-c", "playwright.signed.config.ts", ...pwArgs], { cwd: WEBDIR, env: { ...process.env, E2E_SIGNED_STATE: stateFile } });
  const code = await new Promise((ok) => pw.on("exit", (c) => ok(c ?? 1)));
  if (own.includes("--keep")) return keep(stateFile, code);
  shutdown(code);
}

/** --keep and --no-tests: everything stays up until Ctrl+C, or a file named "stop" in the run folder (for a run started
 * in the background, which no Ctrl+C reaches). */
function keep(stateFile, code) {
  const stop = join(RUN, "stop");
  rmSync(stop, { force: true });
  console.log(`\nStill running: ${WEB}, E2E_SIGNED_STATE=${stateFile}. Ctrl+C, or creating ${stop}, stops everything.`);
  const t = setInterval(() => { if (existsSync(stop)) { clearInterval(t); rmSync(stop, { force: true }); shutdown(code); } }, 1000);
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  oidc?.close();
  for (const c of children.reverse()) killTree(c);
  restoreSecrets();
  process.exitCode = code;
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
main().catch((e) => { console.error(e); shutdown(1); });
