import { storedSession } from "../src/fb";

// The stored-session check reads Firebase Auth's own persistence without loading the SDK.
// jsdom has no IndexedDB, so this covers the localStorage fallback and the parsing.
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { apiKey: "test-key" }, useEmulators: false, functionsRegion: "europe-west1" }));
const KEY = "firebase:authUser:test-key:[DEFAULT]";

afterEach(() => localStorage.clear());

it("finds a session Firebase Auth saved, with its uid, email and creation time", async () => {
  localStorage.setItem(KEY, JSON.stringify({ uid: "u1", email: "amina@school.org", createdAt: "1792800000000", stsTokenManager: {} }));
  expect(await storedSession()).toEqual({ uid: "u1", email: "amina@school.org", createdAt: 1792800000000 });
});

it("treats no record, another project's record, or a broken one as signed out", async () => {
  expect(await storedSession()).toBeNull();
  localStorage.setItem("firebase:authUser:other-key:[DEFAULT]", JSON.stringify({ uid: "x" }));
  expect(await storedSession()).toBeNull();
  localStorage.setItem(KEY, "{not json");
  expect(await storedSession()).toBeNull();
  localStorage.setItem(KEY, JSON.stringify({ email: "no-uid@x.org" }));
  expect(await storedSession()).toBeNull();
});
