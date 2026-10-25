import { act, render, waitFor } from "@testing-library/react";
import { initialState, isoWeek, mergeRemote, StoreProvider, useStore, type AppState, type LessonResult } from "../src/state/store";
import { progressDoc, remoteNotes, remoteProgress, toPush, useCloudSync, type Remote } from "../src/state/sync";

// Firestore, IndexedDB and the content files are replaced so the sync rules can be checked without the emulators.
type Raw = { id: string; data: Record<string, unknown> };
const h = vi.hoisted(() => ({
  stored: undefined as unknown,
  server: { progress: [] as { id: string; data: Record<string, unknown> }[], notes: [] as { id: string; data: Record<string, unknown> }[], fromCache: false },
  getDocs: vi.fn(),
  setDoc: vi.fn(async (_ref: string, _data: Record<string, unknown>) => {}),
}));
vi.mock("../src/platform", () => ({ storage: { get: async () => h.stored, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/firebase", () => ({ db: {}, firebaseReady: true }));
// Deterministic regardless of the machine's .env files (CI has no .env.local).
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { apiKey: "test-key" }, useEmulators: false, functionsRegion: "europe-west1" }));
vi.mock("../src/content/load", () => ({
  loadCatalog: async () => ({ version: 1, units: [{ id: "ai-1", available: true }] }),
  loadUnit: async () => ({ id: "ai-1", track: "ai", lessons: [{ id: "ai-1-1", competencies: ["AI-T1"] }, { id: "ai-1-2" }] }),
}));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...p: string[]) => p.join("/"),
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  getDocs: h.getDocs,
  setDoc: h.setDoc,
}));
h.getDocs.mockImplementation(async (path: string) => ({
  docs: (path.endsWith("/progress") ? h.server.progress : h.server.notes).map((d: Raw) => ({ id: d.id, data: () => d.data })),
  metadata: { fromCache: h.server.fromCache },
}));

const lesson = (completedAt: string, extra: Partial<LessonResult> = {}): LessonResult => ({ done: true, accuracy: 0.8, xp: 26, seconds: 300, completedAt, ...extra });
const state = (patch: Partial<AppState> = {}): AppState => ({ ...initialState, ...patch });
const remote = (patch: Partial<Remote> = {}): Remote => ({ progress: {}, notes: {}, synced: true, ...patch });
const OCT1 = "2026-10-01T10:00:00.000Z", OCT9 = "2026-10-09T10:00:00.000Z";

describe("mergeRemote", () => {
  it("adds lessons finished on another device and counts them in their week", () => {
    const s = mergeRemote(state(), { "ai-1-1": lesson(OCT1, { unitId: "ai-1" }) });
    expect(s.progress["ai-1-1"].unitId).toBe("ai-1");
    expect(s.weeks[isoWeek(new Date(OCT1))]).toBe(1);
  });

  it("takes a newer cloud result without counting the lesson twice", () => {
    const local = state({ progress: { a: lesson(OCT1, { accuracy: 0.5 }) }, weeks: { [isoWeek(new Date(OCT1))]: 1 } });
    const s = mergeRemote(local, { a: lesson(OCT9, { accuracy: 1 }) });
    expect(s.progress.a.accuracy).toBe(1);
    expect(s.weeks).toEqual(local.weeks);
  });

  it("keeps a newer local result and returns the same state when nothing changes", () => {
    const local = state({ progress: { a: lesson(OCT9) } });
    expect(mergeRemote(local, { a: lesson(OCT1) })).toBe(local);
    expect(mergeRemote(local, { a: lesson(OCT9) })).toBe(local);
  });

  it("fills in unit, track and competencies for an old local result", () => {
    const s = mergeRemote(state({ progress: { a: lesson(OCT1) } }), { a: lesson(OCT1, { unitId: "ai-1", track: "ai", competencies: ["AI-T1"] }) });
    expect(s.progress.a).toMatchObject({ unitId: "ai-1", track: "ai", competencies: ["AI-T1"] });
  });

  it("merges notes: the newer edit wins, and a note saved before sync loses to the cloud", () => {
    const local = state({ notes: { a: "old", b: "mine, newer", c: "legacy", d: "same" }, notesAt: { a: 100, b: 900, d: 0 } });
    const s = mergeRemote(local, undefined, { a: { text: "cloud", at: 500 }, b: { text: "cloud", at: 500 }, c: { text: "cloud c", at: 1 }, d: { text: "same", at: 700 }, e: { text: "new", at: 5 } });
    expect(s.notes).toEqual({ a: "cloud", b: "mine, newer", c: "cloud c", d: "same", e: "new" });
    expect(s.notesAt).toEqual({ a: 500, b: 900, c: 1, d: 700, e: 5 });
  });
});

