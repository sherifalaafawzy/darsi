// Downloads: Data saver asks before using mobile data, a saved course that is out of date or missing files says so,
// Remove frees every version and language of a course, a full phone is told so, and once per version the courses'
// chunks are pinned (useOfflineRefresh). Cache Storage, fetch, the catalog and the store are fakes here.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nProvider } from "../src/i18n";
import type { AppState } from "../src/state/store";
import { fakeCaches } from "./stubs/caches";

const h = vi.hoisted(() => ({
  state: {} as Partial<AppState>,
  dispatch: vi.fn(),
  catalog: null as null | Promise<unknown>,
  pinGroups: vi.fn(async () => {}),
  setPins: vi.fn(async () => {}),
  readPins: vi.fn(async () => [] as string[]),
}));
const media = (id: string, file: string) => `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(`content/media/${id}/${file}`)}?alt=media`;
const entry = (id: string) => ({ id, track: "ai", level: 4, title: { en: `Course ${id}` }, summary: { en: "" }, lessons: 2, sizeMB: 2, sizeByLang: { en: 2 }, available: true, src: `content/units/${id}/v3.json`, version: 3 });
// u4's lab runs Darsi Tiny; the others' runs Python.
const unit = (id: string) => ({ id, track: "ai", level: 4, title: { en: `Course ${id}` }, summary: { en: "" }, lessons: [{ id: `${id}-1`, title: { en: "One" }, kit: [], steps: [{ id: "s1", type: "lab", tool: id === "u4" ? "memory" : "bugs" }] }] });
const MODEL = ["manifest.json", "tokenizer.json", "world.json", "replay.json", "model.bin"].map((f) => `/lib/tinylm/v1/${f}`);
const MODEL_MANIFEST = { files: { "model.bin": { gzip: 2746862 }, "tokenizer.json": { gzip: 10746 }, "world.json": { gzip: 15720 }, "replay.json": { gzip: 8782 } } };
const files = (id: string, lang = "en") => [media(id, `kit-${lang}.pdf`), media(id, `h1/${id}-1/light/audio/${lang}.opus`)];
const RUNTIME = ["/lib/python/v1/micropython.js", "/lib/python/v1/micropython.wasm"];

vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadCatalog: () => h.catalog,
  loadUnit: async (id: string) => unit(id),
  unitAssetUrls: (u: { id: string }, lang: string) => files(u.id, lang),
}));
vi.mock("../src/content/mine", () => ({ useMine: () => ({ isMine: () => true }) }));
vi.mock("../src/state/store", () => ({ useStore: () => ({ state: h.state, dispatch: h.dispatch, ready: true }) }));
vi.mock("../src/platform/offline", () => ({ pinGroups: h.pinGroups, setPins: h.setPins, readPins: h.readPins, groupsSaved: async () => true }));
vi.mock("../src/lesson/LightLesson", () => ({ lightPacksOf: async () => [], prefetchLightPacks: async () => {} }));
vi.mock("../src/code/loader", () => ({ prefetchCodeSteps: async () => {} }));
vi.mock("../src/labs/loader", () => ({
  hasLab: (id: string) => id === "bugs" || id === "memory", labGroup: (id: string) => `lab:${id}`, LAB_RUNTIMES: { bugs: "python" }, prefetchLabs: async () => {},
  LAB_MODEL: new Set(["memory"]), MODEL_BASE: "/lib/tinylm/v1/", MODEL_FILES: MODEL,
}));
vi.mock("../src/analytics/track", () => ({ track: vi.fn() }));

const { Downloads, useOfflineRefresh } = await import("../src/screens/Downloads");

let cs: ReturnType<typeof fakeCaches>;
const fetchMock = vi.fn(async (u: string) => (u === MODEL[0] ? new Response(JSON.stringify(MODEL_MANIFEST)) : new Response(`file ${u}`)));
const setConnection = (c: object | undefined) => Object.defineProperty(navigator, "connection", { configurable: true, value: c });
const setStorage = (s: object | undefined) => Object.defineProperty(navigator, "storage", { configurable: true, value: s });
beforeEach(() => {
  cs = fakeCaches(location.origin);
  vi.stubGlobal("caches", cs);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear(); h.dispatch.mockClear(); h.pinGroups.mockClear(); h.setPins.mockClear(); h.readPins.mockClear();
  h.state = { lang: "en", dataSaver: false, downloads: {} };
  h.catalog = Promise.resolve({ version: 1, units: [entry("u1"), entry("u2"), entry("u3")] });
  setConnection(undefined);
  setStorage({ estimate: async () => ({ quota: 5e9, usage: 1e6 }), persist: async () => true, persisted: async () => false });
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());
const show = () => render(<I18nProvider lang="en"><Downloads /></I18nProvider>);
const row = async (title: string) => (await screen.findByText(title)).closest(".stack-sm") as HTMLElement;
const fetchedMedia = () => fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("firebasestorage"));

