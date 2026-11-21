#!/usr/bin/env node
/**
 * A release, tied to a commit: `npm run deploy -- <targets> [--yes]`.
 *
 *   npm run deploy -- hosting                       check everything, build, and print the command; deploy nothing
 *   npm run deploy -- hosting --yes                 the same, then run it
 *   npm run deploy -- functions hosting firestore storage --yes
 *   npm run deploy -- functions:tutorAsk,functions:tutorStatus --yes
 *
 * Targets: hosting (both sites: the app, and login.darsiai.org for school sign-in), functions (or functions:<name>),
 * firestore (or firestore:rules, firestore:indexes), storage.
 * Options: --yes (run the commands), --e2e (also the browser suite), --rules (also the rules tests; on by itself when
 * rules go out), --skip-rules-tests (when rules go out from a machine with no JDK 21: say so in the release notes).
 *
 * What it does, in order:
 *  1. Refuses a tree with anything uncommitted or untracked (`git status --porcelain`): what goes out is a commit.
 *     Refuses a missing apps/web/.env.local (for hosting) or functions/.env.<project> (for functions).
 *  2. Runs every check (scripts/verify.mjs), which also builds the functions.
 *  3. For hosting: builds the app with DARSI_BUILD=<short commit>-<yyyymmdd> (apps/web/vite.config.ts stamps it in),
 *     checks the startup bundle against its budget (scripts/check-bundle.mjs), and refuses a build whose startup files
 *     do not hold the project id from .firebaserc (a build made with the emulators' or another project's settings).
 *  4. Refuses if any of that changed a tracked file (a generated copy that was not committed).
 *  5. Prints the exact `firebase deploy` commands, one per step, in the order indexes, functions, hosting, rules
 *     (scripts/lib/release.mjs says why). Without --yes it stops here.
 *  6. With --yes runs them, stopping at the first that fails. They use firebase.deploy.json (written here, gitignored):
 *     firebase.json without its rebuild hooks, so what goes out is the build that was just checked.
 *     A functions step in which the CLI left a function out (a trigger whose event type changed, when it can't ask)
 *     counts as failed although the CLI exits 0, and a step it refused for a new failure policy says which functions:
 *     either way the script prints the by-hand command for exactly those triggers (it never passes --force itself).
 *  7. When all went out: tags the commit live-YYYYMMDD-n (not pushed) and writes apps/web/dist/release.json
 *     {commit, build, at, targets, tag, project}. The day is UTC's, in the tag and in the build stamp.
 *
 * It never pushes, never seeds content, and does not deploy the tutor's voice relay or agent (docs/OPERATIONS.md).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStamp, deployConfig, firebaseCommand, forceCommand, hasHosting, hasRules, hostingTargets, isFunctionsStep, parseArgs, plan, refusals, tagName, unforced } from "./lib/release.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const USAGE = `Usage: npm run deploy -- <targets> [--yes] [--e2e] [--rules | --skip-rules-tests]
  targets: hosting, functions, functions:<name>, firestore, firestore:rules, firestore:indexes, storage
  Without --yes nothing is deployed: it checks, builds and prints the commands.`;
const CONFIG = "firebase.deploy.json";

const args = parseArgs(process.argv.slice(2));
if (args.error) { console.error(`${args.error}.\n${USAGE}`); process.exit(2); }
const { targets } = args;

const step = (s) => console.log(`\n▸ ${s}`);
// trimEnd only: `git status --porcelain` lines begin with a space when the change is not staged.
const tryGit = (...a) => { const r = spawnSync("git", a, { cwd: ROOT, encoding: "utf8" }); return { ok: r.status === 0, out: (r.stdout ?? "").trimEnd(), err: (r.stderr || r.error?.message || "").trim() }; };
/** Before anything goes out: a git command that fails stops the release. */
const git = (...a) => { const r = tryGit(...a); if (!r.ok) refuse([`git ${a.join(" ")} failed: ${r.err}`]); return r.out; };
/** One command line through the shell (npm and npx are .cmd files on Windows), output shown as it comes. */
const run = (cmd, env = process.env) => spawnSync(cmd, { cwd: ROOT, env, shell: true, stdio: "inherit" }).status === 0;
/**
 * The same, for a deploy step: the output is shown as it comes and also kept, because the Firebase CLI can leave a
 * function out, say so in one warning line and still exit 0 (lib/release.mjs unforced). stdin stays the terminal's,
 * so the CLI still asks its questions when a person runs the release.
 */
