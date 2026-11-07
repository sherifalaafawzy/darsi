import { act, render, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";

// Firebase is loaded only for a session stored on this device, or when an account screen asks for it.
// fb.ts (the loader and the stored-session check) is replaced, so each case controls both.
const h = vi.hoisted(() => ({
  storedSession: vi.fn(),
  loadFirebase: vi.fn(),
  authCallback: null as null | ((u: unknown) => void),
  calls: [] as string[],
  pending: () => Promise.resolve() as Promise<void>, // waitForPendingWrites: resolves once the cloud has every write
  store: {} as Record<string, unknown>,
  replace: vi.fn(),
}));
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { apiKey: "test-key" }, useEmulators: false, functionsRegion: "europe-west1" }));
vi.mock("../src/fb", () => ({ storedSession: h.storedSession, loadFirebase: h.loadFirebase }));
vi.mock("../src/notify/push", () => ({ pushSignOut: vi.fn(async (uid: string) => { h.calls.push(`pushSignOut:${uid}`); }) }));
vi.mock("../src/platform", () => ({ storage: { get: async (k: string) => h.store[k], set: async (k: string, v: unknown) => { h.store[k] = v; }, remove: async (k: string) => { delete h.store[k]; } } }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => { h.calls.push("listen"); h.authCallback = cb; return () => {}; },
  signOut: vi.fn(async () => { h.calls.push("signOut"); }),
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  onSnapshot: (_ref: string, next: (s: unknown) => void) => { next({ exists: () => true, data: () => ({ name: "Amina", role: "teacher", orgId: "o1" }) }); return () => {}; },
  updateDoc: vi.fn(async () => {}),
  setDoc: vi.fn(async () => {}),
  serverTimestamp: () => "ts",
  waitForPendingWrites: vi.fn(async () => { h.calls.push("waitForPendingWrites"); await h.pending(); }),
  terminate: vi.fn(async () => { h.calls.push("terminate"); }),
  clearIndexedDbPersistence: vi.fn(async () => { h.calls.push("clearIndexedDbPersistence"); }),
}));

let auth: ReturnType<typeof useAuth>;
function Probe() { auth = useAuth(); return null; }
const user = (uid: string) => ({ uid, getIdTokenResult: async () => ({ claims: { role: "teacher", orgId: "o1" } }) });

beforeEach(() => {
  h.storedSession.mockReset(); h.loadFirebase.mockReset(); h.authCallback = null; h.calls = [];
  h.pending = () => Promise.resolve(); h.store = {}; h.replace.mockReset();
  vi.stubGlobal("location", { ...window.location, replace: h.replace }); // signing out restarts the page
  localStorage.clear(); sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

it("a guest never loads the Firebase SDK", async () => {
  h.storedSession.mockResolvedValue(null);
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(auth.loading).toBe(false));
  expect(h.loadFirebase).not.toHaveBeenCalled();
  expect(auth.user).toBeNull();
  expect(auth.offlineUid).toBeNull();
});

it("a stored session loads the SDK at startup and publishes the user with their role", async () => {
  h.storedSession.mockResolvedValue({ uid: "u1", email: "a@b.org", createdAt: 1 });
  h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(h.authCallback).not.toBeNull());
  await act(async () => { h.authCallback!(user("u1")); });
  await waitFor(() => expect(auth.loading).toBe(false));
  expect(h.loadFirebase).toHaveBeenCalledTimes(1);
  expect(auth.user?.uid).toBe("u1");
  expect(auth.role).toBe("teacher"); // claims are read before the user is published
  expect(auth.profile?.name).toBe("Amina");
});

it("offline before the SDK was cached: learning continues in the stored account's local store", async () => {
  h.storedSession.mockResolvedValue({ uid: "u1", email: null, createdAt: null });
  h.loadFirebase.mockRejectedValue(new TypeError("Failed to fetch dynamically imported module"));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(auth.loading).toBe(false));
  expect(auth.offlineUid).toBe("u1");
  expect(auth.user).toBeNull();

  // Back online: it retries and reconnects.
  h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
  await act(async () => { window.dispatchEvent(new Event("online")); });
  await waitFor(() => expect(h.authCallback).not.toBeNull());
  await act(async () => { h.authCallback!(user("u1")); });
  await waitFor(() => expect(auth.user?.uid).toBe("u1"));
  expect(auth.offlineUid).toBeNull();
});

it("a stored session that ended while offline becomes a guest once the SDK reconnects", async () => {
  h.storedSession.mockResolvedValue({ uid: "u1", email: null, createdAt: null });
  h.loadFirebase.mockRejectedValue(new TypeError("Failed to fetch dynamically imported module"));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(auth.offlineUid).toBe("u1"));

  h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
  await act(async () => { window.dispatchEvent(new Event("online")); });
  await waitFor(() => expect(h.authCallback).not.toBeNull());
  await act(async () => { h.authCallback!(null); }); // the token was revoked (e.g. an admin reset the password)
  expect(auth.offlineUid).toBeNull();
  expect(auth.user).toBeNull();
  expect(auth.loading).toBe(false);
});

it("an account screen loads the SDK on demand, once", async () => {
  h.storedSession.mockResolvedValue(null);
  h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(auth.loading).toBe(false));
  expect(h.loadFirebase).not.toHaveBeenCalled();
  await act(async () => { await Promise.all([auth.ensureFirebase(), auth.ensureFirebase()]); });
  await act(async () => { await auth.ensureFirebase(); });
  expect(h.loadFirebase).toHaveBeenCalledTimes(1);
  expect(h.authCallback).not.toBeNull(); // listening for the sign-in that follows
});