describe("Downloads", () => {
  it("with Data saver on mobile data, a tap asks first, and Download anyway downloads the course", async () => {
    h.state = { ...h.state, dataSaver: true };
    setConnection({ type: "cellular" });
    show();
    expect(await screen.findByText(/Data saver is on: courses download over Wi-Fi only/)).toBeTruthy();
    fireEvent.click(within(await row("Course u1")).getByRole("button", { name: "Download" }));
    expect((await screen.findByRole("alert")).textContent).toContain("You’re on mobile data and Data saver is on. Download anyway (2 MB)?");
    expect(fetchedMedia()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Download anyway" }));
    await waitFor(() => expect(h.dispatch).toHaveBeenCalledWith({ type: "download", unit: "u1", on: true, v: 3, lang: "en" }));
    expect(cs.urls("darsi-media")).toEqual([...files("u1")].sort());
    // The lab in the course runs Python, so the runtime comes with it; its chunk is pinned.
    expect(cs.paths("darsi-lib")).toEqual(RUNTIME);
    expect(h.pinGroups).toHaveBeenCalledWith(["lab:bugs"], expect.anything());
  });

  it("on Wi-Fi it doesn't ask, even with the browser's Save-Data on", async () => {
    h.state = { ...h.state, dataSaver: true };
    setConnection({ type: "wifi", saveData: true });
    show();
    fireEvent.click(within(await row("Course u1")).getByRole("button", { name: "Download" }));
    await waitFor(() => expect(h.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "download", unit: "u1", on: true })));
    expect(screen.queryByText(/Data saver is on/)).toBeNull();
  });

  it("counts the browser's Save-Data as mobile data only when the phone can't tell the connection type", async () => {
    const { onMeteredConnection } = await import("../src/platform");
    const cases: [object | undefined, boolean][] = [[{ type: "cellular" }, true], [{ type: "wifi", saveData: true }, false], [{ saveData: true }, true],
      [{ type: "unknown", saveData: true }, true], [{ type: "unknown" }, false], [undefined, false]];
    for (const [c, metered] of cases) { setConnection(c); expect(onMeteredConnection()).toBe(metered); }
  });

  it("offers Update for a newer version, Download again when files are gone, and records an older download that is whole", async () => {
    h.state = { ...h.state, downloads: { u1: { v: 2, lang: "en" }, u2: { v: 3, lang: "en" }, u3: "done" } };
    cs.seed("darsi-media", [files("u2")[0], ...files("u3")]);
    cs.seed("darsi-lib", RUNTIME);
    show();
    expect(await within(await row("Course u1")).findByRole("button", { name: "Update" })).toBeTruthy();
    expect(await within(await row("Course u2")).findByRole("button", { name: "Download again" })).toBeTruthy();
    await waitFor(() => expect(h.dispatch).toHaveBeenCalledWith({ type: "download", unit: "u3", on: true, v: 3, lang: "en" }));
    expect(within(await row("Course u3")).getByText("Saved")).toBeTruthy();
    // Updating fetches only what is missing.
    fireEvent.click(within(await row("Course u2")).getByRole("button", { name: "Download again" }));
    await waitFor(() => expect(h.dispatch).toHaveBeenCalledWith({ type: "download", unit: "u2", on: true, v: 3, lang: "en" }));
    expect(fetchedMedia()).toEqual([files("u2")[1]]);
  });

  it("Remove frees every version and language of the course, and unpins what no other download needs", async () => {
    h.state = { ...h.state, downloads: { u1: { v: 3, lang: "en" }, u2: { v: 3, lang: "en" } } };
    const oldArabic = media("u1", "h0/u1-1/light/audio/ar.opus");
    cs.seed("darsi-media", [...files("u1"), oldArabic, ...files("u2")]);
    cs.seed("darsi-lib", RUNTIME);
    show();
    const r1 = await row("Course u1");
    await within(r1).findByText("Saved");
    fireEvent.click(within(r1).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(h.dispatch).toHaveBeenCalledWith({ type: "download", unit: "u1", on: false }));
    expect(cs.urls("darsi-media")).toEqual([...files("u2")].sort());
    expect(cs.paths("darsi-lib")).toEqual(RUNTIME); // shared with other courses and labs
    await waitFor(() => expect(h.setPins).toHaveBeenCalledWith(["lab:bugs"], { offline: true }));
  });

  it("says when the phone is full, and leaves nothing of the attempt behind", async () => {
    show();
    // Not enough room before it starts.
    setStorage({ estimate: async () => ({ quota: 1e6, usage: 0 }), persist: async () => true });
    fireEvent.click(within(await row("Course u1")).getByRole("button", { name: "Download" }));
    expect(await screen.findByText("Not enough space on this phone. Free some space, then try again.")).toBeTruthy();
    expect(fetchedMedia()).toEqual([]);
    // Full half way: what was stored goes again.
    setStorage({ estimate: async () => ({ quota: 5e9, usage: 0 }), persist: async () => true });
    const media0 = await cs.open("darsi-media");
    let n = 0;
    vi.spyOn(cs, "open").mockImplementation(async (name: string) => (name === "darsi-media" ? { ...media0, put: async (k: string, r: Response) => { if (n++) throw new DOMException("full", "QuotaExceededError"); await media0.put(k, r); } } : fakeCaches(location.origin).open(name)) as never);
    fireEvent.click(within(await row("Course u1")).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(n).toBe(2));
    expect(await screen.findByText("Not enough space on this phone. Free some space, then try again.")).toBeTruthy();
    expect(cs.urls("darsi-media")).toEqual([]);
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it("an update keeps only the new version's files: the old version's media leave", async () => {
    h.state = { ...h.state, downloads: { u1: { v: 2, lang: "en" } } };
    const oldAudio = media("u1", "h0/u1-1/light/audio/en.opus");
    cs.seed("darsi-media", [files("u1")[0], oldAudio]);
    cs.seed("darsi-lib", RUNTIME);
    show();
    fireEvent.click(await within(await row("Course u1")).findByRole("button", { name: "Update" }));
    await waitFor(() => expect(h.dispatch).toHaveBeenCalledWith({ type: "download", unit: "u1", on: true, v: 3, lang: "en" }));
    await waitFor(() => expect(cs.urls("darsi-media")).toEqual([...files("u1")].sort()));
  });

  it("a saved course whose labs run Darsi Tiny offers the model, with its size, once for every course", async () => {
    h.catalog = Promise.resolve({ version: 1, units: [entry("u4")] });
    h.state = { ...h.state, downloads: { u4: { v: 3, lang: "en" } } };
    cs.seed("darsi-media", files("u4"));
    show();
    expect(await screen.findByText("This course’s labs run Darsi Tiny, a small AI model that works on the phone. Save it too, so they work offline: 2.8 MB, once for every course.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save Darsi Tiny (2.8 MB)" }));
    await waitFor(() => expect(screen.queryByText(/This course’s labs run Darsi Tiny/)).toBeNull());
    expect(cs.paths("darsi-lib")).toEqual([...MODEL].sort());
    // Nothing is offered once the model is on the phone.
    cleanup();
    show();
    await within(await row("Course u4")).findByText("Saved");
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/This course’s labs run Darsi Tiny/)).toBeNull();
  });

  it("shows a loading block until the catalog arrives, not \"No downloads yet\"", async () => {
    h.catalog = new Promise(() => {});
    const { container } = show();
    expect(container.querySelector(".loading")).toBeTruthy();
    expect(screen.queryByText("No downloads yet")).toBeNull();
  });
});

describe("useOfflineRefresh", () => {
  function Probe() { useOfflineRefresh(); return null; }
  beforeEach(() => { (window as { requestIdleCallback?: unknown }).requestIdleCallback = (f: () => void) => { f(); return 1; }; });
  afterEach(() => { delete (window as { requestIdleCallback?: unknown }).requestIdleCallback; });

  it("pins what the downloaded courses need once per app version, online", async () => {
    h.state = { ...h.state, downloads: { u1: { v: 3, lang: "en" } } };
    const first = render(<Probe />);
    await waitFor(() => expect(h.setPins).toHaveBeenCalledWith(["lab:bugs"]));
    first.unmount();
    h.setPins.mockClear();
    render(<Probe />);
    await new Promise((r) => setTimeout(r, 20));
    expect(h.setPins).not.toHaveBeenCalled();
  });

  it("does nothing for someone with no downloads and nothing pinned", async () => {
    render(<Probe />);
    await waitFor(() => expect(h.readPins).toHaveBeenCalled());
    expect(h.setPins).not.toHaveBeenCalled();
  });
});
