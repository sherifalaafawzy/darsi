import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import { StoreProvider, useStore } from "../src/state/store";
import { useOrgBrand } from "../src/state/orgBrand";

// Sessions on a weak or missing connection (TECHNICAL.md): a school account keeps its role and
// its organization when the token can't be read, a connection that hangs doesn't hold the first screen, a session the
// server ended cleans the device as Sign out does, and "last seen" is written once a day.
// The SDK is replaced as in tests/auth.test.tsx; here each case also decides what the token and the profile answer.
const h = vi.hoisted(() => ({
  storedSession: vi.fn(),
  loadFirebase: vi.fn(),
  authCallback: null as null | ((u: unknown) => unknown),
  snapshot: null as null | ((s: unknown) => void), // the profile listener: a case can deliver a later snapshot
  calls: [] as string[],
  store: {} as Record<string, unknown>,
  replace: vi.fn(),
  profile: { name: "Amina", role: "orgAdmin", orgId: "o1" } as Record<string, unknown>,
  updateDoc: vi.fn(async (..._a: unknown[]) => {}),
  mounts: 0,
  holdProfile: false, // the profile listener answers nothing by itself: a case delivers the snapshot when it chooses
}));
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { apiKey: "test-key" }, useEmulators: false, functionsRegion: "europe-west1" }));
vi.mock("../src/fb", () => ({ storedSession: h.storedSession, loadFirebase: h.loadFirebase }));
vi.mock("../src/notify/push", () => ({ pushSignOut: vi.fn(async (uid: string) => { h.calls.push(`pushSignOut:${uid}`); }) }));
vi.mock("../src/platform", () => ({ storage: { get: async (k: string) => h.store[k], set: async (k: string, v: unknown) => { h.store[k] = v; }, remove: async (k: string) => { delete h.store[k]; } } }));
vi.mock("../src/content/load", async (orig) => ({ ...(await orig<typeof import("../src/content/load")>()), forgetOrgFiles: vi.fn(async () => { h.calls.push("forgetOrgFiles"); }) }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => unknown) => { h.calls.push("listen"); h.authCallback = cb; return () => {}; },
  signOut: vi.fn(async () => { h.calls.push("signOut"); }),
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  onSnapshot: (_ref: string, next: (s: unknown) => void) => { h.snapshot = next; if (!h.holdProfile) next({ exists: () => true, data: () => h.profile }); return () => {}; },
  // The organization's document, offline: only Firestore's cache answers, which useOrgBrand doesn't act on.
  getDoc: vi.fn(async () => ({ metadata: { fromCache: true }, data: () => ({}) })),
  updateDoc: h.updateDoc,
  setDoc: vi.fn(async () => {}),
  serverTimestamp: () => "ts",
  waitForPendingWrites: vi.fn(async () => { h.calls.push("waitForPendingWrites"); }),
  terminate: vi.fn(async () => { h.calls.push("terminate"); }),
  clearIndexedDbPersistence: vi.fn(async () => { h.calls.push("clearIndexedDbPersistence"); }),
}));

const offline = () => Promise.reject(Object.assign(new Error("Firebase: Error (auth/network-request-failed)."), { code: "auth/network-request-failed" }));
/** A signed-in user whose token answers what `token` says at that moment (a working token, or the network failing). */
const user = (uid: string, token: () => Promise<{ claims: Record<string, unknown> }>) => ({ uid, getIdTokenResult: vi.fn(() => token()) });
const KEPT = "darsi:claims:u1";
const today = new Date().toISOString();
const yesterday = new Date(Date.now() - 864e5).toISOString();
const own = { version: 1, lang: "en", onboarded: true, tracks: ["ai"], levels: { ai: 2 }, name: "Amina", org: { id: "o1", name: "Nile School", v: 1 },
  progress: { "ai-1-1": { done: true, completedAt: "2026-11-01" } }, notes: { "ai-1-1": "my private note" }, notesAt: { "ai-1-1": 5 }, weeks: { "2026-W44": 1 }, downloads: {} };

let auth: ReturnType<typeof useAuth>;
let store: ReturnType<typeof useStore>;
/** As App does: one local store per person (key = uid), and the organization read from the claims. */
function Scoped() {
  auth = useAuth();
  if (auth.loading) return null;
  const scope = auth.user?.uid ?? auth.offlineUid ?? "guest";
  return <StoreProvider key={scope} scope={scope}><Routed /></StoreProvider>;
}
function Routed() {
  const { user: u, orgId, role, profile, profileReady } = useAuth();
  store = useStore();
  useOrgBrand(u?.uid, u ? orgId : null, { role, group: profileReady ? profile?.group ?? null : undefined });
  useEffect(() => { h.mounts++; }, []);
  return null;
}
/**
 * waitFor for the cases that fake setTimeout (the 2.5 s start timer): Testing Library's own waits on a timer after each
 * look, which would never fire. This one lets the pending promises and module loads run, without moving any timer.
 */
