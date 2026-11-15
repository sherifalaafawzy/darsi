// "Leave <organization>" in Me's account section (the leaveOrg callable): who sees it, what the confirmation says, what
// happens after (the claims are read again; the server ends the session with the membership, so the app usually
// restarts signed out and a note says why), and the server's refusals in the person's language.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  stored: null as unknown,
  auth: {} as Record<string, unknown>,
  calls: [] as [string, unknown][],
  /** What leaveOrg answers: nothing (ok), or the refusal's reason. */
  refuse: null as string | null,
  /** leaveOrg answers only once this does (the server is still at work). */
  hold: null as Promise<void> | null,
  refresh: vi.fn(),
}));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => h.stored, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => h.auth, createLearnerProfile: async () => {} }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null, forgetSettings: () => {}, loadCatalog: async () => ({ version: 1, units: [] }),
}));
vi.mock("../src/fb", () => ({
  loadFirebase: async () => ({ auth: {}, db: {}, storage: () => ({}) }),
  storedSession: async () => null,
  call: (name: string) => async (data: unknown) => {
    h.calls.push([name, data]);
    if (name === "leaveOrg" && h.hold) await h.hold;
    if (name === "leaveOrg" && h.refuse) throw Object.assign(new Error(h.refuse === "offline" ? "internal" : "Refused in English."), h.refuse === "offline" ? {} : { details: { reason: h.refuse } });
    return { ok: true };
  },
}));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }), where: () => ({}), orderBy: () => ({}), limit: () => ({}), query: () => ({}),
  getDocs: async () => ({ size: 0, metadata: { fromCache: false }, docs: [] }), addDoc: async () => ({ id: "new" }), serverTimestamp: () => "now",
}));
vi.mock("firebase/auth", () => ({ signInWithEmailAndPassword: vi.fn(), GoogleAuthProvider: class {} }));
vi.mock("../src/analytics/track", async (orig) => ({ ...(await orig<typeof import("../src/analytics/track")>()), track: () => {} }));

const { I18nProvider } = await import("../src/i18n");
const { SettingsProvider } = await import("../src/content/settings");
const { StoreProvider, initialState } = await import("../src/state/store");
const { Me } = await import("../src/screens/Me");
const { SignIn } = await import("../src/auth/AuthScreens");
const { Landing } = await import("../src/landing/Landing");
const { leftOrg } = await import("../src/auth/LeftOrg");
const sso = await import("../src/auth/sso");

const ORG = { id: "o1", name: "Nile Valley School", v: 1 };
const member = (patch: Record<string, unknown> = {}) => ({
  user: { uid: "s1", email: "salma@x.org", displayName: "Salma" }, profile: { uid: "s1", name: "Salma", email: "salma@x.org", role: "student", orgId: "o1" },
  role: "student", orgId: "o1", plan: null, configured: true, offlineUid: null,
  ensureFirebase: async () => {}, refreshClaims: h.refresh, updateProfile: async () => {}, signOut: async () => {}, ...patch,
});
const guest = () => member({ user: null, profile: null, role: "learner", orgId: null });
const show = (ui = <Me />, lang = "en") => render(
  <I18nProvider lang={lang}><SettingsProvider lang={lang}><StoreProvider><MemoryRouter initialEntries={["/me"]}>{ui}</MemoryRouter></StoreProvider></SettingsProvider></I18nProvider>);
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
const LEAVE = "Leave ⁨Nile Valley School⁩";
const names = () => h.calls.map(([name]) => name);

beforeEach(() => {
  h.stored = { ...initialState, onboarded: true, lang: "en", tracks: ["ai"], org: ORG };
  h.auth = member();
  h.calls = []; h.refuse = null; h.hold = null;
  h.refresh.mockReset().mockResolvedValue(undefined);
  sessionStorage.clear();
});

describe("who can leave", () => {
  it("a member sees the button, named after their organization", async () => {
    show();
    expect(await screen.findByRole("button", { name: LEAVE })).toBeTruthy();
  });

  it("an org admin and a teacher see it too (the server refuses the only admin)", async () => {
    h.auth = member({ role: "orgAdmin" });
    const first = show();
    expect(await screen.findByRole("button", { name: LEAVE })).toBeTruthy();
    first.unmount();
    h.auth = member({ role: "teacher" });
    show();
    expect(await screen.findByRole("button", { name: LEAVE })).toBeTruthy();
  });

  it("not a guest, not someone without an organization, and not a platform admin", async () => {
    h.auth = guest();
    const first = show();
    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.queryByRole("button", { name: /^Leave/ })).toBeNull();
    first.unmount();

    h.auth = member({ role: "learner", orgId: null });
    const second = show();
    await screen.findByRole("button", { name: "Sign out" });
    await settle();
    expect(screen.queryByRole("button", { name: /^Leave/ })).toBeNull();
    second.unmount();

    h.auth = member({ role: "superadmin" });
    show();
    await screen.findByRole("button", { name: "Sign out" });
    await settle();
    expect(screen.queryByRole("button", { name: /^Leave/ })).toBeNull();
  });

  it("an organization this phone hasn't named yet is 'your organization'", async () => {
    h.stored = { ...initialState, onboarded: true, lang: "en", tracks: ["ai"] };
    show();
    expect(await screen.findByRole("button", { name: "Leave your organization" })).toBeTruthy();
  });
});

