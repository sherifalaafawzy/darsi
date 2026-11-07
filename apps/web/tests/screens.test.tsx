import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { Org, Profile, Role } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";

// The staff screens read Firestore through the hooks in admin/data and write through Cloud Functions;
// both are replaced here so the screens can be checked without the emulators.
const m = vi.hoisted(() => ({
  auth: { user: { uid: "me" }, role: "learner", orgId: null, refreshClaims: vi.fn(async () => {}) } as { user: { uid: string } | null; role: string; orgId: string | null; refreshClaims: () => Promise<void>; profile?: unknown },
  orgs: { pending: [] as unknown[], active: [] as unknown[] },
  students: [] as unknown[] | undefined,
  requests: [] as unknown[],
  org: null as unknown,
  person: null as unknown,
  /** orgs/{id}/private/request: the requester's contact and reason, which members never read. */
  request: undefined as { contact?: string; reason?: string } | undefined,
  api: { reviewOrg: vi.fn(), joinOrg: vi.fn(), requestOrg: vi.fn() },
  reload: vi.fn(),
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: {}, functions: {}, firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  // Staff screens read once and call reload() after their own changes (admin/data.ts has no live listeners).
  useOrgsByStatus: (status: "pending" | "active") => ({ data: m.orgs[status as "pending" | "active"], reload: m.reload }),
  usePerson: () => ({ data: m.person, reload: m.reload }),
  useMyStudents: () => ({ data: m.students, reload: m.reload }),
  useMyOrgRequests: (uid?: string) => ({ data: uid ? m.requests : undefined, reload: m.reload }),
  useOrg: (id?: string | null) => ({ data: id ? m.org : undefined, reload: m.reload }),
  useMembers: () => ({ data: [], reload: m.reload }),
  useOrgRequest: () => ({ data: m.request, reload: m.reload }),
}));

const { SuperAdmin } = await import("../src/admin/SuperAdmin");
const { Teach } = await import("../src/admin/Teach");
const { OrgScreen, PROFILE_WAIT_MS, orgPlace } = await import("../src/org/OrgScreen");

const wrap = (ui: ReactNode, { lang = "en", url = "/" } = {}) =>
  render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter></I18nProvider>);
const org = (o: Partial<Org>): Org => ({ id: "o1", name: "Al-Noor School", type: "school", status: "pending", createdBy: "u1", city: "Cairo", country: "Egypt", createdAt: { seconds: 1792800000 }, ...o });
const student = (uid: string, name: string, lessonsDone = 0): Profile => ({ uid, name, email: `${uid}@users.darsi.app`, role: "student", orgId: "o1", teacherId: "me", summary: { lessonsDone, xp: 0, avgAccuracy: 0.8, lastActive: null, competencies: {}, units: {} } });
const as = (role: Role, orgId: string | null = null) => { m.auth.role = role; m.auth.orgId = orgId; };

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.user = { uid: "me" }; m.auth.profile = { uid: "me", name: "Me" }; as("learner");
  m.orgs = { pending: [], active: [] }; m.students = []; m.requests = []; m.org = null; m.person = null; m.request = undefined;
});

