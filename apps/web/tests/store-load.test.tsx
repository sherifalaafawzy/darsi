// The local store (state/store.tsx) never takes a failed read for "nothing stored": the blank state would then be saved
// over the person's work, and a guest's progress lives only on the phone. It shows a retry card instead and saves nothing.
// What it reads is made safe before it is taken in, a full phone is said once, the browser is asked to keep the site's
// storage after the first lesson, and a new account's copy is written before the guest's learning is cleared.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";

const h = vi.hoisted(() => ({
  db: new Map<string, unknown>(),
  get: vi.fn(), set: vi.fn(), persist: vi.fn(async () => true),
}));
vi.mock("../src/platform", () => ({
  storage: { get: (k: string) => h.get(k), set: (k: string, v: unknown) => h.set(k, v), remove: async (k: string) => { h.db.delete(k); } },
  isQuotaError: (e: unknown) => (e as { name?: string } | null)?.name === "QuotaExceededError",
  persistStorage: () => h.persist(),
}));
const { hasUnsent, initialState, isoWeek, sane, StoreProvider, useStore } = await import("../src/state/store");
type AppState = import("../src/state/store").AppState;
type Ctx = ReturnType<typeof useStore>;

const KEY = "darsi:state";
const OCT1 = "2026-10-01T10:00:00.000Z";
const lesson = (completedAt = OCT1) => ({ done: true as const, accuracy: 1, xp: 30, seconds: 60, completedAt });
const state = (patch: Partial<AppState> = {}): AppState => ({ ...initialState, onboarded: true, ...patch });
const learned = () => state({ progress: { a: lesson() }, weeks: { [isoWeek(new Date(OCT1))]: 1 }, notes: { a: "mine" }, name: "Amina", guest: true });
const done = (id: string) => ({ type: "completeLesson" as const, id, result: { accuracy: 1, xp: 30, seconds: 60 } });
const quota = () => Object.assign(new Error("full"), { name: "QuotaExceededError" });
/** IndexedDB as a Map, as in store-tabs.test.tsx. */
const working = () => {
  h.get.mockImplementation(async (k: string) => structuredClone(h.db.get(k)));
  h.set.mockImplementation(async (k: string, v: unknown) => { h.db.set(k, structuredClone(v)); });
};
let c: Ctx | undefined;
function Tab() { const x = useStore(); useEffect(() => { c = x; }); return <p>the app</p>; }
const open = (props: { scope?: string; adoptGuest?: boolean } = {}) => render(<StoreProvider {...props}><Tab /></StoreProvider>);
const retry = () => screen.getByRole("button", { name: /Try again/ });
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

beforeEach(() => { h.db.clear(); localStorage.clear(); h.get.mockReset(); h.set.mockReset(); h.persist.mockClear(); working(); c = undefined; });
afterEach(cleanup);

// First in the file: it is asked once per page load (a module flag), and later tests finish lessons too.
describe("the browser's promise to keep this site's storage", () => {
  it("asks the browser to keep this site's storage once, after the first new lesson of the visit", async () => {
    h.db.set(KEY, learned());
    open();
    await waitFor(() => expect(c?.state.progress.a).toBeTruthy());
    await tick();
    expect(h.persist).not.toHaveBeenCalled(); // not at startup
    act(() => c!.dispatch(done("a"))); // a replay adds nothing
    act(() => c!.dispatch({ type: "mergeRemote", progress: { cloud: lesson() } })); // nor do lessons from the cloud
    await tick();
    expect(h.persist).not.toHaveBeenCalled();
    act(() => c!.dispatch(done("b")));
    await tick();
    expect(h.persist).toHaveBeenCalledTimes(1);
    act(() => c!.dispatch(done("c")));
    await tick();
    expect(h.persist).toHaveBeenCalledTimes(1);
  });
});

