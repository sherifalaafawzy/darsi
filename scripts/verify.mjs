#!/usr/bin/env node
/**
 * Every check a change must pass, in one command: `npm run verify`. CI runs it (.github/workflows/ci.yml) and so does
 * a release (scripts/deploy.mjs), so "it passed" means the same thing everywhere.
 *
 *   npm run verify                      the checks below, in order, stopping at the first that fails
 *   npm run verify -- --rules           also the security rules tests (the emulators: needs JDK 21 or newer, on PATH
 *                                       or installed in the usual folders)
 *   npm run verify -- --e2e             also the browser suite (it builds the app itself; see apps/web/playwright.config.ts)
 *   npm run verify -- --signed          also the signed-in browser suite (scripts/e2e-signed.mjs: the real functions on
 *                                       the emulators, a stand-in school provider, its own build of the app; needs
 *                                       JDK 21 or newer, as --rules does). Off unless asked for.
 *   npm run verify -- --bundle <dir>    also the startup-bundle check on an app already built into <dir>
 *
 * Without flags it needs no apps/web/.env.local, no Java and no browser: only `npm ci` and `npm ci --prefix functions`.
 * It builds the functions (functions/lib, gitignored) and never the web app.
 *
 * Two of the type-checks cover what the builds leave out: the functions' tests (functions/tsconfig.test.json), and the
 * web app's e2e suite, rules tests and tool configs (apps/web/tsconfig.tools.json). They fail the run like every other
 * step (they only reported until both were clean).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { javaEnv } from "./lib/java.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WEB = join(ROOT, "apps/web"), FUNCTIONS = join(ROOT, "functions");
const args = process.argv.slice(2);
const usage = "Usage: npm run verify -- [--rules] [--e2e] [--signed] [--bundle <built app directory>]";
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
if (flag("--help") || flag("-h")) { console.log(usage); process.exit(0); }
const rules = flag("--rules"), e2e = flag("--e2e"), signed = flag("--signed");
let bundle;
{ const i = args.indexOf("--bundle"); if (i >= 0) { bundle = args[i + 1]; if (!bundle || bundle.startsWith("--")) { console.error(`--bundle needs a directory.\n${usage}`); process.exit(2); } args.splice(i, 2); } }
if (args.length) { console.error(`Unknown argument: ${args.join(" ")}\n${usage}`); process.exit(2); }

for (const [dir, fix] of [[join(ROOT, "node_modules"), "npm ci"], [join(FUNCTIONS, "node_modules"), "npm ci --prefix functions"]]) {
  if (!existsSync(dir)) { console.error(`Packages are not installed (${dir}). Run: ${fix}`); process.exit(2); }
}

/** `env`: the environment to run in, or a sentence saying what is missing (the step then fails without running). */
const steps = [
  { name: "design system: type-check", cmd: "npm run typecheck -w @darsi/design-system" },
  // Never `tsc -b`: it writes .js files beside the sources, and Vite then builds those stale copies.
  { name: "web: type-check", cmd: "npx tsc --noEmit", cwd: WEB },
  { name: "functions: build", cmd: "npm run build --prefix functions" },
  { name: "web: unit tests", cmd: "npm run test -w @darsi/web" },
  { name: "design system: unit tests", cmd: "npm run test -w @darsi/design-system" },
  { name: "functions: unit tests", cmd: "npm test --prefix functions" },
  { name: "css rules", cmd: "npm run lint:css" },
  { name: "design system: contrast", cmd: "npm run contrast -w @darsi/design-system" },
  // What the builds and vitest leave unchecked: the functions' tests, and the web app's e2e suite, rules tests and tool configs.
  { name: "functions tests: type-check", cmd: "npx tsc --noEmit -p tsconfig.test.json", cwd: FUNCTIONS },
  { name: "web e2e, rules tests and configs: type-check", cmd: "npx tsc --noEmit -p tsconfig.tools.json", cwd: WEB },
  ...(rules ? [{ name: "security rules tests", cmd: "npm run test:rules -w @darsi/web", env: () => javaEnv() ?? "the emulators need JDK 21 or newer (https://adoptium.net); none on PATH or in the usual folders" }] : []),
  ...(e2e ? [{ name: "browser suite (e2e)", cmd: "npm run e2e" }] : []),
  // The runner finds the JDK itself too; asked here first, so a machine without one is told before anything is built.
  ...(signed ? [{ name: "signed-in browser suite (e2e, emulators)", cmd: "node scripts/e2e-signed.mjs", env: () => javaEnv() ?? "the emulators need JDK 21 or newer (https://adoptium.net); none on PATH or in the usual folders" }] : []),
  ...(bundle ? [{ name: "startup bundle", cmd: `node scripts/check-bundle.mjs "${resolve(bundle)}"` }] : []),
];

const done = [];
const secs = (ms) => `${(ms / 1000).toFixed(0)} s`;
function summary() {
  console.log("\nverify:");
  for (const d of done) console.log(`  ${d.status.padEnd(6)} ${d.name}${d.note ? `: ${d.note}` : ""} (${secs(d.ms)})`);
  for (const s of steps.slice(done.length)) console.log(`  -      ${s.name} (not run)`);
}

for (const step of steps) {
  console.log(`\n▸ ${step.name}\n  ${step.cmd}${step.cwd ? `   (in ${step.cwd})` : ""}`);
  const t = Date.now();
  const env = step.env?.();
  if (typeof env === "string") { done.push({ name: step.name, status: "FAILED", note: env, ms: 0 }); summary(); console.error(`\nverify stopped at: ${step.name}`); process.exit(1); }
  // One command line through the shell: npm and npx are .cmd files on Windows.
  const r = spawnSync(step.cmd, { cwd: step.cwd ?? ROOT, env: env ?? process.env, shell: true, stdio: "inherit" });
  const ms = Date.now() - t;
  if (r.status !== 0) {
    done.push({ name: step.name, status: "FAILED", note: r.error ? r.error.message : `exit ${r.status}`, ms });
    summary();
    console.error(`\nverify stopped at: ${step.name}`);
    process.exit(1);
  }
  done.push({ name: step.name, status: "ok", ms });
  console.log(`  ok (${secs(ms)})`);
}
summary();
console.log("\nverify passed.");