const runShown = (cmd) => new Promise((done) => {
  let out = "";
  const child = spawn(cmd, { cwd: ROOT, shell: true, stdio: ["inherit", "pipe", "pipe"] });
  child.stdout.on("data", (b) => { out += b; process.stdout.write(b); });
  child.stderr.on("data", (b) => { out += b; process.stderr.write(b); });
  child.on("error", (e) => done({ ok: false, out: `${out}\n${e.message}` }));
  child.on("close", (code) => done({ ok: code === 0, out }));
});
function refuse(reasons) {
  console.error(`\nNot releasing:\n${reasons.map((r) => `  - ${r}`).join("\n")}`);
  process.exit(1);
}

/* ---------- 1. What must be true before anything runs ---------- */

const rc = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8"));
const project = rc.projects?.default;
if (!project) refuse([".firebaserc names no default project"]);
// Two Hosting sites since school sign-in: the app ("app", darsiai.org) and its callback ("login", login.darsiai.org).
// `--only hosting` deploys both, so both must be mapped for the project in .firebaserc.
const hosting = hostingTargets(JSON.parse(readFileSync(join(ROOT, "firebase.json"), "utf8")), rc, project);
const dirty = () => git("status", "--porcelain").split("\n").filter(Boolean);
// The reasons are decided in scripts/lib/release.mjs (refusals), where a test holds them in place.
const reasons = refusals({ changed: dirty(), targets, project, exists: (p) => existsSync(join(ROOT, p)), hosting });
if (reasons.length) refuse(reasons);

const commit = git("rev-parse", "HEAD"), short = git("rev-parse", "--short=8", "HEAD"), branch = git("rev-parse", "--abbrev-ref", "HEAD");
const now = new Date(), build = buildStamp(short, now);
const steps = plan(targets);
console.log(`Release of ${short} (${branch}) to ${project}: ${steps.join(" → ")}\nBuild stamp: ${build}`);
if (!git("branch", "-r", "--contains", "HEAD")) console.log("Note: this commit is on no remote branch yet. Push it, so the release can be found again.");

/* ---------- 2. Every check ---------- */

const rulesTests = args.rules || (hasRules(targets) && !args.skipRulesTests);
if (hasRules(targets) && !rulesTests) console.log("Note: rules are going out without their tests (--skip-rules-tests).");
step("Checking (npm run verify)");
if (!run(`node scripts/verify.mjs${rulesTests ? " --rules" : ""}${args.e2e ? " --e2e" : ""}`)) refuse(["the checks did not pass (above)"]);

/* ---------- 3. The app, built from this commit ---------- */

if (hasHosting(targets)) {
  step(`Building the app (DARSI_BUILD=${build})`);
  // DARSI_LOCAL_BUILD lets an emulator build past the production-settings check (scripts/local.mjs): never here.
  const env = { ...process.env, DARSI_BUILD: build };
  delete env.DARSI_LOCAL_BUILD;
  if (!run("npm run build", env)) refuse(["the build failed (above)"]);
  step("Checking the startup bundle");
  if (!run(`node scripts/check-bundle.mjs apps/web/dist --has ${project}`)) refuse(["the built app did not pass the bundle check (above)"]);
}

/* ---------- 4. Still the commit? ---------- */

const after = dirty();
if (after.length) refuse([`checking and building changed tracked files; commit them and release that commit:\n${after.slice(0, 10).map((l) => `      ${l}`).join("\n")}`]);

