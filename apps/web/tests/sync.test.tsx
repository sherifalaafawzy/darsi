import { act, render, waitFor } from "@testing-library/react";
import { initialState, isoWeek, mergeRemote, StoreProvider, useStore, type AppState, type LessonResult } from "../src/state/store";
import { certDoc, learningOf, learningSync, progressDoc, remoteCerts, remoteNotes, remoteProgress, toPush, useCloudSync, useLearningSync, type Remote } from "../src/state/sync";
import type { EarnedCert } from "../src/content/cert";

// Firestore, IndexedDB and the content files are replaced so the sync rules can be checked without the emulators.
type Raw = { id: string; data: Record<string, unknown> };
const h = vi.hoisted(() => ({
  stored: undefined as unknown,
  server: {
    progress: [] as { id: string; data: Record<string, unknown> }[], notes: [] as { id: string; data: Record<string, unknown> }[],
    certs: [] as { id: string; data: Record<string, unknown> }[], fromCache: false,
    /** The certificates' read fails (the rules refuse it, say). */
    certsFail: false,
  },
  getDocs: vi.fn(),
  setDoc: vi.fn(async (_ref: string, _data: Record<string, unknown>) => {}),
  updateDoc: vi.fn(async (_ref: string, _data: Record<string, unknown>) => {}),
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
  updateDoc: h.updateDoc,
}));
h.getDocs.mockImplementation(async (path: string) => {
  const name = path.split("/").pop() as "progress" | "notes" | "certs";
  if (name === "certs" && h.server.certsFail) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
  return { docs: h.server[name].map((d: Raw) => ({ id: d.id, data: () => d.data })), metadata: { fromCache: h.server.fromCache } };
});

const lesson = (completedAt: string, extra: Partial<LessonResult> = {}): LessonResult => ({ done: true, accuracy: 0.8, xp: 26, seconds: 300, completedAt, ...extra });
const state = (patch: Partial<AppState> = {}): AppState => ({ ...initialState, ...patch });
const remote = (patch: Partial<Remote> = {}): Remote => ({ progress: {}, notes: {}, certs: {}, synced: true, certsSynced: true, ...patch });
const cert = (at: string, title = "AI basics", track: EarnedCert["track"] = "ai"): EarnedCert => ({ title: { en: title }, track, at });
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

  it("adds certificates from the cloud, keeps its own, and the earlier date wins where both have one", () => {
    const local = state({ certs: { mine: cert(OCT9, "Mine"), both: cert(OCT9, "Here"), early: cert(OCT1, "Here first") } });
    const s = mergeRemote(local, undefined, undefined, { gone: cert(OCT1, "A retired course"), both: cert(OCT1, "Cloud"), early: cert(OCT9, "Cloud later") });
    expect(s.certs).toEqual({ mine: cert(OCT9, "Mine"), both: cert(OCT1, "Cloud"), early: cert(OCT1, "Here first"), gone: cert(OCT1, "A retired course") });
    expect(mergeRemote(state(), undefined, undefined, { a: cert(OCT1) }).certs).toEqual({ a: cert(OCT1) });
  });

  it("returns the same state when the cloud's certificates change nothing", () => {
    const local = state({ certs: { a: cert(OCT1) } });
    expect(mergeRemote(local, undefined, undefined, { a: cert(OCT9) })).toBe(local);
    expect(mergeRemote(local, undefined, undefined, { a: cert(OCT1, "Same date") })).toBe(local);
    expect(mergeRemote(local, undefined, undefined, {})).toBe(local);
    expect("certs" in mergeRemote(state(), { a: lesson(OCT1) })).toBe(false);
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

  it("creates only the certificates the cloud lacks, never one it has, whatever its date", () => {
    const s = state({ certs: { have: cert(OCT9), older: cert(OCT9), missing: cert(OCT1) } });
    expect(toPush(s, remote({ certs: { have: cert(OCT9), older: cert(OCT1) } }), since).certs).toEqual(["missing"]);
    expect(toPush(state(), remote(), since).certs).toEqual([]);
  });

  it("before the certificates' server read, creates only those earned this session", () => {
    const s = state({ certs: { old: cert(OCT1), fresh: cert(OCT9) } });
    expect(toPush(s, remote({ certsSynced: false }), since).certs).toEqual(["fresh"]);
    // Lessons and notes known from the server don't release certificates whose read failed or came from the cache.
    expect(toPush(s, remote({ synced: true, certsSynced: false }), since).certs).toEqual(["fresh"]);
    expect(toPush(s, remote(), since).certs).toEqual(["old", "fresh"]);
  });

  it("never sends a certificate the rules would refuse", () => {
    const s = state({ certs: { "AI_1": cert(OCT9), x: cert(OCT9), "ai-long": cert(OCT9, "T", "a".repeat(25) as EarnedCert["track"]), "ai-ok": cert(OCT9) } });
    expect(toPush(s, remote(), since).certs).toEqual(["ai-ok"]);
  });
});

