import { brandUpdate } from "../src/state/orgBrand";
import { screenOf } from "../src/analytics/useAnalytics";

const h = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("../src/platform", () => ({
  storage: { get: async (k: string) => h.store.get(k), set: async (k: string, v: unknown) => { h.store.set(k, v); }, remove: async (k: string) => { h.store.delete(k); } },
}));
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { projectId: "demo" }, useEmulators: false, functionsRegion: "europe-west1" }));
vi.mock("../src/fb", () => ({ loadFirebase: () => Promise.reject(new Error("no SDK in this test")), call: () => vi.fn(), storedSession: async () => null }));

const { configureAnalytics, flush, resetAnalytics, track } = await import("../src/analytics/track");

const online = (on: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => on });
const ctx = { r: "teacher", l: "ar", i: 0 as const };
let fetchMock: ReturnType<typeof vi.fn>;
/** The batch in the last request, ungzipped. */
async function lastBatch() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  const body = init.body as Blob | string;
  const text = typeof body === "string" ? body : await new Response(new Response(await (body as Blob).arrayBuffer()).body!.pipeThrough(new DecompressionStream("gzip"))).text();
  return { url: url as string, batch: JSON.parse(text) as { d: string; c: unknown; e: Array<{ n: string; o?: 1; p?: Record<string, unknown> }> } };
}

beforeEach(() => {
  resetAnalytics(); h.store.clear(); online(true);
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("analytics queue", () => {
  it("keeps events offline and sends them in one gzipped batch once 30 have built up", async () => {
    configureAnalytics({ enabled: true, dataSaver: false, context: ctx });
    online(false);
    for (let i = 0; i < 29; i++) track("screen_view", { s: "learn" });
    await flush(true);
    expect(fetchMock).not.toHaveBeenCalled(); // offline: nothing goes out, nothing is lost
    online(true);
    track("lesson_complete", { u: "ai-1-1", acc: 80 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const { url, batch } = await lastBatch();
    // Gzipped where the browser has CompressionStream (jsdom has not): same address, ?z=1.
    expect(url).toBe(typeof CompressionStream === "function" ? "/api/collect?z=1" : "/api/collect");
    expect(batch.c).toEqual(ctx);
    expect(batch.d).toMatch(/^[a-z0-9]{20}$/);
    expect(batch.e).toHaveLength(30);
    expect(batch.e[0].o).toBe(1); // made offline
    expect(batch.e[29]).toMatchObject({ n: "lesson_complete", p: { u: "ai-1-1", acc: 80 } });
    await flush(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the queue is empty now
  });

  it("sends a few events when the app goes to the background, at most every 15 minutes", async () => {
    configureAnalytics({ enabled: true, dataSaver: false, context: ctx });
    track("session_start");
    await flush(); // not leaving, not full: waits
    expect(fetchMock).not.toHaveBeenCalled();
    await flush(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    track("screen_view", { s: "me" });
    await flush(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // sent a moment ago
  });

  it("keeps a batch the server could not take, and drops one it refused as malformed", async () => {
    configureAnalytics({ enabled: true, dataSaver: false, context: ctx });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    track("session_start");
    await flush(true);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    await flush(true); // the same event again, still queued
    expect((await lastBatch()).batch.e).toHaveLength(1);
    await flush(true);
    expect(fetchMock).toHaveBeenCalledTimes(2); // refused as malformed: gone
  });

  it("with Data saver, waits for 100 events or a day", async () => {
    configureAnalytics({ enabled: true, dataSaver: true, context: ctx });
    for (let i = 0; i < 40; i++) track("screen_view", { s: "learn" });
    await flush(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("switched off in Me: nothing is kept or sent", async () => {
    configureAnalytics({ enabled: true, dataSaver: false, context: ctx });
    track("session_start");
    configureAnalytics({ enabled: false, dataSaver: false, context: ctx });
    track("session_start");
    await flush(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("screenOf", () => {
  it("names a screen by the first part of its path", () => {
    expect(screenOf("/")).toBe("home");
    expect(screenOf("/lesson/ai-1-1/ai-1-1-1")).toBe("lesson");
    expect(screenOf("/super/analytics")).toBe("super");
  });
});

describe("organization brand", () => {
  it("fetches the logo only when its version changed", () => {
    expect(brandUpdate("o1", { name: "Nile School", brand: { logo: "orgs/o1/brand/logo-abc123.webp", v: 2 } }))
      .toEqual({ brand: { id: "o1", name: "Nile School", v: 2 }, fetchLogo: "orgs/o1/brand/logo-abc123.webp" });
    const have = { id: "o1", name: "Nile School", v: 2, logo: "data:image/webp;base64,AA" };
    expect(brandUpdate("o1", { name: "Nile School", brand: { logo: "orgs/o1/brand/logo-abc123.webp", v: 2 } }, have)).toBeNull();
    // Renamed only: the kept logo stays, nothing to download.
    expect(brandUpdate("o1", { name: "Nile Academy", brand: { logo: "orgs/o1/brand/logo-abc123.webp", v: 2 } }, have))
      .toEqual({ brand: { ...have, name: "Nile Academy" }, fetchLogo: null });
    // Logo removed.
    expect(brandUpdate("o1", { name: "Nile School", brand: { logo: null, v: 3 } }, have)).toEqual({ brand: { id: "o1", name: "Nile School", v: 3 }, fetchLogo: null });
    // Another organization: start over.
    expect(brandUpdate("o2", { name: "Delta" }, have)).toEqual({ brand: { id: "o2", name: "Delta", v: 0 }, fetchLogo: null });
  });
});

describe("signing in or out", () => {
  beforeEach(() => { resetAnalytics(); h.store.clear(); online(true); fetchMock = vi.fn(async () => new Response(null, { status: 204 })); vi.stubGlobal("fetch", fetchMock); });
  it("sends what the previous account did at once, as that account", async () => {
    configureAnalytics({ enabled: true, dataSaver: false, context: { r: "guest", l: "en", i: 0 } });
    await flush(); // let the stored queue load
    track("lesson_complete", { u: "ai-1-1" });
    configureAnalytics({ enabled: true, dataSaver: false, context: { r: "teacher", l: "en", i: 0, o: "o1" } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const { batch } = await lastBatch();
    expect(batch.c).toEqual({ r: "guest", l: "en", i: 0 });
    expect(batch.e.map((e) => e.n)).toEqual(["lesson_complete"]);
    // A language change is not a new account: nothing extra is sent.
    track("screen_view", { s: "me" });
    configureAnalytics({ enabled: true, dataSaver: false, context: { r: "teacher", l: "ar", i: 0, o: "o1" } });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
