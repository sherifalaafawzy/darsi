// Where people land in the real App (routes, guards, the store per account), with the auth state driven by the test:
// - the account screens never navigate after signing in, so SignedIn sends each role on (admins to their dashboards,
//   invite codes to /org), whatever order the sign-in and AuthProvider's publishing happen in;
// - /results opens for any signed-in account, and a guest never loads it (nor, with it, the Firebase SDK);
// - finishing onboarding opens the page that was asked for;
// - an account takes over the guest's learning on this device only when it was created here (never a school account);
// - "choose your own password" only for accounts that sign in with a password;
// - the privacy notice and the terms open for anyone, guests too;
// - a page that breaks leaves the nav in place, and a failure nothing else caught shows a card, never a blank page.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

type Auth = Record<string, unknown>;
const h = vi.hoisted(() => {
  const subs = new Set<() => void>();
  let auth: Record<string, unknown> = {};
  return {
    stored: {} as Record<string, unknown>,
    resultsLoaded: false,
    /** What App hands the Course results page for reading content (results/async.ts ContentLoader). */
    resultsContent: null as null | { loadCatalog: unknown; loadUnit: unknown; subscribe?: (onForget: () => void) => () => void },
    /** The org admin's dashboard throws while it renders; a hook under the whole app throws. */
    adminBreaks: false,
    appBreaks: false,
    tutorBreaks: false,
    signIn: vi.fn(),
    popup: vi.fn(),
    redirect: vi.fn(),
    redirectResult: vi.fn(),
    profileExists: true,
    /** The profile's fields as getDoc reads them; a function's setRole can start one without an email. */
    profileFields: {} as Record<string, unknown>,
    createProfile: vi.fn(),
    fbAuth: {} as Record<string, unknown>,
    resetMail: vi.fn(),
    reauth: vi.fn(),
    updatePassword: vi.fn(),
    get: () => auth,
    reset: (p: Record<string, unknown> = {}) => {
      auth = { user: null, profile: null, role: "learner", orgId: null, plan: null, loading: false, offlineUid: null, configured: true,
        ensureFirebase: async () => {}, refreshClaims: async () => {}, updateProfile: async () => {}, signOut: async () => {}, ...p };
    },
    /** AuthProvider publishing a sign-in: claims and user together. */
    publish: (p: Record<string, unknown>) => { auth = { ...auth, ...p }; subs.forEach((f) => f()); },
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
});
vi.mock("../src/auth/AuthProvider", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    AuthProvider: ({ children }: { children: unknown }) => children,
    useAuth: () => useSyncExternalStore(h.subscribe, h.get),
    createLearnerProfile: h.createProfile,
    KEPT_KEY: "darsi:keptOnDevice",
    ENDED_NOTE: "darsi:endedNote",
  };
});
vi.mock("../src/platform", async (orig) => ({
  ...(await orig<typeof import("../src/platform")>()),
  storage: { get: async (k: string) => h.stored[k], set: async (k: string, v: unknown) => { h.stored[k] = v; }, remove: async (k: string) => { delete h.stored[k]; } },
}));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({ auth: h.fbAuth, db: {} }), call: () => async () => ({}), storedSession: async () => null }));
vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: h.signIn, signInWithPopup: h.popup, signInWithRedirect: h.redirect, getRedirectResult: h.redirectResult,
  GoogleAuthProvider: class {}, sendPasswordResetEmail: h.resetMail, reauthenticateWithCredential: h.reauth, updatePassword: h.updatePassword,
  EmailAuthProvider: { credential: (email: string, pw: string) => ({ email, pw }) },
}));
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, ...p: string[]) => p.join("/"), getDoc: async () => ({ exists: () => h.profileExists, get: (k: string) => (h.profileExists ? h.profileFields[k] : undefined) }) }));
vi.mock("../src/analytics/track", async (orig) => ({ ...(await orig<typeof import("../src/analytics/track")>()), track: () => {} }));
vi.mock("../src/state/sync", () => ({ useCloudSync: () => {}, useLearningSync: () => {} }));
vi.mock("../src/state/orgBrand", () => ({ useOrgBrand: () => {} }));
vi.mock("../src/analytics/useAnalytics", () => ({ useAnalytics: () => { if (h.appBreaks) throw new Error("the app broke"); } }));
vi.mock("../src/notify/usePushRefresh", () => ({ usePushRefresh: () => {} }));
vi.mock("../src/tour/Start", () => ({ AppTour: () => null, openTour: () => {}, OPEN_TOUR: "darsi:tour" }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null, forgetSettings: () => {}, loadCatalog: async () => ({ version: 1, units: [] }),
}));
vi.mock("../src/results/CourseResults", () => {
  h.resultsLoaded = true;
  return { CourseResults: ({ content }: { content: NonNullable<typeof h.resultsContent> }) => { h.resultsContent = content; return "Course results page"; } };
});
vi.mock("../src/admin/AdminHome", () => ({ AdminHome: () => { if (h.adminBreaks) throw new Error("the dashboard broke"); return "Org admin dashboard"; } }));
vi.mock("../src/tutor/Tutor", () => ({ Tutor: () => null, TutorPanel: () => { if (h.tutorBreaks) throw new Error("the tutor broke"); return "The tutor's panel"; } }));
vi.mock("../src/legal/Legal", () => ({ LegalPage: ({ doc }: { doc: string }) => `Legal page: ${doc}` }));
// The report sheet's chunk: who the sheet is told the report is from (the card after a crash opens it, app/AppBoundary.tsx).
vi.mock("../src/bugs/Report", () => ({
  capture: async () => null, flushReports: async () => {},
  ReportSheet: ({ uid, about, getToken }: { uid: string | null; about: { who: string | null }; getToken: unknown }) => `Report sheet from ${uid} (${about.who}), ${getToken ? "with" : "without"} a token`,
}));
vi.mock("../src/admin/SuperAdmin", () => ({ SuperAdmin: () => "Platform admin dashboard", PlansPage: () => null, ProjectsPage: () => null, CertificatesPage: () => null, BugsPage: () => null }));
vi.mock("../src/org/OrgScreen", () => ({ OrgScreen: () => "Organization page" }));
vi.mock("../src/admin/Teach", () => ({ Teach: () => "Teach page", TeachPerson: () => null }));