describe("signing out (shared phones and lab PCs)", () => {
  const signedIn = async () => {
    h.storedSession.mockResolvedValue({ uid: "u1", email: "a@b.org", createdAt: 1 });
    h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(h.authCallback).not.toBeNull());
    await act(async () => { h.authCallback!(user("u1")); });
    await waitFor(() => expect(auth.user?.uid).toBe("u1"));
  };
  const own = { version: 1, lang: "ar", onboarded: true, tracks: ["ai"], levels: { ai: 3 }, name: "Amina", org: { id: "o1", name: "Nile School", v: 1 },
    progress: { "ai-1-1": { done: true, completedAt: "2026-11-01" } }, notes: { "ai-1-1": "my private note" }, notesAt: { "ai-1-1": 5 }, weeks: { "2026-W44": 1 }, downloads: { "ai-1": "done" } };

  it("stops this phone's notifications first, then clears Firestore's cache and the account's work here, and starts afresh", async () => {
    await signedIn();
    h.store["darsi:state:u1"] = own;
    await act(async () => { await auth.signOut(); });
    // unregisterDevice needs the session, so it runs before signOut; the cache can only be cleared once the SDK stops.
    expect(h.calls).toEqual(["listen", "pushSignOut:u1", "waitForPendingWrites", "signOut", "terminate", "clearIndexedDbPersistence"]);
    const left = h.store["darsi:state:u1"] as typeof own;
    expect(left).toMatchObject({ lang: "ar", onboarded: true, tracks: ["ai"], levels: { ai: 3 }, downloads: { "ai-1": "done" }, progress: {}, notes: {}, notesAt: {}, weeks: {}, name: "" });
    expect(left.org).toBeUndefined(); // it all comes back from the cloud (and the profile) at the next sign-in
    expect(localStorage.getItem("darsi:purgeFs")).toBeNull();
    expect(sessionStorage.getItem("darsi:keptOnDevice")).toBeNull();
    expect(h.replace).toHaveBeenCalledWith("/");
  });

  it("offline, unsent work stays on this device (sync sends it at the next sign-in here) and the person is told", async () => {
    await signedIn();
    h.store["darsi:state:u1"] = own;
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => { await auth.signOut(); });
    online.mockRestore();
    expect(h.store["darsi:state:u1"]).toEqual(own);
    expect(sessionStorage.getItem("darsi:keptOnDevice")).toBe("1");
    expect(h.calls).toContain("clearIndexedDbPersistence"); // the cache (other people's records too) still goes
    expect(h.replace).toHaveBeenCalledWith("/");
  });

  it("a cache clear that couldn't finish is finished when an account screen next opens, before anything reads Firestore", async () => {
    localStorage.setItem("darsi:purgeFs", "1");
    h.storedSession.mockResolvedValue(null);
    h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(auth.loading).toBe(false));
    await act(async () => { await auth.ensureFirebase(); });
    expect(h.calls).toEqual(["clearIndexedDbPersistence", "listen"]);
    expect(localStorage.getItem("darsi:purgeFs")).toBeNull();
  });

  it("but never under a session still on this device", async () => {
    localStorage.setItem("darsi:purgeFs", "1");
    await signedIn();
    expect(h.calls).toEqual(["listen"]);
    expect(localStorage.getItem("darsi:purgeFs")).toBe("1");
  });

  it("a second tap while it waits joins the first: it runs once, and nobody is told their work wasn't sent", async () => {
    await signedIn();
    h.store["darsi:state:u1"] = own;
    let sent!: () => void;
    h.pending = () => new Promise<void>((r) => { sent = r; }); // a slow connection
    let both!: Promise<unknown>;
    act(() => { both = Promise.all([auth.signOut(), auth.signOut()]); });
    await waitFor(() => expect(h.calls).toContain("waitForPendingWrites"));
    await act(async () => { sent(); await both; });
    expect(h.calls.filter((c) => c === "pushSignOut:u1")).toHaveLength(1);
    expect(h.calls.filter((c) => c === "signOut")).toHaveLength(1);
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("darsi:keptOnDevice")).toBeNull();
  });
});

describe("a self-registered learner's profile", () => {
  it("is created with the fields the rules allow", async () => {
    const { setDoc } = await import("firebase/firestore");
    const { createLearnerProfile } = await import("../src/auth/AuthProvider");
    h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
    vi.mocked(setDoc).mockClear();
    await createLearnerProfile("u2", { name: "Amina", email: "a@b.org", lang: "ar" });
    expect(vi.mocked(setDoc).mock.calls).toEqual([["users/u2", expect.objectContaining({ name: "Amina", email: "a@b.org", lang: "ar", role: "learner", orgId: null, createdAt: "ts" })]]);
  });

  it("still gets the typed name and language when joining from an invite link created the document first", async () => {
    const { setDoc } = await import("firebase/firestore");
    const { createLearnerProfile } = await import("../src/auth/AuthProvider");
    h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
    vi.mocked(setDoc).mockClear().mockRejectedValueOnce(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
    await createLearnerProfile("u3", { name: "Amina", email: "a@b.org", lang: "ar" });
    const [, second] = vi.mocked(setDoc).mock.calls;
    expect(second[0]).toBe("users/u3");
    expect(Object.keys(second[1] as object).sort()).toEqual(["lang", "lastActive", "name"]); // what a person may change on their own profile
    expect(second[2]).toEqual({ merge: true });
  });

  it("any other failure is the sign-up's error, as before", async () => {
    const { setDoc } = await import("firebase/firestore");
    const { createLearnerProfile } = await import("../src/auth/AuthProvider");
    h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
    vi.mocked(setDoc).mockClear().mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "unavailable" }));
    await expect(createLearnerProfile("u4", { name: "A", email: "a@b.org", lang: "en" })).rejects.toThrow("offline");
    expect(vi.mocked(setDoc)).toHaveBeenCalledTimes(1);
  });
});
