// Two tabs of the app on one phone (or the installed app beside a browser tab) share one store: neither overwrites the
// lessons, notes or settings the other saved (state/store.tsx syncTabs). IndexedDB is a Map here.
import { act, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";

const h = vi.hoisted(() => ({ db: new Map<string, unknown>() }));
vi.mock("../src/platform", () => ({
  storage: {
    get: async (k: string) => structuredClone(h.db.get(k)),
    set: async (k: string, v: unknown) => { h.db.set(k, structuredClone(v)); },
    remove: async (k: string) => { h.db.delete(k); },
  },
}));
const { forgetAccount, initialState, isoWeek, StoreProvider, syncTabs, useStore } = await import("../src/state/store");
type AppState = import("../src/state/store").AppState;
type Ctx = ReturnType<typeof useStore>;

const lesson = (completedAt: string) => ({ done: true as const, accuracy: 1, xp: 30, seconds: 60, completedAt });
const state = (patch: Partial<AppState> = {}): AppState => ({ ...initialState, onboarded: true, ...patch });
const OCT1 = "2026-10-01T10:00:00.000Z", OCT2 = "2026-10-02T10:00:00.000Z";

describe("syncTabs", () => {
  it("takes the other tab's save and keeps the lessons, notes, labs and certificates only this one has", () => {
    const mine = state({ progress: { a: lesson(OCT1) }, weeks: { [isoWeek(new Date(OCT1))]: 1 }, notes: { a: "mine" }, notesAt: { a: 5 }, labsDone: { bias: true }, dataSaver: false });
    const theirs = state({ progress: { b: lesson(OCT2) }, weeks: { [isoWeek(new Date(OCT2))]: 1 }, notes: { b: "theirs" }, notesAt: { b: 9 }, dataSaver: true, certs: { u1: { title: { en: "U1" }, track: "ai", at: OCT2 } } });
    const s = syncTabs(mine, theirs);
    expect(Object.keys(s.progress).sort()).toEqual(["a", "b"]);
    expect(s.notes).toEqual({ a: "mine", b: "theirs" });
    expect(s.labsDone).toEqual({ bias: true });
    expect(s.certs?.u1.at).toBe(OCT2);
    expect(s.dataSaver).toBe(true); // the newer save's settings
    expect(Object.values(s.weeks).reduce((x, y) => x + y, 0)).toBe(2);
  });

  it("returns this tab's own state when the other save adds nothing, so the echo stops", () => {
    const mine = state({ progress: { a: lesson(OCT1) }, weeks: { [isoWeek(new Date(OCT1))]: 1 } });
    expect(syncTabs(mine, structuredClone(mine))).toBe(mine);
  });

  it("takes a reset in the other tab as it is, instead of merging this tab's lessons back in", () => {
    const mine = state({ progress: { a: lesson(OCT1) }, weeks: { [isoWeek(new Date(OCT1))]: 1 }, notes: { a: "mine" } });
    const reset = { ...initialState, lang: "ar" };
    const s = syncTabs(mine, reset);
    expect(s.onboarded).toBe(false);
    expect(s.progress).toEqual({});
    expect(s.notes).toEqual({});
    expect(s.lang).toBe("ar");
  });

  it("takes the other tab's “Reset progress” by its time, now that a reset keeps onboarding", () => {
    const mine = state({ progress: { a: lesson(OCT1) }, weeks: { [isoWeek(new Date(OCT1))]: 1 }, notes: { a: "mine" }, resetAt: 1 });
    const reset = state({ resetAt: 2, analytics: false });
    const s = syncTabs(mine, reset);
    expect(s.progress).toEqual({});
    expect(s.notes).toEqual({});
    expect(s.onboarded).toBe(true);
    expect(s.analytics).toBe(false);
    // Once both have the same reset, lessons merge again.
    expect(Object.keys(syncTabs(state({ progress: { b: lesson(OCT2) }, resetAt: 2 }), reset).progress)).toEqual(["b"]);
  });
});

describe("Reset progress on this device", () => {
  it("clears the learning and keeps the settings, onboarding answers and downloads", async () => {
    h.db.clear();
    h.db.set("darsi:state", state({
      progress: { a: lesson(OCT1) }, weeks: { [isoWeek(new Date(OCT1))]: 1 }, notes: { a: "n" }, notesAt: { a: 1 }, levels: { ai: 3 }, labsDone: { bias: true },
      certs: { u1: { title: { en: "U1" }, track: "ai", at: OCT1 } }, analytics: false, dataSaver: true, tracks: ["ai", "iot"], teach: "university", guest: true,
      downloads: { u1: { v: 2, lang: "en" } }, name: "Amina",
    }));
    let c!: Ctx;
    function Tab() { const x = useStore(); useEffect(() => { c = x; }); return null; }
    render(<StoreProvider><Tab /></StoreProvider>);
    await waitFor(() => expect(c?.state.progress.a).toBeTruthy());
    act(() => c.dispatch({ type: "reset" }));
    const s = c.state;
    expect([s.progress, s.weeks, s.notes, s.notesAt, s.levels, s.labsDone, s.certs]).toEqual([{}, {}, {}, {}, {}, {}, {}]);
    expect(s.resetAt).toBeGreaterThan(0);
    // The switched-off statistics stay off, Data saver stays on, and nothing sends the learner back to the landing page.
    expect({ analytics: s.analytics, dataSaver: s.dataSaver, onboarded: s.onboarded, tracks: s.tracks, teach: s.teach, guest: s.guest, name: s.name })
      .toEqual({ analytics: false, dataSaver: true, onboarded: true, tracks: ["ai", "iot"], teach: "university", guest: true, name: "Amina" });
    expect(s.downloads).toEqual({ u1: { v: 2, lang: "en" } });
  });
});

describe("two tabs", () => {
  const KEY = "darsi:state";
  function Tab({ out }: { out: (c: Ctx) => void }) {
    const c = useStore();
    useEffect(() => { out(c); });
    return null;
  }
  /** What the browser does when another tab writes localStorage. */
  const tell = () => act(() => { window.dispatchEvent(new StorageEvent("storage", { key: `darsi:saved:${KEY}` })); });
  beforeEach(() => { h.db.clear(); localStorage.clear(); h.db.set(KEY, state()); });

  it("keep each other's lessons: a stale tab no longer writes over what the other one finished", async () => {
    let a!: Ctx, b!: Ctx;
    render(<StoreProvider><Tab out={(c) => { a = c; }} /></StoreProvider>);
    render(<StoreProvider><Tab out={(c) => { b = c; }} /></StoreProvider>);
    await waitFor(() => expect(a?.ready && b?.ready).toBe(true));
    act(() => a.dispatch({ type: "completeLesson", id: "a1", result: { accuracy: 1, xp: 30, seconds: 60 } }));
    await waitFor(() => expect((h.db.get(KEY) as AppState).progress.a1).toBeTruthy());
    await tell();
    await waitFor(() => expect(b.state.progress.a1).toBeTruthy());
    act(() => b.dispatch({ type: "completeLesson", id: "b1", result: { accuracy: 1, xp: 30, seconds: 60 } }));
    await waitFor(() => expect(Object.keys((h.db.get(KEY) as AppState).progress).sort()).toEqual(["a1", "b1"]));
    await tell();
    await waitFor(() => expect(Object.keys(a.state.progress).sort()).toEqual(["a1", "b1"]));
    expect((h.db.get(KEY) as AppState).weeks[isoWeek()]).toBe(2);
  });

  it("catches up when it comes back into view, in case it missed the other tab's save", async () => {
    let a!: Ctx;
    render(<StoreProvider><Tab out={(c) => { a = c; }} /></StoreProvider>);
    await waitFor(() => expect(a?.ready).toBe(true));
    h.db.set(KEY, state({ progress: { x: lesson(OCT1) }, weeks: { [isoWeek(new Date(OCT1))]: 1 } }));
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(a.state.progress.x).toBeTruthy());
  });

  it("an account signed out in another tab: this tab, still open as it, never merges its lessons back into the forgotten copy", async () => {
    const UID = "u-shared", ACC = `${KEY}:${UID}`;
    h.db.set(ACC, state({ progress: { a: lesson(OCT1) }, weeks: { [isoWeek(new Date(OCT1))]: 1 }, name: "Pupil" }));
    let b!: Ctx;
    const { unmount } = render(<StoreProvider scope={UID}><Tab out={(c) => { b = c; }} /></StoreProvider>);
    await waitFor(() => expect(b?.state.progress.a).toBeTruthy());
    // The other tab signed out: what its forgetAccount leaves behind (this tab's own module never heard of it).
    h.db.set(ACC, state({ name: "" }));
    localStorage.setItem(`darsi:gone:${ACC}`, "1");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    act(() => b.dispatch({ type: "completeLesson", id: "b1", result: { accuracy: 1, xp: 30, seconds: 60 } }));
    await new Promise((r) => setTimeout(r, 20));
    expect((h.db.get(ACC) as AppState).progress).toEqual({});
    expect((h.db.get(ACC) as AppState).name).toBe("");
    unmount();
    // forgetAccount leaves that mark; signing in again here clears it.
    await forgetAccount("u-other");
    expect(localStorage.getItem(`darsi:gone:${KEY}:u-other`)).toBe("1");
    localStorage.removeItem(`darsi:gone:${ACC}`);
  });

  it("signing in again clears the mark, so the account's store is saved once more", async () => {
    const UID = "u-back", ACC = `${KEY}:${UID}`;
    localStorage.setItem(`darsi:gone:${ACC}`, "1");
    h.db.set(ACC, state());
    let c!: Ctx;
    render(<StoreProvider scope={UID}><Tab out={(x) => { c = x; }} /></StoreProvider>);
    await waitFor(() => expect(c?.ready).toBe(true));
    expect(localStorage.getItem(`darsi:gone:${ACC}`)).toBeNull();
    act(() => c.dispatch({ type: "completeLesson", id: "z", result: { accuracy: 1, xp: 30, seconds: 60 } }));
    await waitFor(() => expect((h.db.get(ACC) as AppState).progress.z).toBeTruthy());
  });
});