const { App } = await import("../src/App");
const { initialState, adoptsGuest } = await import("../src/state/store");
const { inAppBrowser, inviteCode } = await import("../src/auth/AuthScreens");

const NOW = Date.now();
const at = (ms: number) => new Date(ms).toUTCString(); // Auth's metadata: to the second
const user = (uid: string, created = NOW - 864e5, lastSignIn = NOW): Auth => ({ uid, email: `${uid}@x.org`, displayName: uid, metadata: { creationTime: at(created), lastSignInTime: at(lastSignIn) } });
const open = (path: string) => { history.replaceState(null, "", path); return render(<App />); };
const where = () => location.pathname + location.search;
/** Lets the screen's own code after a sign-in run to the end, as it does in a browser before AuthProvider publishes. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
async function signInWithPassword(login: string) {
  fireEvent.change(await screen.findByLabelText("Email or username"), { target: { value: login } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-good-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(h.signIn).toHaveBeenCalled());
  await settle();
}

beforeEach(() => {
  h.reset(); h.stored = {}; h.adminBreaks = false; h.appBreaks = false; h.tutorBreaks = false; h.profileExists = true; h.profileFields = { email: "someone@x.org", name: "Someone" }; h.fbAuth = {};
  h.resetMail.mockReset().mockResolvedValue(undefined); h.reauth.mockReset(); h.updatePassword.mockReset().mockResolvedValue(undefined);
  h.signIn.mockReset().mockResolvedValue({ user: { uid: "x" } });
  h.popup.mockReset(); h.redirect.mockReset().mockResolvedValue(undefined); h.redirectResult.mockReset().mockResolvedValue(null); h.createProfile.mockReset().mockResolvedValue(undefined);
  sessionStorage.clear();
});

describe("after signing in", () => {
  it("an org admin's password sign-in lands on the dashboard, not in learner onboarding, and the address says so", async () => {
    open("/signin");
    await signInWithPassword("demo.admin");
    act(() => h.publish({ user: user("a1"), role: "orgAdmin", orgId: "o1" }));
    expect(await screen.findByText("Org admin dashboard")).toBeTruthy();
    expect(where()).toBe("/admin");
    expect(screen.queryByText("Choose your language")).toBeNull();
  });

  it("a platform admin's Google sign-in lands on /super, and the popup's own code finishing later doesn't move the address", async () => {
    let done!: (v: unknown) => void;
    h.popup.mockImplementation(() => new Promise((r) => { done = r; }));
    open("/signin");
    const google = await screen.findByRole("button", { name: "Continue with Google" });
    await waitFor(() => expect(google.getAttribute("aria-disabled")).toBeNull()); // ready (loading keeps it focusable but aria-disabled)
    fireEvent.click(google);
    await waitFor(() => expect(h.popup).toHaveBeenCalled());
    // AuthProvider publishes the account while the popup's promise is still settling.
    act(() => h.publish({ user: user("s1"), role: "superadmin" }));
    expect(await screen.findByText("Platform admin dashboard")).toBeTruthy();
    await act(async () => { done({ user: { uid: "s1", displayName: "S", email: "s@x.org" } }); });
    await settle();
    expect(where()).toBe("/super");
  });

  it("a learner lands on their lessons", async () => {
    open("/signin");
    await signInWithPassword("amina@x.org");
    act(() => h.publish({ user: user("l1"), role: "learner" }));
    await waitFor(() => expect(where()).toBe("/learn"));
  });

  it("an invite link's code survives \"I already have an account\" and joins once signed in", async () => {
    open("/signup?code=abcd-efgh-jkmn");
    fireEvent.click(await screen.findByRole("link", { name: "I already have an account" }));
    expect(where()).toBe("/signin?code=abcd-efgh-jkmn");
    expect(screen.getByText(/After you sign in, you’ll join with invite code/).textContent).toContain("ABCD-EFGH-JKMN");
    // and back again: "Create an account" keeps it too
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe("/signup?code=abcd-efgh-jkmn");
    await signInWithPassword("amina@x.org");
    act(() => h.publish({ user: user("l2"), role: "learner" }));
    expect(await screen.findByText("Organization page")).toBeTruthy();
    expect(where()).toBe("/org?code=abcd-efgh-jkmn");
  });

  it("in an app's own browser, Google isn't tried: it says to open the page (invite code and all) in the phone's browser", async () => {
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Chrome/119.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0]");
    open("/signup?code=abcd-efgh-jkmn");
    const google = await screen.findByRole("button", { name: "Continue with Google" });
    await waitFor(() => expect(google.getAttribute("aria-disabled")).toBeNull()); // ready (loading keeps it focusable but aria-disabled)
    fireEvent.click(google);
    expect(await screen.findByText(/Google sign-in doesn’t work inside this app’s browser/)).toBeTruthy();
    expect(screen.getByText(location.href)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy the link" })).toBeTruthy();
    expect(h.popup).not.toHaveBeenCalled();
    ua.mockRestore();
  });

  it("a blocked Google popup goes to Google's page and back instead; back here, a new account gets its profile", async () => {
    h.popup.mockRejectedValue(Object.assign(new Error("blocked"), { code: "auth/popup-blocked" }));
    const first = open("/signup?code=abcd-efgh-jkmn");
    const google = await screen.findByRole("button", { name: "Continue with Google" });
    await waitFor(() => expect(google.getAttribute("aria-disabled")).toBeNull()); // ready (loading keeps it focusable but aria-disabled)
    fireEvent.click(google);
    await waitFor(() => expect(h.redirect).toHaveBeenCalled());
    expect(sessionStorage.getItem("darsi:googleRedirect")).toBe("1");
    expect(screen.queryByRole("alert")).toBeNull();
    first.unmount();
    // The page comes back to the same address (the code with it) and finishes the sign-in.
    h.profileExists = false;
    h.redirectResult.mockResolvedValue({ user: { uid: "g1", displayName: "Grace", email: "Grace@x.org" } });
    open("/signup?code=abcd-efgh-jkmn");
    await waitFor(() => expect(h.createProfile).toHaveBeenCalledWith("g1", { name: "Grace", email: "grace@x.org", lang: "en" }));
    expect(sessionStorage.getItem("darsi:googleRedirect")).toBeNull();
  });
});

it("after signing out with unsent work, the restarted page says once that it stays on this device", async () => {
  sessionStorage.setItem("darsi:keptOnDevice", "1");
  h.stored["darsi:state"] = { ...initialState, guest: true, onboarded: true, lang: "en" };
  const first = open("/");
  expect(await screen.findByText(/Some of your work hadn’t been sent yet/)).toBeTruthy();
  expect(sessionStorage.getItem("darsi:keptOnDevice")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  expect(screen.queryByText(/Some of your work hadn’t been sent yet/)).toBeNull();
  first.unmount();
  open("/");
  await waitFor(() => expect(where()).toBe("/learn"));
  expect(screen.queryByText(/Some of your work hadn’t been sent yet/)).toBeNull();
});

describe("Course results (/results)", () => {
  it("a guest who types it goes to sign in, and the page (with the Firebase SDK it reads through) never loads", async () => {
    h.stored["darsi:state"] = { ...initialState, guest: true, onboarded: true, lang: "en" };
    open("/results");
    await waitFor(() => expect(where()).toBe("/signin"));
    expect(h.resultsLoaded).toBe(false);
  });

  it("opens for any signed-in account: a university teacher a platform admin gave courses to", async () => {
    h.reset({ user: user("t1"), profile: { uid: "t1", name: "T", role: "learner", teach: "university" }, role: "learner" });
    open("/results");
    expect(await screen.findByText("Course results page")).toBeTruthy();
    expect(where()).toBe("/results");
  });

  it("is told when the catalog is forgotten (the editor published, or back after a long while), so it reads the courses again", async () => {
    h.reset({ user: user("t1"), profile: { uid: "t1", name: "T", role: "learner", teach: "university" }, role: "learner" });
    open("/results");
    expect(await screen.findByText("Course results page")).toBeTruthy();
    const { forgetCatalog } = await import("../src/content/load");
    const told = vi.fn();
    const stop = h.resultsContent!.subscribe!(told);
    forgetCatalog();
    expect(told).toHaveBeenCalledTimes(1);
    // Leaving the page stops it: a later forget tells nobody.
    stop();
    forgetCatalog();
    expect(told).toHaveBeenCalledTimes(1);
  });
});

// The way back from a school's provider lands on a page of the app with `#sso=<ticket>&f=<flow>` in its address
// (TECHNICAL.md "School sign-in"). auth/sso.ts takes it out as it loads, before the router starts; these start the real
// App on such an address the same way (the module loaded when App was imported above, so its step is run again here).
describe("a school sign-in's return in the address when the app starts", () => {
  const start = async (path: string) => {
    history.replaceState(null, "", path);
    (await import("../src/auth/sso")).stashReturn();
    return render(<App />);
  };
  const record = (patch: Record<string, unknown>) => localStorage.setItem("darsi:sso", JSON.stringify({ verifier: "v".repeat(43), flow: "abcd1234", mode: "signin", next: "/signin", at: Date.now(), ...patch }));
  /** Nowhere a person, a link or the history could carry it from. */
  const nowhere = (ticket: string) => {
    for (const text of [location.href, document.body.innerHTML, JSON.stringify({ ...sessionStorage })]) expect(text).not.toContain(ticket);
    expect(location.hash).toBe("");
  };
  const finishes = vi.fn();
  beforeEach(() => {
    finishes.mockReset();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) !== "/api/sso/finish") return { ok: false, status: 404, json: async () => ({}) } as Response;
      finishes(JSON.parse(String(init?.body)), (init?.headers as Record<string, string> | undefined)?.Authorization ?? null);
      return { ok: true, status: 200, json: async () => ({ tested: "create-student", ok: true }) } as Response;
    }));
  });
  afterEach(async () => { vi.unstubAllGlobals(); localStorage.removeItem("darsi:sso"); (await import("../src/auth/sso")).takeStash(location.pathname); });

  it("a return this browser has no record for: the sign-in page says so, with the school finder to start again, and the ticket is nowhere", async () => {
    await start("/signin#sso=SECRET-TICKET-1&f=abcd1234");
    expect(await screen.findByText(/Go back to the tab where you started, or start again here/)).toBeTruthy();
    expect(where()).toBe("/signin");
    expect(screen.getAllByRole("button", { name: "Sign in with your school" })).toHaveLength(1);
    expect(screen.getByLabelText("Email or username")).toBeTruthy();
    nowhere("SECRET-TICKET-1");
    expect(finishes).not.toHaveBeenCalled();
  });

  it("a student's test (a test link) shows its result on its own page, without an account and never as a sign-in", async () => {
    record({ mode: "test", token: "t".repeat(32) });
    await start("/signin#sso=SECRET-TICKET-2&f=abcd1234");
    expect(await screen.findByText("The test worked: you would join as a student.")).toBeTruthy();
    expect(where()).toBe("/sso-test");
    expect(screen.queryByLabelText("Email or username")).toBeNull();
    expect(finishes).toHaveBeenCalledTimes(1);
    expect(finishes).toHaveBeenCalledWith({ ticket: "SECRET-TICKET-2", verifier: "v".repeat(43) }, null);
    expect(h.signIn).not.toHaveBeenCalled();
    nowhere("SECRET-TICKET-2");
    expect(localStorage.getItem("darsi:sso")).toBeNull(); // the record is spent
  });

  it("someone already signed in on this browser sees the test's result too, instead of being sent to their lessons", async () => {
    h.reset({ user: user("st1"), profile: { uid: "st1", name: "St", role: "student", orgId: "o1" }, profileReady: true, role: "student", orgId: "o1" });
    record({ mode: "test", token: "t".repeat(32) });
    await start("/signin#sso=SECRET-TICKET-3&f=abcd1234");
    expect(await screen.findByText("The test worked: you would join as a student.")).toBeTruthy();
    expect(where()).toBe("/sso-test");
    expect(finishes).toHaveBeenCalledWith({ ticket: "SECRET-TICKET-3", verifier: "v".repeat(43) }, null);
    nowhere("SECRET-TICKET-3");
  });

  it("an admin's own test stays on its tab, with the ticket out of the address before the dashboard (and its tabs) render", async () => {
    h.reset({ user: user("a2"), profile: { uid: "a2", name: "A", role: "orgAdmin", orgId: "o1" }, profileReady: true, role: "orgAdmin", orgId: "o1" });
    record({ mode: "test" });
    await start("/admin?tab=signin#sso=SECRET-TICKET-4&f=abcd1234");
    expect(await screen.findByText("Org admin dashboard")).toBeTruthy();
    expect(where()).toBe("/admin?tab=signin");
    nowhere("SECRET-TICKET-4");
    // Kept for the school sign-in panel of that page, which finishes it with the admin's own sign-in.
    expect((await import("../src/auth/sso")).returnedTo("/admin")).toBe(true);
    expect(finishes).not.toHaveBeenCalled();
  });
});