const until = async (ok: () => void) => {
  for (let i = 0; ; i++) {
    try { ok(); return; } catch (e) { if (i > 500) throw e; }
    await act(async () => { await new Promise<void>((r) => setImmediate(r)); });
  }
};
const start = async () => {
  h.storedSession.mockResolvedValue({ uid: "u1", email: "a@b.org", createdAt: 1 });
  h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
  render(<AuthProvider><Scoped /></AuthProvider>);
  await until(() => expect(h.authCallback).not.toBeNull());
};

beforeEach(() => {
  h.storedSession.mockReset(); h.loadFirebase.mockReset(); h.authCallback = null; h.snapshot = null; h.calls = []; h.store = {}; h.replace.mockReset();
  h.profile = { name: "Amina", role: "orgAdmin", orgId: "o1", lastActive: today }; h.updateDoc.mockClear(); h.mounts = 0; h.holdProfile = false;
  vi.stubGlobal("location", { ...window.location, replace: h.replace }); // an ended session restarts the page
  localStorage.clear(); sessionStorage.clear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("the token can't be read (it expired, and the phone is offline)", () => {
  it("a school account keeps the role and organization it last had on this device, marked as not known", async () => {
    localStorage.setItem(KEPT, JSON.stringify({ role: "orgAdmin", orgId: "o1", plan: null }));
    h.store["darsi:state:u1"] = own;
    await start();
    await act(async () => { await h.authCallback!(user("u1", offline)); });
    await waitFor(() => expect(store?.ready).toBe(true));
    expect(auth.user?.uid).toBe("u1");
    expect(auth.role).toBe("orgAdmin");
    expect(auth.orgId).toBe("o1");
    expect(auth.claimsKnown).toBe(false);
    expect(store.state.org).toMatchObject({ id: "o1", name: "Nile School" });
  });

  it("with nothing kept it is a learner for now, and the organization's name, logo and courses stay on the phone", async () => {
    h.store["darsi:state:u1"] = own;
    await start();
    await act(async () => { await h.authCallback!(user("u1", offline)); });
    await waitFor(() => expect(store?.ready).toBe(true));
    await act(async () => {}); // any effect that would clear it has run
    expect(auth.role).toBe("learner");
    expect(auth.orgId).toBeNull();
    expect(auth.claimsKnown).toBe(false);
    expect(store.state.org).toMatchObject({ id: "o1", name: "Nile School" });
    expect(localStorage.getItem(KEPT)).toBeNull(); // a guess is never kept
  });

  it("another account's kept claims, or a broken copy, are never used", async () => {
    localStorage.setItem("darsi:claims:u2", JSON.stringify({ role: "superadmin", orgId: null, plan: null }));
    localStorage.setItem(KEPT, JSON.stringify({ role: "owner-of-everything", orgId: "o1" }));
    await start();
    await act(async () => { await h.authCallback!(user("u1", offline)); });
    expect(auth.user?.uid).toBe("u1");
    expect(auth.role).toBe("learner");
    expect(auth.orgId).toBeNull();
  });

  it("back online, the token is read once more: the claims are known, kept for next time, and decide again", async () => {
    localStorage.setItem(KEPT, JSON.stringify({ role: "orgAdmin", orgId: "o1", plan: null }));
    h.store["darsi:state:u1"] = own;
    h.profile = { name: "Amina", role: "learner", orgId: null, lastActive: today }; // removed from the organization meanwhile
    let token: () => Promise<{ claims: Record<string, unknown> }> = offline;
    const u = user("u1", () => token());
    await start();
    await act(async () => { await h.authCallback!(u); });
    await waitFor(() => expect(store?.ready).toBe(true));
    expect(auth.role).toBe("orgAdmin"); // the old look, until a token says otherwise
    expect(store.state.org?.id).toBe("o1");

    token = async () => ({ claims: { role: "learner" } });
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(auth.claimsKnown).toBe(true));
    expect(auth.role).toBe("learner");
    expect(auth.orgId).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEPT)!)).toEqual({ role: "learner", orgId: null, plan: null });
    await waitFor(() => expect(store.state.org).toBeUndefined()); // left the organization: at once, now that it is known

    // Known claims aren't read again at every reconnection.
    const reads = u.getIdTokenResult.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(u.getIdTokenResult.mock.calls.length).toBe(reads);
  });

  it("or when the server answers the profile listener (a connection that came back without saying so)", async () => {
    localStorage.setItem(KEPT, JSON.stringify({ role: "orgAdmin", orgId: "o1", plan: null }));
    let token: () => Promise<{ claims: Record<string, unknown> }> = offline;
    const u = user("u1", () => token());
    await start();
    await act(async () => { await h.authCallback!(u); });
    expect(auth.claimsKnown).toBe(false);
    const before = u.getIdTokenResult.mock.calls.length;
    await act(async () => { h.snapshot!({ exists: () => true, data: () => h.profile, metadata: { fromCache: true } }); });
    expect(u.getIdTokenResult.mock.calls.length).toBe(before); // Firestore's cache says nothing about the connection

    token = async () => ({ claims: { role: "orgAdmin", orgId: "o1" } });
    await act(async () => { h.snapshot!({ exists: () => true, data: () => h.profile, metadata: { fromCache: false } }); });
    await waitFor(() => expect(auth.claimsKnown).toBe(true));
    expect(auth.role).toBe("orgAdmin");
    const reads = u.getIdTokenResult.mock.calls.length;
    await act(async () => { h.snapshot!({ exists: () => true, data: () => h.profile, metadata: { fromCache: false } }); });
    expect(u.getIdTokenResult.mock.calls.length).toBe(reads); // known: not read again
  });

  it("a token that reads is kept with its plan, and is known", async () => {
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "teacher", orgId: "o1", plan: "super", planUntil: 1800000000000 } }))); });
    expect(auth.claimsKnown).toBe(true);
    expect(auth.plan).toEqual({ id: "super", until: 1800000000000 });
    expect(JSON.parse(localStorage.getItem(KEPT)!)).toEqual({ role: "teacher", orgId: "o1", plan: { id: "super", until: 1800000000000 } });
  });

  it("private mode (localStorage throws): nothing is kept and nothing breaks", async () => {
    const boom = () => { throw new DOMException("denied", "SecurityError"); };
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom), set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    try {
      await start();
      await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "teacher", orgId: "o1" } }))); });
      expect(auth.role).toBe("teacher");
      expect(auth.claimsKnown).toBe(true);
    } finally { get.mockRestore(); set.mockRestore(); }
    expect(localStorage.getItem(KEPT)).toBeNull();
  });
});

