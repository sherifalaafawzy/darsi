// @vitest-environment node
// The startup-bundle check (scripts/check-bundle.mjs, scripts/lib/bundle.mjs): what counts as a startup file, and what
// fails a build. Each case is a tiny made-up build directory shaped like Vite's output.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkBundle, lazyScreens, onDemandPatterns, precached, startup, staticImports } from "../../../scripts/lib/bundle.mjs";
import { ON_DEMAND } from "../vite.config";

const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

/** A build: index.html with its entry and preloads, the files, and sw.js precaching `precache`. */
function build(files: Record<string, string>, opts: { preload?: string[]; precache?: string[] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "darsi-bundle-"));
  made.push(dir);
  const all: Record<string, string> = {
    "index.html": `<!doctype html><html><head>
      <script>/* inline, no src */</script>
      <script type="module" crossorigin src="/assets/index-AAAAAAAA.js"></script>
      ${(opts.preload ?? []).map((p) => `<link rel="modulepreload" crossorigin href="/${p}">`).join("\n")}
      <link rel="stylesheet" crossorigin href="/assets/index-AAAAAAAA.css">
      <script type="module">import("_").catch(()=>1)</script>
      <script nomodule crossorigin id="vite-legacy-polyfill" src="/assets/polyfills-legacy-AAAAAAAA.js"></script>
      <script nomodule crossorigin id="vite-legacy-entry" data-src="/assets/index-legacy-AAAAAAAA.js">System.import(1)</script>
      </head><body></body></html>`,
    "assets/index-AAAAAAAA.css": "body{margin:0}",
    "sw.js": `self.x=1;e.precacheAndRoute([${(opts.precache ?? ["index.html", "assets/index-AAAAAAAA.js"]).map((u) => `{url:"${u}",revision:null}`).join(",")}],{})`,
    ...files,
  };
  for (const [name, text] of Object.entries(all)) { mkdirSync(dirname(join(dir, name)), { recursive: true }); writeFileSync(join(dir, name), text); }
  return dir;
}
const ENTRY = 'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/firebase-AubJmzCj.js","assets/Cms-AAAAAAAA.js"])))=>i.map(i=>d[i]);\nimport{a as b}from"./rt-AAAAAAAA.js";import"./side-AAAAAAAA.js";const lazy=()=>import("./Cms-AAAAAAAA.js");const fb=()=>import("./firebase-AubJmzCj.js");';
const FILES = {
  "assets/index-AAAAAAAA.js": ENTRY,
  "assets/rt-AAAAAAAA.js": "export const a=1;",
  "assets/side-AAAAAAAA.js": 'export{a}from"./deep-AAAAAAAA.js";',
  "assets/deep-AAAAAAAA.js": "export const a=2;",
  "assets/Cms-AAAAAAAA.js": 'import{a}from"./rt-AAAAAAAA.js";import"./editor-only-AAAAAAAA.js";',
  "assets/editor-only-AAAAAAAA.js": "export const big=1;",
  "assets/firebase-AubJmzCj.js": "export const sdk=1;",
};
const names = (dir: string) => startup(dir).files.map((f) => f.file).sort();
const BUDGET = { maxFiles: 4, maxGzipKB: 5 };

