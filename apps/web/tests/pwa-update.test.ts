// The update toast's Reload must always reload, whether or not the new version ever takes control of this page.
import { takeUpdate } from "../src/pwa";

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