describe("a connection that hangs at start", () => {
  it("after 2.5 s the person is in their own store with the role kept here; the late user takes over without a remount", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    localStorage.setItem(KEPT, JSON.stringify({ role: "teacher", orgId: "o1", plan: null }));
    h.store["darsi:state:u1"] = own;
    await start(); // the SDK is on the page, but hasn't said who is signed in
    expect(auth.loading).toBe(true);
    await act(async () => { vi.advanceTimersByTime(2499); });
    expect(auth.loading).toBe(true);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(auth.loading).toBe(false);
    expect(auth.offlineUid).toBe("u1");
    expect(auth.user).toBeNull();
    expect(auth.role).toBe("teacher");
    expect(auth.claimsKnown).toBe(false);
    await until(() => expect(h.mounts).toBe(1));

    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "teacher", orgId: "o1" } }))); });
    expect(auth.user?.uid).toBe("u1");
    expect(auth.offlineUid).toBeNull();
    expect(auth.claimsKnown).toBe(true);
    expect(auth.loading).toBe(false);
    expect(h.mounts).toBe(1); // the same store, the same screens
  });

  it("on a normal connection the user arrives first and the timer changes nothing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "teacher", orgId: "o1" } }))); });
    expect(auth.user?.uid).toBe("u1");
    await until(() => expect(h.mounts).toBe(1));
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(auth.offlineUid).toBeNull();
    expect(auth.user?.uid).toBe("u1");
    expect(auth.role).toBe("teacher");
    expect(h.mounts).toBe(1);
  });

  it("the user is published but the profile hangs: the screen is released, and the profile is not taken for read", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    h.holdProfile = true;
    h.store["darsi:state:u1"] = own;
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "teacher", orgId: "o1" } }))); });
    expect(auth.user?.uid).toBe("u1");
    expect(auth.loading).toBe(true); // a normal start still waits for the profile, as before
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(auth.loading).toBe(false);
    expect(auth.offlineUid).toBeNull(); // the account itself is here: nothing "offline" is published over it
    expect(auth.role).toBe("teacher");
    expect(auth.claimsKnown).toBe(true);
    expect(auth.profileReady).toBe(false); // what App's onboarding gate and sync wait on, as after any sign-in
    await until(() => expect(h.mounts).toBe(1));
    await act(async () => { h.snapshot!({ exists: () => true, data: () => h.profile, metadata: { fromCache: false } }); });
    expect(auth.profileReady).toBe(true);
    expect(auth.profile?.name).toBe("Amina");
    expect(h.mounts).toBe(1);
  });

  // No installed phone has a kept copy at its first start with the build that keeps them: at 2.5 s an org admin was
  // published as a learner, and App's routes sent them from their page to /learn for good (nothing navigates back
  // when the claims arrive).
  it("with no claims kept here (the first start after the update) the first screen waits for the SDK: a staff account is never published as a learner", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    h.holdProfile = true;
    h.store["darsi:state:u1"] = own;
    await start(); // the SDK is on the page, but hasn't said who is signed in
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(auth.loading).toBe(true);
    expect(auth.offlineUid).toBeNull();
    expect(auth.connecting).toBe(true);
    expect(h.mounts).toBe(0); // no screen, so no route has decided anything for a "learner"
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(auth.loading).toBe(true);

    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "orgAdmin", orgId: "o1" } }))); });
    expect(auth.user?.uid).toBe("u1");
    expect(auth.role).toBe("orgAdmin");
    expect(auth.claimsKnown).toBe(true);
    // Released with the user: only the profile is still awaited, as the timer does for a user it finds published.
    expect(auth.loading).toBe(false);
    expect(auth.profileReady).toBe(false);
    await until(() => expect(h.mounts).toBe(1));
    await act(async () => { h.snapshot!({ exists: () => true, data: () => h.profile, metadata: { fromCache: false } }); });
    expect(auth.profileReady).toBe(true);
    expect(h.mounts).toBe(1);
    expect(localStorage.getItem(KEPT)).not.toBeNull(); // kept now: the next slow start doesn't wait
  });

  it("the same when the kept copy can't be read (private mode), and a session that turns out to have ended still ends the wait", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    sessionStorage.setItem("darsi:ended", "u1"); // already cleaned: no restart in this case
    const boom = () => { throw new DOMException("denied", "SecurityError"); };
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    try {
      await start();
      await act(async () => { vi.advanceTimersByTime(2500); });
      expect(auth.loading).toBe(true);
      expect(auth.offlineUid).toBeNull();
    } finally { get.mockRestore(); }
    await act(async () => { await h.authCallback!(null); });
    expect(auth.loading).toBe(false);
    expect(auth.user).toBeNull();
    expect(auth.connecting).toBe(false);
  });

  it("nor is it held for ever when the SDK then fails to load: lessons only, as offline before it was cached", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    h.storedSession.mockResolvedValue({ uid: "u1", email: null, createdAt: null });
    let fail = (_e: Error) => {};
    h.loadFirebase.mockReturnValueOnce(new Promise((_r, reject) => { fail = reject; }));
    render(<AuthProvider><Scoped /></AuthProvider>);
    await until(() => expect(h.loadFirebase).toHaveBeenCalled());
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(auth.loading).toBe(true);
    await act(async () => { fail(new Error("Failed to fetch dynamically imported module")); });
    await until(() => expect(auth.loading).toBe(false));
    expect(auth.offlineUid).toBe("u1");
    expect(auth.role).toBe("learner");
  });

  it("without the SDK (its file hangs too) only lessons are offered: the kept role waits for it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    localStorage.setItem(KEPT, JSON.stringify({ role: "orgAdmin", orgId: "o1", plan: null }));
    h.storedSession.mockResolvedValue({ uid: "u1", email: null, createdAt: null });
    h.loadFirebase.mockReturnValue(new Promise(() => {})); // never answers
    render(<AuthProvider><Scoped /></AuthProvider>);
    await until(() => expect(h.loadFirebase).toHaveBeenCalled());
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(auth.loading).toBe(false);
    expect(auth.offlineUid).toBe("u1");
    expect(auth.role).toBe("learner");
  });

  // `connecting`: what tells a page that needs the account (Course results, the organization page) to wait for it
  // rather than treat a slow start as signed out (App.tsx SignedInOnly).
  it("says the saved session is still being opened while the SDK hasn't answered, and no longer once it has", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    localStorage.setItem(KEPT, JSON.stringify({ role: "teacher", orgId: "o1", plan: null })); // the start that doesn't wait
    await start();
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(auth.offlineUid).toBe("u1");
    expect(auth.user).toBeNull();
    expect(auth.connecting).toBe(true);
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "teacher", orgId: "o1" } }))); });
    expect(auth.user?.uid).toBe("u1");
    expect(auth.connecting).toBe(false);
  });

  it("also while the SDK's own file is still loading; not once it could not load at all, until the phone is online again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    localStorage.setItem(KEPT, JSON.stringify({ role: "teacher", orgId: "o1", plan: null })); // the start that doesn't wait
    h.storedSession.mockResolvedValue({ uid: "u1", email: null, createdAt: null });
    let fail = (_e: Error) => {};
    h.loadFirebase.mockReturnValueOnce(new Promise((_r, reject) => { fail = reject; }));
    render(<AuthProvider><Scoped /></AuthProvider>);
    await until(() => expect(h.loadFirebase).toHaveBeenCalled());
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(auth.offlineUid).toBe("u1");
    expect(auth.connecting).toBe(true);
    await act(async () => { fail(new Error("Failed to fetch dynamically imported module")); });
    await until(() => expect(auth.connecting).toBe(false));
    expect(auth.offlineUid).toBe("u1");
    // Back online: the SDK is asked for again, and the session is being opened again.
    h.loadFirebase.mockReturnValue(new Promise(() => {}));
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(h.loadFirebase).toHaveBeenCalledTimes(2);
    expect(auth.connecting).toBe(true);
  });

  it("a guest is never connecting, and a session the SDK says has ended isn't either", async () => {
    h.storedSession.mockResolvedValue(null);
    const guest = render(<AuthProvider><Scoped /></AuthProvider>);
    await until(() => expect(auth.loading).toBe(false));
    expect(auth.connecting).toBe(false);
    guest.unmount();
    sessionStorage.setItem("darsi:ended", "u1"); // already cleaned: no restart in this case
    await start();
    expect(auth.connecting).toBe(true);
    await act(async () => { await h.authCallback!(null); });
    expect(auth.connecting).toBe(false);
    expect(auth.offlineUid).toBeNull();
  });

  it("nothing is published after the provider is gone", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    h.storedSession.mockResolvedValue({ uid: "u1", email: null, createdAt: null });
    h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
    const view = render(<AuthProvider><Scoped /></AuthProvider>);
    await until(() => expect(h.authCallback).not.toBeNull());
    expect(vi.getTimerCount()).toBe(1); // the start timer, waiting for the SDK's answer
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a guest starts no timer and loads no SDK", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    h.storedSession.mockResolvedValue(null);
    render(<AuthProvider><Scoped /></AuthProvider>);
    await until(() => expect(auth.loading).toBe(false));
    expect(vi.getTimerCount()).toBe(0);
    expect(h.loadFirebase).not.toHaveBeenCalled();
    expect(auth.claimsKnown).toBe(false);
  });
});