it("finishing onboarding opens the page that was asked for, at its address", async () => {
  h.stored["darsi:state"] = { ...initialState, guest: true, lang: "en" };
  open("/downloads?from=link");
  expect(await screen.findByText("Choose your language")).toBeTruthy();
  const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  next();
  fireEvent.click(await screen.findByRole("radio", { name: /A teacher/ })); next();
  fireEvent.click((await screen.findAllByRole("radio"))[0]); next();
  fireEvent.click((await screen.findAllByRole("checkbox"))[0]); next();
  next();
  fireEvent.click(await screen.findByRole("button", { name: "Skip the check" }));
  await waitFor(() => expect(screen.queryByText("Take a short check")).toBeNull());
  expect(where()).toBe("/downloads?from=link");
  expect(await screen.findByRole("heading", { name: "Downloads" })).toBeTruthy();
});

describe("onboarding for staff, and on a new device", () => {
  it("a platform admin opens learner screens without onboarding (a project link, Learn)", async () => {
    h.reset({ user: user("s2"), profile: { uid: "s2", name: "S", role: "superadmin" }, profileReady: true, role: "superadmin" });
    open("/learn");
    expect(await screen.findByText("No courses yet")).toBeTruthy(); // Home, with every track
    expect(screen.queryByText("Choose your language")).toBeNull();
  });

  it("a school's teacher going through it can still reach their students", async () => {
    h.reset({ user: user("t2"), profile: { uid: "t2", name: "T", role: "teacher", orgId: "o1" }, profileReady: true, role: "teacher", orgId: "o1" });
    open("/learn");
    expect(await screen.findByText("Choose your language")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See my students" }));
    expect(await screen.findByText("Teach page")).toBeTruthy();
    expect(where()).toBe("/teach");
  });

  it("a signed-in account that onboarded elsewhere isn't asked again: it waits for its profile, then takes it", async () => {
    // Before the profile is read: nothing (onboarding would flash); with it, the answers are on their way (state/sync.ts).
    h.reset({ user: user("l3"), profile: null, profileReady: false, role: "learner" });
    const a = open("/learn");
    await settle();
    expect(screen.queryByText("Choose your language")).toBeNull();
    a.unmount();
    h.reset({ user: user("l3"), profile: { uid: "l3", name: "L", role: "learner", onboarded: true, tracks: ["ai"] }, profileReady: true, role: "learner" });
    open("/learn");
    await settle();
    expect(screen.queryByText("Choose your language")).toBeNull();
  });

  it("a signed-in account with no answers anywhere goes through it", async () => {
    h.reset({ user: user("l4"), profile: { uid: "l4", name: "L", role: "learner" }, profileReady: true, role: "learner" });
    open("/learn");
    expect(await screen.findByText("Choose your language")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "See my students" })).toBeNull();
  });
});