describe("leaving", () => {
  const ask = async () => {
    fireEvent.click(await screen.findByRole("button", { name: LEAVE }));
    return screen.findByRole("group", { name: "Leave ⁨Nile Valley School⁩?" });
  };

  it("first says what it means, in place, and Cancel changes nothing", async () => {
    show();
    const q = await ask();
    expect(document.activeElement).toBe(q); // the question is read out, and the keyboard is at its buttons
    for (const line of ["Your learning stays with you.", "The organization’s admins and teachers will no longer see it.", "You will lose the organization’s own courses.", "You may be asked to sign in again."])
      expect(within(q).getByText(line)).toBeTruthy();
    fireEvent.click(within(q).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: LEAVE })); // the keyboard is back where it was
    expect(h.calls).toEqual([]);
  });

  it("the note is kept before the server answers (it ends the session as it does), and a refusal takes it back", async () => {
    let answer!: () => void;
    h.hold = new Promise<void>((r) => { answer = r; });
    h.refuse = "last-admin";
    show();
    fireEvent.click(within(await ask()).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(names()).toEqual(["leaveOrg"]));
    expect(leftOrg.get()).toBe("Nile Valley School");
    await act(async () => { answer(); await h.hold; });
    await screen.findByRole("alert");
    expect(leftOrg.get()).toBeNull();
  });

  it("confirming calls leaveOrg, reads the claims again and says so", async () => {
    show();
    fireEvent.click(within(await ask()).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
    expect(h.calls).toEqual([["leaveOrg", {}]]);
    expect((await screen.findByRole("status")).textContent).toBe("You left ⁨Nile Valley School⁩. Your learning is still yours.");
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByRole("button", { name: LEAVE })).toBeNull(); // not offered twice
    expect(leftOrg.get()).toBeNull(); // the session lived: nothing left to say after a restart
  });

  it("when the session ends with the membership, a note waits for the restart: the home page, sign-in and Me say why", async () => {
    h.refresh.mockRejectedValue(Object.assign(new Error("expired"), { code: "auth/user-token-expired" }));
    const me = show();
    fireEvent.click(within(await ask()).getByRole("button", { name: "Leave" }));
    const said = "You left ⁨Nile Valley School⁩. Sign in again to carry on: your learning is with your account.";
    expect((await screen.findByRole("status")).textContent).toBe(said);
    expect(leftOrg.get()).toBe("Nile Valley School");
    me.unmount();

    // The app restarts signed out (AuthProvider): the same tab, as a guest.
    h.auth = guest();
    const home = show(<Landing />);
    expect(screen.getByRole("status").textContent).toBe(said);
    home.unmount();
    const signIn = show(<SignIn />);
    expect(screen.getByRole("status").textContent).toBe(said);
    signIn.unmount();
    const asGuest = show();
    expect((await screen.findByRole("status")).textContent).toBe(said);
    asGuest.unmount();

    // Signed in again: said, and done with.
    h.auth = member({ role: "learner", orgId: null });
    show();
    await screen.findByRole("button", { name: "Sign out" });
    await waitFor(() => expect(leftOrg.get()).toBeNull());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a claims read that only failed (the connection) doesn't tell them to sign in again, but keeps the note in case", async () => {
    h.refresh.mockRejectedValue(Object.assign(new Error("offline"), { code: "auth/network-request-failed" }));
    show();
    fireEvent.click(within(await ask()).getByRole("button", { name: "Leave" }));
    expect((await screen.findByRole("status")).textContent).toBe("You left ⁨Nile Valley School⁩. Your learning is still yours.");
    expect(leftOrg.get()).toBe("Nile Valley School");
  });

  it("the note is for a while only, and nobody else ever sees one", async () => {
    h.auth = guest();
    const first = show(<Landing />);
    expect(screen.queryByRole("status")).toBeNull();
    first.unmount();
    sessionStorage.setItem("darsi:leftOrg", JSON.stringify({ name: "Nile Valley School", at: Date.now() - 16 * 60_000 }));
    show(<Landing />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    ["managed", "en", "Your organization made this login, so you can’t leave by yourself. Ask its admin to remove you."],
    ["managed", "ar", "أنشأت مؤسستك هذا الحساب، فلا يمكنك مغادرتها بنفسك. اطلب من مشرفها أن يزيلك."],
    ["last-admin", "en", "You are the organization’s only admin. Make someone else an admin first, then leave."],
    ["last-admin", "ar", "أنت المشرف الوحيد للمؤسسة. اجعل شخصًا آخر مشرفًا أولًا، ثم غادر."],
    ["disabled", "en", "This account is suspended, so it can’t leave the organization. Ask its admin."],
    ["disabled", "ar", "هذا الحساب موقوف، فلا يمكنه مغادرة المؤسسة. اطلب ذلك من مشرفها."],
    ["offline", "en", "Couldn’t leave just now. Check your connection and try again."],
  ])("a refusal (%s, %s) is explained in the person's language, and nothing else changes", async (reason, lang, words) => {
    h.refuse = reason;
    h.stored = { ...(h.stored as object), lang };
    show(<Me />, lang);
    const cta = lang === "ar" ? "مغادرة ⁨Nile Valley School⁩" : LEAVE;
    fireEvent.click(await screen.findByRole("button", { name: cta }));
    const q = await screen.findByRole("group");
    fireEvent.click(within(q).getByRole("button", { name: lang === "ar" ? "مغادرة" : "Leave" }));
    expect((await within(q).findByRole("alert")).textContent).toBe(words);
    expect(h.refresh).not.toHaveBeenCalled();
    expect(leftOrg.get()).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(names()).toEqual(["leaveOrg"]);
  });

  it("'not in an organization' means this phone is behind: it says so and reads the claims", async () => {
    h.refuse = "not-in-org";
    show();
    fireEvent.click(within(await ask()).getByRole("button", { name: "Leave" }));
    expect((await screen.findByRole("alert")).textContent).toBe("You are not in an organization any more.");
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
    expect(leftOrg.get()).toBeNull();
  });
});

