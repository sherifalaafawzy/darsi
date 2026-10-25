import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { Org, Profile, Role } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";

// The staff screens read Firestore through the hooks in admin/data and write through Cloud Functions;
// both are replaced here so the screens can be checked without the emulators.
const m = vi.hoisted(() => ({
  auth: { user: { uid: "me" }, role: "learner", orgId: null, refreshClaims: vi.fn(async () => {}) } as { user: { uid: string } | null; role: string; orgId: string | null; refreshClaims: () => Promise<void> },
  orgs: { pending: [] as unknown[], active: [] as unknown[] },
  students: [] as unknown[] | undefined,
  requests: [] as unknown[],
  org: null as unknown,
  person: null as unknown,
  api: { reviewOrg: vi.fn(), joinOrg: vi.fn(), requestOrg: vi.fn() },
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: {}, functions: {}, firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useOrgsByStatus: (status: "pending" | "active") => ({ data: m.orgs[status as "pending" | "active"] }),
  usePerson: () => ({ data: m.person }),
  useMyStudents: () => ({ data: m.students }),
  useMyOrgRequests: (uid?: string) => ({ data: uid ? m.requests : undefined }),
  useOrg: (id?: string | null) => ({ data: id ? m.org : undefined }),
  useMembers: () => ({ data: [] }),
}));

const { SuperAdmin } = await import("../src/admin/SuperAdmin");
const { Teach } = await import("../src/admin/Teach");
const { OrgScreen } = await import("../src/org/OrgScreen");

const wrap = (ui: ReactNode, { lang = "en", url = "/" } = {}) =>
  render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter></I18nProvider>);
const org = (o: Partial<Org>): Org => ({ id: "o1", name: "Al-Noor School", type: "school", status: "pending", createdBy: "u1", city: "Cairo", country: "Egypt", createdAt: { seconds: 1792800000 }, ...o });
const student = (uid: string, name: string, lessonsDone = 0): Profile => ({ uid, name, email: `${uid}@users.darsi.app`, role: "student", orgId: "o1", teacherId: "me", summary: { lessonsDone, xp: 0, avgAccuracy: 0.8, lastActive: null, competencies: {}, units: {} } });
const as = (role: Role, orgId: string | null = null) => { m.auth.role = role; m.auth.orgId = orgId; };

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.user = { uid: "me" }; as("learner");
  m.orgs = { pending: [], active: [] }; m.students = []; m.requests = []; m.org = null; m.person = null;
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
