// The published JSON files' one writer (storage.ts saveJson): what it stores (gzipped JSON with its cache-control,
// unchanged), and that it waits out Storage's "too soon" answers itself. Every publish, unpublish, settings, plans,
// language and sites callable has already committed to Firestore when it writes its file, so a 429 that used to end the
// call left the editor and what phones read disagreeing.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Saved = { path: string; body: string; opts: { resumable?: boolean; gzip?: boolean; contentType?: string; metadata?: { cacheControl?: string } } };
/** Every save that worked, how many were tried, and what the next tries throw (in order). */
const store = vi.hoisted(() => ({ saves: [] as Saved[], tries: 0, fail: [] as unknown[], buckets: [] as string[] }));
vi.mock("firebase-admin/storage", () => ({
  getStorage: () => ({
    bucket: (name: string) => {
      store.buckets.push(name);
      return { file: (path: string) => ({ save: async (body: string, opts: Saved["opts"]) => {
        store.tries++;
        if (store.fail.length) throw store.fail.shift();
        store.saves.push({ path, body, opts });
      } }) };
    },
  }),
}));
vi.useFakeTimers({ toFake: ["setTimeout"] });

const { saveJson, savePublicJson, saveRetrying, SAVE_TRIES, BUCKET } = await import("../src/storage");
const tooSoon = () => Object.assign(new Error("The rate limit for object mutation has been exceeded"), { code: 429 });
/** The call's outcome once every wait has passed: "ok", or the error it gave up with. */
async function settled(p: Promise<unknown>): Promise<unknown> {
  const out = p.then(() => "ok", (e: unknown) => e);
  await vi.runAllTimersAsync();
  return out;
}

beforeEach(() => { store.saves.length = 0; store.tries = 0; store.fail = []; store.buckets.length = 0; });

describe("saveJson", () => {
  it("stores gzipped JSON with its cache-control in the app's bucket, in one try", async () => {
    await saveJson("content/units/ai-1/v2.json", "{\"id\":\"ai-1\"}", "public, max-age=31536000, immutable");
    expect(store.saves).toEqual([{
      path: "content/units/ai-1/v2.json", body: "{\"id\":\"ai-1\"}",
      opts: { resumable: false, gzip: true, contentType: "application/json; charset=utf-8", metadata: { cacheControl: "public, max-age=31536000, immutable" } },
    }]);
    expect(store.buckets).toEqual([BUCKET]);
    expect(store.tries).toBe(1);
  });

  it("waits and tries again when Storage says the object changed too recently (429), 1.2 s then 2.4 s later", async () => {
    store.fail = [tooSoon(), tooSoon()];
    const p = saveJson("content/catalog.json", "{}", "public, max-age=60");
    let done = false;
    void p.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.tries).toBe(1);
    await vi.advanceTimersByTimeAsync(1199);
    expect(store.tries).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.tries).toBe(2);
    await vi.advanceTimersByTimeAsync(2399);
    expect(store.tries).toBe(2);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(store.tries).toBe(3);
    expect(store.saves.map((s) => s.path)).toEqual(["content/catalog.json"]);
  });

  it("also tries again on 503 and on a rate-limit message without a code", async () => {
    store.fail = [Object.assign(new Error("Service Unavailable"), { code: 503 }), new Error("rateLimitExceeded: Rate limit exceeded for this object")];
    expect(await settled(saveJson("content/settings.json", "{}", "public, max-age=60"))).toBe("ok");
    expect(store.tries).toBe(3);
  });

  it("gives up after 5 tries and throws Storage's own error", async () => {
    const errors = Array.from({ length: 9 }, tooSoon);
    store.fail = [...errors];
    expect(SAVE_TRIES).toBe(5);
    expect(await settled(saveJson("content/catalog.json", "{}", "public, max-age=60"))).toBe(errors[4]);
    expect(store.tries).toBe(5);
    expect(store.saves).toEqual([]);
  });

  it("never tries a refusal again (403, 404, a bad request)", async () => {
    for (const code of [403, 404, 400]) {
      store.tries = 0;
      const refused = Object.assign(new Error("does not have storage.objects.create access"), { code });
      store.fail = [refused];
      expect(await settled(saveJson("content/catalog.json", "{}", "public, max-age=60")), String(code)).toBe(refused);
      expect(store.tries, String(code)).toBe(1);
    }
  });
});

describe("the small files phones re-check once a minute", () => {
  it("are public or private JSON with max-age=60, under either name, and tried again the same way", async () => {
    await savePublicJson("content/settings.json", { rev: 3 });
    await savePublicJson("orgs/o1/catalog.json", { version: 1, units: [] }, false);
    store.fail = [tooSoon()];
    expect(await settled(saveRetrying("content/sites.json", { v: 1, sites: {} }))).toBe("ok");
    expect(await settled(saveRetrying("orgs/o1/x.json", {}, false))).toBe("ok");
    expect(store.saves.map((s) => [s.path, s.body, s.opts.metadata?.cacheControl])).toEqual([
      ["content/settings.json", "{\"rev\":3}", "public, max-age=60"],
      ["orgs/o1/catalog.json", "{\"version\":1,\"units\":[]}", "private, max-age=60"],
      ["content/sites.json", "{\"v\":1,\"sites\":{}}", "public, max-age=60"],
      ["orgs/o1/x.json", "{}", "private, max-age=60"],
    ]);
  });
});