describe("work not sent yet", () => {
  afterEach(() => localStorage.clear());

  it("leaving first tries to send it; what can't go is said, kept, and Leave anyway goes on", async () => {
    // A lesson finished offline: the unsent mark (state/store.tsx), which an ended session keeps the work for.
    localStorage.setItem("darsi:unsent:s1", "1.abc");
    show();
    fireEvent.click(await screen.findByRole("button", { name: LEAVE }));
    const q = await screen.findByRole("group");
    fireEvent.click(within(q).getByRole("button", { name: "Leave" }));
    expect((await within(q).findByRole("alert")).textContent).toMatch(/^Some of your work hasn’t reached Darsi yet\. If you leave now, it stays on this phone/);
    expect(h.calls).toEqual([]); // not left yet: the person decides
    expect(within(q).getByText("Your learning stays with you.")).toBeTruthy(); // still true: it is kept and sent later
    fireEvent.click(within(q).getByRole("button", { name: "Leave anyway" }));
    await waitFor(() => expect(names()).toEqual(["leaveOrg"]));
    expect(localStorage.getItem("darsi:unsent:s1")).toBe("1.abc"); // left for the ended session to keep
  });

  it("with everything sent it leaves at once", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: LEAVE }));
    fireEvent.click(within(await screen.findByRole("group")).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(names()).toEqual(["leaveOrg"]));
    expect(screen.queryByText(/hasn’t reached Darsi/)).toBeNull();
  });

  it("Cancel forgets the warning", async () => {
    localStorage.setItem("darsi:unsent:s1", "1.abc");
    show();
    fireEvent.click(await screen.findByRole("button", { name: LEAVE }));
    let q = await screen.findByRole("group");
    fireEvent.click(within(q).getByRole("button", { name: "Leave" }));
    await within(q).findByRole("alert");
    fireEvent.click(within(q).getByRole("button", { name: "Cancel" }));
    fireEvent.click(await screen.findByRole("button", { name: LEAVE }));
    q = await screen.findByRole("group");
    expect(within(q).queryByRole("alert")).toBeNull();
    expect(within(q).getByRole("button", { name: "Leave" })).toBeTruthy();
  });
});