describe("toPush", () => {
  const since = Date.parse("2026-10-05T00:00:00.000Z");

  it("before the server copy is known, writes only what was done this session", () => {
    const s = state({ progress: { old: lesson(OCT1), fresh: lesson(OCT9) } });
    expect(toPush(s, remote({ synced: false }), since).progress).toEqual(["fresh"]);
    expect(toPush(s, remote(), since).progress).toEqual(["old", "fresh"]);
  });

  it("writes a lesson only when the cloud lacks it or has an older result", () => {
    const s = state({ progress: { a: lesson(OCT9), b: lesson(OCT1), c: lesson(OCT1) } });
    expect(toPush(s, remote({ progress: { a: lesson(OCT1), b: lesson(OCT1), c: lesson(OCT9) } }), since).progress).toEqual(["a"]);
  });

  it("writes notes that are newer here, never empty new ones, and old ones only after the server read", () => {
    const s = state({ notes: { a: "edited", b: "same", c: "  ", d: "legacy" }, notesAt: { a: 900, b: 900, c: 900 } });
    const r = { a: { text: "before", at: 100 }, b: { text: "same", at: 100 } };
    expect(toPush(s, remote({ notes: r }), since).notes).toEqual(["a", "d"]);
    expect(toPush(s, remote({ notes: r, synced: false }), since).notes).toEqual(["a"]);
  });
});

describe("progressDoc", () => {
  it("matches the security rules: accuracy 0–1, integer xp 0–100, no undefined fields", () => {
    const d = progressDoc("a", lesson(OCT1, { accuracy: 1.4, xp: 120.6, seconds: 61.7 }));
    expect(d).toEqual({ lessonId: "a", accuracy: 1, xp: 100, seconds: 62, completedAt: OCT1 });
    expect(Number.isInteger(progressDoc("a", lesson(OCT1, { xp: Number.NaN })).xp)).toBe(true);
  });

  it("uses content metadata for results saved before they carried it", () => {
    expect(progressDoc("ai-1-1", lesson(OCT1), { unitId: "ai-1", track: "ai", competencies: ["AI-T1"] })).toMatchObject({ unitId: "ai-1", track: "ai", competencies: ["AI-T1"] });
  });
});

it("skips malformed cloud docs", () => {
  expect(Object.keys(remoteProgress([{ id: "a", data: { completedAt: OCT1 } }, { id: "b", data: { xp: 5 } }]))).toEqual(["a"]);
  expect(remoteNotes([{ id: "a", data: { text: "x", updatedAt: 3 } }, { id: "b", data: {} }])).toEqual({ a: { text: "x", at: 3 } });
});

describe("useCloudSync", () => {
  let store: ReturnType<typeof useStore>;
  function Probe() { store = useStore(); useCloudSync("u1"); return null; }
  const progressWrites = () => h.setDoc.mock.calls.filter((c) => String(c[0]).includes("/progress/"));

  beforeEach(() => {
    h.getDocs.mockClear(); h.setDoc.mockClear();
    h.server = { progress: [], notes: [], fromCache: false };
  });

  it("reads once, merges the cloud copy and writes back only what the cloud lacks", async () => {
    h.stored = state({ onboarded: true, progress: { "ai-1-1": lesson(OCT1) }, notes: { "ai-1-1": "plan for Monday" } });
    h.server.progress = [{ id: "ai-1-2", data: { lessonId: "ai-1-2", unitId: "ai-1", track: "ai", accuracy: 1, xp: 30, seconds: 200, completedAt: OCT9 } }];
    render(<StoreProvider scope="u1"><Probe /></StoreProvider>);

    await waitFor(() => expect(store.state.progress["ai-1-2"]?.xp).toBe(30));
    await waitFor(() => expect(h.setDoc).toHaveBeenCalledTimes(2));
    expect(h.getDocs).toHaveBeenCalledTimes(2); // progress + notes, once each: no listeners, no polling
    expect(h.setDoc).toHaveBeenCalledWith("users/u1/progress/ai-1-1", expect.objectContaining({ unitId: "ai-1", track: "ai", competencies: ["AI-T1"], xp: 26 }));
    expect(h.setDoc).toHaveBeenCalledWith("users/u1/notes/ai-1-1", expect.objectContaining({ text: "plan for Monday" }));

    act(() => store.dispatch({ type: "set", patch: { lang: "ar" } })); // unrelated change: no new writes
    await new Promise((r) => setTimeout(r, 20));
    expect(h.setDoc).toHaveBeenCalledTimes(2);
  });

  it("offline: writes a new result at once but holds old ones until the server copy is read", async () => {
    h.stored = state({ onboarded: true, progress: { "ai-1-1": lesson(OCT1, { unitId: "ai-1", track: "ai" }) } });
    h.server.fromCache = true;
    render(<StoreProvider scope="u1"><Probe /></StoreProvider>);
    await waitFor(() => expect(h.getDocs).toHaveBeenCalledTimes(2));

    act(() => store.dispatch({ type: "completeLesson", id: "ai-1-2", result: { accuracy: 0.9, xp: 28, seconds: 240, unitId: "ai-1", track: "ai" } }));
    await waitFor(() => expect(progressWrites().map((c) => c[0])).toEqual(["users/u1/progress/ai-1-2"]));

    h.server.fromCache = false;
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(progressWrites().map((c) => c[0])).toEqual(["users/u1/progress/ai-1-2", "users/u1/progress/ai-1-1"]));
    expect(h.getDocs).toHaveBeenCalledTimes(4);
  });
});
