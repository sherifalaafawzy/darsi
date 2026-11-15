import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { Profile, Role } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";

// Data rights and abuse (functions/src/account.ts): "Your data" in Me, the person page's account panel, a platform
// admin removing a project's content, an organization's own courses in the editor, and the first-admin checks on
// /super/orgs. The callables and Firestore reads are fakes, so the screens can be checked without the emulators.
const m = vi.hoisted(() => ({
  auth: { user: null as { uid: string; email?: string } | null, profile: null as unknown, role: "learner" as string, orgId: null as string | null, signOut: vi.fn(async () => {}) },
  api: { exportAccountData: vi.fn(), deleteAccount: vi.fn(), setAccountSuspended: vi.fn(), moderateSubmission: vi.fn(), createOrg: vi.fn() },
  dispatch: vi.fn(),
  clearRuns: vi.fn(),
  found: [] as unknown[],
  cms: { listUnits: vi.fn(async () => []), listOrgs: vi.fn(async () => [{ id: "org1", name: "Nile School" }]) },
  /** admin/data.ts patchMembers: the member lists already read, mended without a read. */
  patched: [] as unknown[][],
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: vi.fn(), firebaseReady: true }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/state/store", async (orig) => ({ ...(await orig<typeof import("../src/state/store")>()), useStore: () => ({ state: {}, dispatch: m.dispatch }) }));
vi.mock("../src/lesson/engine", async (orig) => ({ ...(await orig<typeof import("../src/lesson/engine")>()), clearRuns: m.clearRuns }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  findByEmail: async () => m.found, findByName: async () => m.found, findPeople: async () => m.found, useAllOrgs: () => ({ data: [], reload: vi.fn() }),
  patchMembers: (...a: unknown[]) => { m.patched.push(a); },
}));
vi.mock("../src/cms/data", async (orig) => ({ ...(await orig<typeof import("../src/cms/data")>()), ...m.cms }));

const { MyData } = await import("../src/account/MyData");
const { AccountActions } = await import("../src/admin/AccountActions");
const { SubmissionCard } = await import("../src/admin/SubmissionCard");
const { OrgsAdmin } = await import("../src/admin/OrgsAdmin");
const { ContentList } = await import("../src/cms/ContentList");

// `at`: the address the screen opens at (a tabbed page's tab is ?tab=…).
const wrap = (ui: ReactNode, lang = "en", at = "/") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[at]}>{ui}</MemoryRouter></I18nProvider>);
const signedIn = (role: Role, extra: Partial<typeof m.auth> = {}) => { Object.assign(m.auth, { user: { uid: "me", email: "me@gmail.com" }, profile: { uid: "me", name: "Me", email: "me@gmail.com", role, orgId: null }, role, orgId: null, ...extra }); };
const person = (p: Partial<Profile & { createdBy: string; suspended: { reason?: string } }>) => ({ uid: "p1", name: "Mona", email: "mna.abd.12345@users.darsi.app", role: "student" as Role, orgId: "org1", createdBy: "adm", ...p });
const refused = (reason: string) => Object.assign(new Error("refused"), { code: "functions/failed-precondition", details: { reason } });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(m.auth, { user: null, profile: null, role: "learner", orgId: null });
  m.found = []; m.patched = [];
  URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
});

