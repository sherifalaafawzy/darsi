// The update toast's Reload must always reload, whether or not the new version ever takes control of this page.
import { reloadForUpdate, siteAnswers, takeUpdate } from "../src/pwa";
import * as loader from "../src/labs/loader";

const reload = vi.fn();
type Fn = () => void;

/** A registration with a waiting worker; `fire` plays its events. */
function setup(waiting = true) {
  const on: Record<string, Fn> = {};
  const worker = { state: "installed", postMessage: vi.fn(), addEventListener: (_: string, f: Fn) => { on.state = f; } };
  const reg = { waiting: waiting ? worker : null };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => reg, addEventListener: (_: string, f: Fn) => { on.controller = f; } } });
  return { worker, fire: (e: "state" | "controller", state?: string) => { if (state) worker.state = state; on[e]?.(); } };
}

beforeEach(() => { reload.mockReset(); vi.stubGlobal("location", { ...location, reload }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, "serviceWorker"); });

describe("Reload on the update toast", () => {
  it("asks the waiting version to take over and reloads once it controls the page", async () => {
    const { worker, fire } = setup();
    await takeUpdate();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();
    fire("controller");
    fire("state", "activated");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads when it activates, on a page it never controls (opened with a hard refresh)", async () => {
    const { fire } = setup();
    await takeUpdate();
    fire("state", "activating");
    expect(reload).not.toHaveBeenCalled();
    fire("state", "activated");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads anyway after a few seconds, and at once when nothing is waiting", async () => {
    vi.useFakeTimers();
    setup();
    await takeUpdate(undefined, 4000);
    vi.advanceTimersByTime(3999);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);
    setup(false);
    await takeUpdate();
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

// The boundaries' Reload (src/app/AppBoundary.tsx) and the labs' "Darsi was updated": check for a newer version, then reload.
describe("Reload after a failure", () => {
  const withUpdate = (update: () => Promise<void>) => {
    const reg = { waiting: null, update: vi.fn(update) };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => reg, addEventListener: () => {} } });
    return reg;
  };
  const setOnline = (v: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => v });
  afterEach(() => setOnline(true));

  it("looks for a newer version first, then reloads", async () => {
    const reg = withUpdate(async () => {});
    await reloadForUpdate();
    expect(reg.update).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("still reloads when that check never answers (a connection that lets nothing through)", async () => {
    vi.useFakeTimers();
    withUpdate(() => new Promise(() => {}));
    const done = reloadForUpdate(3000);
    await vi.advanceTimersByTimeAsync(2999);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("offline, reloads without asking the network", async () => {
    setOnline(false);
    const reg = withUpdate(async () => {});
    await reloadForUpdate();
    expect(reg.update).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // update() answers when the new worker starts installing, before its files are saved. Reloading then brings the old
  // version back (the old worker still answers the page) and the same "Darsi was updated" card.
  const installing = () => {
    let onState: Fn | undefined, onController: Fn | undefined;
    const worker = { state: "installing", postMessage: vi.fn(), addEventListener: (_: string, f: Fn) => { onState = f; } };
    const reg: { waiting: typeof worker | null; installing: typeof worker | null; update: () => Promise<void> } = { waiting: null, installing: worker, update: vi.fn(async () => {}) };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => reg, addEventListener: (_: string, f: Fn) => { onController = f; } } });
    return { worker, reg, state: (s: string) => { worker.state = s; onState?.(); }, controller: () => onController?.() };
  };
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

  it("waits for a new version that is still installing, then switches to it and reloads once", async () => {
    const { worker, reg, state, controller } = installing();
    const done = reloadForUpdate();
    await flush();
    expect(reload).not.toHaveBeenCalled();
    reg.waiting = worker; reg.installing = null; // the spec sets `waiting` before the "installed" statechange
    state("installed");
    await done;
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();
    controller();
    state("activated");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("an older version already waiting is not switched to while a newer one installs (two deploys behind)", async () => {
    const { worker, reg, state, controller } = installing();
    const older = { state: "installed", postMessage: vi.fn(), addEventListener: () => {} };
    reg.waiting = older as unknown as typeof worker;
    const done = reloadForUpdate();
    await flush();
    expect(older.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    reg.waiting = worker; reg.installing = null; // the newer one replaces it as it finishes installing
    state("installed");
    await done;
    expect(older.postMessage).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    controller();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("an install that never finishes: reloads after 15 seconds, not before", async () => {
    vi.useFakeTimers();
    installing();
    const done = reloadForUpdate(3000, 15000);
    await vi.advanceTimersByTimeAsync(14999);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("an install that fails (redundant): reloads at once", async () => {
    const { reg, state } = installing();
    const done = reloadForUpdate();
    await flush();
    expect(reload).not.toHaveBeenCalled();
    reg.installing = null;
    state("redundant");
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("the site answers only with its service worker's script, not a sign-in page or nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { headers: { "Content-Type": "text/javascript; charset=utf-8" } })));
    expect(await siteAnswers()).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { headers: { "Content-Type": "text/html" } })));
    expect(await siteAnswers()).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await siteAnswers()).toBe(false);
  });

  it("labs/loader still exports both (they moved to pwa.tsx)", () => {
    expect(loader.reloadForUpdate).toBe(reloadForUpdate);
    expect(loader.siteAnswers).toBe(siteAnswers);
  });
});