describe("a store that can't be read", () => {
  it("shows the retry card in both languages, saves nothing, and Retry with a working read brings the progress back", async () => {
    h.db.set(KEY, learned());
    h.get.mockRejectedValue(new Error("Internal error opening backing store"));
    open();
    const card = await screen.findByRole("alert");
    expect(card.textContent).toContain("Your saved progress couldn’t be opened");
    expect(card.querySelector("[lang=ar]")!.textContent).toBe("تعذّر فتح تقدّمك المحفوظ");
    // Arabic on a page that may be English: the phone's font, so the Arabic web fonts aren't fetched for it.
    expect([...card.querySelectorAll("[lang=ar]")].every((x) => x.classList.contains("dr-other-script"))).toBe(true);
    expect(screen.queryByText("the app")).toBeNull(); // in place of the app
    expect(screen.queryByRole("button", { name: /Carry on without saving/ })).toBeNull(); // not before Retry was tried
    await tick();
    expect(h.set).not.toHaveBeenCalled();
    expect(h.db.get(KEY)).toEqual(learned());

    working();
    fireEvent.click(retry());
    await waitFor(() => expect(c?.ready).toBe(true));
    expect(c!.state.progress.a).toBeTruthy();
    expect(c!.state.name).toBe("Amina");
    expect(screen.getByText("the app")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reads once per try when storage throws on every call (private mode), and never loops", async () => {
    h.get.mockImplementation(() => { throw new DOMException("The operation is insecure.", "SecurityError"); });
    h.set.mockImplementation(() => { throw new DOMException("The operation is insecure.", "SecurityError"); });
    open();
    await screen.findByRole("alert");
    await tick();
    expect(h.get).toHaveBeenCalledTimes(1);
    fireEvent.click(retry());
    await tick();
    expect(h.get).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(h.set).not.toHaveBeenCalled();
    // Retry failed too: the way on, without saving, so a browser with no storage isn't locked out.
    fireEvent.click(screen.getByRole("button", { name: /Carry on without saving/ }));
    await waitFor(() => expect(c?.ready).toBe(true));
    act(() => c!.dispatch(done("a1")));
    expect(c!.state.progress.a1).toBeTruthy();
    await tick();
    expect(h.set).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: `darsi:saved:${KEY}` })); });
    expect(h.get).toHaveBeenCalledTimes(2); // nor read again behind the person's back
  });

  it("treats a store this version doesn't know (a newer version's, or damage) the same way: never written over", async () => {
    const newer = { version: 2, lessons: { a: 1 } };
    h.db.set(KEY, newer);
    open();
    await screen.findByRole("alert");
    await tick();
    expect(h.set).not.toHaveBeenCalled();
    expect(h.db.get(KEY)).toEqual(newer);
    cleanup();
    h.db.set(KEY, "garbage");
    open();
    await screen.findByRole("alert");
    expect(h.set).not.toHaveBeenCalled();
  });

  it("still starts a first visit (nothing stored) at once, and saves it", async () => {
    open();
    await waitFor(() => expect(c?.ready).toBe(true));
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(h.db.get(KEY)).toMatchObject({ version: 1, progress: {} }));
  });

  it("an account's first time here: an unreadable guest store costs it only the guest's settings", async () => {
    h.get.mockImplementation(async (k: string) => { if (k === KEY) throw new Error("blocked"); return undefined; });
    open({ scope: "p1" });
    await waitFor(() => expect(c?.ready).toBe(true));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(h.set.mock.calls.every(([k]) => k === `${KEY}:p1`)).toBe(true);
  });

  it("but when it would take over the guest's learning, it waits for a read that works", async () => {
    h.get.mockImplementation(async (k: string) => { if (k === KEY) throw new Error("blocked"); return undefined; });
    open({ scope: "n1", adoptGuest: true });
    await screen.findByRole("alert");
    await tick();
    expect(h.set).not.toHaveBeenCalled();
  });
});

describe("what was read is made safe before it is taken in", () => {
  it("hydrates a state whose progress is an array with empty progress, and nothing throws", async () => {
    h.db.set(KEY, { ...learned(), progress: [lesson()], notes: "x", notesAt: null, weeks: 7, certs: ["c"], tracks: "ai", levels: null, downloads: [], labsDone: "all" });
    open();
    await waitFor(() => expect(c?.ready).toBe(true));
    const s = c!.state;
    expect([s.progress, s.notes, s.notesAt, s.weeks, s.levels, s.downloads]).toEqual([{}, {}, {}, {}, {}, {}]);
    expect(s.tracks).toEqual([]);
    expect(s.certs).toBeUndefined();
    expect(s.labsDone).toBeUndefined();
    expect(s.name).toBe("Amina"); // the rest of it is kept
    // And the reducers work on it.
    act(() => { c!.dispatch(done("a1")); c!.dispatch({ type: "saveNote", id: "a1", text: "n" }); c!.dispatch({ type: "labDone", id: "bias" }); });
    expect(Object.keys(c!.state.progress)).toEqual(["a1"]);
  });

  it("leaves a good state exactly as it is", () => {
    const good = learned();
    expect(sane(good)).toBe(good);
    expect(sane({ ...good, certs: undefined })).toMatchObject({ progress: good.progress });
  });

  it("does the same for what another tab saved", async () => {
    h.db.set(KEY, learned());
    open();
    await waitFor(() => expect(c?.state.progress.a).toBeTruthy());
    h.db.set(KEY, { ...learned(), progress: ["broken"], weeks: null, tracks: 3, dataSaver: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(c!.state.dataSaver).toBe(true)); // the other tab's settings came in
    expect(c!.state.progress.a).toBeTruthy(); // and this tab's lesson is still there
    expect(c!.state.tracks).toEqual([]);
  });
});

describe("saving", () => {
  it("stays silent when a save fails for another reason", async () => {
    h.set.mockRejectedValue(new Error("transaction aborted"));
    open();
    await waitFor(() => expect(c?.ready).toBe(true));
    act(() => c!.dispatch(done("a1")));
    await tick();
    expect(h.set).toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says once, in both languages, that the phone is full; the app stays usable", async () => {
    h.set.mockRejectedValue(quota());
    open();
    const note = await screen.findByRole("status");
    expect(note.textContent).toContain("This phone is full. Your last lesson may not be saved");
    expect(note.querySelector("[lang=ar].dr-other-script")!.textContent).toContain("ذاكرة هذا الهاتف ممتلئة");
    expect(screen.getByText("the app")).toBeTruthy(); // beside the app, not in place of it
    act(() => c!.dispatch(done("a1")));
    await tick();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("status")).toBeNull();
    // Once per page load: the next failed save doesn't bring it back.
    act(() => c!.dispatch(done("a2")));
    await tick();
    expect(screen.queryByRole("status")).toBeNull();
    expect(c!.state.progress.a2).toBeTruthy();
  });
});