describe("startup files", () => {
  it("are the entry and what it imports statically, never what it imports lazily", () => {
    expect(names(build(FILES))).toEqual(["assets/deep-AAAAAAAA.js", "assets/index-AAAAAAAA.js", "assets/rt-AAAAAAAA.js", "assets/side-AAAAAAAA.js"]);
  });
  it("include index.html's modulepreload links, and leave out the Chrome 61 build", () => {
    const dir = build({ ...FILES, "assets/extra-AAAAAAAA.js": "export const x=1;", "assets/polyfills-legacy-AAAAAAAA.js": "var p;", "assets/index-legacy-AAAAAAAA.js": "var l;" }, { preload: ["assets/rt-AAAAAAAA.js", "assets/extra-AAAAAAAA.js"] });
    expect(names(dir)).toContain("assets/extra-AAAAAAAA.js");
    expect(names(dir).some((f) => f.includes("legacy"))).toBe(false);
    expect(startup(dir).css.map((f) => f.file)).toEqual(["assets/index-AAAAAAAA.css"]);
  });
  it("list index.html's plain scripts for the report, outside the budget, and never the Chrome 61 build's", () => {
    const html = `<!doctype html><html><head><script src="/boot.js" data-sw="/sw.js"></script>
      <script type="module" crossorigin src="/assets/index-AAAAAAAA.js"></script>
      <script nomodule crossorigin id="vite-legacy-polyfill" src="/assets/polyfills-legacy-AAAAAAAA.js"></script>
      <script nomodule crossorigin id="vite-legacy-entry" data-src="/assets/index-legacy-AAAAAAAA.js">System.import(1)</script>
      <script type="application/ld+json" src="/data.js"></script></head><body></body></html>`;
    const dir = build({ ...FILES, "index.html": html, "boot.js": "var a=1;", "data.js": "{}", "assets/polyfills-legacy-AAAAAAAA.js": "var p;", "assets/index-legacy-AAAAAAAA.js": "var l;" });
    expect(startup(dir).scripts.map((f) => f.file)).toEqual(["boot.js"]);
    expect(names(dir)).toEqual(["assets/deep-AAAAAAAA.js", "assets/index-AAAAAAAA.js", "assets/rt-AAAAAAAA.js", "assets/side-AAAAAAAA.js"]);
    expect(checkBundle(dir, BUDGET, { screens: ["Cms"] }).problems).toEqual([]);
  });
  it("read every form of static import and none of the lazy one", () => {
    const code = 'import{a as b,c}from"./a.js";import d from"./b.js";import*as e from"./c.js";import"./d.js";export{f}from"./e.js";export*from"./f.js";\nconst g=()=>import("./lazy.js"),h=`import x from"./in-a-string.css"`;';
    expect(staticImports(code, "assets/index.js")).toEqual(["a", "b", "c", "d", "e", "f"].map((n) => `assets/${n}.js`));
  });
  it("are measured gzipped", () => {
    const s = startup(build(FILES));
    expect(s.gzip).toBe(s.files.reduce((n, f) => n + f.gzip, 0));
    expect(s.files.every((f) => f.gzip > 0 && f.bytes > 0)).toBe(true);
  });
});

