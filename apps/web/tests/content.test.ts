import type { Catalog, CatalogEntry, Unit } from "../src/content/types";

// Authored units come from Cloud Storage (public: plain fetch; org: the SDK reader App registers with setOrgReader)
// and are kept in Cache Storage by content/load.ts. fetch, caches and the org reader are fakes here.
vi.mock("../src/firebase-config", () => ({ firebaseConfig: { storageBucket: "bkt" }, firebaseReady: true, useEmulators: false }));
const fetchOrgJSON = vi.fn();

const entry = (id: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({ id, track: "ai", level: 1, title: { en: id }, summary: { en: "" }, lessons: 1, sizeMB: 1, available: true, ...extra });
const builtIn: Catalog = { version: 1, units: [entry("ai-1"), entry("iot-1", { available: false })] };
const unit = (id: string): Unit => ({ id, track: "ai", level: 1, title: { en: id }, summary: { en: "" }, lessons: [] });
const url = (path: string) => `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(path)}?alt=media`;

/** In-memory Cache Storage. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      match: async (k: string) => m.get(k)?.clone(),
      put: async (k: string, r: Response) => { m.set(k, r.clone()); },
      keys: async () => [...m.keys()].map((k) => ({ url: k }) as Request),
      delete: async (k: Request | string) => m.delete(typeof k === "string" ? k : k.url),
    };
  };
  return { open, stores };
}
let net: Record<string, unknown>;
let offline: boolean;
let cs: ReturnType<typeof fakeCaches>;

beforeEach(() => {
  vi.resetModules(); fetchOrgJSON.mockReset(); localStorage.clear();
  offline = false;
  net = { "/content/catalog.json": builtIn, "/content/units/ai-1.json": unit("ai-1") };
  cs = fakeCaches();
  vi.stubGlobal("caches", cs);
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    if (offline && u.startsWith("https://")) throw new TypeError("Failed to fetch");
    return u in net ? new Response(JSON.stringify(net[u])) : new Response("not found", { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
const load = async () => { const m = await import("../src/content/load"); m.setOrgReader((p) => fetchOrgJSON(p)); return m; };

describe("mergeCatalog", () => {
  it("lets public units replace built-in ones, appends new ones, and never lets an org unit replace anything", async () => {
    const { mergeCatalog } = await load();
    const pub: Catalog = { version: 1, units: [entry("ai-1", { src: "content/units/ai-1/v2.json", version: 2 }), entry("u12345678", { src: "content/units/u12345678/v1.json" })] };
    const org: Catalog = { version: 1, units: [entry("ai-1", { src: "orgs/o/units/ai-1/v1.json" }), entry("uorg00001", { src: "orgs/o/units/uorg00001/v1.json" }), { junk: true } as unknown as CatalogEntry] };
    const m = mergeCatalog(builtIn, pub, org);
    expect(m.units.map((u) => u.id)).toEqual(["ai-1", "iot-1", "u12345678", "uorg00001"]);
    expect(m.units[0].src).toBe("content/units/ai-1/v2.json");
  });
});

describe("loadCatalog", () => {
  it("shows guests the built-in and public units, and never loads the SDK module", async () => {
    net[url("content/catalog.json")] = { version: 1, units: [entry("u12345678", { src: "content/units/u12345678/v1.json" })] };
    const { configureContent, loadCatalog } = await load();
    configureContent({ orgId: null, signedIn: false });
    expect((await loadCatalog()).units.map((u) => u.id)).toEqual(["ai-1", "iot-1", "u12345678"]);
    expect(fetchOrgJSON).not.toHaveBeenCalled();
  });

  it("falls back to the built-in catalog when there is no public one yet", async () => {
    const { loadCatalog } = await load();
    expect((await loadCatalog()).units.map((u) => u.id)).toEqual(["ai-1", "iot-1"]);
  });

  it("adds the org's units for its members, through the SDK", async () => {
    fetchOrgJSON.mockResolvedValue({ version: 1, units: [entry("uorg00001", { src: "orgs/o1/units/uorg00001/v1.json", owner: "o1" })] });
    const { configureContent, loadCatalog } = await load();
    configureContent({ orgId: "o1", signedIn: true });
    expect((await loadCatalog()).units.map((u) => u.id)).toContain("uorg00001");
    expect(fetchOrgJSON).toHaveBeenCalledWith("orgs/o1/catalog.json");
  });

  it("keeps listing authored units offline from the last copy", async () => {
    net[url("content/catalog.json")] = { version: 1, units: [entry("u12345678", { src: "content/units/u12345678/v1.json" })] };
    await (await load()).loadCatalog(); // online: the public catalog is stored
    vi.resetModules(); offline = true; // next app start, no signal
    expect((await (await load()).loadCatalog()).units.map((u) => u.id)).toContain("u12345678");
  });
});

describe("loadUnit", () => {
  it("reads a published unit cache-first by its versioned path", async () => {
    net[url("content/catalog.json")] = { version: 1, units: [entry("u12345678", { src: "content/units/u12345678/v3.json" })] };
    net[url("content/units/u12345678/v3.json")] = unit("u12345678");
    const { loadUnit } = await load();
    expect((await loadUnit("u12345678")).id).toBe("u12345678");
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) => u === url("content/units/u12345678/v3.json")).length;
    vi.resetModules();
    const again = await load();
    await again.loadUnit("u12345678");
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) => u === url("content/units/u12345678/v3.json")).length).toBe(calls); // served from Cache Storage
  });

  it("still loads built-in units from /content", async () => {
    expect((await (await load()).loadUnit("ai-1")).id).toBe("ai-1");
  });
});

describe("signing out", () => {
  it("forgets cached org files but keeps public ones", async () => {
    fetchOrgJSON.mockResolvedValue({ version: 1, units: [] });
    net[url("content/catalog.json")] = { version: 1, units: [] };
    const { configureContent, loadCatalog } = await load();
    configureContent({ orgId: "o1", signedIn: true });
    await loadCatalog();
    const keys = async () => [...(cs.stores.get("darsi-content")?.keys() ?? [])];
    expect((await keys()).some((k) => k.includes("/o/orgs%2F"))).toBe(true);
    configureContent({ orgId: null, signedIn: false });
    await vi.waitFor(async () => expect((await keys()).some((k) => k.includes("/o/orgs%2F"))).toBe(false));
    expect((await keys()).some((k) => k.includes("/o/content%2Fcatalog.json"))).toBe(true);
  });
});

describe("unitAssetUrls", () => {
  it("leaves an authored unit's JSON out and includes uploaded files", async () => {
    const { unitAssetUrls } = await load();
    const u: Unit = { ...unit("u12345678"), lessons: [{ id: "u12345678-1", title: { en: "L" }, minutes: 5, tryTomorrow: { en: "x" }, slides: [],
      kit: [{ kind: "slides", title: { en: "S" }, pages: 1, formats: ["pdf"], urls: { en: { pdf: "https://x/slides.pdf" } } }],
      steps: [{ type: "video", id: "v", prompt: { en: "W" }, title: { en: "V" }, src: null, sources: { en: "https://x/v-en.mp4" }, captions: { en: "https://x/v-en.vtt" }, duration: 60, sizeMB: 2, transcript: { en: "t" } }] }] };
    expect(unitAssetUrls(u, "ar", entry("u12345678", { src: "content/units/u12345678/v1.json" }))).toEqual(["https://x/slides.pdf", "https://x/v-en.mp4"]);
    expect(unitAssetUrls(unit("ai-1"), "en")).toEqual(["/content/units/ai-1.json"]);
  });
});
