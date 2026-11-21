// @vitest-environment node
// The deciding parts of a release (scripts/deploy.mjs, scripts/lib/release.mjs): what the command line may say, the
// order things go out in, the config that goes to the Firebase CLI, and the tag. Nothing here deploys.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildStamp, deployConfig, firebaseCommand, forceCommand, hasFunctions, hasHosting, hasRules, hostingTargets, isFunctionsStep, parseArgs, plan, refusals, tagName, unforced } from "../../../scripts/lib/release.mjs";

const ok = (argv: string[]) => { const p = parseArgs(argv); if (p.error !== undefined) throw new Error(p.error); return p; };
const repo = (path: string) => readFileSync(join(__dirname, "../../..", path), "utf8");

describe("what a release refuses before anything runs", () => {
  const all = () => true;
  const without = (...missing: string[]) => (p: string) => !missing.includes(p);
  it("lets a clean tree with its settings files through", () => {
    expect(refusals({ changed: [], targets: ["hosting", "functions", "firestore", "storage"], project: "darsi-test-1", exists: all })).toEqual([]);
  });
  it("refuses a tree with anything uncommitted or untracked, and shows what", () => {
    const one = refusals({ changed: [" M scripts/verify.mjs"], targets: ["hosting"], project: "darsi-test-1", exists: all });
    expect(one).toHaveLength(1);
    expect(one[0]).toMatch(/^the tree has 1 uncommitted or untracked entry /);
    expect(one[0]).toContain("       M scripts/verify.mjs");
    // Untracked files count too, whatever the target: rules and indexes are read from the tree as well.
    const many = refusals({ changed: Array.from({ length: 12 }, (_, i) => `?? note-${i}.txt`), targets: ["firestore:indexes"], project: "darsi-test-1", exists: all });
    expect(many[0]).toMatch(/^the tree has 12 uncommitted or untracked entries /);
    expect(many[0]).toContain("?? note-9.txt");
    expect(many[0]).not.toContain("?? note-10.txt");
    expect(many[0]).toContain("… and 2 more");
  });
  it("wants the settings each target is built or deployed with, and only those", () => {
    const missing = without("apps/web/.env.local", "functions/.env.darsi-test-1");
    expect(refusals({ changed: [], targets: ["hosting"], project: "darsi-test-1", exists: missing })).toEqual([expect.stringMatching(/^apps\/web\/\.env\.local is missing/)]);
    expect(refusals({ changed: [], targets: ["functions:collect"], project: "darsi-test-1", exists: missing })).toEqual([expect.stringMatching(/^functions\/\.env\.darsi-test-1 is missing/)]);
    expect(refusals({ changed: [], targets: ["hosting", "functions"], project: "darsi-test-1", exists: missing })).toHaveLength(2);
    expect(refusals({ changed: [], targets: ["firestore", "storage"], project: "darsi-test-1", exists: missing })).toEqual([]);
    // Another project's settings file is not this project's.
    expect(refusals({ changed: [], targets: ["functions"], project: "darsi-test-1", exists: without("functions/.env.darsi-test-1") })).toHaveLength(1);
  });
  it("wants every Hosting site mapped for the project when hosting goes out (the app and school sign-in's login site)", () => {
    const real = hostingTargets(JSON.parse(repo("firebase.json")), JSON.parse(repo(".firebaserc")), "darsi-f0685");
    expect(real).toEqual({ sites: ["app", "login"], mapped: ["app", "login"] });
    const half = { sites: ["app", "login"], mapped: ["app"] };
    expect(refusals({ changed: [], targets: ["hosting"], project: "darsi-test-1", exists: all, hosting: half })).toEqual([expect.stringMatching(/^\.firebaserc maps no Hosting site to "login" for darsi-test-1/)]);
    expect(refusals({ changed: [], targets: ["functions"], project: "darsi-test-1", exists: all, hosting: half })).toEqual([]);
    // The single-site shape from before still reads (no targets: nothing to map).
    expect(hostingTargets({ hosting: { public: "dist" } }, {}, "p")).toEqual({ sites: [], mapped: [] });
    expect(repo("scripts/deploy.mjs")).toContain("hosting });");
  });
  it("is asked by deploy.mjs before it checks, builds or deploys, and nothing goes out without --yes", () => {
    const script = repo("scripts/deploy.mjs");
    const at = (s: string) => { const i = script.indexOf(s); expect(i, s).toBeGreaterThan(0); return i; };
    const refused = at("if (reasons.length) refuse(reasons);");
    expect(at('refusals({ changed: dirty(), targets, project,')).toBeLessThan(refused);
    expect(at('git("status", "--porcelain")')).toBeLessThan(refused);
    expect(refused).toBeLessThan(at("node scripts/verify.mjs"));
    expect(at("node scripts/verify.mjs")).toBeLessThan(at('run("npm run build", env)'));
    // The only place a firebase command runs is after the exit for a run without --yes.
    expect(at("if (!args.yes) {")).toBeLessThan(at("await runShown(cmd)"));
    expect(script.match(/\brun(?:Shown)?\(cmd\)/g)).toEqual(["runShown(cmd)"]);
  });
  it("counts a functions step in which the CLI left a function out as failed, before the app or the rules go out or a tag is made", () => {
    const script = repo("scripts/deploy.mjs");
    const at = (s: string) => { const i = script.indexOf(s); expect(i, s).toBeGreaterThan(0); return i; };
    // Exit code 0 is not enough: the output is read too, and a skipped trigger stops the loop like a failed command.
    const stop = at("if (!r.ok || held.skipped) {");
    expect(at("isFunctionsStep(steps[i]) ? unforced(r.out)")).toBeLessThan(stop);
    expect(stop).toBeLessThan(at("went.push(steps[i]);"));
    expect(script.slice(stop, at("went.push(steps[i]);"))).toContain("break;");
    expect(at("if (failed) {")).toBeLessThan(at("const tag = tagName("));
    expect(script.slice(at("if (failed) {"), at("const tag = tagName("))).toContain("process.exit(1);");
    // It names the by-hand command, and never adds --force to a command of its own.
    expect(script).toContain("forceCommand(held.names, project)");
    expect(script).toContain("steps.map((only) => firebaseCommand(only, project, CONFIG))");
    expect(firebaseCommand("functions", "p", "c.json")).not.toContain("--force");
  });
});

