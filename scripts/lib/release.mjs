/**
 * The parts of scripts/deploy.mjs that decide things and touch nothing, so they can be tested
 * (apps/web/tests/release.test.ts): reading the arguments, the order things go out in, the tag's name.
 */

/** What `npm run deploy -- …` accepts. `firestore` is its rules and its indexes; `functions:a,functions:b` names single functions. */
const TARGET = /^(?:hosting|storage|firestore|firestore:rules|firestore:indexes|functions|functions:[A-Za-z][\w-]*)$/;

/**
 * The command line: targets (separated by spaces or commas), --yes, the verify flags it passes on (--rules, --e2e),
 * and --skip-rules-tests. Returns { error } for anything it does not know: a release never guesses.
 */
export function parseArgs(argv) {
  const targets = [], flags = new Set();
  for (const a of argv) {
    if (a.startsWith("--")) {
      if (!["--yes", "--rules", "--e2e", "--skip-rules-tests"].includes(a)) return { error: `Unknown option ${a}` };
      flags.add(a);
    } else for (const t of a.split(",").filter(Boolean)) {
      if (!TARGET.test(t)) return { error: `Unknown target "${t}"` };
      if (!targets.includes(t)) targets.push(t);
    }
  }
  if (!targets.length) return { error: "Nothing to deploy" };
  if (targets.includes("functions") && targets.some((t) => t.startsWith("functions:"))) return { error: 'Give "functions" (all of them) or single functions, not both' };
  if (flags.has("--rules") && flags.has("--skip-rules-tests")) return { error: "--rules and --skip-rules-tests contradict each other" };
  return { targets, yes: flags.has("--yes"), rules: flags.has("--rules"), e2e: flags.has("--e2e"), skipRulesTests: flags.has("--skip-rules-tests") };
}

export const hasHosting = (targets) => targets.includes("hosting");
export const hasFunctions = (targets) => targets.some((t) => t === "functions" || t.startsWith("functions:"));
export const hasRules = (targets) => targets.some((t) => t === "firestore" || t === "firestore:rules" || t === "storage");

/**
 * Why a release may not start, or [] when it may. Checked before anything runs (scripts/deploy.mjs):
 * - `changed`: the lines of `git status --porcelain`. Any line refuses: what goes out is a commit, never a working tree.
 * - the settings files a target is built or deployed with (`exists` answers for a path from the repository's root).
 * - `hosting`: firebase.json's Hosting sites by target ("app", and "login" for school sign-in's callback) and the ones
 *   .firebaserc maps for this project. `--only hosting` deploys every site, and the CLI stops halfway on one it can't map.
 */
export function refusals({ changed, targets, project, exists, hosting }) {
  const reasons = [];
  if (changed.length) reasons.push(`the tree has ${changed.length} uncommitted or untracked ${changed.length === 1 ? "entry" : "entries"} (git status): commit or remove them first. A release is a commit.\n${changed.slice(0, 10).map((l) => `      ${l}`).join("\n")}${changed.length > 10 ? `\n      … and ${changed.length - 10} more` : ""}`);
  if (hasHosting(targets) && !exists("apps/web/.env.local")) reasons.push("apps/web/.env.local is missing: the app would be built without the live project's settings (apps/web/.env.example)");
  if (hasFunctions(targets) && !exists(`functions/.env.${project}`)) reasons.push(`functions/.env.${project} is missing: the functions' settings for the live project (functions/.env.example)`);
  const unmapped = hasHosting(targets) && hosting ? hosting.sites.filter((t) => !hosting.mapped.includes(t)) : [];
  if (unmapped.length) reasons.push(`.firebaserc maps no Hosting site to ${unmapped.map((t) => `"${t}"`).join(" and ")} for ${project}: add it under targets.${project}.hosting (docs/FIREBASE.md, school sign-in)`);
  return reasons;
}

/**
 * firebase.json's Hosting sites by their target (an array since school sign-in: "app" and "login"; one object before),
 * and the targets .firebaserc maps for the project.
 */
export function hostingTargets(firebaseJson, firebaserc, project) {
  const sites = [].concat(firebaseJson?.hosting ?? []).map((h) => h?.target).filter((t) => typeof t === "string");
  return { sites, mapped: Object.keys(firebaserc?.targets?.[project]?.hosting ?? {}) };
}

/**
 * The `--only` value of each `firebase deploy`, in the order they run. One command would let the CLI pick its own order
 * (rules first); a release wants:
 *   1. indexes   they take minutes to build and adding one breaks nothing, so they start first;
 *   2. functions the server learns the new calls while the old app is still the one in use;
 *   3. hosting   the new app, which phones take at their next update;
 *   4. rules     last, so a rule the new app needs to be tighter never locks out the server or the app before them.
 * Rules must still let the previous app work: phones keep it until they update (docs/OPERATIONS.md).
 */
export function plan(targets) {
  const has = (t) => targets.includes(t);
  const fns = targets.filter((t) => t === "functions" || t.startsWith("functions:"));
  const rules = [...(has("firestore") || has("firestore:rules") ? ["firestore:rules"] : []), ...(has("storage") ? ["storage"] : [])];
  return [
    ...(has("firestore") || has("firestore:indexes") ? ["firestore:indexes"] : []),
    ...(fns.length ? [fns.join(",")] : []),
    ...(has("hosting") ? ["hosting"] : []),
    ...(rules.length ? [rules.join(",")] : []),
  ];
}

