// content/load.ts on a bad connection: a catalog that hangs gives way to the last copy (Home, Downloads and downloaded
// lessons don't wait on it), and a course republished while the phone was away still opens offline from the version it
// saved. tests/content.test.ts has the rest of the loader; fetch and Cache Storage are fakes here.
import type { CatalogEntry, Unit } from "../src/content/types";
import { fakeCaches, json } from "./stubs/caches";

vi.mock("../src/firebase-config", () => ({ firebaseConfig: { storageBucket: "bkt" }, firebaseReady: true, useEmulators: false }));

const url = (path: string) => `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(path)}?alt=media`;
const entry = (id: string, version: number): CatalogEntry => ({ id, track: "ai", level: 1, title: { en: id }, summary: { en: "" }, lessons: 1, sizeMB: 1, available: true, src: `content/units/${id}/v${version}.json`, version });
const unit = (id: string, title: string): Unit => ({ id, track: "ai", level: 1, title: { en: title }, summary: { en: "" }, lessons: [] });

let cs: ReturnType<typeof fakeCaches>;
let answer: (u: string) => Promise<Response>;
beforeEach(() => {
  vi.resetModules();
  cs = fakeCaches(location.origin);
  vi.stubGlobal("caches", cs);
  vi.stubGlobal("fetch", vi.fn((u: string) => answer(u)));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const load = () => import("../src/content/load");

describe("a connection that hangs", () => {
  it("answers with the last catalog after a moment, and keeps the network's copy for next time", async () => {
    cs.seed("darsi-content", []);
    await (await cs.open("darsi-content")).put(url("content/catalog.json"), json({ version: 1, units: [entry("old", 1)] }));
    let arrive: (r: Response) => void = () => {};
    answer = () => new Promise((r) => { arrive = r; });
    vi.useFakeTimers();
    const { loadCatalog, SLOW_MS } = await load();
    const p = loadCatalog();
    await vi.advanceTimersByTimeAsync(SLOW_MS + 10);
    expect((await p).units.map((u) => u.id)).toEqual(["old"]);
    // The answer comes in later: stored, so the next start sees the new catalog.
    arrive(json({ version: 1, units: [entry("new", 1)] }));
    await vi.advanceTimersByTimeAsync(10);
    await vi.waitFor(async () => expect(await (await (await cs.open("darsi-content")).match(url("content/catalog.json")))!.json()).toEqual({ version: 1, units: [entry("new", 1)] }));
  });

  it("still waits for the network on a first visit, when there is no copy to fall back on", async () => {
    answer = async () => json({ version: 1, units: [entry("first", 1)] });
    expect((await (await load()).loadCatalog()).units.map((u) => u.id)).toEqual(["first"]);
  });

  it("uses a quick answer from the network over the copy", async () => {
    await (await cs.open("darsi-content")).put(url("content/catalog.json"), json({ version: 1, units: [entry("old", 1)] }));
    answer = async () => json({ version: 1, units: [entry("new", 1)] });
    expect((await (await load()).loadCatalog()).units.map((u) => u.id)).toEqual(["new"]);
  });
});

describe("a course republished while the phone was away", () => {
  it("opens offline from the newest version saved on the phone", async () => {
    const c = await cs.open("darsi-content");
    await c.put(url("content/catalog.json"), json({ version: 1, units: [entry("u1", 6)] })); // the catalog says v6 …
    await c.put(url("content/units/u1/v4.json"), json(unit("u1", "v4")));
    await c.put(url("content/units/u1/v5.json"), json(unit("u1", "v5"))); // … but the download was v5
    await c.put(url("content/units/u10/v9.json"), json(unit("u10", "another course")));
    answer = async () => { throw new TypeError("Failed to fetch"); };
    expect((await (await load()).loadUnit("u1")).title.en).toBe("v5");
  });

  it("still fails for a course that was never on the phone", async () => {
    await (await cs.open("darsi-content")).put(url("content/catalog.json"), json({ version: 1, units: [entry("u2", 1)] }));
    answer = async () => { throw new TypeError("Failed to fetch"); };
    await expect((await load()).loadUnit("u2")).rejects.toThrow();
  });
});

describe("old versions of a course", () => {
  const versions = async (id: string) => (await (await cs.open("darsi-content")).keys()).map((k) => k.url).filter((u) => u.includes(encodeURIComponent(`content/units/${id}/`))).sort();

  it("leave once a new one is stored, except the version the phone downloaded", async () => {
    const c = await cs.open("darsi-content");
    await c.put(url("content/catalog.json"), json({ version: 1, units: [entry("u1", 6)] }));
    for (const v of [3, 4, 5]) await c.put(url(`content/units/u1/v${v}.json`), json(unit("u1", `v${v}`)));
    await c.put(url("content/units/u10/v2.json"), json(unit("u10", "another course")));
    answer = async (u) => (u.includes("v6") ? json(unit("u1", "v6")) : json({ version: 1, units: [entry("u1", 6)] }));
    const { loadUnit, setKeptVersions } = await load();
    setKeptVersions((id) => (id === "u1" ? 4 : undefined));
    expect((await loadUnit("u1")).title.en).toBe("v6");
    await vi.waitFor(async () => expect(await versions("u1")).toEqual([url("content/units/u1/v4.json"), url("content/units/u1/v6.json")]));
    expect(await versions("u10")).toEqual([url("content/units/u10/v2.json")]);
  });

  it("all stay for a download whose version wasn't recorded", async () => {
    const c = await cs.open("darsi-content");
    for (const v of [3, 4]) await c.put(url(`content/units/u1/v${v}.json`), json(unit("u1", `v${v}`)));
    answer = async (u) => (u.includes("v6") ? json(unit("u1", "v6")) : json({ version: 1, units: [entry("u1", 6)] }));
    const { loadUnit, setKeptVersions } = await load();
    setKeptVersions(() => null);
    await loadUnit("u1");
    await new Promise((r) => setTimeout(r, 20));
    expect(await versions("u1")).toHaveLength(3);
  });
});

describe("a catalog request that fails after the copy answered", () => {
  it("is nobody's error: no unhandled rejection", async () => {
    await (await cs.open("darsi-content")).put(url("content/catalog.json"), json({ version: 1, units: [entry("old", 1)] }));
    let fail: (e: Error) => void = () => {};
    answer = () => new Promise((_, reject) => { fail = reject; });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      vi.useFakeTimers();
      const { loadCatalog, SLOW_MS } = await load();
      const p = loadCatalog();
      await vi.advanceTimersByTimeAsync(SLOW_MS + 10);
      expect((await p).units.map((u) => u.id)).toEqual(["old"]);
      fail(new TypeError("Failed to fetch"));
      vi.useRealTimers();
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).not.toHaveBeenCalled();
    } finally { process.off("unhandledRejection", unhandled); }
  });
});

describe("the dev catalog", () => {
  it("is never read outside the Vite dev server (tests and builds)", async () => {
    answer = async () => json({ version: 1, units: [] });
    await (await load()).loadCatalog();
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([u]) => String(u).includes("dev-catalog"))).toBe(false);
  });
});
