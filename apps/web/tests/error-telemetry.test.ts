// The app's own errors as usage events (analytics/useAnalytics.ts, bugs/log.ts): each kind of error is counted once a
// session as `app_error` (screen, kind, a fingerprint of the message), at most five a session, on the usage queue with
// no request of its own, and never when sharing usage statistics is switched off.
import type { ErrorNote } from "../src/bugs/log";

const h = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("../src/platform", () => ({
  storage: { get: async (k: string) => h.store.get(k), set: async (k: string, v: unknown) => { h.store.set(k, v); }, remove: async (k: string) => { h.store.delete(k); } },
}));
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { projectId: "demo" }, useEmulators: false, functionsRegion: "europe-west1" }));
vi.mock("../src/fb", () => ({ loadFirebase: () => Promise.reject(new Error("no SDK in this test")), call: () => vi.fn(), storedSession: async () => null }));

const { configureAnalytics, flush, resetAnalytics } = await import("../src/analytics/track");
const { errorHash, resetErrorTelemetry, watchErrors } = await import("../src/analytics/useAnalytics");
const { startBugLog, bugLog, onError } = await import("../src/bugs/log");

type Sent = { n: string; p?: { s?: string; k?: string; h?: string } };
let fetchMock: ReturnType<typeof vi.fn>;
let stop: () => void = () => {};
/** Everything queued so far, as the server would get it (the app going to the background sends it). */
async function queued(): Promise<Sent[]> {
  fetchMock.mockClear();
  await flush(true);
  if (!fetchMock.mock.calls.length) return [];
  const body = fetchMock.mock.calls[0][1].body as Blob | string;
  const text = typeof body === "string" ? body : await new Response(new Response(await (body as Blob).arrayBuffer()).body!.pipeThrough(new DecompressionStream("gzip"))).text();
  return (JSON.parse(text) as { e: Sent[] }).e;
}
const errors = async () => (await queued()).filter((e) => e.n === "app_error");

const thrown = (message: string, at = "https://darsiai.org/assets/index-abc.js:10:5") => Object.assign(new Error(message), { stack: `Error: ${message}\n    at render (${at})\n    at next (https://darsiai.org/assets/index-abc.js:99:1)` });
const windowError = (e: Error) => window.dispatchEvent(new ErrorEvent("error", { message: `Uncaught Error: ${e.message}`, error: e }));
const rejection = (reason: unknown) => window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason }));
const appError = (e: Error, chunk: boolean) => window.dispatchEvent(new CustomEvent("darsi:app-error", { detail: { name: e.name, message: e.message, stack: e.stack, chunk } }));
const on = (enabled = true) => configureAnalytics({ enabled, dataSaver: false, context: { r: "teacher", l: "en", i: 0 } });

beforeAll(() => { startBugLog(); });
beforeEach(() => {
  resetAnalytics(); resetErrorTelemetry(); h.store.clear();
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  history.replaceState(null, "", "/lesson/ai-1-1/ai-1-1-2?step=3");
  on();
  stop = watchErrors();
});
afterEach(() => { stop(); vi.unstubAllGlobals(); });

