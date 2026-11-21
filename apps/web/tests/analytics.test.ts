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
/** The batch in a request (the last one unless `at` says which), ungzipped. */
async function lastBatch(at = -1) {
  const [url, init] = fetchMock.mock.calls.at(at)!;
  const body = init.body as Blob | string;
  const text = typeof body === "string" ? body : await new Response(new Response(await (body as Blob).arrayBuffer()).body!.pipeThrough(new DecompressionStream("gzip"))).text();
  return { url: url as string, batch: JSON.parse(text) as { d: string; b: string; c: unknown; e: Array<{ n: string; o?: 1; p?: Record<string, unknown> }> } };
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
    // Who sent it, and which build (build.ts: "dev" wherever vite.config.ts doesn't name one, as in tests).
    expect(batch.c).toEqual({ ...ctx, v: "dev" });
    expect(batch.d).toMatch(/^[a-z0-9]{20}$/);
    expect(batch.b).toMatch(/^[0-9a-f]{16}$/);
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

  it("sends a batch that got no answer again under the same id, and the next batch under a new one", async () => {
    configureAnalytics({ enabled: true, dataSaver: false, context: ctx });
    track("session_start");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await flush(true);
    const first = (await lastBatch()).batch;
    // The batch on its way is kept with the stored queue at once (the app may be closing), not after the usual delay.
    expect(h.store.get("darsi:events")).toEqual({ e: [expect.objectContaining({ n: "session_start" })], b: { id: first.b, count: 1 } });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")); // no answer at all this time
    await flush(true);
    expect((await lastBatch()).batch.b).toBe(first.b);
    // Events made since then never join the batch that is being sent again: the server would skip them with it.
    track("screen_view", { s: "me" });
    track("lab_open", { lab: "neuron" });
    await flush(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const again = (await lastBatch(2)).batch, rest = (await lastBatch(3)).batch;
    expect(again.b).toBe(first.b);
    expect(again.e).toEqual(first.e);
    expect(rest.b).toMatch(/^[0-9a-f]{16}$/);
    expect(rest.b).not.toBe(first.b);
    expect(rest.e.map((e) => e.n)).toEqual(["screen_view", "lab_open"]);
    await flush(true);
    expect(fetchMock).toHaveBeenCalledTimes(4); // everything was taken
  });

  it("after a restart, sends the batch that was on its way under the id it had", async () => {
    const t = Math.floor(Date.now() / 1000);
    // What the last session left: three events, the first two already sent once with no answer seen.
    h.store.set("darsi:events", { e: [{ n: "session_start", t }, { n: "screen_view", t, p: { s: "learn" } }, { n: "screen_view", t, p: { s: "me" } }], b: { id: "0123456789abcdef", count: 2 } });
    configureAnalytics({ enabled: true, dataSaver: false, context: ctx });
    await flush(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const again = (await lastBatch(0)).batch, rest = (await lastBatch(1)).batch;
    expect(again.b).toBe("0123456789abcdef");
    expect(again.e.map((e) => e.p?.s ?? e.n)).toEqual(["session_start", "learn"]);
    expect(rest.b).not.toBe(again.b);
    expect(rest.e.map((e) => e.p?.s)).toEqual(["me"]);
  });

  it("reads the queue an older build stored (a plain list), and stores a plain list again when nothing is pending", async () => {
    vi.useFakeTimers();
    try {
      h.store.set("darsi:events", [{ n: "session_start", t: Math.floor(Date.now() / 1000) }]);
      configureAnalytics({ enabled: true, dataSaver: false, context: ctx });
      track("screen_view", { s: "learn" });
      await flush(true);
      expect((await lastBatch()).batch.e.map((e) => e.n)).toEqual(["session_start", "screen_view"]);
      track("screen_view", { s: "me" });
      await vi.advanceTimersByTimeAsync(2000); // the queue is saved a moment after it changes
      expect(h.store.get("darsi:events")).toEqual([expect.objectContaining({ n: "screen_view", p: { s: "me" } })]);
    } finally { vi.useRealTimers(); }
  });

  it("forgets the id of a waiting batch once the queue's cap has cut into it", async () => {
    configureAnalytics({ enabled: true, dataSaver: false, context: ctx });
    track("session_start");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await flush(true);
    const first = (await lastBatch()).batch.b;
    online(false); // nothing goes out while 300 more events push the old ones off the queue
    for (let i = 0; i < 300; i++) track("screen_view", { s: "learn" });
    online(true);
    await flush(true);
    const { batch } = await lastBatch();
    expect(batch.b).not.toBe(first);
    expect(batch.e).toHaveLength(100);
    expect(batch.e.some((e) => e.n === "session_start")).toBe(false);
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
    expect(batch.c).toEqual({ r: "guest", l: "en", i: 0, v: "dev" });
    expect(batch.e.map((e) => e.n)).toEqual(["lesson_complete"]);
    // A language change is not a new account: nothing extra is sent.
    track("screen_view", { s: "me" });
    configureAnalytics({ enabled: true, dataSaver: false, context: { r: "teacher", l: "ar", i: 0, o: "o1" } });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
