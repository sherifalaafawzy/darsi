// Where people land in the real App (routes, guards, the store per account), with the auth state driven by the test:
// - the account screens never navigate after signing in, so SignedIn sends each role on (admins to their dashboards,
//   invite codes to /org), whatever order the sign-in and AuthProvider's publishing happen in;
// - /results opens for any signed-in account, and a guest never loads it (nor, with it, the Firebase SDK);
// - finishing onboarding opens the page that was asked for;
// - an account takes over the guest's learning on this device only when it was created here (never a school account).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

type Auth = Record<string, unknown>;
const h = vi.hoisted(() => {
  const subs = new Set<() => void>();
  let auth: Record<string, unknown> = {};
  return {
    stored: {} as Record<string, unknown>,
    resultsLoaded: false,
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
vi.mock("../src/analytics/useAnalytics", () => ({ useAnalytics: () => {} }));
vi.mock("../src/notify/usePushRefresh", () => ({ usePushRefresh: () => {} }));
vi.mock("../src/tour/Start", () => ({ AppTour: () => null, openTour: () => {}, OPEN_TOUR: "darsi:tour" }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null, forgetSettings: () => {}, loadCatalog: async () => ({ version: 1, units: [] }),
}));
vi.mock("../src/results/CourseResults", () => { h.resultsLoaded = true; return { CourseResults: () => "Course results page" }; });
vi.mock("../src/admin/AdminHome", () => ({ AdminHome: () => "Org admin dashboard" }));
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
  h.reset(); h.stored = {}; h.profileExists = true; h.profileFields = { email: "someone@x.org", name: "Someone" }; h.fbAuth = {};
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
      h.reset({ user: { ...user("m1"), email: "m1@users.darsi.app" }, profile: { uid: "m1", name: "M", role: "student", mustChangePassword: true }, role: "student", orgId: "o1" });
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