describe("a session the server ended (password reset, suspended, removed, a role taken away)", () => {
  const cleaned = () => {
    expect(h.calls).toEqual(expect.arrayContaining(["terminate", "clearIndexedDbPersistence", "forgetOrgFiles"]));
    expect(h.calls).not.toContain("signOut"); // nobody tapped Sign out
    expect(h.store["darsi:state:u1"]).toMatchObject({ lang: "en", onboarded: true, progress: {}, notes: {}, notesAt: {}, weeks: {}, name: "" });
    expect((h.store["darsi:state:u1"] as typeof own).org).toBeUndefined();
    expect(localStorage.getItem("darsi:run:u1:ai-1-1-2")).toBeNull();
    expect(localStorage.getItem("darsi:run:u2:ai-1-1-2")).toBe("{}"); // another account's lesson in progress stays
    expect(localStorage.getItem(KEPT)).toBeNull();
    expect(localStorage.getItem("darsi:purgeFs")).toBeNull(); // the cache was cleared here and now
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith("/");
  };
  const seed = () => {
    h.store["darsi:state:u1"] = own;
    localStorage.setItem("darsi:run:u1:ai-1-1-2", "{}"); localStorage.setItem("darsi:run:u2:ai-1-1-2", "{}");
  };

  it("leaves the device as Sign out does, and starts the page afresh", async () => {
    seed();
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "orgAdmin", orgId: "o1" } }))); });
    expect(localStorage.getItem(KEPT)).not.toBeNull();
    await act(async () => { await h.authCallback!(null); });
    expect(auth.user).toBeNull();
    expect(auth.role).toBe("learner");
    expect(auth.claimsKnown).toBe(false);
    cleaned();
  });

  it("also when it ended while the app was closed: the session stored at start is the one cleaned", async () => {
    seed();
    localStorage.setItem(KEPT, JSON.stringify({ role: "orgAdmin", orgId: "o1", plan: null }));
    await start();
    await act(async () => { await h.authCallback!(null); });
    expect(auth.loading).toBe(false);
    cleaned();
  });

  it("cleans once: a record of the session still on the device after the restart doesn't restart the page for ever", async () => {
    seed();
    await start();
    await act(async () => { await h.authCallback!(null); });
    cleaned();
    expect(sessionStorage.getItem("darsi:ended")).toBe("u1");
  });

  it("the page that restart opens finds the same record: a guest's screen, and no second restart", async () => {
    sessionStorage.setItem("darsi:ended", "u1");
    await start();
    await act(async () => { await h.authCallback!(null); });
    expect(auth.user).toBeNull();
    expect(auth.loading).toBe(false);
    expect(h.calls).toEqual(["listen"]);
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("a cache that can't be cleared now is left to the next account screen", async () => {
    const fs = await import("firebase/firestore");
    vi.mocked(fs.clearIndexedDbPersistence).mockRejectedValueOnce(new Error("failed-precondition"));
    seed();
    await start();
    await act(async () => { await h.authCallback!(null); });
    expect(localStorage.getItem("darsi:purgeFs")).toBe("1");
    expect(h.replace).toHaveBeenCalledWith("/");
  });

  it("a token read that outlives the session publishes nobody and keeps nothing", async () => {
    let answer!: (r: { claims: Record<string, unknown> }) => void;
    const u = user("u1", () => new Promise((r) => { answer = r; }));
    await start();
    let first!: unknown;
    act(() => { first = h.authCallback!(u); }); // the token is being read…
    await act(async () => { await h.authCallback!(null); }); // …when the session ends
    await act(async () => { answer({ claims: { role: "orgAdmin", orgId: "o1" } }); await first; });
    expect(auth.user).toBeNull();
    expect(auth.role).toBe("learner");
    expect(localStorage.getItem(KEPT)).toBeNull();
    expect(h.replace).toHaveBeenCalledTimes(1);
  });

  it("a guest opening an account screen cleans nothing", async () => {
    h.storedSession.mockResolvedValue(null);
    h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
    render(<AuthProvider><Scoped /></AuthProvider>);
    await waitFor(() => expect(auth.loading).toBe(false));
    await act(async () => { await auth.ensureFirebase(); });
    await act(async () => { await h.authCallback!(null); }); // the SDK's first answer: nobody is signed in
    expect(h.calls).toEqual(["listen"]);
    expect(h.replace).not.toHaveBeenCalled();
    expect(localStorage.getItem("darsi:purgeFs")).toBeNull();
  });

  it("a normal sign-out runs its own clean-up, once: the session ending under it isn't taken for the server's doing", async () => {
    seed();
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "orgAdmin", orgId: "o1" } }))); });
    await waitFor(() => expect(auth.user?.uid).toBe("u1"));
    const { signOut } = await import("firebase/auth");
    // As the SDK does: Sign out reports "nobody" to the listener while signOutHere is still at work.
    vi.mocked(signOut).mockImplementationOnce(async () => { h.calls.push("signOut"); await h.authCallback!(null); });
    await act(async () => { await auth.signOut(); });
    expect(h.calls).toEqual(["listen", "pushSignOut:u1", "waitForPendingWrites", "signOut", "terminate", "clearIndexedDbPersistence", "forgetOrgFiles"]);
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(KEPT)).toBeNull();
    expect(localStorage.getItem("darsi:signedOut")).toMatch(/^u1 \d+$/); // what other tabs of this account go by
  });

  it("a sign-out that fails takes its mark back: the account is still signed in here", async () => {
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "orgAdmin", orgId: "o1" } }))); });
    await waitFor(() => expect(auth.user?.uid).toBe("u1"));
    h.loadFirebase.mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module"));
    await act(async () => { await expect(auth.signOut()).rejects.toThrow("Failed to fetch"); });
    expect(localStorage.getItem("darsi:signedOut")).toBeNull();
    expect(localStorage.getItem(KEPT)).not.toBeNull();
  });

  it("nor is a sign-out in another tab: the work it kept on this device (not sent yet) is not deleted here", async () => {
    seed();
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "orgAdmin", orgId: "o1" } }))); });
    localStorage.setItem("darsi:signedOut", `u1 ${Date.now()}`); // the other tab's Sign out
    await act(async () => { await h.authCallback!(null); });
    expect(auth.user).toBeNull();
    expect(h.calls).toEqual(["listen"]);
    expect(h.replace).not.toHaveBeenCalled();
    expect((h.store["darsi:state:u1"] as typeof own).progress).toEqual(own.progress);
    expect(localStorage.getItem(KEPT)).toBeNull(); // the claims still go with the session
  });

  it("a tab opened while another one is still signing out leaves that sign-out's mark alone", async () => {
    seed();
    localStorage.setItem("darsi:signedOut", `u1 ${Date.now() - 5000}`); // its Sign out began five seconds ago
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "orgAdmin", orgId: "o1" } }))); });
    await act(async () => { await h.authCallback!(null); }); // and now ends the session
    expect(h.replace).not.toHaveBeenCalled();
    expect((h.store["darsi:state:u1"] as typeof own).progress).toEqual(own.progress);
  });

  it("signing in again later takes the sign-out mark away, so an ended session is cleaned", async () => {
    seed();
    localStorage.setItem("darsi:signedOut", `u1 ${Date.now() - 5 * 60e3}`);
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "orgAdmin", orgId: "o1" } }))); });
    expect(localStorage.getItem("darsi:signedOut")).toBeNull();
    await act(async () => { await h.authCallback!(null); });
    cleaned();
  });

  it("without unsent work, says once that the person was signed out", async () => {
    seed();
    await start();
    await act(async () => { await h.authCallback!(null); });
    cleaned();
    expect(sessionStorage.getItem("darsi:endedNote")).toBe("out");
  });

  /** What an ended session with unsent work leaves: the account's own work, and nothing else of it. */
  const keptWork = () => {
    expect(h.store["darsi:state:u1"]).toMatchObject({ progress: own.progress, notes: own.notes, name: "Amina", org: own.org });
    expect(localStorage.getItem("darsi:gone:darsi:state:u1")).toBeNull(); // its store may be saved, and read at the next sign-in
    expect(localStorage.getItem("darsi:run:u1:ai-1-1-2")).toBe("{}"); // its lesson in progress
    expect(localStorage.getItem(KEPT)).toBeNull(); // the claims still go
    expect(h.calls).toEqual(expect.arrayContaining(["terminate", "clearIndexedDbPersistence", "forgetOrgFiles"]));
    expect(h.replace).toHaveBeenCalledWith("/");
    expect(sessionStorage.getItem("darsi:endedNote")).toBe("kept");
  };

  it("keeps the account's lessons and notes the cloud hasn't acknowledged (the unsent mark), and says so", async () => {
    seed();
    localStorage.setItem("darsi:unsent:u1", "1.abc"); // a lesson finished offline (state/store.tsx unsent)
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "orgAdmin", orgId: "o1" } }))); });
    await act(async () => { await h.authCallback!(null); });
    keptWork();
    expect(localStorage.getItem("darsi:unsent:u1")).toBe("1.abc"); // the next sign-in's sync sends it, then clears it
  });

  it("also when it ended while the app was closed", async () => {
    seed();
    localStorage.setItem("darsi:unsent:u1", "1.abc");
    await start();
    await act(async () => { await h.authCallback!(null); });
    keptWork();
  });

  it("keeps a project draft that was never sent, with the rest of the account's work", async () => {
    seed();
    localStorage.setItem("darsi-project-draft:u1:ai-1-1-4:proj", JSON.stringify({ text: "My plan for the class", explain: "", ai: "", aiHow: "", repo: "", links: "", check: "" }));
    await start();
    await act(async () => { await h.authCallback!(null); });
    keptWork();
    expect(localStorage.getItem("darsi-project-draft:u1:ai-1-1-4:proj")).toContain("My plan for the class");
  });

  it("another account's unsent mark changes nothing for this one", async () => {
    seed();
    localStorage.setItem("darsi:unsent:u2", "1.abc");
    await start();
    await act(async () => { await h.authCallback!(null); });
    cleaned();
  });
});