it("a guest on /org is told to sign in by App itself (no organization chunk, so no SDK), with the invite code kept", async () => {
  h.stored["darsi:state"] = { ...initialState, guest: true, onboarded: true, lang: "en" };
  open("/org?code=abcd-efgh-jkmn");
  expect(await screen.findByText("Sign in to join or register an organization")).toBeTruthy();
  expect(screen.queryByText("Organization page")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(where()).toBe("/signin?code=abcd-efgh-jkmn"));
});

describe("taking over the guest's learning on this device", () => {
  const guest = { ...initialState, guest: true, onboarded: true, lang: "en", name: "Previous Guest", progress: { "ai-1-1": { done: true as const, accuracy: 1, xp: 30, seconds: 60, completedAt: "2026-11-01T10:00:00.000Z" } }, notes: { "ai-1-1": "the guest's note" } };

  it("only at the sign-in that created the account here, and never for an account an organization made", () => {
    const fresh = { creationTime: at(NOW - 30e3), lastSignInTime: at(NOW - 30e3) };
    expect(adoptsGuest(fresh, null, NOW)).toBe(true); // sign-up or Google, a moment ago
    expect(adoptsGuest({ creationTime: at(NOW - 30e3) }, null, NOW)).toBe(true);
    expect(adoptsGuest(fresh, "o1", NOW)).toBe(false); // made by an organization (orgId claim from the start)
    expect(adoptsGuest({ creationTime: at(NOW - 90e3), lastSignInTime: at(NOW - 5e3) }, null, NOW)).toBe(false); // made earlier, signing in now
    expect(adoptsGuest({ creationTime: at(NOW - 11 * 60e3), lastSignInTime: at(NOW - 11 * 60e3) }, null, NOW)).toBe(false);
    expect(adoptsGuest(undefined, null, NOW)).toBe(false);
  });

  it("a pupil the school just made, signing in on a shared PC, starts clean; the guest keeps their work", async () => {
    h.stored["darsi:state"] = guest;
    open("/signin");
    await signInWithPassword("pupil.4821");
    act(() => h.publish({ user: user("p1", NOW - 60e3, NOW), role: "student", orgId: "o1" }));
    await waitFor(() => expect(h.stored["darsi:state:p1"]).toBeTruthy());
    expect(h.stored["darsi:state:p1"]).toMatchObject({ progress: {}, notes: {}, name: "", onboarded: false });
    expect(h.stored["darsi:state"]).toMatchObject({ progress: guest.progress, notes: guest.notes });
  });

  it("the person who learned as a guest and just made their account brings it along", async () => {
    h.stored["darsi:state"] = guest;
    open("/signup");
    act(() => h.publish({ user: user("n1", NOW - 2e3, NOW - 2e3), role: "learner" }));
    await waitFor(() => expect(h.stored["darsi:state:n1"]).toMatchObject({ progress: guest.progress, notes: guest.notes, guest: false }));
  });
});

