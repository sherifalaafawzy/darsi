import { act, render, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";

// Firebase is loaded only for a session stored on this device, or when an account screen asks for it.
// fb.ts (the loader and the stored-session check) is replaced, so each case controls both.
const h = vi.hoisted(() => ({
  storedSession: vi.fn(),
  loadFirebase: vi.fn(),
  authCallback: null as null | ((u: unknown) => void),
}));
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { apiKey: "test-key" }, useEmulators: false, functionsRegion: "europe-west1" }));
vi.mock("../src/fb", () => ({ storedSession: h.storedSession, loadFirebase: h.loadFirebase }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => { h.authCallback = cb; return () => {}; },
  signOut: vi.fn(async () => {}),
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  onSnapshot: (_ref: string, next: (s: unknown) => void) => { next({ exists: () => true, data: () => ({ name: "Amina", role: "teacher", orgId: "o1" }) }); return () => {}; },
  updateDoc: vi.fn(async () => {}),
  setDoc: vi.fn(async () => {}),
  serverTimestamp: () => "ts",
}));

let auth: ReturnType<typeof useAuth>;
function Probe() { auth = useAuth(); return null; }
const user = (uid: string) => ({ uid, getIdTokenResult: async () => ({ claims: { role: "teacher", orgId: "o1" } }) });

beforeEach(() => { h.storedSession.mockReset(); h.loadFirebase.mockReset(); h.authCallback = null; });

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