if (git("rev-parse", "HEAD") !== commit) refuse([`the checkout moved to another commit while this ran (it started at ${short}); start again`]);

/* ---------- 5. The commands ---------- */

const commands = steps.map((only) => firebaseCommand(only, project, CONFIG));
console.log(`\n${args.yes ? "Deploying" : "This would run"}, in this order:\n${commands.map((c) => `  ${c}`).join("\n")}`);
if (!args.yes) {
  console.log("\nNothing was deployed. Run the same command with --yes to release.");
  process.exit(0);
}

/* ---------- 6. Out ---------- */

// Beside firebase.json, so its paths still resolve; gitignored, and removed again below.
writeFileSync(join(ROOT, CONFIG), `${JSON.stringify(deployConfig(JSON.parse(readFileSync(join(ROOT, "firebase.json"), "utf8"))), null, 2)}\n`);
const went = [];
let failed = "", why = "";
try {
  for (const [i, cmd] of commands.entries()) {
    step(cmd);
    const r = await runShown(cmd);
    // What the CLI would only do with --force (lib/release.mjs unforced): a trigger it skipped is still on the previous
    // code, so the step did not go out whatever its exit code says, and nothing after it (the app, the rules) may.
    const held = isFunctionsStep(steps[i]) ? unforced(r.out) : { skipped: false, refused: false, names: [] };
    if (!r.ok || held.skipped) {
      failed = steps[i];
      if (held.skipped) why = `The Firebase CLI left ${held.names.join(", ") || "a function"} out of this step (its event type changed, and the CLI could not ask or was answered no): ${r.ok ? "the other functions went out, that one is still on the previous code" : "and the step failed"}.`;
      else if (held.refused) why = `The Firebase CLI refused the whole step: ${held.names.join(", ") || "a trigger"} newly has a failure policy (it is retried), and the CLI could not ask. No function went out.`;
      const by = forceCommand(held.names, project);
      if (why) why += by
        ? `\n  Deploy ${held.names.length === 1 ? "it" : "them"} by hand from this commit, then run the release again:\n    ${by}`
        : "\n  Deploy the functions it names by hand with --force (only those: --only functions:<name>), then run the release again.";
      break;
    }
    went.push(steps[i]);
  }
} finally { rmSync(join(ROOT, CONFIG), { force: true }); }
if (failed) {
  console.error(`\nThe release stopped at: ${failed}\n  Went out: ${went.join(", ") || "nothing"}\n  Did not: ${steps.slice(went.length).join(", ")}${why ? `\n${why}` : ""}\nNo tag was made. Fix the cause and release the rest (docs/OPERATIONS.md, "When a release stops halfway").`);
  process.exit(1);
}

/* ---------- 7. The record ---------- */

// From here on everything is out: nothing below may stop the script before it has said so.
const tag = tagName(now, tryGit("tag", "--list", "live-*").out.split("\n").filter(Boolean));
// `at` is when it finished going out; `now` (the start, minutes earlier) dates the build stamp and the tag.
const record = { commit, build, at: new Date().toISOString(), targets: steps, tag, project };
mkdirSync(join(ROOT, "apps/web/dist"), { recursive: true });
writeFileSync(join(ROOT, "apps/web/dist/release.json"), `${JSON.stringify(record, null, 2)}\n`);
const tagged = tryGit("tag", "-a", tag, "-m", `Live on ${project}: ${steps.join(", ")} (build ${build})`, commit);
console.log(`\nReleased ${short} to ${project}: ${steps.join(", ")}.`);
if (tagged.ok) console.log(`Tagged ${tag} (not pushed: git push origin ${tag}).`);
else console.log(`The tag could not be made (${tagged.err}). Make it by hand: git tag -a ${tag} -m "Live on ${project}: ${steps.join(", ")}" ${short}`);
console.log("Record: apps/web/dist/release.json. Now check the live site (docs/OPERATIONS.md, \"After a release\").");