describe("Sign out with unsent work the queue never held", () => {
  it("keeps the account's work on the device when the unsent mark is set, though Firestore's queue is empty", async () => {
    h.store["darsi:state:u1"] = own;
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "learner" } }))); });
    await waitFor(() => expect(auth.user?.uid).toBe("u1"));
    localStorage.setItem("darsi:unsent:u1", "1.abc"); // finished offline last session, held back until a server read
    await act(async () => { await auth.signOut(); });
    expect(h.calls).toContain("waitForPendingWrites");
    expect((h.store["darsi:state:u1"] as typeof own).progress).toEqual(own.progress);
    expect(sessionStorage.getItem("darsi:keptOnDevice")).toBe("1");
  });

  it("forgets it as before when nothing is unsent", async () => {
    h.store["darsi:state:u1"] = own;
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "learner" } }))); });
    await waitFor(() => expect(auth.user?.uid).toBe("u1"));
    await act(async () => { await auth.signOut(); });
    expect((h.store["darsi:state:u1"] as typeof own).progress).toEqual({});
    expect(sessionStorage.getItem("darsi:keptOnDevice")).toBeNull();
  });

  // The project form says "What you type is kept on this phone until you send it". Sign out used to delete it without
  // a word when everything else was in the cloud; an ended session already kept it.
  it("keeps a project that was typed and never sent, with the account's copy and its lesson in progress, and says so", async () => {
    const DRAFT = "darsi-project-draft:u1:ai-1-1-4:proj";
    h.store["darsi:state:u1"] = own;
    localStorage.setItem(DRAFT, JSON.stringify({ text: "My plan for the class", explain: "", ai: "", aiHow: "", repo: "", links: "", check: "" }));
    localStorage.setItem("darsi:run:u1:ai-1-1-2", "{}");
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "learner" } }))); });
    await waitFor(() => expect(auth.user?.uid).toBe("u1"));
    await act(async () => { await auth.signOut(); });
    expect(localStorage.getItem(DRAFT)).toContain("My plan for the class");
    expect(localStorage.getItem("darsi:run:u1:ai-1-1-2")).toBe("{}");
    expect((h.store["darsi:state:u1"] as typeof own).progress).toEqual(own.progress);
    expect(sessionStorage.getItem("darsi:keptOnDevice")).toBe("1");
    expect(h.calls).toContain("clearIndexedDbPersistence"); // Firestore's cache (other people's records too) still goes
  });

  it("a milestone already sent, or a form with nothing typed, holds nothing back: they go with the rest", async () => {
    h.store["darsi:state:u1"] = own;
    localStorage.setItem("darsi-project-draft:u1:cap:m1", JSON.stringify({ text: "Sent on Monday", sentAt: 1_700_000_000_000, sentBy: "u1" }));
    localStorage.setItem("darsi-project-draft:u1:ai-1-1-4:proj", JSON.stringify({ text: "  ", explain: "", ai: "none", aiHow: "", repo: "", links: "", check: "" }));
    localStorage.setItem("darsi-project-draft:u2:ai-1-1-4:proj", JSON.stringify({ text: "Another account's" }));
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "learner" } }))); });
    await waitFor(() => expect(auth.user?.uid).toBe("u1"));
    await act(async () => { await auth.signOut(); });
    expect(Object.keys(localStorage).filter((k) => k.startsWith("darsi-project-draft:"))).toEqual(["darsi-project-draft:u2:ai-1-1-4:proj"]);
    expect((h.store["darsi:state:u1"] as typeof own).progress).toEqual({});
    expect(sessionStorage.getItem("darsi:keptOnDevice")).toBeNull();
  });
});

