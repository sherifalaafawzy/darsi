// @vitest-environment node
// The build and test configuration (vite.config.ts, .env.e2e, playwright.config.ts, vitest.config.ts): a production
// build without the project's settings stops, the e2e suite needs no private file, the legal pages and src/staff stay
// out of the precache, and the build carries its name. (index.html and public/boot.js: tests/boot.test.ts.)
// Node, not jsdom: vite.config.ts reads files by URL as it loads.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "@testing-library/react";
import { loadEnv } from "vite";
import { ON_DEMAND, REQUIRED_ENV, buildStamp, checkBuildEnv, staffOnly, withSwRegistration } from "../vite.config";

const dir = join(__dirname, "..");
const read = (file: string) => readFileSync(join(dir, file), "utf8");
const keys = (file: string) => [...read(file).matchAll(/^(VITE_\w+)=/gm)].map((m) => m[1]);

describe("a production build and the project's settings (checkBuildEnv)", () => {
  const live = {
    VITE_FIREBASE_API_KEY: "key", VITE_FIREBASE_AUTH_DOMAIN: "example.org", VITE_FIREBASE_PROJECT_ID: "project", VITE_FIREBASE_STORAGE_BUCKET: "bucket",
    VITE_FIREBASE_APP_ID: "1:2:web:3", VITE_FIREBASE_VAPID_KEY: "vapid", VITE_TUTOR_RELAY: "wss://relay.example.org/live", VITE_USE_EMULATORS: "false",
  };

  it("passes with every setting there and the emulators off", () => {
    expect(() => checkBuildEnv(live, "production")).not.toThrow();
    const { VITE_USE_EMULATORS: _, ...unset } = live;
    expect(() => checkBuildEnv(unset, "production")).not.toThrow();
  });

  it.each(REQUIRED_ENV)("stops when %s is missing or empty, and names it", (key) => {
    const { [key]: _, ...without } = live;
    expect(() => checkBuildEnv(without, "production")).toThrow(new RegExp(`\\b${key} is not set`));
    expect(() => checkBuildEnv({ ...live, [key]: "" }, "production")).toThrow(new RegExp(`\\b${key} is not set`));
    expect(() => checkBuildEnv({ ...live, [key]: "  " }, "production")).toThrow(key);
  });

  it("names every missing setting at once, and says where they go", () => {
    let said = "";
    try { checkBuildEnv({}, "production"); } catch (e) { said = String((e as Error).message); }
    for (const key of REQUIRED_ENV) expect(said).toContain(key);
    expect(said).toMatch(/are not set/);
    expect(said).toContain("apps/web/.env.local");
    expect(said).toContain(".env.example");
  });

  it("stops when the build would look for the emulators", () => {
    expect(() => checkBuildEnv({ ...live, VITE_USE_EMULATORS: "true" }, "production")).toThrow(/VITE_USE_EMULATORS is true/);
  });

  it("lets other modes through (the e2e suite's build, development), whatever they hold", () => {
    for (const mode of ["e2e", "development", "test"]) {
      expect(() => checkBuildEnv({}, mode)).not.toThrow();
      expect(() => checkBuildEnv({ ...live, VITE_USE_EMULATORS: "true" }, mode)).not.toThrow();
    }
  });

  it("lets npm run local's build through: production mode, for the emulators, with DARSI_LOCAL_BUILD=1", () => {
    expect(() => checkBuildEnv({ VITE_USE_EMULATORS: "true", DARSI_LOCAL_BUILD: "1" }, "production")).not.toThrow();
    // Only "1" says so: a stray value does not open the door.
    expect(() => checkBuildEnv({ VITE_USE_EMULATORS: "true", DARSI_LOCAL_BUILD: "0" }, "production")).toThrow();
    expect(() => checkBuildEnv({ ...live, VITE_USE_EMULATORS: "true", DARSI_LOCAL_BUILD: "" }, "production")).toThrow();
  });

  it("is what the example file marks REQUIRED, key for key", () => {
    const example = read(".env.example");
    const marked = [...example.matchAll(/^# REQUIRED\.[^\n]*\n(?:#[^\n]*\n)*(VITE_\w+)=/gm)].map((m) => m[1]);
    expect(marked.sort()).toEqual([...REQUIRED_ENV].sort());
    expect(keys(".env.example")).toEqual(expect.arrayContaining([...REQUIRED_ENV, "VITE_USE_EMULATORS"]));
  });
});

describe("the e2e suite's settings (.env.e2e)", () => {
  it("builds with public demo values and no emulators, whatever .env.local holds", () => {
    // Settings already in the environment win over the files: leave them out, as CI would.
    const outside = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("VITE_")));
    for (const k of Object.keys(outside)) delete process.env[k];
    try {
      expect(loadEnv("e2e", dir, "VITE_")).toMatchObject({
        VITE_USE_EMULATORS: "false", VITE_FIREBASE_PROJECT_ID: "demo-darsi", VITE_FIREBASE_STORAGE_BUCKET: "demo-darsi.appspot.com",
        VITE_FIREBASE_API_KEY: "demo-local", VITE_FIREBASE_AUTH_DOMAIN: "demo-darsi.firebaseapp.com", VITE_FIREBASE_APP_ID: "1:000000000000:web:local",
      });
    } finally { Object.assign(process.env, outside); }
  });

  it("sets every setting the example lists, so none falls through to the live .env.local", () => {
    expect(keys(".env.e2e")).toEqual(expect.arrayContaining(keys(".env.example")));
    // The same settings as npm run dev, apart from the emulators.
    expect(keys(".env.e2e").sort()).toEqual(keys(".env.development").sort());
  });

  it("is kept in git, though other .env files are not", () => {
    const ignore = readFileSync(join(dir, "../../.gitignore"), "utf8").split(/\r?\n/);
    expect(ignore.indexOf("!apps/web/.env.e2e")).toBeGreaterThan(ignore.indexOf(".env*"));
  });

  it("is what Playwright builds with, into a folder of its own", () => {
    const config = read("playwright.config.ts").replace(/^\s*\/\/.*$/gm, ""); // the code, not its comments
    expect(config).toContain("vite build --mode e2e --outDir dist-e2e --emptyOutDir");
    expect(config).toContain("vite preview --outDir dist-e2e");
    expect(config).not.toMatch(/npm run build/); // that one reads .env.local and overwrites apps/web/dist
    expect(config).toContain("forbidOnly: !!process.env.CI");
    expect(config).toContain("retries: process.env.CI ? 1 : 0");
    expect(config).toMatch(/name: "webkit-phone", grep: \/@smoke\//);
  });
});

describe("what the precache leaves out", () => {
  const onDemand = (file: string) => ON_DEMAND.some((p) => p.re.test(file));

  it("leaves the legal pages' chunk out, by name", () => {
    expect(onDemand("assets/Legal-abc.js")).toBe(true);
    expect(onDemand("Legal-abc.js")).toBe(true);
    expect(onDemand("assets/Legal-DEFGHIJK.css")).toBe(true);
    expect(ON_DEMAND.some((p) => /[{,]Legal[,}]/.test(p.glob))).toBe(true);
    // Only that chunk: a startup file that merely starts with the word stays precached.
    expect(onDemand("assets/LegalNotice-abc.js")).toBe(false);
    expect(onDemand("assets/index-abc.js")).toBe(false);
    expect(onDemand("boot.js")).toBe(false);
  });

  it("treats a chunk made only of src/staff code as staff, and one that startup or learners share as not", () => {
    const src = "H:/x/apps/web/src";
    const chunk = (fileName: string, moduleIds: string[], o: { imports?: string[]; isEntry?: boolean; css?: string[] } = {}) =>
      [fileName, { type: "chunk", fileName, moduleIds, imports: o.imports ?? [], isEntry: !!o.isEntry, code: "", viteMetadata: { importedCss: new Set(o.css ?? []) } }];
    const bundle = Object.fromEntries([
      chunk("assets/index-AAAAAAAA.js", [`${src}/main.tsx`], { isEntry: true, imports: ["assets/tabs-STARTUP0.js"] }),
      // staff code that startup imports (it shouldn't, but then it must stay precached)
      chunk("assets/tabs-STARTUP0.js", [`${src}/staff/tabs.ts`]),
      chunk("assets/Tabs-BBBBBBBB.js", [`${src}/staff/Tabs.tsx`, `${src}/staff/strings.ts`, "H:/x/node_modules/react/index.js"], { css: ["assets/Tabs-CCCCCCCC.css"] }),
      chunk("assets/sso-DDDDDDDD.js", [`C:\\x\\apps\\web\\src\\staff\\sso.ts`, `${src}/admin/data.ts`]),
      chunk("assets/mixed-EEEEEEEE.js", [`${src}/staff/strings.ts`, `${src}/lesson/engine.ts`]),
      // A stylesheet in the chunk (src/styles is nobody's folder) follows the code that imports it: staff here…
      chunk("assets/Panels-GGGGGGGG.js", [`${src}/styles/tabs.css`, `${src}/admin/Tabs.tsx`], { css: ["assets/Panels-HHHHHHHH.css"] }),
      // …and not staff there, nor is a chunk of nothing but styles.
      chunk("assets/card-IIIIIIII.js", [`${src}/styles/lesson.css`, `${src}/lesson/Card.tsx`], { css: ["assets/card-JJJJJJJJ.css"] }),
      chunk("assets/styles-KKKKKKKK.js", [`${src}/styles/admin.css`]),
      ["assets/Panels-HHHHHHHH.css", { type: "asset", fileName: "assets/Panels-HHHHHHHH.css", source: "" }],
      ["assets/card-JJJJJJJJ.css", { type: "asset", fileName: "assets/card-JJJJJJJJ.css", source: "" }],
      // "staff" somewhere else in the path is not the folder
      chunk("assets/staffroom-FFFFFFFF.js", [`${src}/labs/apps/staff/index.tsx`]),
      ["assets/Tabs-CCCCCCCC.css", { type: "asset", fileName: "assets/Tabs-CCCCCCCC.css", source: "" }],
    ]);
    expect([...staffOnly(bundle as never)].sort()).toEqual(["assets/Panels-GGGGGGGG.js", "assets/Panels-HHHHHHHH.css", "assets/Tabs-BBBBBBBB.js", "assets/Tabs-CCCCCCCC.css", "assets/sso-DDDDDDDD.js"]);
  });
});

describe("the build's name (buildStamp)", () => {
  it("is DARSI_BUILD when the release gives one", () => {
    expect(buildStamp("4245d198-20261111")).toBe("4245d198-20261111");
    expect(buildStamp("  rc1 ")).toBe("rc1");
  });
  it("is otherwise the commit and the day (UTC), or \"dev\" without git", () => {
    const stamp = buildStamp("", new Date("2026-11-11T23:30:00Z"));
    expect(stamp).toMatch(/^(?:[0-9a-f]{4,40}-20261111|dev)$/);
    expect(buildStamp(undefined, new Date("2026-01-02T00:00:00Z"))).toMatch(/^(?:[0-9a-f]{4,40}-20260102|dev)$/);
  });
  it("is declared for the app's code, which reads it through src/build.ts", () => {
    expect(read("src/vite-env.d.ts")).toMatch(/declare const __DARSI_BUILD__: string \| undefined;/);
    expect(read("vite.config.ts")).toContain("define: { __DARSI_BUILD__: JSON.stringify(buildStamp()) }");
  });
});

describe("the service worker's registration (darsi-early-sw)", () => {
  const html = read("index.html");

  it("names the service worker on the boot tag at build time, and fails a page that lost the tag", () => {
    const built = withSwRegistration(html);
    expect(built).toContain('<script src="/boot.js" data-sw="/sw.js"></script>');
    expect(built).not.toContain('<script src="/boot.js"></script>');
    expect(built).not.toContain("serviceWorker.register");
    expect(withSwRegistration(built)).toBe(built); // a second pass over the same page changes nothing and does not fail
    expect(() => withSwRegistration("<html><body></body></html>")).toThrow(/boot\.js/);
  });
});

describe("the unit tests' own settings (vitest.config.ts)", () => {
  it("gives findBy… and waitFor five seconds in every test file (tests/setup.ts)", () => {
    expect(getConfig().asyncUtilTimeout).toBe(5000);
    const config = read("vitest.config.ts");
    expect(config).toContain('setupFiles: ["tests/setup.ts"]');
    expect(config).toContain("retry: process.env.CI ? 1 : 0");
  });

  it("gives a test longer than one wait, so a wait that never passes fails with its own message", () => {
    // Equal, the test's timeout fires first: "Test timed out in 5000ms", and Testing Library's message with the page is lost.
    const testTimeout = Number(/testTimeout: ([\d_]+)/.exec(read("vitest.config.ts"))?.[1].replace(/_/g, ""));
    expect(testTimeout).toBeGreaterThanOrEqual(2 * getConfig().asyncUtilTimeout);
  });
});
