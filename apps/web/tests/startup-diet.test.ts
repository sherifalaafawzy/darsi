// The startup file's diet (CLAUDE.md "Keep the startup bundle in one file"; scripts/bundle-budget.json): the account
// screens, Me, Kit, My tracks and Labs load as one lazy chunk (src/screens/more.ts), and the school chunks they show are
// imported by App and handed over (auth/sso.ts setSchoolChunks). One lazy chunk per page split the startup file into 22
// files, and an import() made inside the chunk split it too: these checks keep both from coming back unnoticed. The
// build itself is measured by scripts/check-bundle.mjs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const read = (file: string) => readFileSync(join(__dirname, "../src", file), "utf8");
/** The specifiers of a file's import() calls: comments and `typeof import("…")` types (erased at build) left out. */
const dynamicImports = (file: string) => [...read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
  .matchAll(/(?<!typeof\s)\bimport\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]);

describe("the school chunks (auth/sso.ts)", () => {
  it("refuse until App registers them, as when a chunk can't load, then load what was registered", async () => {
    vi.resetModules();
    const sso = await import("../src/auth/sso");
    await expect(sso.loadSchoolFinder()).rejects.toThrow("school chunks not registered");
    await expect(sso.loadSchoolLink()).rejects.toThrow("school chunks not registered");
    const finder = { SchoolTestDone: () => null }, link = { SchoolLink: () => null };
    const load = { finder: vi.fn(async () => finder), link: vi.fn(async () => link) };
    sso.setSchoolChunks(load as unknown as Parameters<typeof sso.setSchoolChunks>[0]);
    expect(await sso.loadSchoolFinder()).toBe(finder);
    expect(await sso.loadSchoolLink()).toBe(link);
    expect(load.finder).toHaveBeenCalledTimes(1);
    expect(load.link).toHaveBeenCalledTimes(1);
  });

  it("App registers both, with the only import() of them", () => {
    const app = read("App.tsx");
    expect(app).toMatch(/setSchoolChunks\(\{ finder: \(\) => import\("\.\/auth\/SchoolFinder"\), link: \(\) => import\("\.\/auth\/SchoolLink"\) \}\)/);
    expect(dynamicImports("auth/sso.ts")).toEqual([]);
  });
});

describe("what startup hands the lazy pages instead of letting them import it", () => {
  it("the return from a school's provider is taken out of the address by auth/sso.ts itself as it loads, with no import of the flow", () => {
    const sso = read("auth/sso.ts");
    // Run at module load (App imports the module before it renders the router), not from a screen's effect.
    expect(sso).toMatch(/^stashReturn\(\);$/m);
    // Startup's part stays tiny: it imports nothing (the flow, the words and the screens are the lazy school chunks').
    expect(sso.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/^\s*import\s/m);
    expect(read("App.tsx")).not.toContain("./auth/ssoFlow");
  });

  it("Course results and Course access get the catalog's subscription from content/load, which App already imports", () => {
    const app = read("App.tsx");
    expect(app).toContain("const CONTENT = { loadCatalog, loadUnit, subscribe: subscribeCatalog };");
    expect(app).toMatch(/import \{[^}]*\bsubscribeCatalog\b[^}]*\} from "\.\/content\/load";/);
    // The pages themselves stay lazy, and never import content/load (results/async.ts says why).
    expect(app).toContain('lazyRetry(() => import("./results/CourseResults")');
    expect(app).toContain('lazyRetry(() => import("./results/CourseAccess")');
    for (const file of ["results/async.ts", "results/CourseResults.tsx", "results/CourseAccess.tsx"]) expect(read(file), file).not.toMatch(/from "\.\.\/content\/load"/);
    expect(dynamicImports("content/load.ts").filter((spec) => spec.startsWith("."))).toEqual([]);
  });
});

describe("the lazy pages (screens/more.ts)", () => {
  // Every module that is only in the chunk: an import() of app code made from one of them splits the startup file.
  const IN_CHUNK = ["screens/more.ts", "auth/AuthScreens.tsx", "screens/Me.tsx", "screens/Kit.tsx", "screens/MyTracks.tsx", "screens/Labs.tsx",
    "notify/NotificationsPanel.tsx", "account/MyData.tsx", "screens/MyProjects.tsx"];

  it("export every page App routes to", async () => {
    const more = await import("../src/screens/more");
    for (const page of ["SignIn", "SignUp", "Forgot", "SetPassword", "NotConfigured", "Me", "Kit", "MyTracks", "Labs", "LabApp"] as const) {
      expect(typeof more[page], page).toBe("function");
    }
  });

  it("are not imported statically by App, which loads them from the one chunk", () => {
    const app = read("App.tsx");
    for (const mod of ["./auth/AuthScreens", "./screens/Me", "./screens/Kit", "./screens/MyTracks", "./screens/Labs"]) {
      expect(app, mod).not.toContain(`from "${mod}"`);
      expect(app, mod).not.toContain(`import("${mod}")`);
    }
    expect(app).toContain('const more = () => import("./screens/more");');
  });

  it("make no import() of the app's own modules (the Firebase SDK's are fine: they share nothing with startup)", () => {
    for (const file of IN_CHUNK) {
      expect(dynamicImports(file).filter((spec) => spec.startsWith(".")), file).toEqual([]);
    }
  });

  it("keep the labs catalogue's stylesheet global (main.tsx), as before the screen became lazy", () => {
    expect(read("main.tsx")).toContain('import "./styles/labs.css";');
  });
});