describe("the bundle check", () => {
  it("passes a build inside its budget", () => {
    expect(checkBundle(build(FILES), BUDGET, { screens: ["Cms"] }).problems).toEqual([]);
  });
  it("fails one startup file too many", () => {
    const dir = build({ ...FILES, "assets/extra-AAAAAAAA.js": "export const x=1;" }, { preload: ["assets/extra-AAAAAAAA.js"] });
    expect(checkBundle(dir, BUDGET, { screens: ["Cms"] }).problems).toEqual(["startup is 5 files; the budget is 4"]);
  });
  it("fails a startup that outgrew its size", () => {
    // Text gzip cannot shrink much: 20,000 characters of digits from a fixed walk.
    let n = 7, noise = "";
    while (noise.length < 20000) { n = (n * 1103515245 + 12345) % 2147483648; noise += n.toString(36); }
    const p = checkBundle(build({ ...FILES, "assets/rt-AAAAAAAA.js": `export const a="${noise}";` }), BUDGET, { screens: ["Cms"] }).problems;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^startup is \d+\.\d KB gzipped; the budget is 5 KB$/);
  });
  it("fails when the Firebase SDK becomes a startup file", () => {
    const dir = build({ ...FILES, "assets/index-AAAAAAAA.js": `${ENTRY}import"./firebase-AubJmzCj.js";` });
    expect(checkBundle(dir, { maxFiles: 9, maxGzipKB: 5 }, { screens: ["Cms"] }).problems).toEqual(["the Firebase SDK is in the startup files: assets/firebase-AubJmzCj.js"]);
  });
  it("lets a startup file that is only named like the settings through (app-config)", () => {
    const dir = build({ ...FILES, "assets/rt-AAAAAAAA.js": 'import"./app-config-AAAAAAAA.js";export const a=1;', "assets/app-config-AAAAAAAA.js": "export const c=1;" });
    expect(checkBundle(dir, { maxFiles: 5, maxGzipKB: 5 }, { screens: ["Cms"] }).problems).toEqual([]);
  });
  it.each([
    ["assets/lab-neuron-AAAAAAAA.js", "a lab app"],
    ["assets/Cms-AAAAAAAA.js", "LAZY_SCREENS"],
    ["assets/Cms-AAAAAAAA.css", "LAZY_SCREENS"],
    ["assets/CodeSteps-AAAAAAAA.js", "the code steps"],
    ["assets/tinylm-AAAAAAAA.js", "Darsi Tiny"],
    ["assets/firebase-AubJmzCj.js", "the Firebase SDK"],
    ["assets/firebase-extra-8nzskOCE.js", "the Firebase SDK"],
    ["assets/index-legacy-AAAAAAAA.js", "Chrome 61"],
  ])("fails a precache that holds %s", (url, why) => {
    const p = checkBundle(build(FILES, { precache: ["index.html", url] }), BUDGET, { screens: ["Cms", "SuperAdmin"] }).problems;
    expect(p).toHaveLength(1);
    expect(p[0]).toContain(`sw.js precaches ${url}`);
    expect(p[0]).toContain(why);
  });
  it("does not mistake startup names for lazy ones", () => {
    const ok = ["index.html", "assets/index-AAAAAAAA.js", "assets/app-config-AAAAAAAA.js", "assets/labs-AAAAAAAA.js", "labs-manifest.json", "assets/administer-AAAAAAAA.js"];
    expect(checkBundle(build(FILES, { precache: ok }), BUDGET, { screens: ["Cms", "admin"] }).problems).toEqual([]);
  });
  it("fails a service worker it cannot read the precache of", () => {
    expect(checkBundle(build({ ...FILES, "sw.js": "self.skipWaiting()" }), BUDGET, { screens: ["Cms"] }).problems).toEqual(["sw.js lists no precached files (has the service worker's format changed?)"]);
    expect(precached(build(FILES, { precache: ["a.js", "b/c.css"] }))).toEqual(["a.js", "b/c.css"]);
  });
  it("for a release, wants the project id in a startup file", () => {
    const dir = build({ ...FILES, "assets/rt-AAAAAAAA.js": 'export const a={projectId:"darsi-test-1"};' });
    expect(checkBundle(dir, BUDGET, { screens: ["Cms"], has: "darsi-test-1" }).problems).toEqual([]);
    // A lazy chunk holding it is not enough: the app would start with other settings.
    expect(checkBundle(dir, BUDGET, { screens: ["Cms"], has: "sdk" }).problems).toEqual(['no startup file contains "sdk": this build was not made with that project\'s settings']);
  });
});

describe("the lists the check shares with vite.config.ts", () => {
  const config = readFileSync(join(__dirname, "../vite.config.ts"), "utf8");
  it("reads LAZY_SCREENS from the file's text", () => {
    const screens = lazyScreens(config);
    expect(screens).toContain("Cms");
    expect(screens).toContain("SuperAdmin");
    expect(() => lazyScreens("const OTHER = [];")).toThrow(/LAZY_SCREENS not found/);
  });
  it("repeats every on-demand pattern of the build, so the two cannot drift apart", () => {
    const mine = onDemandPatterns(lazyScreens(config)).map((p) => p.re.source).sort();
    expect(mine).toEqual(ON_DEMAND.map((p) => p.re.source).sort());
  });
});
