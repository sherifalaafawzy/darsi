// What the phone saved for offline stays there, on the page's side: the pins a download or "Save all labs" makes
// (platform/offline.ts), and what a lab or code step does when its runtime or chunk isn't on the phone.
// The worker's side is in tests/offline-sw.test.ts. Cache Storage and fetch are fakes here.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { fakeCaches, json } from "./stubs/caches";

vi.mock("../src/code/CodeSteps", () => { throw new Error("Failed to fetch dynamically imported module"); });

describe("pinning (platform/offline.ts)", () => {
  const MANIFEST = { v: 1, groups: {
    code: ["assets/CodeSteps-A1.js", "assets/CodeSteps-A2.css", "assets/sandbox-A3.js"],
    "lab:bias": ["assets/lab-bias-B1.js"],
    "lab:minilm": ["assets/lab-minilm-B2.js"],
  } };
  let cs: ReturnType<typeof fakeCaches>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let manifest: unknown;
  beforeEach(() => {
    vi.resetModules();
    cs = fakeCaches(location.origin);
    manifest = MANIFEST;
    fetchMock = vi.fn(async (u: string) => (u === "/offline-manifest.json" ? (manifest ? json(manifest) : new Response("", { status: 404 })) : new Response(`file ${u}`)));
    vi.stubGlobal("caches", cs);
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  const load = () => import("../src/platform/offline");
  const saved = () => cs.paths("darsi-saved").filter((p) => p.startsWith("/assets/"));

  it("saves a course's code steps and labs in darsi-saved, moving a copy the worker already had", async () => {
    cs.seed("darsi-labs", ["/assets/lab-bias-B1.js"]);
    const { pinGroups, readPins } = await load();
    await pinGroups(["code", "lab:bias"]);
    expect(saved()).toEqual(["/assets/CodeSteps-A1.js", "/assets/CodeSteps-A2.css", "/assets/lab-bias-B1.js", "/assets/sandbox-A3.js"]);
    // The worker answers these from its own cache when it can, and doesn't keep a second copy (cache: "no-store").
    const chunks = fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/assets/"));
    expect(chunks.length).toBe(4);
    expect(chunks.every(([, o]) => (o as RequestInit).cache === "no-store")).toBe(true);
    expect(cs.paths("darsi-labs")).toEqual([]);
    expect(await readPins()).toEqual(["code", "lab:bias"]);
  });

  it("\"labs\" pins every lab, and setPins keeps exactly what is still needed", async () => {
    const { pinGroups, setPins, readPins, groupsSaved } = await load();
    await pinGroups(["labs"]);
    await pinGroups(["code"]);
    expect(saved()).toHaveLength(5);
    expect(await readPins()).toEqual(["code", "labs"]);
    await setPins(["lab:bias"], { offline: true });
    expect(saved()).toEqual(["/assets/lab-bias-B1.js"]);
    expect(await readPins()).toEqual(["lab:bias"]);
    expect(await groupsSaved(["lab:bias"])).toBe(true);
    expect(await groupsSaved(["code"])).toBe(false);
  });

  it("never pins a web page as a chunk (a Wi-Fi sign-in page answering every request): the download fails instead", async () => {
    fetchMock.mockImplementation(async (u: string) => (u === "/offline-manifest.json" ? json(MANIFEST) : new Response("<html>Sign in</html>", { headers: { "Content-Type": "text/html" } })));
    const { pinGroups, groupsSaved } = await load();
    await expect(pinGroups(["lab:bias"])).rejects.toThrow();
    expect(saved()).toEqual([]);
    expect(await groupsSaved(["lab:bias"])).toBe(false);
  });

  it("without a build manifest (development), loads the chunks the usual way and still records the pins", async () => {
    manifest = null;
    const warm = vi.fn(async () => {});
    const { pinGroups, readPins } = await load();
    await pinGroups(["code"], { warm });
    expect(warm).toHaveBeenCalled();
    expect(saved()).toEqual([]);
    expect(await readPins()).toEqual(["code"]);
  });
});

describe("offline, without a saved runtime or code chunk", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("the sandbox says \"offline\" for a failed request as for an error answer, so labs and code steps show their download note", async () => {
    const { runtimeFile } = await import("../src/code/sandbox");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(runtimeFile("/lib/python/v1/micropython.js", (r) => r.text())).rejects.toThrow(/^offline$/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 504 })));
    await expect(runtimeFile("/lib/python/v1/micropython.js", (r) => r.text())).rejects.toThrow(/^offline$/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("print")));
    await expect(runtimeFile("/lib/python/v1/micropython.js", (r) => r.text())).resolves.toBe("print");
  });

  it("a code exercise that can't load offers Retry and lets the learner skip it", async () => {
    const { CodeStepEmbed } = await import("../src/code/loader");
    const { I18nProvider } = await import("../src/i18n");
    const onSkip = vi.fn();
    const step = { id: "s1", type: "code", lang: "python", prompt: { en: "Print hi" } } as never;
    const props = { step, result: null, onAnswer: () => {}, onUngradedReady: () => {}, attempt: 0, lessonId: "l1", unitId: "u1", onSkip };
    render(createElement(I18nProvider, { lang: "en", children: createElement(CodeStepEmbed, props) }));
    expect(await screen.findByText("This exercise isn’t on this phone yet. Connect once to open it.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip this exercise" }));
    expect(onSkip).toHaveBeenCalled();
  });

  it("labs that run code list their runtime, so a downloaded course saves it too", async () => {
    const { LAB_RUNTIMES } = await import("../src/labs/loader");
    const dir = join(__dirname, "../src/labs/apps");
    const found: Record<string, string> = {};
    for (const id of readdirSync(dir)) {
      const f = join(dir, id, "index.tsx");
      const m = existsSync(f) ? /\.prepare\("(python|sql)"\)/.exec(readFileSync(f, "utf8")) : null;
      if (m) found[id] = m[1];
    }
    expect(found).toEqual(LAB_RUNTIMES);
  });

  it("labs that run Darsi Tiny are listed with the model's path, so a downloaded course can offer to save it", async () => {
    const { LAB_MODEL, MODEL_BASE, MODEL_FILES } = await import("../src/labs/loader");
    const { TINYLM_BASE } = await import("../src/tinylm");
    expect(MODEL_BASE).toBe(TINYLM_BASE);
    expect(MODEL_FILES.at(-1)).toBe(`${TINYLM_BASE}model.bin`); // last: the labs take it as "the model is here"
    const dir = join(__dirname, "../src/labs/apps");
    // A lab that loads the model takes useTiny from the agents labs (agentloop/lab-agents) or the security labs
    // (inject/lab-tiny). The tutor lab draws with another model (useTeachBase) and is in no course.
    const found = readdirSync(dir).filter((id) => {
      const f = join(dir, id, "index.tsx");
      return existsSync(f) && /import \{[^}]*\buseTiny\b[^}]*\} from "(?:\.\.\/agentloop\/lab-agents|\.\.\/inject\/lab-tiny|\.\/lab-agents|\.\/lab-tiny)"/.test(readFileSync(f, "utf8"));
    });
    expect(found.sort()).toEqual([...LAB_MODEL].sort());
  });
});