describe("an account the organization manages", () => {
  it("gets no Leave button, and is told who can remove it (managedBy)", async () => {
    h.auth = member({ profile: { uid: "s1", name: "Salma", email: "salma@x.org", role: "student", orgId: "o1", managedBy: "o1" } });
    show();
    expect(await screen.findByText("Your organization manages this login, so you can’t leave it yourself. Its admin can remove you.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Leave/ })).toBeNull();
  });

  it("a username login from before managedBy is managed too, as the server decides", async () => {
    h.auth = member({ user: { uid: "s1", email: "salma.a.123@users.darsi.app", displayName: "Salma" }, profile: { uid: "s1", name: "Salma", email: "salma.a.123@users.darsi.app", role: "student", orgId: "o1" } });
    show();
    expect(await screen.findByText(/manages this login/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Leave/ })).toBeNull();
  });

  it("an own login that an admin once typed in (createdBy, or managedBy naming another organization) may leave", async () => {
    h.auth = member({ profile: { uid: "s1", name: "Salma", email: "salma@x.org", role: "student", orgId: "o1", createdBy: "adm", managedBy: "o2" } });
    show();
    expect(await screen.findByRole("button", { name: LEAVE })).toBeTruthy();
    expect(screen.queryByText(/manages this login/)).toBeNull();
  });

  it("says it in Arabic too", async () => {
    h.auth = member({ profile: { uid: "s1", name: "Salma", email: "salma@x.org", role: "student", orgId: "o1", managedBy: "o1" } });
    h.stored = { ...(h.stored as object), lang: "ar" };
    show(<Me />, "ar");
    expect(await screen.findByText("تدير مؤسستك هذا الحساب، فلا يمكنك مغادرتها بنفسك. يستطيع مشرفها أن يزيلك.")).toBeTruthy();
  });
});

// Me's "School sign-in" row is a lazy chunk that reads the organization's document again: it is asked for only when
// there is something for it to show, never for every member of every organization.
describe("the school sign-in row", () => {
  const link = vi.fn(async () => ({ SchoolLink: () => <p>School row</p> }) as unknown as typeof import("../src/auth/SchoolLink"));
  beforeEach(() => {
    link.mockClear();
    sso.setSchoolChunks({ finder: () => Promise.reject(new Error("offline")), link });
  });

  it("a member of an organization without school sign-in never loads it", async () => {
    show();
    await screen.findByRole("button", { name: LEAVE });
    await settle();
    expect(link).not.toHaveBeenCalled();
    expect(screen.queryByText("School row")).toBeNull();
  });

  it("an organization with school sign-in (kept from the one read at app start): loaded once and shown", async () => {
    h.stored = { ...(h.stored as object), org: { ...ORG, sso: true } };
    show();
    expect(await screen.findByText("School row")).toBeTruthy();
    await settle();
    expect(link).toHaveBeenCalledTimes(1);
  });

  it("not for another organization's flag left on the phone", async () => {
    h.stored = { ...(h.stored as object), org: { ...ORG, id: "o2", sso: true } };
    show();
    await screen.findByRole("button", { name: "Leave your organization" });
    await settle();
    expect(link).not.toHaveBeenCalled();
  });

  it.each([
    ["an account the school's sign-in made", { sso: true }],
    ["a connected account", { ssoLinkedAt: 1 }],
  ])("%s gets the row whatever the organization says", async (_, extra) => {
    h.auth = member({ profile: { uid: "s1", name: "Salma", email: "salma@x.org", role: "student", orgId: "o1", ...extra } });
    show();
    expect(await screen.findByText("School row")).toBeTruthy();
    await settle();
    expect(link).toHaveBeenCalledTimes(1);
  });

  it("not while school sign-in is switched off for the whole platform", async () => {
    localStorage.setItem("darsi:ssoOn", "0");
    try {
      h.stored = { ...(h.stored as object), org: { ...ORG, sso: true } };
      show();
      await screen.findByRole("button", { name: LEAVE });
      await settle();
      expect(link).not.toHaveBeenCalled();
    } finally { localStorage.removeItem("darsi:ssoOn"); }
  });

  it("a return from connecting that waits for the row gets it, and the row stays once it has taken the return", async () => {
    const was = location.pathname + location.search;
    history.replaceState(null, "", "/me#sso=ticket-1&f=flow-1");
    sso.stashReturn(); // as a page load does, before anything renders
    try {
      expect(sso.returnedTo("/me")).toBe(true);
      const { rerender } = show();
      expect(await screen.findByText("School row")).toBeTruthy();
      expect(link).toHaveBeenCalledTimes(1);
      // The row (auth/SchoolLink) takes the return as it mounts; Me renders again (the profile arrives, a save) and
      // must not take the row away in the middle of the confirmation.
      sso.takeStash("/me");
      rerender(<I18nProvider lang="en"><SettingsProvider lang="en"><StoreProvider><MemoryRouter initialEntries={["/me"]}><Me /></MemoryRouter></StoreProvider></SettingsProvider></I18nProvider>);
      await settle();
      expect(screen.getByText("School row")).toBeTruthy();
      expect(link).toHaveBeenCalledTimes(1);
    } finally { sso.takeStash("/me"); history.replaceState(null, "", was); }
  });

  it("never for a platform admin", async () => {
    h.stored = { ...(h.stored as object), org: { ...ORG, sso: true } };
    h.auth = member({ role: "superadmin" });
    show();
    await screen.findByRole("button", { name: "Sign out" });
    await settle();
    expect(link).not.toHaveBeenCalled();
  });
});
