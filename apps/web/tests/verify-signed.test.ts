// @vitest-environment node
// The signed-in browser suite's place in the checks (scripts/verify.mjs, .github/workflows/ci.yml,
// apps/web/tsconfig.tools.json): it needs the emulators (JDK 21 or newer), so `npm run verify` runs it only when asked
// (--signed), CI runs it as a job of its own that may fail for now, and its Playwright config is type-checked with the
// other tool configs. That type-check and the one of the functions' tests fail `npm run verify` like any other step.
// Nothing here starts the suite.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repo = (path: string) => readFileSync(join(__dirname, "../../..", path), "utf8");
/** A file's lines without its comments (`//` and `#` lines, and the continuation lines of a block comment). */
const code = (path: string) => repo(path).split(/\r?\n/).filter((l) => !/^\s*(?:\/\/|#|\/?\*)/.test(l)).join("\n");

describe("verify --signed", () => {
  const verify = code("scripts/verify.mjs");

  it("is a flag of its own, and the step is there only when it is given", () => {
    expect(verify).toMatch(/signed = flag\("--signed"\)/);
    // One step, spread in only for the flag: a plain `npm run verify` never starts the emulators.
    const steps = verify.match(/node scripts\/e2e-signed\.mjs/g) ?? [];
    expect(steps).toHaveLength(1);
    expect(verify).toMatch(/\.\.\.\(signed \? \[\{[^\n]*cmd: "node scripts\/e2e-signed\.mjs"[^\n]*\}\] : \[\]\)/);
    expect(verify).toContain("[--signed]"); // the usage line names it
  });

  it("asks for the JDK before anything of the suite runs, as the rules tests do", () => {
    const step = verify.split("\n").find((l) => l.includes("node scripts/e2e-signed.mjs"))!;
    expect(step).toMatch(/env: \(\) => javaEnv\(\) \?\? "the emulators need JDK 21 or newer/);
    // A step whose `env` answers a sentence fails without running its command.
    expect(verify).toMatch(/if \(typeof env === "string"\) \{[^\n]*status: "FAILED"[^\n]*process\.exit\(1\)/);
  });

  it("the runner it starts exists", () => {
    expect(repo("scripts/e2e-signed.mjs")).toContain("playwright.signed.config.ts");
  });
});

describe("CI's signed-in suite", () => {
  const ci = repo(".github/workflows/ci.yml");
  const job = ci.slice(ci.indexOf("\n  e2e-signed:"));

  it("is a job of its own that runs the same runner, with Java for the emulators", () => {
    expect(ci).toContain("\n  e2e-signed:\n");
    expect(job).toContain("run: node scripts/e2e-signed.mjs");
    expect(job).toMatch(/uses: actions\/setup-java@v\d+\n\s+with:\n\s+distribution: temurin\n\s+java-version: "21"/);
    expect(job).toContain("run: npm ci --prefix functions"); // the runner builds the functions
  });

  it("may fail for now, and says why beside the line", () => {
    const lines = job.split(/\r?\n/);
    const at = lines.findIndex((l) => l.trim() === "continue-on-error: true");
    expect(at).toBeGreaterThan(0);
    expect(lines[at - 1].trim().startsWith("#")).toBe(true);
    // The job that gates every change does not run it.
    const gate = ci.slice(ci.indexOf("\n  verify:"), ci.indexOf("\n  bundle:"));
    expect(gate).toContain("run: npm run verify");
    expect(gate).not.toContain("--signed");
    expect(gate).not.toContain("continue-on-error");
  });
});

describe("the tool configs' type-check", () => {
  it("covers the signed-in suite's Playwright config with the plain one", () => {
    const include = /"include":\s*(\[[^\]]*\])/.exec(repo("apps/web/tsconfig.tools.json"))![1];
    expect(JSON.parse(include)).toEqual(expect.arrayContaining(["e2e", "playwright.config.ts", "playwright.signed.config.ts"]));
  });
});

describe("verify's two extra type-checks", () => {
  const verify = code("scripts/verify.mjs");
  const stepOf = (cmd: string) => verify.split("\n").filter((l) => l.includes(`cmd: "${cmd}"`));

  it("run on every plain `npm run verify`, in the functions and in the web app", () => {
    const fns = stepOf("npx tsc --noEmit -p tsconfig.test.json"), tools = stepOf("npx tsc --noEmit -p tsconfig.tools.json");
    expect(fns).toHaveLength(1);
    expect(tools).toHaveLength(1);
    expect(fns[0]).toContain("cwd: FUNCTIONS");
    expect(tools[0]).toContain("cwd: WEB");
    // Not behind a flag, as the emulators' steps are.
    for (const l of [...fns, ...tools]) expect(l.trim().startsWith("{ name:")).toBe(true);
    expect(repo("functions/tsconfig.test.json")).toMatch(/"include":\s*\["src",\s*"test"\]/);
  });

  it("fail the run: no step only reports any more", () => {
    expect(verify).not.toMatch(/\breport\b/);
    expect(verify).not.toContain("report only");
    expect(verify).not.toContain('"noted"');
    // One way through the loop: a step that exits with anything but 0 stops the run.
    expect(verify).toMatch(/if \(r\.status !== 0\) \{\s*done\.push\(\{[^\n]*status: "FAILED"/);
    expect(verify.match(/process\.exit\(0\)/g) ?? []).toHaveLength(1); // --help only
  });
});