describe("the account screens", () => {
  const google = async () => {
    const button = await screen.findByRole("button", { name: "Continue with Google" });
    await waitFor(() => expect(button.getAttribute("aria-disabled")).toBeNull());
    fireEvent.click(button);
  };

  it("a Google sign-up whose profile a function started first (joining from an invite link) still gets its name and language", async () => {
    h.profileFields = { role: "learner", orgId: "o1", claimsUpdatedAt: 1 }; // setRole's merge: no email, no name
    h.popup.mockResolvedValue({ user: { uid: "g2", displayName: "Grace", email: "Grace@x.org" } });
    open("/signup?code=abcd-efgh-jkmn");
    await google();
    await waitFor(() => expect(h.createProfile).toHaveBeenCalledWith("g2", { name: "Grace", email: "grace@x.org", lang: "en" }));
  });

  it("an existing Google account's profile is left as it is", async () => {
    h.popup.mockResolvedValue({ user: { uid: "g3", displayName: "Google Name", email: "g3@x.org" } });
    open("/signin");
    await google();
    await waitFor(() => expect(h.popup).toHaveBeenCalled());
    await settle();
    expect(h.createProfile).not.toHaveBeenCalled();
  });

  it("back from Google's page, an account Auth already took in is finished too", async () => {
    sessionStorage.setItem("darsi:googleRedirect", "1");
    h.profileExists = false;
    h.fbAuth = { currentUser: { uid: "g4", displayName: "Hana", email: "hana@x.org" } }; // getRedirectResult gives null
    open("/signup");
    await waitFor(() => expect(h.createProfile).toHaveBeenCalledWith("g4", { name: "Hana", email: "hana@x.org", lang: "en" }));
  });

  it("a mistyped email says so, not 'Something went wrong'", async () => {
    h.signIn.mockReset().mockRejectedValue(Object.assign(new Error("bad"), { code: "auth/invalid-email" }));
    open("/signin");
    await signInWithPassword("amina@");
    expect((await screen.findByRole("alert")).textContent).toBe("That doesn’t look like an email address. Check it and try again.");
  });

  it("the reset email comes in the person's language, and the field fills itself in", async () => {
    h.stored["darsi:state"] = { ...initialState, lang: "ar" };
    open("/forgot");
    const email = await screen.findByLabelText("البريد الإلكتروني");
    expect(email.getAttribute("autocomplete")).toBe("email");
    fireEvent.change(email, { target: { value: "amina@x.org" } });
    fireEvent.click(screen.getByRole("button", { name: "أرسل الرابط" }));
    await waitFor(() => expect(h.resetMail).toHaveBeenCalled());
    expect(h.fbAuth.languageCode).toBe("ar");
  });

  describe("choosing your own password (accounts an organization made)", () => {
    const choose = async (pw: string) => {
      h.reset({ user: { ...user("m1"), email: "m1@users.darsi.app", providerData: [{ providerId: "password" }] }, profile: { uid: "m1", name: "M", role: "student", mustChangePassword: true }, role: "student", orgId: "o1" });
      open("/learn");
      fireEvent.change(await screen.findByLabelText(/^New password/), { target: { value: pw } });
      fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: pw } });
      fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    };

    it("refuses the password the organization gave out", async () => {
      h.reauth.mockResolvedValue({}); // it still signs in: the same password
      await choose("Slip-1234");
      expect((await screen.findByRole("alert")).textContent).toBe("Choose a password different from the one your organization gave you.");
      expect(h.reauth).toHaveBeenCalledWith(expect.objectContaining({ uid: "m1" }), { email: "m1@users.darsi.app", pw: "Slip-1234" });
      expect(h.updatePassword).not.toHaveBeenCalled();
    });

    it("takes a new one", async () => {
      h.reauth.mockRejectedValue(Object.assign(new Error("no"), { code: "auth/invalid-credential" }));
      await choose("my-own-secret");
      await waitFor(() => expect(h.updatePassword).toHaveBeenCalledWith(expect.objectContaining({ uid: "m1" }), "my-own-secret"));
      expect(screen.queryByRole("alert")).toBeNull();
    });

    // The flag is set when an organization makes the account; the person may then only ever sign in with Google.
    const flagged = (providers: string[]) => h.reset({
      user: { ...user("a2"), providerData: providers.map((providerId) => ({ providerId })) },
      profile: { uid: "a2", name: "A", role: "orgAdmin", orgId: "o1", mustChangePassword: true }, role: "orgAdmin", orgId: "o1",
    });

    it("an account that signs in with Google only has no password to change: it goes to its home", async () => {
      flagged(["google.com"]);
      open("/");
      expect(await screen.findByText("Org admin dashboard")).toBeTruthy();
      expect(where()).toBe("/admin");
      expect(screen.queryByLabelText(/^New password/)).toBeNull();
    });

    it("an account with a password (alone, or beside Google) is asked for its own first", async () => {
      for (const providers of [["password"], ["google.com", "password"]]) {
        flagged(providers);
        const view = open("/");
        expect(await screen.findByLabelText(/^New password/)).toBeTruthy();
        expect(screen.queryByText("Org admin dashboard")).toBeNull();
        view.unmount();
      }
    });

    // School sign-in links an org-made account still on its handed-out password (functions/src/sso.ts): its school
    // session can't answer "your current password", so the gate leaves it to its home (the flag stays for its own login).
    it("a school session of such an account is not asked: it goes to its home", async () => {
      flagged(["password"]);
      h.reset({ ...h.get(), sso: "o1" });
      open("/");
      expect(await screen.findByText("Org admin dashboard")).toBeTruthy();
      expect(screen.queryByLabelText(/^New password/)).toBeNull();
    });
  });
});