describe("certDoc", () => {
  it("is exactly the shape the rules take: title, track and at, nothing else", () => {
    const c = { ...cert(OCT1), extra: "x", title: { en: "AI basics", ar: "أساسيات الذكاء الاصطناعي", fr: undefined, de: 5 } } as unknown as EarnedCert;
    expect(certDoc("ai-1-1", c)).toEqual({ title: { en: "AI basics", ar: "أساسيات الذكاء الاصطناعي" }, track: "ai", at: OCT1 });
  });

  it("refuses ids, tracks and dates the rules refuse", () => {
    for (const id of ["AI-1", "ai_1", "-ai", "a", "a".repeat(65), "ai/1", ""]) expect(certDoc(id, cert(OCT1))).toBeNull();
    expect(certDoc("a".repeat(64), cert(OCT1))).not.toBeNull();
    expect(certDoc("u12345678", cert(OCT1))).not.toBeNull(); // an organization's course
    expect(certDoc("ai-1", cert(OCT1, "T", "a".repeat(25) as EarnedCert["track"]))).toBeNull();
    expect(certDoc("ai-1", cert(OCT1, "T", "" as EarnedCert["track"]))).toBeNull();
    expect(certDoc("ai-1", cert("x".repeat(41)))).toBeNull();
    expect(certDoc("ai-1", { title: { ar: "عنوان" }, track: "ai", at: OCT1 } as unknown as EarnedCert)).toBeNull();
    expect(certDoc("ai-1", { title: null, track: "ai", at: OCT1 } as unknown as EarnedCert)).toBeNull();
  });

  it("fits the title into the rules' limits by leaving languages out, English first and never cut", () => {
    const many = Object.fromEntries([...Array.from({ length: 40 }, (_, i) => [`l${String(i).padStart(2, "0")}`, "t"]), ["en", "English"]]);
    const d = certDoc("ai-1", { title: many, track: "ai", at: OCT1 } as unknown as EarnedCert)!;
    expect(Object.keys(d.title)).toHaveLength(30);
    expect(d.title.en).toBe("English");
    // 6,000 for all the texts, counted in bytes (Arabic letters are two): the long Arabic title is left out, whole.
    const big = certDoc("ai-1", { title: { en: "e".repeat(5000), ar: "ع".repeat(600), fr: "f".repeat(900) }, track: "ai", at: OCT1 } as unknown as EarnedCert)!;
    expect(big.title).toEqual({ en: "e".repeat(5000), fr: "f".repeat(900) });
    expect(certDoc("ai-1", { title: { en: "e".repeat(6001) }, track: "ai", at: OCT1 } as unknown as EarnedCert)).toBeNull();
    // Language codes joined by commas: at most 300.
    const codes = Object.fromEntries([["en", "E"], ...Array.from({ length: 5 }, (_, i) => [`${i}`.repeat(70), "t"])]);
    const k = Object.keys(certDoc("ai-1", { title: codes, track: "ai", at: OCT1 } as unknown as EarnedCert)!.title);
    expect(k.join(",").length).toBeLessThanOrEqual(300);
    expect(k).toHaveLength(5);
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
  expect(remoteCerts([
    { id: "a", data: { title: { en: "A", ar: "أ", xx: 5 }, track: "ai", at: OCT1 } },
    { id: "b", data: { title: { ar: "ب" }, track: "ai", at: OCT1 } }, { id: "c", data: { title: { en: "C" }, at: OCT1 } },
    { id: "d", data: { title: "D", track: "ai", at: OCT1 } }, { id: "e", data: { title: { en: "E" }, track: "ai" } },
  ])).toEqual({ a: { title: { en: "A", ar: "أ" }, track: "ai", at: OCT1 } });
});

describe("useCloudSync", () => {
  let store: ReturnType<typeof useStore>;
  function Probe() { store = useStore(); useCloudSync("u1"); return null; }
  const progressWrites = () => h.setDoc.mock.calls.filter((c) => String(c[0]).includes("/progress/"));
  const certWrites = () => h.setDoc.mock.calls.filter((c) => String(c[0]).includes("/certs/"));
  const reads = () => h.getDocs.mock.calls.map((c) => String(c[0]));

  beforeEach(() => {
    h.getDocs.mockClear(); h.setDoc.mockReset(); h.setDoc.mockImplementation(async () => {});
    h.server = { progress: [], notes: [], certs: [], fromCache: false, certsFail: false };
  });

  it("reads once, merges the cloud copy and writes back only what the cloud lacks", async () => {
    h.stored = state({ onboarded: true, progress: { "ai-1-1": lesson(OCT1) }, notes: { "ai-1-1": "plan for Monday" } });
    h.server.progress = [{ id: "ai-1-2", data: { lessonId: "ai-1-2", unitId: "ai-1", track: "ai", accuracy: 1, xp: 30, seconds: 200, completedAt: OCT9 } }];
    render(<StoreProvider scope="u1"><Probe /></StoreProvider>);

    await waitFor(() => expect(store.state.progress["ai-1-2"]?.xp).toBe(30));
    await waitFor(() => expect(h.setDoc).toHaveBeenCalledTimes(2));
    expect(reads()).toEqual(["users/u1/progress", "users/u1/notes", "users/u1/certs"]); // once each: no listeners, no polling
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
    await waitFor(() => expect(h.getDocs).toHaveBeenCalledTimes(3));

    act(() => store.dispatch({ type: "completeLesson", id: "ai-1-2", result: { accuracy: 0.9, xp: 28, seconds: 240, unitId: "ai-1", track: "ai" } }));
    await waitFor(() => expect(progressWrites().map((c) => c[0])).toEqual(["users/u1/progress/ai-1-2"]));

    h.server.fromCache = false;
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(progressWrites().map((c) => c[0])).toEqual(["users/u1/progress/ai-1-2", "users/u1/progress/ai-1-1"]));
    expect(h.getDocs).toHaveBeenCalledTimes(6);
  });

  it("reads the certificates with the lessons, takes the cloud's and creates only the ones it lacks", async () => {
    h.stored = state({ onboarded: true, certs: { "ai-1": cert(OCT1), "iot-1-2": cert(OCT9, "Sensors", "iot") } });
    h.server.certs = [
      { id: "iot-1-2", data: { title: { en: "Sensors" }, track: "iot", at: OCT9 } },
      // Earned on another phone, in a course that has been unpublished since.
      { id: "cyber-1-1", data: { title: { en: "Passwords", ar: "كلمات المرور" }, track: "cyber", at: OCT1 } },
    ];
    render(<StoreProvider scope="u1"><Probe /></StoreProvider>);

    await waitFor(() => expect(store.state.certs?.["cyber-1-1"]).toEqual({ title: { en: "Passwords", ar: "كلمات المرور" }, track: "cyber", at: OCT1 }));
    await waitFor(() => expect(certWrites()).toHaveLength(1));
    expect(certWrites()[0]).toEqual(["users/u1/certs/ai-1", { title: { en: "AI basics" }, track: "ai", at: OCT1 }]);
    expect(Object.keys(store.state.certs ?? {}).sort()).toEqual(["ai-1", "cyber-1-1", "iot-1-2"]);

    // Changes elsewhere, and a certificate earned again, write nothing more.
    act(() => store.dispatch({ type: "set", patch: { lang: "ar" } }));
    act(() => store.dispatch({ type: "earnCert", id: "ai-1", cert: cert(new Date().toISOString()) }));
    await new Promise((r) => setTimeout(r, 20));
    expect(h.setDoc).toHaveBeenCalledTimes(1);
    expect(h.getDocs).toHaveBeenCalledTimes(3);
  });

  it("a refused certificate write is never tried again, and lessons keep syncing", async () => {
    h.setDoc.mockImplementation(async (path: string) => { if (path.includes("/certs/")) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.stored = state({ onboarded: true });
    h.server.fromCache = true;
    render(<StoreProvider scope="u1"><Probe /></StoreProvider>);
    await waitFor(() => expect(h.getDocs).toHaveBeenCalledTimes(3));
    act(() => store.dispatch({ type: "earnCert", id: "ai-1", cert: cert(new Date().toISOString()) }));
    await waitFor(() => expect(certWrites()).toHaveLength(1));

    act(() => store.dispatch({ type: "completeLesson", id: "ai-1-1", result: { accuracy: 1, xp: 30, seconds: 100, unitId: "ai-1", track: "ai" } }));
    await waitFor(() => expect(progressWrites().map((c) => c[0])).toEqual(["users/u1/progress/ai-1-1"]));
    // Back online, the server's copy still lacks the certificate: it isn't sent again.
    h.server.fromCache = false;
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(h.getDocs).toHaveBeenCalledTimes(6));
    act(() => store.dispatch({ type: "saveNote", id: "ai-1-1", text: "try it on Monday" }));
    await waitFor(() => expect(h.setDoc).toHaveBeenCalledWith("users/u1/notes/ai-1-1", expect.objectContaining({ text: "try it on Monday" })));
    act(() => store.dispatch({ type: "completeLesson", id: "ai-1-2", result: { accuracy: 1, xp: 30, seconds: 100, unitId: "ai-1", track: "ai" } }));
    await waitFor(() => expect(progressWrites().map((c) => c[0])).toEqual(["users/u1/progress/ai-1-1", "users/u1/progress/ai-1-2"]));
    await new Promise((r) => setTimeout(r, 20));
    expect(certWrites()).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("a refused certificates read doesn't hold lessons back, and only this session's certificates go", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.server.certsFail = true;
    h.stored = state({ onboarded: true, progress: { "ai-1-1": lesson(OCT1, { unitId: "ai-1", track: "ai" }) }, certs: { "ai-1": cert(OCT1) } });
    render(<StoreProvider scope="u1"><Probe /></StoreProvider>);

    // Lessons and notes came from the server, so the old result goes; whether the cloud has the old certificate is unknown.
    await waitFor(() => expect(progressWrites().map((c) => c[0])).toEqual(["users/u1/progress/ai-1-1"]));
    expect(certWrites()).toHaveLength(0);

    act(() => store.dispatch({ type: "earnCert", id: "iot-1-2", cert: cert(new Date().toISOString(), "Sensors", "iot") }));
    await waitFor(() => expect(certWrites().map((c) => c[0])).toEqual(["users/u1/certs/iot-1-2"]));
    act(() => { window.dispatchEvent(new Event("online")); }); // a refused read isn't made again until the next sign-in
    await new Promise((r) => setTimeout(r, 20));
    expect(h.getDocs).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("offline: a certificate earned now goes at once, older ones once the server copy is read", async () => {
    h.stored = state({ onboarded: true, certs: { "ai-1": cert(OCT1) } });
    h.server.fromCache = true;
    render(<StoreProvider scope="u1"><Probe /></StoreProvider>);
    await waitFor(() => expect(h.getDocs).toHaveBeenCalledTimes(3));

    act(() => store.dispatch({ type: "earnCert", id: "iot-1-2", cert: cert(new Date().toISOString(), "Sensors", "iot") }));
    await waitFor(() => expect(certWrites().map((c) => c[0])).toEqual(["users/u1/certs/iot-1-2"]));

    h.server.fromCache = false;
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(certWrites().map((c) => c[0])).toEqual(["users/u1/certs/iot-1-2", "users/u1/certs/ai-1"]));
    expect(h.getDocs).toHaveBeenCalledTimes(6);
  });
});

describe("the learning profile on users/{uid} (learningSync)", () => {
  const answers = { onboarded: true, audience: "students", stage: "upper", tracks: ["ai", "code"], levels: { ai: 3, code: 4 }, weeklyLessons: 8 };
  const T1 = 1762500000000, T2 = T1 + 60e3;

  it("gives a new device the account's answers all at once, onboarded too, and writes nothing", () => {
    const r = learningSync(state(), { name: "Amina", ...answers, learnAt: T1 });
    expect(r.push).toBeUndefined();
    expect(r.pull).toEqual({ ...answers, learnAt: T1 });
    expect(learningSync(state(), null)).toEqual({}); // the profile not read yet, or none: nothing
  });

  it("starts onboarding from tracks an organization chose and where they teach, and writes nothing until it is done", () => {
    expect(learningSync(state(), { tracks: ["iot"], teach: "secondary" })).toEqual({ pull: { tracks: ["iot"], teach: "lower", learnAt: 0 } });
    expect(learningSync(state({ tracks: ["ai"] }), { tracks: ["iot"] })).toEqual({}); // the learner's own choice stands
  });

  it("from a device onboarded before profiles were kept, writes its answers once, and dates both copies", () => {
    const here = state({ onboarded: true, tracks: ["ai"], levels: { ai: 2 }, audience: "teachers", teach: "university" });
    const r = learningSync(here, { name: "Amina", role: "learner", teach: "university" }, T1);
    expect(r.push).toEqual({ onboarded: true, tracks: ["ai"], levels: { ai: 2 }, weeklyLessons: 4, audience: "teachers", learnAt: T1 }); // teach already there
    expect(r.pull).toEqual({ learnAt: T1 });
    // Its echo changes nothing.
    expect(learningSync({ ...here, learnAt: T1 }, { teach: "university", ...r.push })).toEqual({});
  });

  it("writes only what changed here since, and takes what changed on another device since", () => {
    const here = state({ ...answers, learnAt: T2, levels: { ai: 4, code: 4 } } as Partial<AppState>);
    expect(learningSync(here, { ...answers, learnAt: T1 })).toEqual({ push: { levels: { ai: 4, code: 4 }, learnAt: T2 } });
    expect(learningSync(state({ ...answers, learnAt: T1 } as Partial<AppState>), { ...answers, tracks: ["code"], learnAt: T2 })).toEqual({ pull: { tracks: ["code"], learnAt: T2 } });
  });

  it("takes an edit someone else made on the profile (the same date, other values)", () => {
    expect(learningSync(state({ ...answers, learnAt: T1 } as Partial<AppState>), { ...answers, tracks: ["cyber"], learnAt: T1 })).toEqual({ pull: { tracks: ["cyber"], learnAt: T1 } });
  });

  it("ignores what the profile holds that the app would never write", () => {
    expect(learningOf({ onboarded: "yes", audience: "parents", stage: "nursery", tracks: "ai", levels: { ai: 99, cyber: 2, x: "3" }, weeklyLessons: 2.5, teach: 7, learnAt: "soon" }))
      .toEqual({ values: { levels: { cyber: 2 } }, at: 0 });
  });

  it("dates a change to the learning profile here, and nothing else", () => {
    let s: AppState | null = null;
    function P() { const st = useStore(); s = st.state; (P as unknown as { d: typeof st.dispatch }).d = st.dispatch; return null; }
    h.stored = state({ onboarded: true, learnAt: T1 });
    render(<StoreProvider scope="u1"><P /></StoreProvider>);
    const d = (P as unknown as { d: ReturnType<typeof useStore>["dispatch"] }).d;
    return waitFor(() => expect(s!.learnAt).toBe(T1)).then(() => {
      act(() => d({ type: "set", patch: { lang: "ar", track: "ai" } }));
      expect(s!.learnAt).toBe(T1);
      act(() => d({ type: "set", patch: { tracks: ["ai"] } }));
      expect(s!.learnAt).toBeGreaterThan(T1);
      act(() => d({ type: "set", patch: { tracks: ["cyber"], learnAt: T2 } })); // the account's copy arriving keeps its date
      expect(s!.learnAt).toBe(T2);
    });
  });
});

describe("useLearningSync", () => {
  let store: ReturnType<typeof useStore>;
  function Probe({ profile }: { profile: Record<string, unknown> | null }) { store = useStore(); useLearningSync("u1", profile, true); return null; }
  beforeEach(() => { h.updateDoc.mockReset(); h.updateDoc.mockImplementation(async () => {}); });

  it("skips onboarding on a new device, from the profile alone, and writes nothing", async () => {
    h.stored = undefined;
    render(<StoreProvider scope="u1"><Probe profile={{ name: "Amina", onboarded: true, tracks: ["code"], levels: { code: 3 }, audience: "students", stage: "university", learnAt: 1 }} /></StoreProvider>);
    await waitFor(() => expect(store.state).toMatchObject({ onboarded: true, tracks: ["code"], levels: { code: 3 }, audience: "students", stage: "university", learnAt: 1 }));
    await new Promise((r) => setTimeout(r, 20));
    expect(h.updateDoc).not.toHaveBeenCalled();
  });

  it("writes a change once, whole, and its echo ends it", async () => {
    const profile = { onboarded: true, tracks: ["ai"], levels: { ai: 2 }, weeklyLessons: 4, learnAt: 5 };
    h.stored = state({ onboarded: true, tracks: ["ai"], levels: { ai: 2 }, learnAt: 5 });
    const view = render(<StoreProvider scope="u1"><Probe profile={profile} /></StoreProvider>);
    await waitFor(() => expect(store.state.learnAt).toBe(5));
    act(() => store.dispatch({ type: "set", patch: { levels: {} } })); // a level dropped: the field goes whole, not merged
    await waitFor(() => expect(h.updateDoc).toHaveBeenCalledTimes(1));
    const [ref, data] = h.updateDoc.mock.calls[0];
    expect(ref).toBe("users/u1");
    expect(data).toEqual({ levels: {}, learnAt: store.state.learnAt });
    act(() => store.dispatch({ type: "set", patch: { dataSaver: true } })); // before the echo: not sent again
    view.rerender(<StoreProvider scope="u1"><Probe profile={{ ...profile, ...data }} /></StoreProvider>);
    await new Promise((r) => setTimeout(r, 20));
    expect(h.updateDoc).toHaveBeenCalledTimes(1);
  });
});