describe("the guest who just made an account", () => {
  const ACC = `${KEY}:n1`;

  it("has the account's store written before the guest's learning is cleared", async () => {
    h.db.set(KEY, learned());
    localStorage.setItem("darsi-project-draft:guest:l1:p1", JSON.stringify({ text: "typed as a guest" }));
    open({ scope: "n1", adoptGuest: true });
    await waitFor(() => expect(c?.state.progress.a).toBeTruthy());
    const [first, second] = h.set.mock.calls as [string, AppState][];
    expect(first[0]).toBe(ACC);
    expect(first[1]).toMatchObject({ progress: { a: lesson() }, notes: { a: "mine" }, guest: false });
    expect(second[0]).toBe(KEY);
    expect(second[1]).toMatchObject({ progress: {}, notes: {}, name: "" });
    expect(c!.state.guest).toBe(false);
    // The project they typed as a guest comes too.
    expect(localStorage.getItem("darsi-project-draft:n1:l1:p1")).toContain("typed as a guest");
    expect(localStorage.getItem("darsi-project-draft:guest:l1:p1")).toBeNull();
  });

  // Sync holds lessons from before this session back until its first server read, so they are not in Firestore's queue:
  // without the mark, Sign out before that read (a cache-only answer on a patchy connection) forgot them for good.
  it("marks the account as having unsent work: the guest's lessons and notes are in no cloud yet", async () => {
    h.db.set(KEY, learned());
    expect(hasUnsent("n1")).toBe(false);
    open({ scope: "n1", adoptGuest: true });
    await waitFor(() => expect(c?.state.progress.a).toBeTruthy());
    expect(localStorage.getItem("darsi:unsent:n1")).not.toBeNull();
    expect(hasUnsent("n1")).toBe(true);
  });

  it("marks it also when the account's copy can't be written (a full phone: the work is only in memory)", async () => {
    h.db.set(KEY, state({ notes: { a: "a note, no lesson yet" }, guest: true }));
    h.set.mockImplementation(async () => { throw new Error("no room"); });
    open({ scope: "n1", adoptGuest: true });
    await waitFor(() => expect(c?.state.notes.a).toBe("a note, no lesson yet"));
    expect(hasUnsent("n1")).toBe(true);
  });

  it("marks nothing for a guest who had only settings, or only an emptied note", async () => {
    h.db.set(KEY, state({ lang: "ar", notes: { a: "  " }, guest: true }));
    open({ scope: "n1", adoptGuest: true });
    await waitFor(() => expect(c?.state.lang).toBe("ar"));
    await tick();
    expect(Object.keys(localStorage).filter((k) => k.startsWith("darsi:unsent:"))).toEqual([]);
  });

  it("keeps the guest's copy when the account's can't be written (a full phone)", async () => {
    h.db.set(KEY, learned());
    h.set.mockImplementation(async (k: string, v: unknown) => { if (k === ACC) throw new Error("no room"); h.db.set(k, structuredClone(v)); });
    open({ scope: "n1", adoptGuest: true });
    await waitFor(() => expect(c?.state.progress.a).toBeTruthy()); // this visit still has it
    await tick();
    expect((h.db.get(KEY) as AppState).progress.a).toBeTruthy();
    expect(h.set.mock.calls.some(([k]) => k === KEY)).toBe(false);
  });

  it("an account that only signs in here takes the guest's settings and leaves the guest's work and drafts alone", async () => {
    h.db.set(KEY, { ...learned(), lang: "ar" });
    localStorage.setItem("darsi-project-draft:guest:l1:p1", JSON.stringify({ text: "the guest’s" }));
    open({ scope: "p1" });
    await waitFor(() => expect(c?.ready).toBe(true));
    expect(c!.state.lang).toBe("ar");
    expect(c!.state.progress).toEqual({});
    await tick();
    expect((h.db.get(KEY) as AppState).progress.a).toBeTruthy();
    expect(localStorage.getItem("darsi-project-draft:guest:l1:p1")).not.toBeNull();
    expect(localStorage.getItem("darsi-project-draft:p1:l1:p1")).toBeNull();
    expect(hasUnsent("p1")).toBe(false); // nothing of the guest's became this account's
  });
});