describe("the privacy notice and the terms", () => {
  it("open for a guest who has never used the app, at their own addresses", async () => {
    const a = open("/privacy");
    expect(await screen.findByText("Legal page: privacy")).toBeTruthy();
    expect(where()).toBe("/privacy");
    a.unmount();
    open("/terms");
    expect(await screen.findByText("Legal page: terms")).toBeTruthy();
    expect(where()).toBe("/terms");
  });

  it("open for someone signed in too, without sending them to their home", async () => {
    h.reset({ user: user("l5"), profile: { uid: "l5", name: "L", role: "learner" }, profileReady: true, role: "learner" });
    open("/terms");
    expect(await screen.findByText("Legal page: terms")).toBeTruthy();
    expect(where()).toBe("/terms");
  });

  it("name themselves in the window title", async () => {
    open("/privacy");
    await waitFor(() => expect(document.title).toBe("Privacy notice — Darsi"));
  });
});

describe("after a session the server ended (AuthProvider sessionEnded)", () => {
  const guest = () => { h.stored["darsi:state"] = { ...initialState, guest: true, onboarded: true, tracks: ["ai"], lang: "en" }; };

  it("the page the person lands on says once that they were signed out", async () => {
    guest();
    sessionStorage.setItem("darsi:endedNote", "out");
    const a = open("/");
    expect(await screen.findByText("You were signed out. Sign in again to carry on.")).toBeTruthy();
    expect(sessionStorage.getItem("darsi:endedNote")).toBeNull();
    a.unmount();
    open("/");
    await settle();
    expect(screen.queryByText(/You were signed out/)).toBeNull(); // once
  });

  it("and that their unsent work is kept on the phone, when it was", async () => {
    guest();
    sessionStorage.setItem("darsi:endedNote", "kept");
    open("/learn");
    // Not "will be sent": the kept work may be a typed project draft, which is never sent by itself.
    expect(await screen.findByText("You were signed out. Your unsent work is kept on this phone, ready for when you sign in again.")).toBeTruthy();
    expect(screen.queryByText(/will be sent/)).toBeNull();
  });

  it("someone who left their organization is told by its own note, unless work was kept", async () => {
    guest();
    sessionStorage.setItem("darsi:endedNote", "out");
    sessionStorage.setItem("darsi:leftOrg", JSON.stringify({ name: "Nile School", at: Date.now() }));
    open("/me");
    expect(await screen.findByText(/You left .*Nile School/)).toBeTruthy();
    expect(screen.queryByText(/You were signed out/)).toBeNull();
  });
});