describe("the note for someone who left their organization", () => {
  it("goes at a sign-in in this page, not when the page starts with the session it had", async () => {
    sessionStorage.setItem("darsi:leftOrg", JSON.stringify({ name: "Nile School", at: Date.now() }));
    await start(); // a session stored at start (the leave's refresh failed on the connection, say)
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "learner" } }))); });
    expect(sessionStorage.getItem("darsi:leftOrg")).not.toBeNull();
  });

  it("is cleared when someone signs in after the restart", async () => {
    sessionStorage.setItem("darsi:leftOrg", JSON.stringify({ name: "Nile School", at: Date.now() }));
    h.storedSession.mockResolvedValue(null);
    h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
    render(<AuthProvider><Scoped /></AuthProvider>);
    await waitFor(() => expect(auth.loading).toBe(false));
    await act(async () => { await auth.ensureFirebase(); });
    await act(async () => { await h.authCallback!(null); });
    expect(sessionStorage.getItem("darsi:leftOrg")).not.toBeNull(); // the sign-in screen still says it
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "learner" } }))); });
    expect(sessionStorage.getItem("darsi:leftOrg")).toBeNull();
  });
});

describe("last seen", () => {
  const signIn = async () => {
    await start();
    await act(async () => { await h.authCallback!(user("u1", async () => ({ claims: { role: "orgAdmin", orgId: "o1" } }))); });
    await waitFor(() => expect(auth.profile?.name).toBe("Amina"));
  };

  it("is written when the profile's date is yesterday", async () => {
    h.profile = { ...h.profile, lastActive: yesterday };
    await signIn();
    expect(h.updateDoc).toHaveBeenCalledTimes(1);
    const [ref, patch] = h.updateDoc.mock.calls[0] as unknown as [string, { lastActive: string }];
    expect(ref).toBe("users/u1");
    expect(Object.keys(patch)).toEqual(["lastActive"]);
    expect(patch.lastActive.slice(0, 10)).toBe(today.slice(0, 10));
  });

  it("is written for a profile that never had one", async () => {
    h.profile = { name: "Amina", role: "orgAdmin", orgId: "o1" };
    await signIn();
    expect(h.updateDoc).toHaveBeenCalledTimes(1);
  });

  it("is not written when the profile already says today", async () => {
    h.profile = { ...h.profile, lastActive: today };
    await signIn();
    expect(h.updateDoc).not.toHaveBeenCalled();
  });
});
