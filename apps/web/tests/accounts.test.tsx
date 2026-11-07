import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: vi.fn(), firebaseReady: true }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/state/store", async (orig) => ({ ...(await orig<typeof import("../src/state/store")>()), useStore: () => ({ state: {}, dispatch: m.dispatch }) }));
vi.mock("../src/lesson/engine", async (orig) => ({ ...(await orig<typeof import("../src/lesson/engine")>()), clearRuns: m.clearRuns }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  findByEmail: async () => m.found, findByName: async () => m.found, findPeople: async () => m.found, useAllOrgs: () => ({ data: [], reload: vi.fn() }),
}));
vi.mock("../src/cms/data", async (orig) => ({ ...(await orig<typeof import("../src/cms/data")>()), ...m.cms }));

const { MyData } = await import("../src/account/MyData");
const { AccountActions } = await import("../src/admin/AccountActions");
const { SubmissionCard } = await import("../src/admin/SubmissionCard");
const { OrgsAdmin } = await import("../src/admin/OrgsAdmin");
const { ContentList } = await import("../src/cms/ContentList");

const wrap = (ui: ReactNode, lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter>{ui}</MemoryRouter></I18nProvider>);
const signedIn = (role: Role, extra: Partial<typeof m.auth> = {}) => { Object.assign(m.auth, { user: { uid: "me", email: "me@gmail.com" }, profile: { uid: "me", name: "Me", email: "me@gmail.com", role, orgId: null }, role, orgId: null, ...extra }); };
const person = (p: Partial<Profile & { createdBy: string; suspended: { reason?: string } }>) => ({ uid: "p1", name: "Mona", email: "mna.abd.12345@users.darsi.app", role: "student" as Role, orgId: "org1", createdBy: "adm", ...p });
const refused = (reason: string) => Object.assign(new Error("refused"), { code: "functions/failed-precondition", details: { reason } });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(m.auth, { user: null, profile: null, role: "learner", orgId: null });
  m.found = [];
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
});

describe("the person page's account panel", () => {
  it("lets a platform admin download, suspend and delete", async () => {
    signedIn("superadmin");
    m.api.setAccountSuspended.mockResolvedValue({ suspended: true });
    m.api.deleteAccount.mockResolvedValue({ ok: true });
    const onDeleted = vi.fn(), onChanged = vi.fn();
    wrap(<AccountActions person={person({})} onDeleted={onDeleted} onChanged={onChanged} />);
    fireEvent.change(screen.getByLabelText("Reason (kept in the log)"), { target: { value: "Spam in projects" } });
    fireEvent.click(screen.getByRole("button", { name: "Suspend account" }));
    await waitFor(() => expect(m.api.setAccountSuspended).toHaveBeenCalledWith({ uid: "p1", suspended: true, reason: "Spam in projects" }));
    expect(onChanged).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete account and data" }));
    fireEvent.change(screen.getByLabelText("To confirm, type delete"), { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    await waitFor(() => expect(m.api.deleteAccount).toHaveBeenCalledWith({ uid: "p1" }));
    expect(onDeleted).toHaveBeenCalled();
  });
  it("offers a suspended account's restore", () => {
    signedIn("superadmin");
    wrap(<AccountActions person={person({ suspended: { reason: "Spam" } })} onDeleted={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Restore account" })).toBeTruthy();
    expect(screen.getByText(/This account is suspended/)).toBeTruthy();
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

describe("a new organization's first admin (/super/orgs)", () => {
  const create = (admin: string) => {
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Nile School" } });
    fireEvent.change(screen.getByLabelText(/Its admin/), { target: { value: admin } });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
  };
  it("refuses yourself, and another platform admin, before anything is created", async () => {
    signedIn("superadmin");
    m.found = [{ uid: "me", name: "Me", email: "me@gmail.com", role: "superadmin" }];
    const { unmount } = wrap(<OrgsAdmin />);
    create("me@gmail.com");
    expect(await screen.findByText(/You can't make yourself an organization's admin/)).toBeTruthy();
    unmount();
    m.found = [{ uid: "s2", name: "Other", email: "s2@gmail.com", role: "superadmin" }];
    wrap(<OrgsAdmin />);
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
