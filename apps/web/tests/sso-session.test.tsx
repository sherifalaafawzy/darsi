// A school session's end and sign-out (auth/AuthProvider.tsx; TECHNICAL.md "School sign-in"): a session that came
// through a school's sign-in (the token's `sso` claim) and ends without Sign out keeps unsent work as every ended
// session does, and goes back to its school's sign-in ("Your school asks you to sign in again"), never to the guest
// home; Sign out of one marks this device (the next school sign-in asks for a fresh login) and lands on the school's
// sign-in, which says the school may still have the person signed in. Firebase is mocked as in auth.test.tsx.
import { act, render, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import { lastSchool, signedOutHere } from "../src/auth/sso";

const h = vi.hoisted(() => ({
  storedSession: vi.fn(),
  loadFirebase: vi.fn(),
  authCallback: null as null | ((u: unknown) => void),
  store: {} as Record<string, unknown>,
  replace: vi.fn(),
  unsent: false,
}));
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { apiKey: "test-key" }, useEmulators: false, functionsRegion: "europe-west1" }));
vi.mock("../src/fb", () => ({ storedSession: h.storedSession, loadFirebase: h.loadFirebase }));
vi.mock("../src/notify/push", () => ({ pushSignOut: vi.fn(async () => {}) }));
vi.mock("../src/platform", () => ({ storage: { get: async (k: string) => h.store[k], set: async (k: string, v: unknown) => { h.store[k] = v; }, remove: async (k: string) => { delete h.store[k]; } } }));
vi.mock("../src/state/store", async (orig) => ({ ...(await orig<typeof import("../src/state/store")>()), hasUnsent: () => h.unsent }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => { h.authCallback = cb; return () => {}; },
  signOut: vi.fn(async () => {}),
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  onSnapshot: (_ref: string, next: (s: unknown) => void) => { next({ exists: () => true, data: () => ({ name: "Amina", role: "student", orgId: "org1" }) }); return () => {}; },
  updateDoc: vi.fn(async () => {}),
  waitForPendingWrites: vi.fn(async () => {}),
  terminate: vi.fn(async () => {}),
  clearIndexedDbPersistence: vi.fn(async () => {}),
}));

let auth: ReturnType<typeof useAuth>;
function Probe() { auth = useAuth(); return null; }
const school = (uid: string) => ({ uid, getIdTokenResult: async () => ({ claims: { role: "student", orgId: "org1", sso: "org1" } }) });
const plain = (uid: string) => ({ uid, getIdTokenResult: async () => ({ claims: { role: "student", orgId: "org1" } }) });

beforeEach(() => {
  h.storedSession.mockReset(); h.loadFirebase.mockReset(); h.authCallback = null; h.store = {}; h.replace.mockReset(); h.unsent = false;
  vi.stubGlobal("location", { ...window.location, replace: h.replace });
  localStorage.clear(); sessionStorage.clear();
  lastSchool.set({ orgId: "org1", slug: "nile-ab12", name: "Nile School", host: "login.nile.edu" });
});
afterEach(() => vi.unstubAllGlobals());

const signedIn = async (u: unknown) => {
  h.storedSession.mockResolvedValue({ uid: "u1", email: null, createdAt: 1 });
  h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(h.authCallback).not.toBeNull());
  await act(async () => { h.authCallback!(u); });
  await waitFor(() => expect(auth.user).not.toBeNull());
};

it("says a session came through the school's sign-in", async () => {
  await signedIn(school("u1"));
  expect(auth.sso).toBe("org1");
  // Kept for an offline start like the other claims.
  expect(JSON.parse(localStorage.getItem("darsi:claims:u1")!)).toMatchObject({ sso: "org1" });
});

it("an ended school session goes back to its school's sign-in, says why, and keeps unsent work", async () => {
  await signedIn(school("u1"));
  h.unsent = true;
  await act(async () => { h.authCallback!(null); });
  await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/signin?school=nile-ab12"));
  expect(sessionStorage.getItem("darsi:ssoNote")).toBe("again");
  // The unsent work is kept as for any ended session, and the toast says so as before.
  expect(sessionStorage.getItem("darsi:endedNote")).toBe("kept");
});

it("with nothing unsent, only the school's page speaks (no second 'signed out' toast)", async () => {
  await signedIn(school("u1"));
  await act(async () => { h.authCallback!(null); });
  await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/signin?school=nile-ab12"));
  expect(sessionStorage.getItem("darsi:endedNote")).toBeNull();
});

// The usual way a school session ends: revoked overnight (functions ssoJob), with the app closed. At the next start the
// SDK's first answer is "nobody": no token was read in this page, so the screen has no claims; the kept copy has them.
it("a school session that ended while the app was closed goes to its school's sign-in too, not the guest home", async () => {
  localStorage.setItem("darsi:claims:u1", JSON.stringify({ role: "student", orgId: "org1", plan: null, sso: "org1" }));
  h.storedSession.mockResolvedValue({ uid: "u1", email: null, createdAt: 1 });
  h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(h.authCallback).not.toBeNull());
  await act(async () => { h.authCallback!(null); });
  await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/signin?school=nile-ab12"));
  expect(h.replace).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("darsi:ssoNote")).toBe("again");
  expect(sessionStorage.getItem("darsi:endedNote")).toBeNull(); // nothing unsent: only the school's page speaks
  expect(localStorage.getItem("darsi:claims:u1")).toBeNull(); // and the kept copy goes with the session
  expect(auth.user).toBeNull();
});

it("an account that isn't a school's, ended while the app was closed, is as before", async () => {
  localStorage.setItem("darsi:claims:u1", JSON.stringify({ role: "student", orgId: "org1", plan: null }));
  h.storedSession.mockResolvedValue({ uid: "u1", email: null, createdAt: 1 });
  h.loadFirebase.mockResolvedValue({ auth: {}, db: {} });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(h.authCallback).not.toBeNull());
  await act(async () => { h.authCallback!(null); });
  await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/"));
  expect(sessionStorage.getItem("darsi:ssoNote")).toBeNull();
  expect(sessionStorage.getItem("darsi:endedNote")).toBe("out");
});

it("a school this device doesn't know goes to the plain sign-in, never the guest home", async () => {
  localStorage.removeItem("darsi:ssoSchool");
  await signedIn(school("u1"));
  await act(async () => { h.authCallback!(null); });
  await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/signin"));
});

it("an ended session that didn't come through a school is as before", async () => {
  await signedIn(plain("u1"));
  await act(async () => { h.authCallback!(null); });
  await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/"));
  expect(sessionStorage.getItem("darsi:ssoNote")).toBeNull();
});

it("Sign out of a school session marks this device and lands on the school's sign-in", async () => {
  await signedIn(school("u1"));
  await act(async () => { await auth.signOut(); });
  expect(h.replace).toHaveBeenCalledWith("/signin?school=nile-ab12");
  expect(signedOutHere.get()).toBe(true);
  expect(sessionStorage.getItem("darsi:ssoNote")).toBe("out");
});

it("Sign out of any other session is as before", async () => {
  await signedIn(plain("u1"));
  await act(async () => { await auth.signOut(); });
  expect(h.replace).toHaveBeenCalledWith("/");
  expect(signedOutHere.get()).toBe(false);
});