describe("a slow start with a kept staff role (AuthProvider offlineUid)", () => {
  it("staff pages wait behind the loading screen until the SDK publishes the user", async () => {
    h.stored["darsi:state:a1"] = { ...initialState, onboarded: true, tracks: ["ai"] };
    h.reset({ user: null, offlineUid: "a1", role: "orgAdmin", orgId: "o1" });
    const { container } = open("/admin");
    await settle();
    expect(screen.queryByText("Org admin dashboard")).toBeNull();
    expect(where()).toBe("/admin");
    expect(container.querySelector(".app-main .loading")).toBeTruthy();
    act(() => h.publish({ user: user("a1"), offlineUid: null, profile: { uid: "a1", name: "A", role: "orgAdmin", orgId: "o1" }, profileReady: true }));
    expect(await screen.findByText("Org admin dashboard")).toBeTruthy();
  });

  // The pages that only ask for an account (not a role) took the same moment for "signed out": /results went to the
  // lessons for good, and /org said to sign in first. `connecting`: the saved session is still being opened.
  const slow = (more: Auth = {}) => {
    h.stored["darsi:state:a1"] = { ...initialState, onboarded: true, tracks: ["ai"], lang: "en" };
    h.reset({ user: null, offlineUid: "a1", connecting: true, ...more });
  };
  const arrive = () => act(() => h.publish({ user: user("a1"), offlineUid: null, connecting: false, profile: { uid: "a1", name: "A", role: "learner" }, profileReady: true }));

  it("Course results waits too, and opens where it was asked for when the account arrives", async () => {
    slow();
    const { container } = open("/results");
    await settle();
    expect(where()).toBe("/results");
    expect(container.querySelector(".app-main .loading")).toBeTruthy();
    expect(screen.queryByText("Course results page")).toBeNull();
    arrive();
    expect(await screen.findByText("Course results page")).toBeTruthy();
    expect(where()).toBe("/results");
  });

  it("an account whose SDK could not load at all (offline) still goes to its lessons", async () => {
    slow({ connecting: false });
    open("/results");
    await waitFor(() => expect(where()).toBe("/learn"));
    expect(screen.queryByText("Course results page")).toBeNull();
  });

  it("the organization page waits instead of saying to sign in first; offline, it says so as before", async () => {
    slow();
    const a = open("/org?code=ABCD-EFGH-JKLM");
    await settle();
    expect(where()).toBe("/org?code=ABCD-EFGH-JKLM");
    expect(a.container.querySelector(".app-main .loading")).toBeTruthy();
    expect(screen.queryByText("Sign in to join or register an organization")).toBeNull();
    arrive();
    expect(await screen.findByText("Organization page")).toBeTruthy();
    expect(where()).toBe("/org?code=ABCD-EFGH-JKLM");
    a.unmount();
    slow({ connecting: false });
    open("/org?code=ABCD-EFGH-JKLM");
    expect(await screen.findByText("Sign in to join or register an organization")).toBeTruthy();
  });
});