describe("the app's own errors", () => {
  it("queues one app_error for a window error, with the screen, the kind and a 12-hex fingerprint", async () => {
    const e = thrown("x is not a function");
    windowError(e);
    expect(await errors()).toEqual([{ n: "app_error", t: expect.any(Number), p: { s: "lesson", k: "error", h: errorHash("Error: x is not a function", e.stack) } }]);
    expect(errorHash("Error: x is not a function", e.stack)).toMatch(/^[0-9a-f]{12}$/);
    // Nothing of the message or the address goes out: only the fingerprint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("queues one for a promise nobody caught", async () => {
    const e = thrown("The server said no");
    rejection(e);
    expect((await errors()).map((x) => x.p)).toEqual([{ s: "lesson", k: "rejection", h: errorHash("Error: The server said no", e.stack) }]);
  });

  it("queues one for what the error boundaries tell (darsi:app-error): a chunk that didn't load, a screen that crashed", async () => {
    const chunk = Object.assign(new TypeError("Failed to fetch dynamically imported module: https://darsiai.org/assets/Tutor-abc.js"), { stack: "" });
    appError(chunk, true);
    appError(thrown("Cannot read properties of undefined (reading 'map')"), false);
    expect((await errors()).map((x) => x.p?.k)).toEqual(["chunk", "render"]);
    // Both are also in the log a problem report carries.
    const log = bugLog().entries.map((x) => x.msg);
    expect(log).toContain("TypeError: Failed to fetch dynamically imported module: https://darsiai.org/assets/Tutor-abc.js");
    expect(log).toContain("Error: Cannot read properties of undefined (reading 'map')");
  });

  it("gives the same error the same fingerprint every time, whatever site the app is served from", () => {
    const a = errorHash("Uncaught Error: Boom", "Error: Boom\n    at render (https://darsiai.org/assets/index-abc.js:10:5)");
    expect(errorHash("Error: Boom", "Error: Boom\n    at render (https://learn.school.example/assets/index-abc.js:10:5)")).toBe(a);
    expect(errorHash("Error: Boom", "render@https://darsiai.org/assets/index-abc.js?v=2:10:5")).not.toBe(errorHash("Error: Boom", "render@https://darsiai.org/assets/index-abc.js:11:5"));
    // Another message, another place, or another build's file: another fingerprint.
    expect(errorHash("Error: Bang", "Error: Bang\n    at render (https://darsiai.org/assets/index-abc.js:10:5)")).not.toBe(a);
    expect(errorHash("Error: Boom", "Error: Boom\n    at render (https://darsiai.org/assets/index-xyz.js:10:5)")).not.toBe(a);
    expect(errorHash("", "")).toMatch(/^[0-9a-f]{12}$/);
  });

  it("queues the same error once, however often it happens and whichever way it is heard", async () => {
    const e = thrown("Boom");
    windowError(e); windowError(e);
    rejection(e); // the same error again, this time as a rejection
    expect(await errors()).toHaveLength(1);
    windowError(e);
    expect(await errors()).toHaveLength(0);
  });

  it("drops the sixth different error of a session", async () => {
    for (let i = 1; i <= 7; i++) windowError(thrown(`Failure number ${i}`, `https://darsiai.org/assets/index-abc.js:${i}:1`));
    const sent = await errors();
    expect(sent).toHaveLength(5);
    expect(new Set(sent.map((x) => x.p?.h)).size).toBe(5);
  });

  it("queues none when sharing usage statistics is switched off, and such errors don't use up the session's five", async () => {
    on(false);
    for (let i = 1; i <= 6; i++) windowError(thrown(`Quiet failure ${i}`));
    expect(await queued()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    on(true);
    windowError(thrown("Heard again"));
    expect(await errors()).toHaveLength(1);
  });

  it("keeps the errors from before anyone listened (startup) for the first listener", async () => {
    stop();
    windowError(thrown("Too early"));
    expect(await errors()).toEqual([]);
    stop = watchErrors();
    expect((await errors()).map((x) => x.p?.k)).toEqual(["error"]);
  });

  it("never goes round: an error made by a listener is not told again, and a listener that throws harms nobody", async () => {
    const heard: string[] = [];
    const off = onError((n: ErrorNote) => {
      heard.push(n.message);
      windowError(thrown("made while telling")); // would loop without the guard
      throw new Error("a listener of its own that fails");
    });
    try {
      expect(() => windowError(thrown("The first one"))).not.toThrow();
      expect(heard).toEqual(["Uncaught Error: The first one"]);
      expect(await errors()).toHaveLength(1);
    } finally { off(); }
  });

  it("is not the browser's ResizeObserver notice, which stays in the report log only", async () => {
    // As Chrome, Firefox and Safari raise it: a window error with a message and no error object.
    window.dispatchEvent(new ErrorEvent("error", { message: "ResizeObserver loop completed with undelivered notifications." }));
    window.dispatchEvent(new ErrorEvent("error", { message: "ResizeObserver loop limit exceeded" }));
    expect(await errors()).toEqual([]);
    expect(bugLog().entries.map((x) => x.msg)).toContain("ResizeObserver loop completed with undelivered notifications.");
    // And it doesn't use up the session's five.
    for (let i = 1; i <= 5; i++) windowError(thrown(`Real failure ${i}`, `https://darsiai.org/assets/index-abc.js:${i}:1`));
    expect(await errors()).toHaveLength(5);
  });

  it("is not an image or a script that failed to load", async () => {
    const img = document.createElement("img");
    document.body.appendChild(img);
    img.dispatchEvent(new Event("error")); // reaches the window listener in the capture phase
    img.remove();
    expect(await errors()).toEqual([]);
  });
});