/** The exact command for one step. `config` is the copy of firebase.json without its rebuild hooks (deployConfig). */
export const firebaseCommand = (only, project, config) => `npx firebase deploy --only ${only} --project ${project} --config ${config}`;

/** Whether a step deploys functions (all of them, or named ones). */
export const isFunctionsStep = (only) => only.split(",").some((t) => t === "functions" || t.startsWith("functions:"));

const plainText = (s) => String(s ?? "").replace(/\u001b\[[0-9;]*m/g, "");
/** "a(europe-west1), b(europe-west1)" → ["a", "b"] */
const labels = (list) => (list ?? "").split(",").map((s) => s.trim().replace(/\(.*$/, "")).filter((s) => /^[A-Za-z][\w-]*$/.test(s));

/**
 * What the Firebase CLI said it would not do without `--force`, read from a functions step's output. A release can't be
 * asked questions (the CLI is non-interactive whenever stdin is no terminal, or it finds an agent session), and it then:
 * - `refused`: stops the whole step before any function goes out when an event trigger newly gets a failure policy
 *   ("Pass the --force option to deploy functions with a failure policy"); the step fails, so this only explains it;
 * - `skipped`: leaves out a trigger whose event type changed with ONE warning line and still exits 0. That function is
 *   then on the previous code while everything else is new, so scripts/deploy.mjs counts the step as failed.
 * Run by a person at a terminal the CLI asks instead, once per such trigger ("Would you like to proceed with the unsafe
 * migration?"), and a No leaves that trigger out with no further line and exit code 0. So the skip sentence alone is
 * not the test: every trigger the CLI listed as unsafely changing must also have gone out, which it says with
 * "functions[<name>(<region>)] Successful update operation." (release/fabricator.js). One it listed and did not report
 * as updated is `skipped` too, whoever or whatever said no.
 * `names`: the functions the CLI named for either (it checks failure policies first, so a refused step has not yet
 * said which triggers it would skip). The release never passes `--force` itself (on a whole deploy it also deletes
 * functions that are not in the source, and it must never reach the indexes): the named triggers go out by hand first,
 * with `forceCommand`.
 * The CLI's wording is checked against the installed version by apps/web/tests/release.test.ts: an upgrade that
 * rewords any of it fails there, rather than leave this reading nothing.
 */
export function unforced(output) {
  const text = plainText(output);
  const refused = /Pass the --force option to deploy functions with a failure policy/.test(text);
  const updated = (name) => new RegExp(`functions\\[${name}\\([^)]*\\)\\]\\s+Successful update operation`).test(text);
  // labels() lets only letters, digits, "_" and "-" through, so a name is safe inside the expression above.
  const left = labels(/unsafely changing event types: (.*?)\. While automatic migration/s.exec(text)?.[1]).filter((n) => !updated(n));
  const skipped = /Skipping updates for functions that may be unsafe to update/.test(text) || left.length > 0;
  const names = [
    ...(refused ? labels(/will newly be retried in case of failure: (.*?)\. Retried executions/s.exec(text)?.[1]) : []),
    ...left,
  ];
  return { skipped, refused, names: [...new Set(names)] };
}

/**
 * The by-hand command for the triggers a release was refused: only the named functions, so `--force` confirms their
 * new failure policy or event type and deletes nothing. It uses firebase.json, whose predeploy builds and tests the
 * functions: run it from the commit being released. "" when no function was named.
 */
export const forceCommand = (names, project) =>
  names.length ? `npx firebase deploy --only ${[...new Set(names)].map((n) => `functions:${n}`).join(",")} --project ${project} --force` : "";

/**
 * firebase.json without the `predeploy` hooks. The release has already built the functions and the app from the commit
 * it checked; the hooks would build them a second time, and what goes out must be the build that was checked.
 */
export function deployConfig(firebaseJson) {
  const strip = (x) => { if (!x || typeof x !== "object") return x; const { predeploy: _drop, ...rest } = x; return rest; };
  const cfg = { ...firebaseJson };
  for (const key of ["hosting", "functions"]) if (cfg[key]) cfg[key] = Array.isArray(cfg[key]) ? cfg[key].map(strip) : strip(cfg[key]);
  return cfg;
}

/** yyyymmdd in UTC, the day apps/web/vite.config.ts stamps a build with when nobody gives it one (buildStamp there). */
export const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
/** DARSI_BUILD, which apps/web/vite.config.ts stamps into the app: the commit and the day it was built. */
export const buildStamp = (shortCommit, d) => `${shortCommit}-${ymd(d)}`;

/** live-YYYYMMDD-n: the next free number for that day, given the tags that exist. */
export function tagName(d, existing) {
  const prefix = `live-${ymd(d)}-`;
  const taken = existing.filter((t) => t.startsWith(prefix)).map((t) => Number(t.slice(prefix.length))).filter(Number.isInteger);
  return `${prefix}${Math.max(0, ...taken) + 1}`;
}