describe("Your data, in Me", () => {
  it("is not there for guests", () => {
    wrap(<MyData />);
    expect(screen.queryByText("Your data")).toBeNull();
  });
  it("saves the person's data as a file", async () => {
    signedIn("learner");
    m.api.exportAccountData.mockResolvedValue({ uid: "me", lessons: [] });
    wrap(<MyData />);
    fireEvent.click(screen.getByRole("button", { name: "Download my data" }));
    await waitFor(() => expect(m.api.exportAccountData).toHaveBeenCalledWith({}));
    expect(await screen.findByText("Your data was saved as a file.")).toBeTruthy();
  });
  it("deletes the account only after the word is typed, then clears this phone and signs out", async () => {
    signedIn("learner");
    m.api.deleteAccount.mockResolvedValue({ ok: true });
    wrap(<MyData />);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account and my data" }));
    const go = screen.getByRole("button", { name: "Delete for good" });
    expect(go).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("To confirm, type delete"), { target: { value: "Delete" } });
    expect(go).toHaveProperty("disabled", false);
    fireEvent.click(go);
    await waitFor(() => expect(m.api.deleteAccount).toHaveBeenCalledWith({}));
    await waitFor(() => expect(m.auth.signOut).toHaveBeenCalled());
    expect(m.dispatch).toHaveBeenCalledWith({ type: "reset" });
    expect(m.clearRuns).toHaveBeenCalled();
  });
  it("takes away the deleted account's unsent mark, so the sign-out doesn't keep its store or say its work is kept", async () => {
    signedIn("learner");
    localStorage.setItem("darsi:unsent:me", "1.abc"); // a write this session never got acknowledged (state/store.tsx unsent)
    localStorage.setItem("darsi:unsent:other", "2.def"); // another account's on this phone stays
    m.api.deleteAccount.mockResolvedValue({ ok: true });
    wrap(<MyData />);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account and my data" }));
    fireEvent.change(screen.getByLabelText("To confirm, type delete"), { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    await waitFor(() => expect(m.auth.signOut).toHaveBeenCalled());
    expect(localStorage.getItem("darsi:unsent:me")).toBeNull();
    expect(localStorage.getItem("darsi:unsent:other")).toBe("2.def");
    localStorage.removeItem("darsi:unsent:other");
  });
  it("keeps the unsent mark when the server refuses the deletion", async () => {
    signedIn("learner");
    localStorage.setItem("darsi:unsent:me", "1.abc");
    m.api.deleteAccount.mockRejectedValue(refused("recent-login"));
    wrap(<MyData />);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account and my data" }));
    fireEvent.change(screen.getByLabelText("To confirm, type delete"), { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    await waitFor(() => expect(m.api.deleteAccount).toHaveBeenCalled());
    await screen.findByRole("button", { name: "Delete for good" });
    expect(localStorage.getItem("darsi:unsent:me")).toBe("1.abc");
    localStorage.removeItem("darsi:unsent:me");
  });
  it("asks for a fresh sign-in when the server wants one", async () => {
    signedIn("teacher");
    m.api.deleteAccount.mockRejectedValue(refused("recent-login"));
    wrap(<MyData />, "ar");
    fireEvent.click(screen.getByRole("button", { name: "احذف حسابي وبياناتي" }));
    fireEvent.change(screen.getByLabelText("للتأكيد، اكتب حذف"), { target: { value: "حذف" } });
    fireEvent.click(screen.getByRole("button", { name: "احذف نهائيًا" }));
    expect(await screen.findByText(/خلال ١٠ دقائق/)).toBeTruthy();
    expect(m.auth.signOut).not.toHaveBeenCalled();
  });
  // functions/src/account.ts target(): a person's own account in a session the school's sign-in opened is refused the
  // download and the deletion alike ("sso-own-login"), with an English sentence as the error's message.
  it("says, in the person's language, that a school session needs their own login, for the download and for deleting", async () => {
    signedIn("learner");
    const own = () => Object.assign(new Error("Sign in with your own Darsi login to do this."), { code: "functions/failed-precondition", details: { reason: "sso-own-login" } });
    m.api.exportAccountData.mockRejectedValue(own());
    m.api.deleteAccount.mockRejectedValue(own());
    wrap(<MyData />, "ar");
    fireEvent.click(screen.getByRole("button", { name: "تنزيل بياناتي" }));
    const said = await screen.findByRole("alert");
    expect(said.textContent).toMatch(/^أنت مسجّل الدخول عبر مدرستك\. لتفعل ذلك سجّل الدخول بحسابك الخاص/);
    expect(said.textContent).not.toContain("Sign in with your own");
    fireEvent.click(screen.getByRole("button", { name: "احذف حسابي وبياناتي" }));
    fireEvent.change(screen.getByLabelText("للتأكيد، اكتب حذف"), { target: { value: "حذف" } });
    fireEvent.click(screen.getByRole("button", { name: "احذف نهائيًا" }));
    await waitFor(() => expect(m.api.deleteAccount).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/^أنت مسجّل الدخول عبر مدرستك/));
    expect(m.auth.signOut).not.toHaveBeenCalled();
  });
  // functions/src/account.ts claimDataExport: one download per account every ten minutes ("data-wait").
  it("says when a second download must wait, in the person's language and numerals", async () => {
    signedIn("learner");
    m.api.exportAccountData.mockRejectedValue(Object.assign(new Error("A download of this account's data started a few minutes ago. Try again later."), { code: "functions/resource-exhausted", details: { reason: "data-wait", retryAt: Date.now() + 9 * 60_000 } }));
    wrap(<MyData />, "ar");
    fireEvent.click(screen.getByRole("button", { name: "تنزيل بياناتي" }));
    const said = await screen.findByRole("alert");
    // The stamp is taken before anything is read, so the first download may have failed or never arrived:
    // the sentence says one was started, never that the person has their data.
    expect(said.textContent).toBe("بدأ تنزيل بياناتك قبل دقائق. انتظر ١٠ دقائق ثم حاول مرة أخرى.");
    expect(said.textContent).not.toMatch(/نزّلت|نزّلها/);
  });
  it("the wait never says the data was downloaded: the first try may have failed on the way", async () => {
    signedIn("learner");
    m.api.exportAccountData.mockRejectedValue(Object.assign(new Error("A download of this account's data started a few minutes ago. Try again later."), { code: "functions/resource-exhausted", details: { reason: "data-wait", retryAt: Date.now() + 9 * 60_000 } }));
    wrap(<MyData />, "en");
    fireEvent.click(screen.getByRole("button", { name: "Download my data" }));
    const said = await screen.findByRole("alert");
    expect(said.textContent).toBe("A download of your data was started a few minutes ago. Wait 10 minutes, then try again.");
    expect(said.textContent).not.toMatch(/You downloaded|was downloaded/);
  });
  it("never shows the server's or the SDK's own words: a failure with no sentence is 'try again', a lost call 'no connection'", async () => {
    signedIn("learner");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // A refusal this screen has no sentence for, with the server's English as its message.
      m.api.exportAccountData.mockRejectedValueOnce(Object.assign(new Error("This is not your account."), { code: "functions/permission-denied", details: { reason: "not-yours" } }));
      wrap(<MyData />, "ar");
      fireEvent.click(screen.getByRole("button", { name: "تنزيل بياناتي" }));
      expect((await screen.findByRole("alert")).textContent).toBe("حدث خطأ. حاول مجددًا.");
      // The raw answer is kept for "Report a problem" (bugs/log.ts reads the console), not shown.
      expect(log).toHaveBeenCalledWith("[account]", "not-yours", "This is not your account.");
      // A reason that is the name of something every object has is no sentence either.
      m.api.exportAccountData.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "functions/failed-precondition", details: { reason: "constructor" } }));
      fireEvent.click(screen.getByRole("button", { name: "تنزيل بياناتي" }));
      await waitFor(() => expect(m.api.exportAccountData).toHaveBeenCalledTimes(2));
      expect((await screen.findByRole("alert")).textContent).toBe("حدث خطأ. حاول مجددًا.");
      // The call never got an answer: the SDK's bare "internal" while offline, or "unavailable".
      m.api.exportAccountData.mockRejectedValueOnce(Object.assign(new Error("internal"), { code: "functions/unavailable" }));
      fireEvent.click(screen.getByRole("button", { name: "تنزيل بياناتي" }));
      await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("لا يوجد اتصال. حاول مجددًا عند الاتصال."));
      const offline = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      try {
        m.api.exportAccountData.mockRejectedValueOnce(Object.assign(new Error("internal"), { code: "functions/internal" }));
        fireEvent.click(screen.getByRole("button", { name: "تنزيل بياناتي" }));
        await waitFor(() => expect(m.api.exportAccountData).toHaveBeenCalledTimes(4));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("لا يوجد اتصال. حاول مجددًا عند الاتصال."));
      } finally { offline.mockRestore(); }
    } finally { log.mockRestore(); }
  });
  it("sends a school account to its admin, and an admin to hand the role over, with no delete button", () => {
    signedIn("student", { user: { uid: "me", email: "mna.abd.12345@users.darsi.app" }, profile: { uid: "me", role: "student", orgId: "org1", createdBy: "adm" }, orgId: "org1" });
    const { unmount } = wrap(<MyData />);
    expect(screen.getByText(/Your organization made this account/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete my account and my data" })).toBeNull();
    unmount();
    signedIn("orgAdmin", { orgId: "org1" });
    wrap(<MyData />);
    expect(screen.getByText(/someone else must take over your role/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete my account and my data" })).toBeNull();
  });
  it("decides a school account by who manages it (managedBy), as the server does, not by who made the profile", () => {
    // Managed by the organization it is in, with an email of its own: the organization's to delete.
    signedIn("student", { profile: { uid: "me", role: "student", orgId: "org1", managedBy: "org1" }, orgId: "org1" });
    const a = wrap(<MyData />);
    expect(screen.getByText(/Your organization made this account/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete my account and my data" })).toBeNull();
    a.unmount();
    // An own email an admin once typed in (createdBy), not managed: the person's own to delete.
    signedIn("student", { profile: { uid: "me", role: "student", orgId: "org1", createdBy: "adm" }, orgId: "org1" });
    const b = wrap(<MyData />);
    expect(screen.queryByText(/Your organization made this account/)).toBeNull();
    expect(screen.getByRole("button", { name: "Delete my account and my data" })).toBeTruthy();
    b.unmount();
    // managedBy naming an organization it has left: not this one's.
    signedIn("learner", { profile: { uid: "me", role: "learner", orgId: null, managedBy: "org1" }, orgId: null });
    wrap(<MyData />);
    expect(screen.getByRole("button", { name: "Delete my account and my data" })).toBeTruthy();
  });
});

describe("the person page's account panel", () => {
  it("lets a platform admin download, suspend and delete", async () => {
    signedIn("superadmin");
    m.api.setAccountSuspended.mockResolvedValue({ suspended: true });
    m.api.deleteAccount.mockResolvedValue({ ok: true });
    const onDeleted = vi.fn(), onChanged = vi.fn();
    wrap(<AccountActions person={person({})} onDeleted={onDeleted} onChanged={onChanged} />);
    // Suspending signs the person out everywhere: it asks first, and the reason is part of the question.
    expect(screen.queryByLabelText("Reason (kept in the log)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Suspend account" }));
    expect(m.api.setAccountSuspended).not.toHaveBeenCalled();
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toMatch(/Suspend .*Mona.*'s account\?/);
    expect(ask.textContent).toMatch(/signed out everywhere and can't sign in until the account is restored/);
    fireEvent.change(within(ask).getByLabelText("Reason (kept in the log)"), { target: { value: "Spam in projects" } });
    fireEvent.click(within(ask).getByRole("button", { name: "Suspend account" }));
    await waitFor(() => expect(m.api.setAccountSuspended).toHaveBeenCalledWith({ uid: "p1", suspended: true, reason: "Spam in projects" }));
    expect(onChanged).toHaveBeenCalled();
    // The organization's member lists already read mark the row, with no read of every member.
    expect(m.patched).toEqual([["org1", "p1", { suspended: true }]]);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Delete account and data" }));
    fireEvent.change(screen.getByLabelText("To confirm, type delete"), { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    await waitFor(() => expect(m.api.deleteAccount).toHaveBeenCalledWith({ uid: "p1" }));
    expect(onDeleted).toHaveBeenCalled();
  });
  it("suspends nothing on Cancel", () => {
    signedIn("superadmin");
    wrap(<AccountActions person={person({})} onDeleted={vi.fn()} onChanged={vi.fn()} />);
    const suspend = screen.getByRole("button", { name: "Suspend account" });
    suspend.focus();
    fireEvent.click(suspend);
    // The safe action has the focus, so Enter on the question that just appeared suspends nobody.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.api.setAccountSuspended).not.toHaveBeenCalled();
    // The button stayed on the page while the question was open, so the keyboard is back where it was.
    expect(screen.getByRole("button", { name: "Suspend account" })).toBe(suspend);
    expect(document.activeElement).toBe(suspend);
  });
  it("says a refused suspension in the admin's language", async () => {
    signedIn("superadmin");
    m.api.setAccountSuspended.mockRejectedValue(refused("superadmin"));
    wrap(<AccountActions person={person({})} onDeleted={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Suspend account" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Suspend account" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/That person is a platform admin/);
  });
  it("offers a suspended account's restore, in one click", async () => {
    signedIn("superadmin");
    m.api.setAccountSuspended.mockResolvedValue({ suspended: false });
    const onChanged = vi.fn();
    wrap(<AccountActions person={person({ suspended: { reason: "Spam" } })} onDeleted={vi.fn()} onChanged={onChanged} />);
    expect(screen.getByText(/This account is suspended/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Suspend account" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restore account" }));
    expect(screen.queryByRole("alertdialog")).toBeNull(); // restoring only gives back what the suspension took
    await waitFor(() => expect(m.api.setAccountSuspended).toHaveBeenCalledWith({ uid: "p1", suspended: false }));
    expect(onChanged).toHaveBeenCalled();
  });
  it("shows an org admin only the accounts their organization made, and never suspension", () => {
    signedIn("orgAdmin", { orgId: "org1" });
    const { unmount } = wrap(<AccountActions person={person({})} onDeleted={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Delete account and data" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Suspend account" })).toBeNull();
    unmount();
    // A teacher who joined with a code made their own account: the admin removes them from the organization instead.
    const { container } = wrap(<AccountActions person={person({ role: "teacher", email: "t@gmail.com", createdBy: undefined })} onDeleted={vi.fn()} onChanged={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
  it("decides an organization's accounts by who manages them, never by who made the profile", () => {
    signedIn("orgAdmin", { orgId: "org1" });
    // Added by the admin with the person's own email: the account is the person's, not the organization's.
    const own = wrap(<AccountActions person={person({ email: "parent@gmail.com", createdBy: "adm" })} onDeleted={vi.fn()} onChanged={vi.fn()} />);
    expect(own.container.textContent).toBe("");
    own.unmount();
    // Managed by this organization (managedBy), whatever the login looks like.
    const managed = wrap(<AccountActions person={person({ email: "pupil@school.edu", createdBy: undefined, managedBy: "org1" })} onDeleted={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Delete account and data" })).toBeTruthy();
    managed.unmount();
    // A username login another organization manages (moved here since): not this organization's to delete.
    const other = wrap(<AccountActions person={person({ managedBy: "org2" })} onDeleted={vi.fn()} onChanged={vi.fn()} />);
    expect(other.container.textContent).toBe("");
  });
  it("says why an organization's admin was refused in words that match the rule", async () => {
    signedIn("orgAdmin", { orgId: "org1" });
    m.api.deleteAccount.mockRejectedValue(Object.assign(new Error("server words"), { code: "functions/permission-denied", details: { reason: "not-yours" } }));
    wrap(<AccountActions person={person({})} onDeleted={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete account and data" }));
    fireEvent.change(screen.getByLabelText("To confirm, type delete"), { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/organization that manages the account/);
  });
  it("never for another platform admin, or yourself", () => {
    signedIn("superadmin");
    const { container } = wrap(<><AccountActions person={person({ uid: "s2", role: "superadmin" })} onDeleted={vi.fn()} onChanged={vi.fn()} /><AccountActions person={person({ uid: "me" })} onDeleted={vi.fn()} onChanged={vi.fn()} /></>);
    expect(container.textContent).toBe("");
  });
});

describe("removing a project's content (platform admins)", () => {
  const sub = { id: "s1", lessonId: "ai-1-1-4", unitId: "ai-1-1", text: "Something abusive", status: "submitted" as const };
  it("asks first, then removes it", async () => {
    signedIn("superadmin");
    m.api.moderateSubmission.mockResolvedValue({ ok: true, files: 1 });
    wrap(<SubmissionCard uid="p1" sub={sub} lessonTitle="Project" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove content" }));
    expect(screen.getByText(/Remove this project's text, links and files for good/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Remove content" })[0]);
    await waitFor(() => expect(m.api.moderateSubmission).toHaveBeenCalledWith({ uid: "p1", id: "s1" }));
    expect(await screen.findByText("Removed by Darsi staff")).toBeTruthy();
    expect(screen.queryByText("Something abusive")).toBeNull();
  });
  it("shows a removed project as removed, to every reviewer, with no button for teachers", () => {
    signedIn("teacher", { orgId: "org1" });
    wrap(<SubmissionCard uid="p1" sub={{ ...sub, text: "", moderated: { by: "boss" } } as never} lessonTitle="Project" />);
    expect(screen.getByText("Removed by Darsi staff")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove content" })).toBeNull();
  });
});

describe("a new organization's first admin (/super/orgs, the New organization tab)", () => {
  const NEW = "/super/orgs?tab=new";
  const create = (admin: string) => {
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Nile School" } });
    fireEvent.change(screen.getByLabelText(/Its admin/), { target: { value: admin } });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
  };
  it("refuses yourself, and another platform admin, before anything is created", async () => {
    signedIn("superadmin");
    m.found = [{ uid: "me", name: "Me", email: "me@gmail.com", role: "superadmin" }];
    const { unmount } = wrap(<OrgsAdmin />, "en", NEW);
    expect(screen.getByRole("tab", { name: "New organization" }).getAttribute("aria-selected")).toBe("true");
    create("me@gmail.com");
    expect(await screen.findByText(/You can't make yourself an organization's admin/)).toBeTruthy();
    unmount();
    m.found = [{ uid: "s2", name: "Other", email: "s2@gmail.com", role: "superadmin" }];
    wrap(<OrgsAdmin />, "en", NEW);
    create("s2@gmail.com");
    expect(await screen.findByText(/That person is a platform admin/)).toBeTruthy();
    expect(m.api.createOrg).not.toHaveBeenCalled();
  });
});

describe("an organization's own courses in the editor (platform admins)", () => {
  it("opens the list of an organization picked from the owners", async () => {
    signedIn("superadmin");
    wrap(<ContentList />);
    await waitFor(() => expect(m.cms.listUnits).toHaveBeenCalledWith("public"));
    fireEvent.change(await screen.findByLabelText("Show the courses of"), { target: { value: "org1" } });
    await waitFor(() => expect(m.cms.listUnits).toHaveBeenCalledWith("org1"));
    expect(screen.getByText(/This organization's own courses/)).toBeTruthy();
  });
  it("has no picker for an org admin", async () => {
    signedIn("orgAdmin", { orgId: "org1" });
    wrap(<ContentList />);
    await waitFor(() => expect(m.cms.listUnits).toHaveBeenCalledWith("org1"));
    expect(screen.queryByLabelText("Show the courses of")).toBeNull();
    expect(m.cms.listOrgs).not.toHaveBeenCalled();
  });
});