describe("when something breaks", () => {
  let logged: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { logged = vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { logged.mockRestore(); });

  it("a staff page that throws shows its message inside the layout: the nav stays, and so does the way to other pages", async () => {
    h.adminBreaks = true;
    h.reset({ user: user("a3"), profile: { uid: "a3", name: "A", role: "orgAdmin", orgId: "o1" }, profileReady: true, role: "orgAdmin", orgId: "o1" });
    open("/admin");
    expect(await screen.findByRole("heading", { name: "Something went wrong on this page" })).toBeTruthy();
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0]; // the rail
    expect(nav.querySelector('a[href="/teach"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    // Another page opens, and the failure doesn't follow.
    fireEvent.click(nav.querySelector('a[href="/teach"]')!);
    expect(await screen.findByText("Teach page")).toBeTruthy();
    expect(screen.queryByText("Something went wrong on this page")).toBeNull();
    // Back on the dashboard, mended: it shows.
    h.adminBreaks = false;
    fireEvent.click(nav.querySelector('a[href="/admin"]')!);
    expect(await screen.findByText("Org admin dashboard")).toBeTruthy();
  });

  it("the tutor's panel failing leaves the lesson alone: its button comes back with a note, and a tap tries again", async () => {
    h.stored["darsi:state"] = { ...initialState, guest: true, onboarded: true, lang: "en" };
    h.tutorBreaks = true;
    open("/lesson/u1/u1-1");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the tutor" }));
    expect(await screen.findByText("The tutor couldn’t open. Try again in a moment.")).toBeTruthy();
    // Neither the page's boundary nor the whole app's card (the lesson screen itself is as it was).
    expect(screen.queryByText("Something went wrong on this page")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
    h.tutorBreaks = false;
    fireEvent.click(screen.getByRole("button", { name: "Ask the tutor" }));
    expect(await screen.findByText("The tutor's panel")).toBeTruthy();
    expect(screen.queryByText("The tutor couldn’t open. Try again in a moment.")).toBeNull();
  });

  it("a failure nothing else caught shows a card with Reload, not a blank page", async () => {
    h.stored["darsi:state"] = { ...initialState, guest: true, onboarded: true, lang: "en" };
    h.appBreaks = true;
    open("/learn");
    expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    // A guest's report from the card is anonymous.
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    expect(await screen.findByText("Report sheet from null (null), without a token")).toBeTruthy();
  });

  it("a signed-in person's report from that card still says whose it is", async () => {
    h.reset({ user: user("c7"), profile: { uid: "c7", name: "Carla", role: "learner" }, profileReady: true, role: "learner" });
    h.appBreaks = true;
    open("/learn");
    expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    expect(await screen.findByText("Report sheet from c7 (Carla), with a token")).toBeTruthy();
  });
});

describe("where you are (screen readers, tabs, history)", () => {
  const learner = (patch: Record<string, unknown> = {}) => { h.stored["darsi:state"] = { ...initialState, guest: true, onboarded: true, tracks: ["ai"], lang: "en", ...patch }; };

  it("the window title names the page, in the page's language, with an organization's name for its members", async () => {
    learner();
    const a = open("/labs");
    await waitFor(() => expect(document.title).toBe("Labs — Darsi"));
    a.unmount();
    learner({ lang: "ar" });
    const b = open("/downloads");
    await waitFor(() => expect(document.title).toBe("التنزيلات — درسي"));
    b.unmount();
    learner({ org: { id: "o1", name: "Nile School", v: 1 } });
    const c = open("/learn");
    await waitFor(() => expect(document.title).toBe("Learn — Nile School"));
    c.unmount();
    learner();
    open("/signin");
    await waitFor(() => expect(document.title).toBe("Darsi — درسي"));
  });

  it("moving to another page puts focus on its title; a page that has just loaded leaves focus alone", async () => {
    learner();
    open("/learn");
    await screen.findAllByRole("link", { name: "Labs" });
    await settle();
    expect(document.activeElement).toBe(document.body);
    const tabs = screen.getAllByRole("link", { name: "Labs" });
    fireEvent.click(tabs[tabs.length - 1]); // the bottom nav
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Labs" })));
  });

  it("each onboarding step takes focus from the button that went with the last one (the check's questions: mine.test)", async () => {
    h.stored["darsi:state"] = { ...initialState, guest: true, lang: "en" };
    open("/learn");
    expect(await screen.findByText("Choose your language")).toBeTruthy();
    expect(document.activeElement).toBe(document.body); // the page has just loaded
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Who are you?" })));
  });

  it("students hear about where they study, and skipping the check says what it does", async () => {
    h.stored["darsi:state"] = { ...initialState, guest: true, lang: "en" };
    open("/learn");
    const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Choose your language")).toBeTruthy();
    next();
    fireEvent.click(await screen.findByRole("radio", { name: /A student/ })); next();
    fireEvent.click((await screen.findAllByRole("radio"))[0]); next();
    fireEvent.click((await screen.findAllByRole("checkbox"))[0]); next();
    next();
    expect(await screen.findByText(/starting at the level for where you study\./)).toBeTruthy();
    expect(screen.queryByText(/where you teach/)).toBeNull();
    expect(screen.getByRole("button", { name: "Skip the check" })).toBeTruthy();
  });
});

describe("helpers", () => {
  it("reads invite codes the way the server does", () => {
    expect(inviteCode("abcd efgh-jkmn")).toBe("ABCD-EFGH-JKMN");
    expect(inviteCode("k7q2mxp")).toBe("K7Q-2MXP");
    expect(inviteCode("hello")).toBeNull();
    expect(inviteCode(null)).toBeNull();
  });

  it("knows the in-app browsers Google refuses, and not the phone's own browsers", () => {
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.31.105;]")).toBe(true);
    expect(inAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 307.0.0.34.111")).toBe(true);
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 12; TECNO KG5 Build/SP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0 Mobile Safari/537.36 Telegram-Android/10.2.3")).toBe(true);
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36")).toBe(false);
    expect(inAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1")).toBe(false);
  });
});