describe("SuperAdmin", () => {
  beforeEach(() => as("superadmin"));

  it("shows a pending request with who sent it, and approves it", async () => {
    m.orgs.pending = [org({ size: 40, reason: "Train our teachers" })];
    m.orgs.active = [org({ id: "o2", name: "Sunrise University", type: "university", status: "active", memberCount: 120 })];
    m.person = { uid: "u1", name: "Amina Bello", email: "amina@school.org" };
    m.api.reviewOrg.mockResolvedValue({ status: "active" });
    wrap(<SuperAdmin />);
    expect(screen.getByText("Al-Noor School")).toBeTruthy();
    expect(screen.getByText("Amina Bello")).toBeTruthy();
    expect(screen.getByText("Train our teachers")).toBeTruthy();
    expect(screen.getByText("Sunrise University")).toBeTruthy();
    expect(screen.getAllByText("Cairo · Egypt")).toHaveLength(2); // the request card and the active-organizations row
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(m.api.reviewOrg).toHaveBeenCalledWith({ orgId: "o1", approve: true, note: undefined }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", expect.stringContaining("is now active"));
    expect(m.reload).toHaveBeenCalled(); // the lists are read again, not pushed live
  });

  it("shows the requester's contact and reason from the request's private document", () => {
    m.orgs.pending = [org({})];
    m.request = { contact: "+20 100 000 0000", reason: "A pilot for grades 7-9" };
    wrap(<SuperAdmin />);
    expect(screen.getByText("+20 100 000 0000")).toBeTruthy();
    expect(screen.getByText("A pilot for grades 7-9")).toBeTruthy();
  });

  it("rejects with an optional note for the requester", async () => {
    m.orgs.pending = [org({})];
    m.api.reviewOrg.mockResolvedValue({ status: "rejected" });
    wrap(<SuperAdmin />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText(/Note to the requester/), { target: { value: "Please use your school email" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject request" }));
    await waitFor(() => expect(m.api.reviewOrg).toHaveBeenCalledWith({ orgId: "o1", approve: false, note: "Please use your school email" }));
  });

  it("says why an approval was refused, in Arabic, and warns ahead when the requester joined another school", async () => {
    m.orgs.pending = [org({})];
    m.person = { uid: "u1", name: "Amina Bello", email: "amina@school.org", orgId: "o7" };
    m.api.reviewOrg.mockRejectedValue(Object.assign(new Error("The requester now belongs to another organization."), { code: "functions/failed-precondition", details: { reason: "requester-in-org" } }));
    wrap(<SuperAdmin />, { lang: "ar" });
    expect(screen.getByText("انضم مقدّم الطلب إلى مؤسسة أخرى بعد إرساله.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "موافقة" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("ارفض هذا الطلب بدلًا من ذلك"));
  });

  it("reads the lists again when someone else reviewed the request meanwhile", async () => {
    m.orgs.pending = [org({})];
    m.api.reviewOrg.mockRejectedValue(Object.assign(new Error("This request was already reviewed."), { code: "functions/failed-precondition", details: { reason: "reviewed" } }));
    wrap(<SuperAdmin />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", expect.stringContaining("was already reviewed"));
    expect(m.reload).toHaveBeenCalled();
  });

  it("uses the Arabic comma between city and country", () => {
    m.orgs.active = [org({ status: "active" })];
    wrap(<SuperAdmin />, { lang: "ar" });
    expect(screen.getByText("Cairo، Egypt")).toBeTruthy();
  });
});

describe("Teach", () => {
  beforeEach(() => as("teacher", "o1"));

  it("lists the teacher's students linking to /teach/:uid", () => {
    m.students = [student("s1", "Omar", 3), student("s2", "Fatima")];
    wrap(<Teach />);
    expect(screen.getByRole("link", { name: /Omar/ }).getAttribute("href")).toBe("/teach/s1");
    expect(screen.getByRole("link", { name: /Fatima/ }).getAttribute("href")).toBe("/teach/s2");
  });

  it("explains how students get assigned when there are none", () => {
    m.students = [];
    wrap(<Teach />);
    expect(screen.getByText(/Your admin assigns students to teachers/)).toBeTruthy();
  });
});

describe("OrgScreen", () => {
  it("joins with an invite code and refreshes the token claims", async () => {
    m.api.joinOrg.mockResolvedValue({ orgId: "o1", role: "teacher", orgName: "Al-Noor School" });
    wrap(<OrgScreen />);
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "k7q-2mxp" } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(m.api.joinOrg).toHaveBeenCalledWith({ code: "K7Q-2MXP" }));
    await waitFor(() => expect(m.auth.refreshClaims).toHaveBeenCalled());
  });

  it("joins from an invite link only once a new account's profile exists, so the join can't make a nameless one (ux-accounts-04)", async () => {
    m.api.joinOrg.mockResolvedValue({ orgId: "o1", role: "student", orgName: "Al-Noor School" });
    m.auth.profile = null; // signed up a moment ago: the app is still creating it
    const tree = () => <I18nProvider lang="en"><MemoryRouter initialEntries={["/org?code=K7Q-2MXP"]}><OrgScreen /></MemoryRouter></I18nProvider>;
    const r = render(tree());
    await new Promise((ok) => setTimeout(ok, 50));
    expect(m.api.joinOrg).not.toHaveBeenCalled();
    m.auth.profile = { uid: "me", name: "Me" };
    r.rerender(tree());
    await waitFor(() => expect(m.api.joinOrg).toHaveBeenCalledWith({ code: "K7Q-2MXP" }));
    expect(m.api.joinOrg).toHaveBeenCalledTimes(1);
  });

  it("joins from an invite link after a few seconds even without a profile", async () => {
    vi.useFakeTimers();
    try {
      m.api.joinOrg.mockResolvedValue({ orgId: "o1", role: "student", orgName: "Al-Noor School" });
      m.auth.profile = null;
      wrap(<OrgScreen />, { url: "/org?code=K7Q-2MXP" });
      await act(async () => { await vi.advanceTimersByTimeAsync(PROFILE_WAIT_MS - 100); });
      expect(m.api.joinOrg).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      expect(m.api.joinOrg).toHaveBeenCalledWith({ code: "K7Q-2MXP" });
    } finally { vi.useRealTimers(); }
  });

  it("says in the person's language when a hand-made username login is refused", async () => {
    m.api.joinOrg.mockRejectedValue(Object.assign(new Error("This kind of login is only for accounts an organization makes."), { code: "functions/permission-denied" }));
    wrap(<OrgScreen />, { lang: "ar" });
    fireEvent.change(screen.getByLabelText("رمز الدعوة"), { target: { value: "AAA-BBBB" } });
    fireEvent.submit(screen.getByLabelText("رمز الدعوة").closest("form")!);
    expect(await screen.findByText(/مخصص للحسابات التي تُنشئها المدارس/)).toBeTruthy();
  });

  it("shows a friendly message for an unknown code", async () => {
    m.api.joinOrg.mockRejectedValue(Object.assign(new Error("That code is not valid."), { code: "functions/not-found" }));
    wrap(<OrgScreen />);
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "AAA-BBBB" } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(await screen.findByText(/Check it with your admin/)).toBeTruthy();
  });

  it("opens the request form from ?request=1 and sends it", async () => {
    m.api.requestOrg.mockResolvedValue({ orgId: "o9", status: "pending" });
    wrap(<OrgScreen />, { url: "/org?request=1" });
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Hope NGO" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "ngo" } });
    fireEvent.change(screen.getByLabelText("Approximate number of people"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(m.api.requestOrg).toHaveBeenCalledWith(expect.objectContaining({ name: "Hope NGO", type: "ngo", size: 25 })));
    // The request list is read once, not live: it is read again so "being reviewed" shows.
    await waitFor(() => expect(m.reload).toHaveBeenCalled());
  });

  it("puts the registration form first for someone who came to register one, and the invite code first otherwise", () => {
    const first = (a: string, b: string) => Boolean(screen.getByLabelText(a).compareDocumentPosition(screen.getByLabelText(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
    const r = wrap(<OrgScreen />, { url: "/org?request=1" });
    expect(first("Organization name", "Invite code")).toBe(true);
    r.unmount();
    wrap(<OrgScreen />);
    expect(screen.queryByLabelText("Organization name")).toBeNull(); // the form opens from its button, below the code
    fireEvent.click(screen.getByRole("button", { name: "Register your organization" }));
    expect(first("Invite code", "Organization name")).toBe(true); // and stays where it was
  });

  it("names a country given as a code in the page's language, beside the city", () => {
    expect(orgPlace({ city: "Cairo", country: "EG" }, "en", ", ")).toBe("Cairo, Egypt");
    expect(orgPlace({ city: "Cairo", country: "eg" }, "ar-EG", "، ")).toBe("Cairo، مصر");
    expect(orgPlace({ city: "", country: "Egypt" }, "ar-EG", "، ")).toBe("Egypt"); // typed out: as typed
    expect(orgPlace({}, "en", ", ")).toBe("—");
    as("student", "o1"); m.org = org({ status: "active", country: "EG" });
    wrap(<OrgScreen />);
    expect(screen.getByText("Cairo · Egypt")).toBeTruthy();
  });

  it("shows a pending request and hides the request form", () => {
    m.requests = [org({ status: "pending" })];
    wrap(<OrgScreen />, { url: "/org?request=1" });
    expect(screen.getByText(/is being reviewed/)).toBeTruthy();
    expect(screen.queryByLabelText("Organization name")).toBeNull();
  });

  it("shows the reviewer's note on a rejected request", () => {
    m.requests = [org({ status: "rejected", reviewNote: "Please use your school email" })];
    wrap(<OrgScreen />);
    expect(screen.getByText(/was not approved/)).toBeTruthy();
    expect(screen.getByText(/Please use your school email/)).toBeTruthy();
  });

  it("refreshes claims once when a request was approved but the token is stale", () => {
    m.requests = [org({ status: "active" })];
    wrap(<OrgScreen />);
    expect(m.auth.refreshClaims).toHaveBeenCalledTimes(1);
  });

  it("shows membership and the admin's shortcuts", () => {
    as("orgAdmin", "o1"); m.org = org({ status: "active" });
    wrap(<OrgScreen />);
    expect(screen.getByText(/Your role at .*Al-Noor School.*: admin\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manage your organization" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "See my students" })).toBeTruthy();
  });
});