describe("the files a release and CI lean on", () => {
  it("npm run local's build says it is meant for the emulators (vite.config.ts's settings check lets it through)", () => {
    const local = repo("scripts/local.mjs");
    const env = local.slice(local.indexOf("const viteEnv = {"), local.indexOf('"vite", "build"'));
    expect(env).toContain('DARSI_LOCAL_BUILD: "1"');
    expect(local.slice(local.indexOf('"vite", "build"')).split("\n")[0]).toContain("env: viteEnv");
    // A release never does: its build must pass that check.
    expect(repo("scripts/deploy.mjs")).toContain("delete env.DARSI_LOCAL_BUILD;");
  });
  it("git keeps the tests' and the e2e suite's public settings, and nothing else named .env", () => {
    const lines = repo(".gitignore").split(/\r?\n/);
    const ignoreAll = lines.indexOf(".env*");
    expect(ignoreAll).toBeGreaterThanOrEqual(0);
    for (const keep of ["!apps/web/.env.test", "!apps/web/.env.e2e"]) expect(lines.indexOf(keep), keep).toBeGreaterThan(ignoreAll);
    expect(lines.filter((l) => l.startsWith("!") && l.includes(".env")).sort()).toEqual(["!.env.example", "!apps/web/.env.development", "!apps/web/.env.e2e", "!apps/web/.env.test"]);
    // What a release writes and removes, and the e2e suite's own build: neither may make a tree look uncommitted.
    expect(lines).toContain("firebase.deploy.json");
    expect(lines).toContain("apps/web/dist-e2e/");
  });
  it("the Firebase CLI is pinned to the version the lockfile holds, and Node to the functions' runtime", () => {
    const pkg = JSON.parse(repo("package.json")) as { engines: { node: string }; devDependencies: Record<string, string>; scripts: Record<string, string> };
    const lock = JSON.parse(repo("package-lock.json")) as { packages: Record<string, { version?: string; devDependencies?: Record<string, string>; engines?: { node: string } }> };
    expect(pkg.devDependencies["firebase-tools"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(lock.packages["node_modules/firebase-tools"].version).toBe(pkg.devDependencies["firebase-tools"]);
    expect(lock.packages[""].devDependencies?.["firebase-tools"]).toBe(pkg.devDependencies["firebase-tools"]);
    expect(pkg.engines.node).toBe("22.x");
    expect(lock.packages[""].engines?.node).toBe("22.x");
    expect(repo(".nvmrc").trim()).toBe("22");
    expect(pkg.scripts).toMatchObject({ verify: "node scripts/verify.mjs", deploy: "node scripts/deploy.mjs", "check:bundle": "node scripts/check-bundle.mjs" });
  });
  it("CI has no secrets, cannot write to the repository and deploys nothing", () => {
    // Comments may name `npm run deploy`; what runs may not.
    const ci = repo(".github/workflows/ci.yml").split(/\r?\n/).filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(ci).not.toMatch(/secrets\.|pull_request_target|firebase deploy|npm run deploy|deploy\.mjs|gcloud/);
    expect(ci).toMatch(/\npermissions:\n  contents: read\n/);
    expect(ci).not.toMatch(/:\s*write\b/);
    expect(ci).toContain("run: npm run verify");
    expect(ci).toContain("node scripts/check-bundle.mjs");
  });
});

describe("the release command line", () => {
  it("reads targets separated by spaces or commas, once each", () => {
    expect(ok(["hosting", "functions,firestore", "hosting"]).targets).toEqual(["hosting", "functions", "firestore"]);
    expect(ok(["functions:tutorAsk,functions:tutorStatus"]).targets).toEqual(["functions:tutorAsk", "functions:tutorStatus"]);
  });
  it("deploys only with --yes", () => {
    expect(ok(["hosting"]).yes).toBe(false);
    expect(ok(["hosting", "--yes"]).yes).toBe(true);
  });
  it("refuses what it does not know, and never guesses", () => {
    expect(parseArgs([]).error).toBe("Nothing to deploy");
    expect(parseArgs(["--yes"]).error).toBe("Nothing to deploy");
    expect(parseArgs(["hostng"]).error).toBe('Unknown target "hostng"');
    expect(parseArgs(["hosting", "--force"]).error).toBe("Unknown option --force");
    expect(parseArgs(["database"]).error).toBe('Unknown target "database"');
    expect(parseArgs(["functions", "functions:collect"]).error).toMatch(/not both/);
    expect(parseArgs(["firestore", "--rules", "--skip-rules-tests"]).error).toMatch(/contradict/);
  });
  it("knows what each target needs", () => {
    expect(hasHosting(["functions"])).toBe(false);
    expect(hasFunctions(["functions:collect"])).toBe(true);
    expect(hasFunctions(["hosting", "firestore"])).toBe(false);
    expect(["firestore", "firestore:rules", "storage"].every((t) => hasRules([t]))).toBe(true);
    expect(hasRules(["firestore:indexes", "hosting", "functions"])).toBe(false);
  });
});

describe("the order of a release", () => {
  it("is indexes, functions, hosting, then rules, however the targets were given", () => {
    expect(plan(["storage", "firestore", "hosting", "functions"])).toEqual(["firestore:indexes", "functions", "hosting", "firestore:rules,storage"]);
  });
  it("keeps single functions in one command and leaves out what was not asked for", () => {
    expect(plan(["hosting"])).toEqual(["hosting"]);
    expect(plan(["functions:a", "functions:b", "firestore:rules"])).toEqual(["functions:a,functions:b", "firestore:rules"]);
    expect(plan(["firestore:indexes"])).toEqual(["firestore:indexes"]);
  });
  it("prints the exact command, with the project and the config without rebuild hooks", () => {
    expect(firebaseCommand("hosting", "darsi-f0685", "firebase.deploy.json")).toBe("npx firebase deploy --only hosting --project darsi-f0685 --config firebase.deploy.json");
  });
});

// The Firebase CLI's own words (firebase-tools 15.33 lib/deploy/functions/prompts.js), with its bold codes. It can't ask
// when stdin is no terminal or it finds an agent session, which is how releases have been run.
describe("what the Firebase CLI would only do with --force", () => {
  const bold = (s: string) => `\u001b[1m${s}\u001b[22m`;
  const retry = `⚠  functions: The following functions will newly be retried in case of failure: ${bold("onAccountDeletion(europe-west1), onProgressWrite(europe-west1), onSubscriptionWrite(europe-west1)")}. Retried executions are billed as any other execution, and functions are retried repeatedly until they either successfully execute or the maximum retry period has elapsed, which can be up to 7 days. For safety, you might want to ensure that your functions are idempotent; see https://firebase.google.com/docs/functions/retries to learn more.`;
  const unsafe = `⚠  functions: The following functions are unsafely changing event types: ${bold("onOrgSite(europe-west1)")}. While automatic migration is allowed for these functions, updating the underlying event type may result in data loss. To avoid this, consider the best practices outlined in the migration guide: https://firebase.google.com/docs/functions/manage-functions?gen=2nd#modify-trigger`;
  const skippedLine = "⚠  functions: Skipping updates for functions that may be unsafe to update. To update these functions anyway, deploy again in interactive mode or use the --force option.";
  const refusedLine = "Error: Pass the --force option to deploy functions with a failure policy";

  it("sees a trigger the CLI skipped although the step ended well, and names it", () => {
    const out = `i  functions: preparing codebase default for deployment\n${unsafe}\n${skippedLine}\n✔  functions[tutorAsk(europe-west1)] Successful update operation.\n\n✔  Deploy complete!\n`;
    expect(unforced(out)).toEqual({ skipped: true, refused: false, names: ["onOrgSite"] });
    expect(forceCommand(unforced(out).names, "darsi-test-1")).toBe("npx firebase deploy --only functions:onOrgSite --project darsi-test-1 --force");
  });
  it("explains a step refused for a new failure policy, and names every such trigger", () => {
    const out = `${retry}\n\n${refusedLine}\n`;
    expect(unforced(out)).toEqual({ skipped: false, refused: true, names: ["onAccountDeletion", "onProgressWrite", "onSubscriptionWrite"] });
    expect(forceCommand(unforced(out).names, "darsi-test-1")).toBe("npx firebase deploy --only functions:onAccountDeletion,functions:onProgressWrite,functions:onSubscriptionWrite --project darsi-test-1 --force");
  });
  it("still sees the skip when the CLI's list can't be read, and makes no command out of nothing", () => {
    expect(unforced(skippedLine)).toEqual({ skipped: true, refused: false, names: [] });
    expect(forceCommand([], "darsi-test-1")).toBe("");
  });
  const updatedLine = (name: string) => `✔  \u001b[1m\u001b[32mfunctions[${name}(europe-west1)]\u001b[39m\u001b[22m Successful update operation.`;
  const asked = (name: string, answer: string) => `? [${name}(europe-west1)] Would you like to proceed with the unsafe migration? ${answer}`;
  it("finds nothing in a step that went out whole, or in a warning the person answered yes to and the CLI then acted on", () => {
    expect(unforced("✔  functions[collect(europe-west1)] Successful update operation.\n✔  Deploy complete!")).toEqual({ skipped: false, refused: false, names: [] });
    // Run from a terminal, the CLI warns and asks; with a yes there is no skip line and no refusal, and the trigger is
    // reported as updated like any other function.
    expect(unforced(`${retry}\n? Would you like to proceed with deployment? Yes\n${unsafe}\n${asked("onOrgSite", "Yes")}\n${updatedLine("tutorAsk")}\n${updatedLine("onOrgSite")}\n\n✔  Deploy complete!`)).toEqual({ skipped: false, refused: false, names: [] });
    expect(unforced("")).toEqual({ skipped: false, refused: false, names: [] });
  });
  // At a terminal the CLI asks per trigger (prompts.js promptForUnsafeMigration), and a No drops that trigger with no
  // further line: no "Skipping updates" sentence, exit code 0, "Deploy complete!". Only the missing success line says so.
  it("sees a trigger the person declined at the CLI's question, though no line says it was left out", () => {
    const out = `i  functions: preparing codebase default for deployment\n${unsafe}\n${asked("onOrgSite", "No")}\n${updatedLine("tutorAsk")}\n\n✔  Deploy complete!\n`;
    expect(unforced(out)).toEqual({ skipped: true, refused: false, names: ["onOrgSite"] });
    expect(forceCommand(unforced(out).names, "darsi-test-1")).toBe("npx firebase deploy --only functions:onOrgSite --project darsi-test-1 --force");
    // Of two it asked about, only the one that did not go out is named; a function whose name merely starts the same is not it.
    const two = `⚠  functions: The following functions are unsafely changing event types: ${bold("onOrgSite(europe-west1), onOrg(europe-west1)")}. While automatic migration is allowed for these functions, updating the underlying event type may result in data loss.`;
    expect(unforced(`${two}\n${asked("onOrg", "No")}\n${asked("onOrgSite", "Yes")}\n${updatedLine("onOrgSite")}\n✔  Deploy complete!`)).toEqual({ skipped: true, refused: false, names: ["onOrg"] });
    expect(unforced(`${two}\n${asked("onOrg", "Yes")}\n${asked("onOrgSite", "Yes")}\n${updatedLine("onOrgSite")}\n${updatedLine("onOrg")}\n✔  Deploy complete!`)).toEqual({ skipped: false, refused: false, names: [] });
    // "Skipped (No changes detected)" is not an update.
    expect(unforced(`${unsafe}\n✔  functions[onOrgSite(europe-west1)] Skipped (No changes detected)\n✔  Deploy complete!`).skipped).toBe(true);
  });
  // unforced() reads the CLI's sentences. If an upgrade rewords one, these fail, instead of the release reading nothing
  // and passing a step that left a trigger behind. (The CLI is a pinned devDependency of the repository's root.)
  it("still matches the words of the installed Firebase CLI", () => {
    const prompts = repo("node_modules/firebase-tools/lib/deploy/functions/prompts.js");
    for (const words of [
      '"The following functions will newly be retried in case of failure: "',
      '"Retried executions are billed as any other execution',
      '"Pass the --force option to deploy functions with a failure policy"',
      '"The following functions are unsafely changing event types: "',
      '"While automatic migration is allowed for these functions',
      '"Skipping updates for functions that may be unsafe to update.',
      "Would you like to proceed with the unsafe migration?",
    ]) expect(prompts, words).toContain(words);
    const fabricator = repo("node_modules/firebase-tools/lib/deploy/functions/release/fabricator.js");
    // Every function that went out is reported by its label and the operation's name, and an update's is "update".
    expect(fabricator).toContain("`functions[${label}]`))} Successful ${op} operation.`");
    expect(fabricator).toContain('this.wrapOperation("update", update.endpoint,');
    // A label is "<name>(<region>)", which is what the lists and the success line are read by.
    expect(repo("node_modules/firebase-tools/lib/deploy/functions/functionsDeployHelper.js")).toMatch(/function getFunctionLabel\(fn\) \{\s*let id = `\$\{fn\.id\}\(\$\{fn\.region\}\)`;/);
  });
  it("is asked of functions steps only, and the by-hand command names single functions, never a whole target", () => {
    expect(["functions", "functions:a,functions:b"].every(isFunctionsStep)).toBe(true);
    expect(["hosting", "firestore:indexes", "firestore:rules,storage"].some(isFunctionsStep)).toBe(false);
    expect(forceCommand(["a", "a", "b"], "p")).toBe("npx firebase deploy --only functions:a,functions:b --project p --force");
    for (const step of plan(["storage", "firestore", "hosting", "functions"])) expect(firebaseCommand(step, "p", "c.json")).not.toContain("--force");
  });
  it("is written down for the enterprise batch: the exact triggers, by hand, before the release", () => {
    const doc = repo("docs/FIREBASE.md");
    const steps = doc.slice(doc.indexOf("### Releasing the enterprise batch"));
    const cmd = "npx firebase deploy --only functions:onProgressWrite,functions:onSubscriptionWrite,functions:onAccountDeletion,functions:onOrgLicence,functions:onOrgSite --project darsi-f0685 --force";
    expect(steps).toContain(cmd);
    expect(steps.indexOf(cmd)).toBeLessThan(steps.indexOf("npm run deploy -- functions hosting firestore storage --yes"));
  });
});

describe("the config that goes to the Firebase CLI", () => {
  const real = JSON.parse(readFileSync(join(__dirname, "../../../firebase.json"), "utf8")) as Record<string, unknown>;
  it("is firebase.json without its rebuild hooks, and otherwise the same", () => {
    const cfg = deployConfig(real);
    expect(JSON.stringify(cfg)).not.toContain("predeploy");
    const hooks = (x: unknown): unknown => JSON.parse(JSON.stringify(x, (k, v: unknown) => (k === "predeploy" ? undefined : v)));
    expect(cfg).toEqual(hooks(real));
    // Two Hosting sites since school sign-in (the app, and login.darsiai.org for the provider's callback): each one's
    // headers go out as written, and neither builds anything again.
    type Site = { target: string; headers: unknown[]; predeploy?: unknown };
    const sites = (x: Record<string, unknown>) => x.hosting as Site[];
    expect(sites(cfg).map((h) => h.target)).toEqual(["app", "login"]);
    for (const [i, site] of sites(cfg).entries()) expect(site.headers).toEqual(sites(real)[i].headers);
  });
  it("does not change the object it was given", () => {
    const before = JSON.stringify(real);
    deployConfig(real);
    expect(JSON.stringify(real)).toBe(before);
  });
  it("handles one functions codebase or several", () => {
    expect(deployConfig({ functions: { source: "functions", predeploy: ["x"] } })).toEqual({ functions: { source: "functions" } });
    expect(deployConfig({ functions: [{ source: "a", predeploy: ["x"] }, { source: "b" }] })).toEqual({ functions: [{ source: "a" }, { source: "b" }] });
  });
});

describe("the release's names", () => {
  const day = new Date(Date.UTC(2026, 10, 5, 23, 30)); // 5 November 2026 in UTC, already the 6th east of it
  it("stamps the build with the commit and the day in UTC, as vite.config.ts dates a build", () => {
    expect(buildStamp("4245d198", day)).toBe("4245d198-20261105");
  });
  it("tags live-YYYYMMDD-n with the next free number of that day", () => {
    expect(tagName(day, [])).toBe("live-20261105-1");
    expect(tagName(day, ["live-20261104-3", "live-20261105-1", "live-20261105-2"])).toBe("live-20261105-3");
    // A removed tag's number is not given out again below the highest one.
    expect(tagName(day, ["live-20261105-4", "live-20261105-x"])).toBe("live-20261105-5");
  });
});
