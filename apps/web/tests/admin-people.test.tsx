// The org admin's and teacher's people screens (admin/): the person page, the dashboard and adding or importing people,
// with Firestore, the callables and the course files replaced, so they can be checked without the emulators.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/i18n";
import { StoreProvider } from "../src/state/store";
import ar from "../src/i18n/ar.json";
import arPeople from "../src/admin/people-strings/ar.json";
import enStaff from "../src/staff/strings/en.json";
import arStaff from "../src/staff/strings/ar.json";
import arAdmin from "../src/admin/strings/ar.json";
import enAdmin from "../src/admin/strings/en.json";
import enRules from "../src/admin/governance-strings/en.json";
import arRules from "../src/admin/governance-strings/ar.json";

const m = vi.hoisted(() => {
  const lesson = (id: string, title: string) => ({ id, title: { en: title }, minutes: 5, steps: [], tryTomorrow: { en: "" }, slides: [], kit: [] });
  const entry = (id: string, track: string, title: string, lessons: number) => ({ id, track, level: 1, title: { en: title }, summary: { en: "" }, lessons, sizeMB: 1, available: true, src: `content/units/${id}/v1.json` });
  return {
    auth: { user: { uid: "admin1" }, role: "orgAdmin", orgId: "o1" } as { user: { uid: string } | null; role: string; orgId: string | null },
    person: null as unknown, personErr: undefined as Error | undefined, progress: [] as unknown[], subs: [] as unknown[], certs: [] as unknown[], staff: [] as unknown[] | undefined,
    members: [] as unknown[], org: null as unknown, orgErr: undefined as Error | undefined, orgLoading: false, membersLoading: false, subsLoading: false, invites: { teacher: "AAAA-BBBB-CCCC", student: "DDDD-EEEE-FFFF" } as unknown,
    reload: vi.fn(), invitesReload: vi.fn(), staffErr: undefined as Error | undefined, invitesErr: undefined as Error | undefined,
    // The member list's own changes (admin/data.ts): the hook's patch and remove on the dashboard, and the module's
    // patchMembers and dropMembers from the person page. No read follows any of them.
    patch: vi.fn(), drop: vi.fn(), patched: [] as unknown[][], dropped: [] as unknown[][], forgot: 0,
    // How often each tab's own read was asked for (a hook runs on every render: 0 means its tab was never opened).
    calls: { invites: 0, sites: 0, progress: 0, subs: 0, certs: 0, staff: 0 },
    loaded: [] as string[],
    updates: [] as Array<{ path: string; data: Record<string, unknown> }>,
    failUpdate: null as Error | null,
    made: [] as unknown[], madeCalls: [] as unknown[][],
    api: { regenerateInviteCode: vi.fn(), resetMemberPassword: vi.fn(), createMembers: vi.fn(), setMemberRole: vi.fn(), removeMember: vi.fn(), setUserRole: vi.fn(), deleteAccount: vi.fn(), exportAccountData: vi.fn(), grantSuper: vi.fn(), grantCredits: vi.fn(), setSeat: vi.fn(), fillSeats: vi.fn(),
      updateMembers: vi.fn(), bulkMembers: vi.fn(), setMemberSuspended: vi.fn() },
    catalog: [entry("ai-1-1", "ai", "AI basics", 2), entry("iot-1-2", "iot", "Sensors", 2), entry("cyber-1-1", "cyber", "Passwords", 2)],
    unit: (id: string) => ({ id, track: id.split("-")[0], level: 1, title: { en: id }, summary: { en: "" }, lessons: [lesson(`${id}-1`, "Lesson one"), lesson(`${id}-2`, "Lesson two")] }),
  };
});
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, firebaseReady: true, call: () => vi.fn(), storage: async () => ({}), storageDataUrl: async () => "data:image/png;base64,AA" }));
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<typeof import("firebase/firestore")>()),
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  updateDoc: async (path: string, data: Record<string, unknown>) => { if (m.failUpdate) throw m.failUpdate; m.updates.push({ path, data }); },
}));
// The governance panels the dashboard mounts (another package's; they read their own data).
vi.mock("../src/admin/OrgActivity", () => ({ OrgActivity: ({ orgId }: { orgId: string }) => `The activity of ${orgId}` }));
// The join rules are another test's (tests/governance.test.tsx): here only that they are mounted, told of a new code,
// and asked to read again (`refresh` going up).
vi.mock("../src/admin/OrgPolicy", () => ({ OrgPolicy: ({ orgId, renewed, refresh }: { orgId: string; renewed?: { role: string; n: number } | null; refresh?: number }) => `Who may join ${orgId}${renewed ? ` (new ${renewed.role} code, ${renewed.n})` : ""}${refresh ? ` (read again, ${refresh})` : ""}` }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null,
  loadCatalog: async () => ({ version: 1, units: m.catalog }),
  loadUnit: async (id: string) => { m.loaded.push(id); return m.unit(id); },
}));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  usePerson: () => ({ data: m.person, error: m.personErr, reload: m.reload }),
  useProgress: () => { m.calls.progress++; return { data: m.progress, reload: m.reload }; },
  useSubmissions: () => { m.calls.subs++; return { data: m.subsLoading ? undefined : m.subs, loading: m.subsLoading, reload: m.reload }; },
  useCerts: () => { m.calls.certs++; return { data: m.certs, reload: m.reload }; },
  useOrgStaff: (orgId?: string | null) => { m.calls.staff++; return { data: orgId && !m.staffErr ? m.staff : undefined, error: orgId ? m.staffErr : undefined, reload: m.reload }; },
  // The whole list at once, as the hook gives it when every page has arrived (tests/people-paging.test.tsx has the pages).
  useMembers: () => ({ data: m.membersLoading ? undefined : m.members, partial: m.membersLoading ? [] : m.members, loaded: m.membersLoading ? 0 : m.members.length, complete: !m.membersLoading,
    loading: m.membersLoading, refreshing: false, at: 0, reload: m.reload, patch: m.patch, remove: m.drop }),
  patchMembers: (...a: unknown[]) => { m.patched.push(a); }, dropMembers: (...a: unknown[]) => { m.dropped.push(a); }, forgetMembers: () => { m.forgot++; },
  useOrg: () => ({ data: m.orgLoading ? undefined : m.org, error: m.orgErr, loading: m.orgLoading, reload: m.reload }),
  useInvites: () => { m.calls.invites++; return { data: m.invitesErr ? undefined : m.invites as { teacher?: string; student?: string }, error: m.invitesErr, loading: false, reload: m.invitesReload }; },
  useSites: () => { m.calls.sites++; return { data: [], loading: false, reload: m.reload }; },
  useAllOrgs: () => ({ data: [], reload: m.reload }),
  useSubscription: () => ({ data: null, reload: m.reload }),
  useCredits: () => ({ data: undefined, reload: m.reload }),
  madeSince: async (...a: unknown[]) => { m.madeCalls.push(a); return m.made; },
}));

const { PersonDetail, courseGroups, unitsUsed } = await import("../src/admin/PersonDetail");
const { AdminHome } = await import("../src/admin/AdminHome");
const { AddPeople, ImportPeople, CHUNK, alreadyMade, lostCall } = await import("../src/admin/AddPeople");
const { OrgBranding } = await import("../src/admin/OrgBranding");
const { SubmissionCard } = await import("../src/admin/SubmissionCard");
const { sendOrder } = await import("../src/admin/importer");
const { byName, cleanGroup } = await import("../src/admin/data");
const { byCourse } = await import("../src/admin/orgStats");
const { useDuration } = await import("../src/admin/charts");
const { lastActiveText } = await import("../src/admin/PersonDetail");
const { useI18n } = await import("../src/i18n");

const wrap = (ui: ReactNode, { lang = "en", url = "/admin/people/s1" } = {}) => render(
  <StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/admin/people/:uid" element={ui} /><Route path="*" element={ui} /></Routes>
  </MemoryRouter></I18nProvider></StoreProvider>,
);
const summary = (o: Record<string, unknown> = {}) => ({ lessonsDone: 0, xp: 0, avgAccuracy: 0, lastActive: null, competencies: {}, compAcc: {}, units: {}, ...o });
const amina = (o: Record<string, unknown> = {}) => ({ uid: "s1", name: "Amina Bello", email: "amina.b@users.darsiai.org", role: "student", orgId: "o1", teacherId: "t1", ...o });
const row = (lessonId: string, unitId: string, o: Record<string, unknown> = {}) => ({ lessonId, unitId, track: unitId.split("-")[0], accuracy: 0.5, xp: 40, seconds: 300, completedAt: "2026-11-01T10:00:00Z", ...o });
const sectionOf = (heading: string) => screen.getByRole("heading", { name: heading }).closest("section")!;
/** Opens a tab of the page (admin/Tabs.tsx); a tab with a count is named with it ("Projects 2"). */
const openTab = (name: string | RegExp) => fireEvent.click(screen.getByRole("tab", { name }));
const tabNames = () => screen.getAllByRole("tab").map((x) => x.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  m.auth = { user: { uid: "admin1" }, role: "orgAdmin", orgId: "o1" };
  m.membersLoading = false; m.subsLoading = false; m.orgLoading = false; m.orgErr = undefined;
  m.calls = { invites: 0, sites: 0, progress: 0, subs: 0, certs: 0, staff: 0 };
  m.patched = []; m.dropped = []; m.forgot = 0; m.staffErr = undefined; m.invitesErr = undefined;
  m.person = null; m.personErr = undefined; m.failUpdate = null; m.made = []; m.madeCalls = []; m.progress = []; m.subs = []; m.certs = []; m.members = []; m.org = null; m.loaded = []; m.updates = [];
  m.staff = [{ uid: "t1", name: "Grace Adeyemi", role: "teacher", orgId: "o1" }, { uid: "a1", name: "Bola Admin", role: "orgAdmin", orgId: "o1" }];
});

describe("the person page", () => {
  it("counts and assesses from the server's summary, not lesson results the student wrote (ux-teacher-04)", async () => {
    // One real lesson (in the summary), plus results for lessons that don't exist, claiming every UNESCO code.
    m.person = amina({ summary: summary({ lessonsDone: 1, xp: 40, avgAccuracy: 0.5, competencies: { "S.TA.U": 1 }, compAcc: { "S.TA.U": 0.5 }, units: { "ai-1-1": 1 }, seconds: 300 }) });
    const forged = { accuracy: 1, xp: 100, seconds: 3600, competencies: ["S.HM.U", "S.ET.U", "S.SD.C", "T.HM.A"] };
    m.progress = [row("ai-1-1-1", "ai-1-1"), row("ai-1-1-zz", "ai-1-1", forged), row("ai-1-1-yy", "ai-1-1", forged)];
    wrap(<PersonDetail />);
    const stats = await screen.findByText("Lessons", { selector: "dt" });
    expect(stats.nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("Accuracy", { selector: "dt" }).nextElementSibling?.textContent).toBe("50%");
    const caps = within(sectionOf("Capabilities"));
    expect(caps.getAllByText(/^[ST]\.[A-Z]{2}\.[A-Z]$/).map((e) => e.textContent)).toEqual(["S.TA.U"]);
    // Only the course's real lessons are listed (on the Courses tab).
    openTab("Courses");
    expect(await screen.findByText("Lesson one")).toBeTruthy();
    expect(screen.queryByText("ai-1-1-zz")).toBeNull();
  });

  it("downloads only the courses with results or projects, and names one no longer offered (ux-teacher-05, -07)", async () => {
    m.person = amina({ summary: summary({ lessonsDone: 1, units: { "ai-1-1": 1 } }) });
    m.progress = [row("ai-1-1-1", "ai-1-1"), row("data-s1-1", "data-s1"), row("data-s1-2", "data-s1"), row("gone-9-1", "gone-9")];
    m.subs = [{ id: "p1", lessonId: "iot-1-2-2", unitId: "iot-1-2", text: "My sensor", status: "submitted" }];
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=courses" });
    expect(await screen.findByText("Lesson one")).toBeTruthy();
    // Courses downloads the courses with results only: the one with just a project waits for the Projects tab.
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(m.loaded).toEqual(["ai-1-1"]);
    const courses = within(sectionOf("Courses"));
    expect(courses.getByText("AI basics")).toBeTruthy();
    // Unpublished since: its title from the course sources (admin/courseTitles.json), never its raw id.
    const gone = courses.getByText("Collect and sort").closest(".course-head") as HTMLElement;
    expect(within(gone).getByText("No longer offered")).toBeTruthy();
    expect(courses.queryByText("data-s1")).toBeNull();
    expect(courses.getByText("Lessons finished: 2")).toBeTruthy();
    // A course Darsi never had in its sources (an org's own, made in the editor) can only be named by its id.
    expect(courses.getByText("gone-9")).toBeTruthy();
    // The project's title is its lesson's once its course is loaded.
    openTab(/^Projects/);
    expect(await within(sectionOf("Projects")).findByText("Lesson two")).toBeTruthy();
    expect([...m.loaded].sort()).toEqual(["ai-1-1", "iot-1-2"]); // never cyber-1-1, never all of them
  });

  it("names a course no longer offered from the person's certificate, and marks it done (users/{uid}/certs)", async () => {
    m.person = amina({ summary: summary({ lessonsDone: 2, units: { "ai-1-1": 1 } }) });
    m.progress = [row("ai-1-1-1", "ai-1-1"), row("data-s1-1", "data-s1"), row("data-s1-2", "data-s1")];
    m.certs = [{ id: "data-s1", title: { en: "Data for beginners" }, track: "data", at: "2026-10-20T10:00:00.000Z" }];
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=courses" });
    expect(await screen.findByText("Lesson one")).toBeTruthy();
    const courses = within(sectionOf("Courses"));
    const gone = courses.getByText("Data for beginners").closest(".course-head")!;
    expect(within(gone as HTMLElement).getByText("No longer offered")).toBeTruthy();
    expect(within(gone as HTMLElement).getByText("Unit complete")).toBeTruthy();
    expect(courses.queryByText("data-s1")).toBeNull();
    // The published course, half done and with no certificate, has no badge.
    expect(within(courses.getByText("AI basics").closest(".course-head") as HTMLElement).queryByText("Unit complete")).toBeNull();
  });

  it("works out the courses from results that have no unitId (older phones)", () => {
    const catalog = m.catalog as Parameters<typeof unitsUsed>[0];
    expect(unitsUsed(catalog, [{ lessonId: "cyber-1-1-2" }, { lessonId: "ai-1-1-1", unitId: "ai-1-1" }]).map((u) => u.id)).toEqual(["ai-1-1", "cyber-1-1"]);
    const groups = courseGroups(catalog, [row("ai-1-1-1", "ai-1-1"), row("gone-1-1", "gone-1"), row("bogus", "gone-1")] as never);
    expect(groups.map((g) => [g.id, g.entry ? "listed" : "gone", g.rows.length])).toEqual([["ai-1-1", "listed", 1], ["gone-1", "gone", 1]]);
  });

  it("shows the student's teacher and only the platform's role picker to a platform admin (ux-superadmin-person-account-panel)", async () => {
    m.auth = { user: { uid: "root" }, role: "superadmin", orgId: null };
    m.person = amina({ summary: summary() });
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=account" });
    const teacher = await screen.findByLabelText("Teacher") as HTMLSelectElement;
    expect(teacher.value).toBe("t1");
    expect(teacher.selectedOptions[0].textContent).toBe("Grace Adeyemi");
    expect([...teacher.options].map((o) => o.textContent)).toContain("Bola Admin"); // admins who teach can be picked
    expect(screen.getAllByLabelText("Role")).toHaveLength(1); // "Role and organization" only
    expect(within(sectionOf("Account")).queryByLabelText("Role")).toBeNull();
  });

  it("a platform admin's new role or organization reaches the lists already read without reading every member", async () => {
    m.auth = { user: { uid: "root" }, role: "superadmin", orgId: null };
    m.person = amina({ summary: summary() });
    m.api.setUserRole.mockResolvedValue({ ok: true });
    const tree = () => (
      <StoreProvider><I18nProvider lang="en"><MemoryRouter initialEntries={["/admin/people/s1?tab=account"]}>
        <Routes><Route path="/admin/people/:uid" element={<PersonDetail />} /></Routes>
      </MemoryRouter></I18nProvider></StoreProvider>
    );
    const r = render(tree());
    const panel = within(screen.getByRole("region", { name: "Role and organization" }));
    // A new role in the same organization: the row is mended once the profile is read again.
    fireEvent.change(panel.getByLabelText("Role"), { target: { value: "teacher" } });
    fireEvent.click(panel.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.reload).toHaveBeenCalled());
    expect(m.patched).toEqual([]); // nothing until the profile says what was saved
    m.person = amina({ role: "teacher", summary: summary() });
    r.rerender(tree());
    await waitFor(() => expect(m.patched).toEqual([["o1", "s1", { role: "teacher" }]]));
    expect(m.forgot).toBe(0); // no organization's list is thrown away
    // Out of the organization: the row leaves its list.
    fireEvent.change(panel.getByLabelText("Role"), { target: { value: "learner" } });
    fireEvent.click(panel.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.api.setUserRole).toHaveBeenCalledTimes(2));
    m.person = amina({ role: "learner", orgId: null, summary: summary() });
    r.rerender(tree());
    await waitFor(() => expect(m.dropped).toEqual([["o1", "s1"]]));
  });

  it("gives an org admin the role picker, and a teacher who left shows as a former teacher", async () => {
    m.person = amina({ teacherId: "gone", summary: summary() });
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=account" });
    expect(within(sectionOf("Account")).getByLabelText("Role")).toBeTruthy();
    const teacher = screen.getByLabelText("Teacher") as HTMLSelectElement;
    expect(teacher.selectedOptions[0].textContent).toBe("Former teacher");
  });

  it("saves a class, spaces tidied, and a teacher through the audited callable, and reads the person again", async () => {
    m.person = amina({ summary: summary() });
    m.api.updateMembers.mockResolvedValue({ updated: 1 });
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=account" });
    const input = screen.getByLabelText("Group") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  7   A " } });
    fireEvent.blur(input);
    await waitFor(() => expect(m.api.updateMembers).toHaveBeenCalledWith({ orgId: "o1", uids: ["s1"], patch: { group: "7 A" } }));
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(m.reload).toHaveBeenCalled();
    // Never the browser's own write to the profile (it left no audit entry); the lists already read follow without a read.
    expect(m.updates).toEqual([]);
    expect(m.patched).toEqual([["o1", "s1", { group: "7 A" }]]);
    const teacher = screen.getByLabelText("Teacher") as HTMLSelectElement;
    expect(teacher.options[0].textContent).toBe("No teacher");
    fireEvent.change(teacher, { target: { value: "a1" } });
    await waitFor(() => expect(m.api.updateMembers).toHaveBeenLastCalledWith({ orgId: "o1", uids: ["s1"], patch: { teacherId: "a1" } }));
    await waitFor(() => expect((screen.getByLabelText("Teacher") as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Teacher"), { target: { value: "" } });
    await waitFor(() => expect(m.api.updateMembers).toHaveBeenLastCalledWith({ orgId: "o1", uids: ["s1"], patch: { teacherId: null } }));
  });

  it("says a refused class in the admin's language", async () => {
    m.person = amina({ summary: summary() });
    m.api.updateMembers.mockRejectedValue(Object.assign(new Error("This organization is suspended."), { code: "functions/failed-precondition", details: { reason: "org-suspended" } }));
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=account" });
    const input = screen.getByLabelText("Group") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "8 B" } });
    fireEvent.blur(input);
    expect(await screen.findByText(enStaff["st.rf.orgSuspended"])).toBeTruthy();
    expect(m.patched).toEqual([]);
  });

  it("says the teachers couldn't be loaded and offers the read again, instead of a picker that stays grey", () => {
    m.person = amina({ summary: summary() });
    m.staffErr = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=account" });
    const note = screen.getByText(/The list of teachers couldn't be loaded/).closest("[role=alert]") as HTMLElement;
    expect(note.textContent).toContain(enStaff["st.err.permissionDenied"]);
    expect(note.textContent).not.toMatch(/insufficient permissions/);
    expect((screen.getByLabelText("Teacher") as HTMLSelectElement).disabled).toBe(true);
    m.reload.mockClear();
    fireEvent.click(within(note).getByRole("button", { name: "Retry" }));
    expect(m.reload).toHaveBeenCalledTimes(1);
  });

  it("asks before resetting a password, and a double click sends one reset", async () => {
    m.person = amina({ summary: summary() });
    let answer: (v: { login: string; password: string }) => void = () => {};
    m.api.resetMemberPassword.mockImplementation(() => new Promise((r) => { answer = r; }));
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=account" });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toMatch(/Reset .*Amina Bello.*'s password\?The current password stops working at once\./);
    expect(m.api.resetMemberPassword).not.toHaveBeenCalled();
    // Cancel has the focus: Enter on a question that just appeared resets nothing.
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Cancel" }));
    const yes = within(ask).getByRole("button", { name: "Yes, reset" });
    fireEvent.click(yes);
    fireEvent.click(yes);
    expect(m.api.resetMemberPassword).toHaveBeenCalledTimes(1);
    expect(m.api.resetMemberPassword).toHaveBeenCalledWith({ orgId: "o1", uid: "s1" });
    await act(async () => { answer({ login: "amina.b@users.darsiai.org", password: "9BSkqzWp!" }); });
    expect(await screen.findByText("9BSkqzWp!")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.patched).toEqual([["o1", "s1", { mustChangePassword: true }]]);
    // Cancelled: nothing is sent.
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.api.resetMemberPassword).toHaveBeenCalledTimes(1);
  });

  it("keeps an open question when a class is saved meanwhile (leaving the field saves it)", async () => {
    m.person = amina({ summary: summary() });
    m.api.updateMembers.mockResolvedValue({ updated: 1 });
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=account" });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    const input = screen.getByLabelText("Group") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "7 A" } });
    fireEvent.blur(input);
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(screen.getByRole("alertdialog").textContent).toMatch(/^Reset .*Amina Bello.*'s password\?/);
    expect(m.api.resetMemberPassword).not.toHaveBeenCalled();
  });

  it("suspends a login the organization made, with the reason asked in the confirmation, and restores it", async () => {
    m.person = amina({ summary: summary() });
    m.api.setMemberSuspended.mockResolvedValue({ suspended: true });
    const first = wrap(<PersonDetail />, { url: "/admin/people/s1?tab=account" });
    fireEvent.click(screen.getByRole("button", { name: "Suspend account" }));
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toMatch(/Suspend .*Amina Bello.*'s account\?/);
    expect(m.api.setMemberSuspended).not.toHaveBeenCalled();
    fireEvent.change(within(ask).getByLabelText("Reason (kept in the log)"), { target: { value: " Left the school " } });
    fireEvent.click(within(ask).getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(m.api.setMemberSuspended).toHaveBeenCalledWith({ orgId: "o1", uid: "s1", suspended: true, reason: "Left the school" }));
    expect(await screen.findByText("Suspended: they can't sign in, and their sessions have ended.")).toBeTruthy();
    expect(m.patched).toEqual([["o1", "s1", { suspended: true }]]);
    expect(m.reload).toHaveBeenCalled();
    first.unmount();
    // Suspended (the profile says when and by whom): the same button restores it, with no reason to give.
    m.person = amina({ summary: summary(), suspended: { at: 1, by: "admin1", byOrg: "o1" } });
    m.api.setMemberSuspended.mockResolvedValue({ suspended: false });
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=account" });
    fireEvent.click(within(sectionOf("Account")).getByRole("button", { name: "Restore account" }));
    const again = screen.getByRole("alertdialog");
    expect(within(again).queryByLabelText("Reason (kept in the log)")).toBeNull();
    fireEvent.click(within(again).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(m.api.setMemberSuspended).toHaveBeenLastCalledWith({ orgId: "o1", uid: "s1", suspended: false }));
    expect(await screen.findByText("Restored: they can sign in again.")).toBeTruthy();
  });

  it("offers suspension only for a login the organization manages, and says what to do when the server finds it isn't one", async () => {
    // Their own email: nothing to lock from here.
    m.person = amina({ email: "amina@gmail.com", summary: summary() });
    const own = wrap(<PersonDetail />, { url: "/admin/people/s1?tab=account" });
    expect(screen.queryByRole("button", { name: "Suspend account" })).toBeNull();
    own.unmount();
    // An email login the organization made (the server's word, `managed`), which the server then refuses all the same.
    m.person = amina({ email: "amina@school.org", managed: true, summary: summary() });
    m.api.setMemberSuspended.mockRejectedValue(Object.assign(new Error("This person signs in with their own email"), { code: "functions/failed-precondition", details: { reason: "own-login" } }));
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=account" });
    fireEvent.click(screen.getByRole("button", { name: "Suspend account" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Suspend" }));
    expect(await screen.findByText(/so the organization can't suspend it\. Remove them from the organization instead\./)).toBeTruthy();
    expect(m.patched).toEqual([]);
  });

  it("shows a reset password in its own left-to-right element, so Arabic can't move its last '!' (ux-orgadmin-reset-pw-bidi)", async () => {
    m.person = amina({ summary: summary() });
    m.api.resetMemberPassword.mockResolvedValue({ login: "amina.b@users.darsiai.org", password: "9BSkqzWp!" });
    wrap(<PersonDetail />, { lang: "ar", url: "/admin/people/s1?tab=account" });
    fireEvent.click(screen.getByRole("button", { name: ar["p.resetPw"] }));
    // Asked first, in Arabic.
    expect(screen.getByRole("alertdialog").textContent).toContain(arPeople["pp.resetOneBody"]);
    fireEvent.click(screen.getByRole("button", { name: arPeople["pp.resetYes"] }));
    const pw = await screen.findByText("9BSkqzWp!");
    expect(pw.tagName).toBe("CODE");
    expect(pw.getAttribute("dir")).toBe("ltr");
    const login = screen.getByText("amina.b", { selector: "code" });
    expect(login.getAttribute("dir")).toBe("ltr");
    // Nothing invisible is added to the text, so what is copied is exactly the password.
    expect(pw.closest("[role=status]")!.textContent).not.toMatch(/[\u0001\u0002⁦-⁩]/);
    expect(screen.getByRole("button", { name: "انسخ كلمة المرور" })).toBeTruthy();
  });

  it("opens a profile saved without a name or email instead of crashing (ux-accounts-04)", async () => {
    m.person = { uid: "s9", role: "student", orgId: "o1" };
    wrap(<PersonDetail />, { url: "/admin/people/s9" });
    expect(await screen.findByRole("heading", { level: 2 })).toHaveProperty("textContent", "—");
  });

  it("tells a teacher an old link is to someone else's student, not the rules' own words (ux-teacher-12)", () => {
    m.auth = { user: { uid: "t2" }, role: "teacher", orgId: "o1" };
    m.person = undefined;
    m.personErr = Object.assign(new Error("evaluation error at L91:22 for 'get' @ L91"), { code: "permission-denied" });
    wrap(<PersonDetail back="/teach" />, { url: "/admin/people/s13" });
    expect(screen.getByText("This person isn't one of your students. Their teacher may have changed.")).toBeTruthy();
    expect(screen.queryByText(/evaluation error/)).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("names someone outside an admin's organization, and a deleted account, instead of loading for ever", () => {
    m.person = undefined;
    m.personErr = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    const first = wrap(<PersonDetail />);
    expect(screen.getByText("This person isn't in your organization.")).toBeTruthy();
    first.unmount();
    m.auth = { user: { uid: "root" }, role: "superadmin", orgId: null };
    m.person = null; m.personErr = undefined;
    wrap(<PersonDetail />);
    expect(screen.getByText("This account no longer exists.")).toBeTruthy();
  });
});

describe("reviewing a project", () => {
  it("says when a review is refused, shows it saving, and keeps feedback within the rules' 5,000 characters (ux-teacher-12)", async () => {
    m.failUpdate = Object.assign(new Error("PERMISSION_DENIED"), { code: "permission-denied" });
    const onReviewed = vi.fn();
    wrap(<SubmissionCard uid="s1" sub={{ id: "p1", lessonId: "ai-1-1-1", unitId: "ai-1-1", text: "My project", status: "submitted" }} lessonTitle="Lesson one" onReviewed={onReviewed} />);
    expect((screen.getByLabelText("Feedback") as HTMLTextAreaElement).maxLength).toBe(5000);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("The review wasn't saved. Reload the page and try again.")).toBeTruthy();
    expect(onReviewed).not.toHaveBeenCalled();
    m.failUpdate = null;
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(onReviewed).toHaveBeenCalled());
    expect(screen.queryByText("The review wasn't saved. Reload the page and try again.")).toBeNull();
    expect(m.updates[0]).toMatchObject({ path: "users/s1/submissions/p1", data: { status: "approved" } });
  });
});

describe("the org dashboard", () => {
  const people = () => [
    { uid: "s1", name: "Amina Bello", email: "amina.b@users.darsiai.org", role: "student", orgId: "o1", summary: summary({ lessonsDone: 2, competencies: { "S.TA.U": 2 } }) },
    { uid: "s2", name: "Omar Said", email: "omar.s@users.darsiai.org", role: "student", orgId: "o1", group: "6B" },
    { uid: "t1", name: "Grace Adeyemi", email: "grace@school.org", role: "teacher", orgId: "o1" },
    { uid: "x9", email: "nameless@users.darsiai.org", role: "student", orgId: "o1" },
  ];
  beforeEach(() => { m.members = people(); m.org = { id: "o1", name: "Nile School", type: "school", status: "active", createdBy: "admin1" }; });

  it("lists competency coverage from the members' summaries, downloading no course (ux-orgadmin-dashboard-units)", async () => {
    wrap(<AdminHome />, { url: "/admin" });
    const cov = within(sectionOf("Capability coverage"));
    expect(cov.getByText("S.TA.U")).toBeTruthy();
    expect(cov.getByText("25%")).toBeTruthy(); // 1 of 4 members
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(m.loaded).toEqual([]);
  });

  it("lists a nameless member on People, not dropped", () => {
    wrap(<AdminHome />, { url: "/admin?tab=people" });
    expect(screen.getByText("nameless")).toBeTruthy();
    expect(within(screen.getByRole("table")).getAllByRole("link")).toHaveLength(4);
  });

  it("opens on Overview and reads the invite codes and the web addresses only when their tabs open", () => {
    wrap(<AdminHome />, { url: "/admin" });
    expect(tabNames()).toEqual(["Overview", "People", "Invite", "Look", "Sign-in & web address", "Activity"]); // no Super seats without a licence
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Overview" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Invite codes" })).toBeNull();
    expect(m.calls).toMatchObject({ invites: 0, sites: 0 });
    openTab("Invite");
    expect(screen.getByText("AAAA-BBBB-CCCC")).toBeTruthy();
    expect(m.calls.invites).toBeGreaterThan(0);
    expect(m.calls.sites).toBe(0);
    // The two ways to make accounts are on Invite too, with who may join (the policy panel) under the codes, and the
    // advice to import a large cohort (sign-ups from one network are limited each hour).
    const invite = within(screen.getByRole("tabpanel", { name: "Invite" }));
    expect(invite.getByRole("button", { name: "Add people" })).toBeTruthy();
    expect(invite.getByRole("button", { name: "Import from Excel" })).toBeTruthy();
    expect(invite.getByText("Who may join o1")).toBeTruthy();
    expect(invite.getByText(/^Adding more than about 100 people\? Import them from a spreadsheet instead/)).toBeTruthy();
    openTab("Sign-in & web address");
    expect(m.calls.sites).toBeGreaterThan(0);
    // The organization's own activity log is a tab of its own, mounted when opened.
    expect(screen.queryByText("The activity of o1")).toBeNull();
    openTab("Activity");
    expect(within(screen.getByRole("tabpanel", { name: "Activity" })).getByText("The activity of o1")).toBeTruthy();
  });

  it("shows the web address panel at ?tab=signin, with nothing of the other tabs read", () => {
    wrap(<AdminHome />, { url: "/admin?tab=signin" });
    expect(within(screen.getByRole("tabpanel", { name: "Sign-in & web address" })).getByRole("heading", { name: "Web address" })).toBeTruthy();
    expect(m.calls.sites).toBeGreaterThan(0);
    expect(m.calls.invites).toBe(0);
    expect(screen.queryByRole("heading", { name: "Capability coverage" })).toBeNull();
  });

  it("lists Super seats only for an organization with a licence, and ?tab=seats opens Overview without one", () => {
    const none = wrap(<AdminHome />, { url: "/admin?tab=seats" });
    expect(screen.queryByRole("tab", { name: "Super seats" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    none.unmount();
    m.org = { id: "o1", name: "Nile School", type: "school", status: "active", createdBy: "admin1", licence: { plan: "super", seats: 10, until: Date.now() + 864e5 } };
    wrap(<AdminHome />, { url: "/admin?tab=seats" });
    expect(tabNames()).toEqual(["Overview", "People", "Invite", "Super seats", "Look", "Sign-in & web address", "Activity"]);
    expect(within(screen.getByRole("tabpanel", { name: "Super seats" })).getByRole("heading", { level: 3 })).toBeTruthy();
  });

  it("leads from 'Projects to review' to People, and keeps what was ticked there over a visit to another tab", () => {
    m.members = [{ ...people()[0], projectsWaiting: 2 }, ...people().slice(1)];
    wrap(<AdminHome />, { url: "/admin" });
    // A real link (the keyboard reaches it and Enter opens it by itself; a new browser tab opens the same view), with
    // the look of base.css's .tile-link: no role, tabindex or inline cursor of its own.
    const tile = screen.getByText("Projects to review").closest(".tile") as HTMLElement;
    expect(tile.tagName).toBe("A");
    expect(tile).toBe(screen.getByRole("link", { name: /^Projects to review/ }));
    expect(tile.className).toBe("tile tile-link");
    expect(tile.getAttribute("href")).toBe("/admin?tab=people");
    expect(tile.hasAttribute("role") || tile.hasAttribute("tabindex") || tile.hasAttribute("style")).toBe(false);
    expect(within(tile).getByText("2")).toBeTruthy();
    // With a modifier the browser opens it itself (a new tab): the page doesn't hold the click or change its own tab.
    // (Read at the document, after the page's own handlers; then held there, so the test's DOM follows no link.)
    let heldByPage: boolean | null = null;
    document.addEventListener("click", (e) => { heldByPage = e.defaultPrevented; e.preventDefault(); }, { once: true });
    fireEvent.click(tile, { ctrlKey: true });
    expect(heldByPage).toBe(false);
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    // A plain click opens People in place.
    expect(fireEvent.click(tile)).toBe(false);
    expect(screen.getByRole("tab", { name: "People" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByLabelText("Select Omar Said"));
    fireEvent.change(screen.getByLabelText("Search by name, email or group"), { target: { value: "omar" } });
    openTab("Look");
    openTab("People");
    expect((screen.getByLabelText("Select Omar Said") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Search by name, email or group") as HTMLInputElement).value).toBe("omar");
  });

  it("leaves 'Projects to review' a plain tile, no link, when nothing waits", () => {
    m.members = people();
    wrap(<AdminHome />, { url: "/admin" });
    const tile = screen.getByText("Projects to review").closest(".tile") as HTMLElement;
    expect(tile.tagName).toBe("DIV");
    expect(tile.className).toBe("tile");
    expect(within(tile).getByText("0")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Projects to review/ })).toBeNull();
    fireEvent.click(tile);
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
  });

  it("shows what the last page did above the tabs, on People where its Back leads", () => {
    render(
      <StoreProvider><I18nProvider lang="en"><MemoryRouter initialEntries={[{ pathname: "/admin", search: "?tab=people", state: { done: "Amina was removed." } }]}>
        <Routes><Route path="/admin" element={<AdminHome />} /></Routes>
      </MemoryRouter></I18nProvider></StoreProvider>,
    );
    const note = screen.getByRole("status");
    expect(note.textContent).toBe("Amina was removed.");
    expect(note.closest("[role=tabpanel]")).toBeNull();
    // It stays when another tab is chosen (the tabs pass the page's state on).
    openTab("Overview");
    expect(screen.getByRole("status").textContent).toBe("Amina was removed.");
  });

  it("asks before making a new invite code, shows it worked, and shows a failure (ux-orgadmin-invite-regenerate)", async () => {
    m.api.regenerateInviteCode.mockResolvedValueOnce({ code: "NEWW-CODE-XXXX" }).mockRejectedValueOnce(Object.assign(new Error("internal"), { code: "functions/internal" }));
    wrap(<AdminHome />, { url: "/admin?tab=invite" });
    fireEvent.click(screen.getAllByRole("button", { name: "New code" })[0]);
    // Asked where the button is: the old code stops, and the new one does not take its last day or limit along.
    expect(screen.getByText("Make a new teacher code? The old code and its links stop working. Its last day and limit are not carried over.")).toBeTruthy();
    expect(m.api.regenerateInviteCode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Make a new code" }));
    await waitFor(() => expect(m.api.regenerateInviteCode).toHaveBeenCalledWith({ orgId: "o1", role: "teacher" }));
    // Said where the admin just pressed, not only far below in the rules form: the limits are gone, and where to set them.
    const made = await screen.findByText(/^New code made\. The old one no longer works\./);
    expect(made.textContent).toMatch(/no last day and no limit/);
    expect(made.textContent).toContain(`“${enRules["gv.pol.title"]}”`);
    expect(m.invitesReload).toHaveBeenCalled();
    // The rules under the codes are told which code is new: it has no last day, limit or uses now, whatever they read.
    expect(screen.getByText("Who may join o1 (new teacher code, 1)")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "New code" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Make a new code" }));
    // Never the SDK's own word ("internal"): what happened and what to do, in the admin's language.
    expect(await screen.findByText(enStaff["st.err.internal"])).toBeTruthy();
    expect(screen.queryByText("internal")).toBeNull();
    // A code that wasn't made is not said to be new.
    expect(screen.getByText("Who may join o1 (new teacher code, 1)")).toBeTruthy();
  });

  it("a new code's words say its last day and limit are gone, in both languages, naming the rules form by its own heading", () => {
    expect(enAdmin["inv.newDone"]).toContain(`“${enRules["gv.pol.title"]}”`);
    expect(arAdmin["inv.newDone"]).toContain(`«${arRules["gv.pol.title"]}»`);
    expect(arAdmin["inv.newDone"]).toContain("بلا يوم أخير وبلا حد أقصى");
    for (const key of ["inv.newConfirmTeacher", "inv.newConfirmStudent"] as const) {
      expect(enAdmin[key], key).toMatch(/last day and limit are not carried over/);
      expect(arAdmin[key], key).toContain("اليوم الأخير ولا الحد الأقصى");
    }
  });

  it("says 'Copied' only when the clipboard took it; otherwise shows the code selected, to copy by hand", async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      wrap(<AdminHome />, { url: "/admin?tab=invite" });
      const [copyTeacher, copyStudent] = screen.getAllByRole("button", { name: "Copy" });
      fireEvent.click(copyTeacher);
      expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
      expect(writeText).toHaveBeenCalledWith("AAAA-BBBB-CCCC");
      fireEvent.click(copyStudent);
      const note = (await screen.findByText("It couldn't be copied for you. It is selected below: copy it yourself.")).closest("[role=status]") as HTMLElement;
      expect(within(note).getByText("DDDD-EEEE-FFFF").tagName).toBe("CODE");
      expect(String(getSelection())).toBe("DDDD-EEEE-FFFF");
      // The student code never said "Copied" (the teacher's still does, for a moment).
      expect(copyStudent.textContent).toBe("Copy");
    } finally { Reflect.deleteProperty(navigator, "clipboard"); }
  });

  it("says the invite codes couldn't be read, with Retry, instead of '…' for ever", () => {
    // useInvites as it answers a failed read: no data, an error.
    m.invitesErr = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    wrap(<AdminHome />, { url: "/admin?tab=invite" });
    const note = within(screen.getByRole("tabpanel", { name: "Invite" })).getByRole("alert");
    expect(note.textContent).toContain(enStaff["st.err.permissionDenied"]);
    expect(note.textContent).not.toMatch(/insufficient permissions/);
    fireEvent.click(within(note).getByRole("button", { name: "Retry" }));
    expect(m.invitesReload).toHaveBeenCalledTimes(1);
  });

  it("gives several people a class or a teacher at once, through the audited callable (feat-org-bulk-classes)", async () => {
    m.api.updateMembers.mockImplementation(async ({ uids }: { uids: string[] }) => ({ updated: uids.length }));
    wrap(<AdminHome />, { url: "/admin?tab=people" });
    fireEvent.click(screen.getByLabelText("Select Amina Bello"));
    fireEvent.click(screen.getByLabelText("Select Grace Adeyemi"));
    expect(screen.getByText("Selected: 2")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Class (choose or type)"), { target: { value: " 7   A " } });
    fireEvent.click(screen.getByRole("button", { name: "Set class" }));
    await waitFor(() => expect(m.api.updateMembers).toHaveBeenCalledWith({ orgId: "o1", uids: ["s1", "t1"], patch: { group: "7 A" } }));
    expect(await screen.findByText("Saved. People updated: 2.")).toBeTruthy();
    // The rows are changed in place: the list is not read again (5,000 members were, after every single action).
    expect(m.patch).toHaveBeenCalledWith(["s1", "t1"], { group: "7 A" });
    expect(m.reload).not.toHaveBeenCalled();
    expect(m.updates).toEqual([]);
    // A teacher goes only to the students selected, and only once one is chosen.
    fireEvent.click(screen.getByLabelText("Select Omar Said"));
    fireEvent.click(screen.getByLabelText("Select Grace Adeyemi"));
    const setTeacher = screen.getByRole("button", { name: "Set teacher" }) as HTMLButtonElement;
    expect((screen.getByLabelText("Teacher") as HTMLSelectElement).selectedOptions[0].textContent).toBe("Choose a teacher…");
    expect(setTeacher.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Teacher"), { target: { value: "t1" } });
    expect(setTeacher.disabled).toBe(false);
    fireEvent.click(setTeacher);
    await waitFor(() => expect(m.api.updateMembers).toHaveBeenLastCalledWith({ orgId: "o1", uids: ["s2"], patch: { teacherId: "t1" } }));
    await waitFor(() => expect(m.patch).toHaveBeenLastCalledWith(["s2"], { teacherId: "t1" }));
  });

  it("asks before taking the teacher away from the students selected ('No teacher' is a choice, not the default)", async () => {
    m.api.updateMembers.mockResolvedValue({ updated: 2 });
    wrap(<AdminHome />, { url: "/admin?tab=people" });
    for (const name of ["Amina Bello", "Omar Said", "Grace Adeyemi"]) fireEvent.click(screen.getByLabelText(`Select ${name}`));
    fireEvent.change(screen.getByLabelText("Teacher"), { target: { value: "-" } });
    expect((screen.getByLabelText("Teacher") as HTMLSelectElement).selectedOptions[0].textContent).toBe("No teacher");
    fireEvent.click(screen.getByRole("button", { name: "Set teacher" }));
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toMatch(/^Remove the teacher from 2 students\?/); // the teacher ticked is no student
    expect(m.api.updateMembers).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.api.updateMembers).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Set teacher" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Yes, remove the teacher" }));
    await waitFor(() => expect(m.api.updateMembers).toHaveBeenCalledWith({ orgId: "o1", uids: ["s1", "s2"], patch: { teacherId: null } }));
    expect(await screen.findByText("Saved. People updated: 2.")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("removes several people after asking, lists the one the server refused with its reason, and reads nothing again", async () => {
    m.api.bulkMembers.mockResolvedValue({ results: [{ uid: "s1", ok: true }, { uid: "s2", ok: true }, { uid: "t1", ok: false, reason: "last-admin" }] });
    wrap(<AdminHome />, { url: "/admin?tab=people" });
    for (const name of ["Amina Bello", "Omar Said", "Grace Adeyemi"]) fireEvent.click(screen.getByLabelText(`Select ${name}`));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toMatch(/^Remove 3 people from the organization\?They are signed out on every device/);
    expect(m.api.bulkMembers).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(m.api.bulkMembers).toHaveBeenCalledWith({ orgId: "o1", uids: ["s1", "s2", "t1"], action: "remove" }));
    expect(await screen.findByText("Removed from the organization: 2. Not done: 1. They are still selected, with the reason for each below.")).toBeTruthy();
    const refused = within(screen.getByRole("list", { name: "Not done, and why" })).getAllByRole("listitem");
    expect(refused.map((li) => li.textContent)).toEqual(["Grace Adeyemi: This is the organization's only admin. Make someone else its admin first."]);
    // The two removed leave the rows already read; the one refused stays ticked, to try again.
    expect(m.drop).toHaveBeenCalledWith(["s1", "s2"]);
    expect(m.reload).not.toHaveBeenCalled();
    expect(screen.getByText("Selected: 1")).toBeTruthy();
    expect((screen.getByLabelText("Select Grace Adeyemi") as HTMLInputElement).checked).toBe(true);
  });

  it("suspends with the reason asked in the confirmation, and restores, marking the rows without a read", async () => {
    m.api.bulkMembers.mockImplementation(async ({ uids }: { uids: string[] }) => ({ results: uids.map((uid) => ({ uid, ok: true })) }));
    wrap(<AdminHome />, { url: "/admin?tab=people" });
    fireEvent.click(screen.getByLabelText("Select Amina Bello"));
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toMatch(/^Suspend 1 account\?/);
    fireEvent.change(within(ask).getByLabelText("Reason (kept in the log)"), { target: { value: "Left in June" } });
    fireEvent.click(within(ask).getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(m.api.bulkMembers).toHaveBeenCalledWith({ orgId: "o1", uids: ["s1"], action: "suspend", reason: "Left in June" }));
    expect(await screen.findByText("Suspended: 1.")).toBeTruthy();
    expect(m.patch).toHaveBeenCalledWith(["s1"], { suspended: true });
    fireEvent.click(screen.getByLabelText("Select Amina Bello"));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(m.api.bulkMembers).toHaveBeenLastCalledWith({ orgId: "o1", uids: ["s1"], action: "restore" }));
    await waitFor(() => expect(m.patch).toHaveBeenLastCalledWith(["s1"], { suspended: false }));
    expect(m.reload).not.toHaveBeenCalled();
  });

  it("marks a suspended member in the table", () => {
    m.members = [{ ...people()[0], suspended: true }, ...people().slice(1)];
    wrap(<AdminHome />, { url: "/admin?tab=people" });
    expect(within(screen.getByRole("link", { name: /Amina Bello/ }).closest("tr") as HTMLElement).getByText("Suspended")).toBeTruthy();
    expect(within(screen.getByRole("link", { name: /Omar Said/ }).closest("tr") as HTMLElement).queryByText("Suspended")).toBeNull();
  });

  it("resets several passwords and shows them once as slips to download or print, kept over a look at another tab", async () => {
    m.api.bulkMembers.mockResolvedValue({ results: [{ uid: "s1", ok: true, login: "amina.b@users.darsiai.org", password: "pw-amina" }, { uid: "t1", ok: false, reason: "own-login" }] });
    wrap(<AdminHome />, { url: "/admin?tab=people" });
    fireEvent.click(screen.getByLabelText("Select Amina Bello"));
    fireEvent.click(screen.getByLabelText("Select Grace Adeyemi"));
    fireEvent.click(screen.getByRole("button", { name: "Reset passwords and download slips" }));
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toMatch(/^Reset the passwords of 2 people\?Their current passwords stop working at once\./);
    expect(m.api.bulkMembers).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole("button", { name: "Yes, reset" }));
    await waitFor(() => expect(m.api.bulkMembers).toHaveBeenCalledWith({ orgId: "o1", uids: ["s1", "t1"], action: "resetPassword" }));
    // The results component of Add people: the table, the slips, Download and Print.
    expect((await screen.findAllByText("pw-amina")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Download credentials (Excel)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print login slips" })).toBeTruthy();
    // Said as resets of accounts people already have, never as accounts created.
    expect(screen.getByRole("heading", { name: "New passwords" })).toBeTruthy();
    expect(screen.getByText("1 password reset")).toBeTruthy();
    expect(screen.getByText("1 not reset")).toBeTruthy();
    expect(screen.getByText("Password reset")).toBeTruthy(); // the row's status
    expect(screen.queryByRole("heading", { name: "Accounts ready" })).toBeNull();
    expect(screen.queryByText(/\bcreated\b/i)).toBeNull();
    expect(screen.getByText(/^Error — This person signs in with their own email or Google account/)).toBeTruthy();
    expect(screen.getByText("New passwords made: 1. Not done: 1. They are still selected, with the reason for each below.")).toBeTruthy();
    expect(m.patch).toHaveBeenCalledWith(["s1"], { mustChangePassword: true });
    // Another tab of the page loses nothing (the panel is kept while hidden): no question, and they are there on return.
    openTab("Look");
    expect(screen.getByRole("tab", { name: "Look" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    openTab("People");
    expect(screen.getAllByText("pw-amina").length).toBeGreaterThan(0);
    // Saved: back to the list, where the person it didn't work for is still ticked.
    fireEvent.click(screen.getByRole("button", { name: "I have saved them: back to the list" }));
    expect(screen.queryByText("pw-amina")).toBeNull();
    expect((screen.getByLabelText("Select Grace Adeyemi") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Select Amina Bello") as HTMLInputElement).checked).toBe(false);
  });

  it("asks once before the admin leaves the page with new passwords not yet downloaded or printed", async () => {
    m.api.bulkMembers.mockResolvedValue({ results: [{ uid: "s1", ok: true, login: "amina.b@users.darsiai.org", password: "pw-amina" }] });
    render(
      <StoreProvider><I18nProvider lang="en"><MemoryRouter initialEntries={["/admin?tab=people"]}>
        <Link to="/learn">Learn</Link>
        <Routes><Route path="/admin" element={<AdminHome />} /><Route path="/learn" element={<p>Learning</p>} /></Routes>
      </MemoryRouter></I18nProvider></StoreProvider>,
    );
    fireEvent.click(screen.getByLabelText("Select Amina Bello"));
    fireEvent.click(screen.getByRole("button", { name: "Reset passwords and download slips" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Yes, reset" }));
    expect((await screen.findAllByText("pw-amina")).length).toBeGreaterThan(0);
    await act(async () => {}); // the guard starts in an effect, after the passwords are on the page
    // A link out of the page is held by the results themselves (Add people's guard), which offer the download first.
    fireEvent.click(screen.getByRole("link", { name: "Learn" }));
    const asks = screen.getAllByRole("alertdialog");
    expect(asks).toHaveLength(1);
    expect(asks[0].textContent).toMatch(/^Leave without the passwords\?/);
    expect(within(asks[0]).getByRole("button", { name: "Download first" })).toBeTruthy();
    expect(screen.queryByText("Learning")).toBeNull();
    // "Leave anyway" leaves: the same thing is not asked a second time by the panel around them.
    fireEvent.click(within(asks[0]).getByRole("button", { name: "Leave anyway" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Learning")).toBeTruthy();
  });

  it("says why a login can't be suspended, not the password sentence, for someone with their own sign-in", async () => {
    m.api.bulkMembers.mockResolvedValue({ results: [{ uid: "s1", ok: true }, { uid: "t1", ok: false, reason: "own-login" }] });
    wrap(<AdminHome />, { url: "/admin?tab=people" });
    fireEvent.click(screen.getByLabelText("Select Amina Bello"));
    fireEvent.click(screen.getByLabelText("Select Grace Adeyemi"));
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Suspend" }));
    const refused = within(await screen.findByRole("list", { name: "Not done, and why" })).getAllByRole("listitem");
    expect(refused.map((li) => li.textContent)).toEqual(["Grace Adeyemi: This person signs in with their own email or Google account, so the organization can't suspend it. Remove them from the organization instead."]);
  });

  it("drops a question about the people selected when nobody is selected any more", () => {
    wrap(<AdminHome />, { url: "/admin?tab=people" });
    fireEvent.click(screen.getByLabelText("Select Amina Bello"));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Ticking someone later is only that: the removal isn't asked about again by itself.
    fireEvent.click(screen.getByLabelText("Select Omar Said"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.api.bulkMembers).not.toHaveBeenCalled();
  });

  it("sends more than 200 people in turns of 200, and stops with what was done when a call fails", async () => {
    m.members = Array.from({ length: 450 }, (_, i) => ({ uid: `u${String(i).padStart(3, "0")}`, name: `Pupil ${String(i).padStart(3, "0")}`, email: `p${i}@users.darsiai.org`, role: "student", orgId: "o1" }));
    m.api.bulkMembers
      .mockImplementationOnce(async ({ uids }: { uids: string[] }) => ({ results: uids.map((uid) => ({ uid, ok: true })) }))
      .mockImplementationOnce(async ({ uids }: { uids: string[] }) => ({ results: uids.map((uid) => ({ uid, ok: true })) }))
      .mockRejectedValueOnce(Object.assign(new Error("deadline"), { code: "functions/deadline-exceeded" }));
    wrap(<AdminHome />, { url: "/admin?tab=people" });
    fireEvent.click(screen.getByLabelText("Select everyone matching"));
    expect(screen.getByText("Selected: 450")).toBeTruthy(); // everyone the search matches, not only the 100 rows drawn
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(m.api.bulkMembers).toHaveBeenCalledTimes(3));
    expect(m.api.bulkMembers.mock.calls.map((c) => (c[0] as { uids: string[] }).uids.length)).toEqual([200, 200, 50]);
    expect(await screen.findByText(`Suspended: 400. This stopped after 400 of 450. The rest are still selected: try them again. ${enStaff["st.err.deadlineExceeded"]}`)).toBeTruthy();
    expect(screen.getByText("Selected: 50")).toBeTruthy();
  });

  it("draws 100 rows of a long list, then 100 more each time", () => {
    m.members = Array.from({ length: 230 }, (_, i) => ({ uid: `u${i}`, name: `Pupil ${String(i).padStart(3, "0")}`, email: `p${i}@users.darsiai.org`, role: "student", orgId: "o1" }));
    wrap(<AdminHome />, { url: "/admin?tab=people" });
    const linked = () => within(screen.getByRole("table")).getAllByRole("link").length;
    expect(linked()).toBe(100);
    expect(screen.getByText("Showing 100 of 230")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show 100 more" }));
    expect(linked()).toBe(200);
    fireEvent.click(screen.getByRole("button", { name: "Show 30 more" }));
    expect(linked()).toBe(230);
    expect(screen.queryByRole("button", { name: /^Show \d+ more$/ })).toBeNull();
    // A search starts at the top again; the export is of everyone it matches, drawn or not.
    fireEvent.change(screen.getByLabelText("Search by name, email or group"), { target: { value: "pupil 1" } });
    expect(linked()).toBe(100);
    expect(screen.getByRole("button", { name: "Export CSV (only the 100 shown)" })).toBeTruthy();
  });

  it("goes back from Add people and from Import to the dashboard's People tab", () => {
    for (const [path, ui] of [["/admin/add", <AddPeople key="a" />], ["/admin/import", <ImportPeople key="i" />]] as const) {
      const page = render(
        <StoreProvider><I18nProvider lang="en"><MemoryRouter initialEntries={[path]}>
          <Routes><Route path="/admin" element={<AdminHome />} /><Route path="*" element={ui} /></Routes>
        </MemoryRouter></I18nProvider></StoreProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.getByRole("tab", { name: "People" }).getAttribute("aria-selected")).toBe("true");
      expect(screen.getByRole("table")).toBeTruthy();
      page.unmount();
    }
  });

  it("says 'Loading…' on Look only while the organization is being read, and says a read that failed above the tabs", () => {
    m.org = null; m.orgLoading = true;
    const first = wrap(<AdminHome />, { url: "/admin?tab=look" });
    expect(within(screen.getByRole("tabpanel", { name: "Look" })).getByText("Loading…")).toBeTruthy();
    first.unmount();
    // The read failed: no "Loading…" for ever in the panel; the page says why, whichever tab is open.
    m.orgLoading = false; m.orgErr = Object.assign(new Error("offline"), { code: "unavailable" });
    wrap(<AdminHome />, { url: "/admin?tab=look" });
    expect(screen.queryByText("Loading…")).toBeNull();
    const note = document.querySelector(".notice.err")!;
    expect(note.textContent).toBeTruthy();
    expect(note.closest("[role=tabpanel]")).toBeNull();
  });

  it("has a Refresh button at the end of the tab row, since nothing is pushed live (ux-orgadmin-live-listeners)", () => {
    wrap(<AdminHome />, { url: "/admin" });
    const refresh = screen.getByRole("button", { name: "Refresh" });
    expect(refresh.closest("[role=tabpanel]")).toBeNull(); // one for the page, whichever tab is open
    // Not on a line of its own above the tabs (100 px of every first screen): in the tabs' bar, after the list and
    // outside it, so the keyboard reaches it after the tabs and it is never one of them.
    const list = screen.getByRole("tablist");
    expect(list.contains(refresh)).toBe(false);
    expect(refresh.closest(".tb-action")?.parentElement).toBe(list.parentElement);
    expect(list.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // On a phone only its icon shows: its words stay in the button, as its name (and as a tooltip).
    expect(refresh.querySelector(".dr-btn-label")?.textContent).toBe("Refresh");
    expect(refresh.getAttribute("title")).toBe("Refresh");
    fireEvent.click(refresh);
    expect(m.reload).toHaveBeenCalledTimes(2); // the organization and its members
    // The invite codes were never read (their tab wasn't opened), so they aren't read now either.
    expect(m.invitesReload).not.toHaveBeenCalled();
    openTab("Invite");
    openTab("People");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(m.invitesReload).toHaveBeenCalledTimes(1); // once read, read again, even from another tab
    expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);
  });

  // The join rules (and "People who were removed") are their own one-off read under the codes: Refresh has them read
  // again too, or a person removed on People is missing from that list until the whole page is loaded again.
  it("Refresh has the join rules under the codes read again as well, once the Invite tab was opened (r5-staff-ui-r5)", () => {
    wrap(<AdminHome />, { url: "/admin?tab=invite" });
    expect(screen.getByText("Who may join o1")).toBeTruthy(); // its first read: nothing asked again
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByText("Who may join o1 (read again, 1)")).toBeTruthy();
    openTab("People");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByText("Who may join o1 (read again, 2)")).toBeTruthy();
    expect(m.invitesReload).toHaveBeenCalledTimes(2);
  });

  it("people removed on People: the Invite tab's join rules are read again (their removed list), not the codes", async () => {
    m.api.bulkMembers.mockResolvedValue({ results: [{ uid: "s1", ok: true }, { uid: "t1", ok: false, reason: "last-admin" }] });
    wrap(<AdminHome />, { url: "/admin?tab=invite" });
    openTab("People");
    // Suspending removes nobody: nothing is read again.
    fireEvent.click(screen.getByLabelText("Select Amina Bello"));
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(m.api.bulkMembers).toHaveBeenCalledTimes(1));
    await screen.findByText(/^Suspended: 1\./);
    expect(screen.getByText("Who may join o1")).toBeTruthy();
    for (const name of ["Grace Adeyemi"]) fireEvent.click(screen.getByLabelText(`Select ${name}`));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(screen.getByText("Who may join o1 (read again, 1)")).toBeTruthy());
    expect(m.invitesReload).not.toHaveBeenCalled();
  });
});

describe("while staff pages load, on your own page, and when the server refuses (release walk-through)", () => {
  const nile = { id: "o1", name: "Nile School", type: "school", status: "active", createdBy: "admin1" };
  /** The person page and the dashboard it goes back to, as the app routes them. */
  const pages = (lang = "en") => render(
    <StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={["/admin/people/s1?tab=account"]}>
      <Routes><Route path="/admin/people/:uid" element={<PersonDetail />} /><Route path="/admin" element={<AdminHome />} /></Routes>
    </MemoryRouter></I18nProvider></StoreProvider>,
  );

  it("says the dashboard is loading, never 'Members 0' or 'No people yet' (which invited a second import)", () => {
    m.membersLoading = true; m.org = nile;
    wrap(<AdminHome />, { url: "/admin" });
    // No tile and no coverage until the whole list is here: a number worked out from part of it would be wrong.
    expect(document.querySelector(".tile")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Capability coverage" })).toBeNull();
    expect(screen.queryByText("No people yet")).toBeNull();
    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
    // The People tab too, where "No people yet" would show.
    openTab("People");
    expect(screen.queryByText("No people yet")).toBeNull();
    expect(within(screen.getByRole("tabpanel", { name: "People" })).getByText("Loading…")).toBeTruthy();
  });

  it("counts members by their role names, in capitals and plural", () => {
    m.org = nile;
    m.members = [amina(), { uid: "t1", name: "Grace", role: "teacher", orgId: "o1" }, { uid: "a1", name: "Bola", role: "orgAdmin", orgId: "o1" }];
    wrap(<AdminHome />, { url: "/admin" });
    // One list item per role, so a role's name never parts from its number at the end of a line, and no "·" between them.
    const members = screen.getByText("Members", { selector: ".tile span" }).closest(".tile") as HTMLElement;
    expect(within(members).getAllByRole("listitem").map((x) => x.textContent)).toEqual(["Teachers: 1", "Students: 1", "Admins: 1"]);
    expect(members.textContent).not.toContain("·");
    openTab("People");
    expect(within(screen.getByRole("table")).getAllByText("Student").length).toBeGreaterThan(0); // the table's role column
  });

  it("shows a person's projects as loading, not 'No projects submitted yet'", () => {
    m.person = amina({ summary: summary() }); m.subsLoading = true;
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=projects" });
    // The "Projects" number left the stats (it forced reading every project to open the page): the list says it loads.
    expect(screen.queryByText("Projects", { selector: "dt" })).toBeNull();
    expect(within(sectionOf("Projects")).getByText("Loading…")).toBeTruthy();
    expect(screen.queryByText("No projects submitted yet.")).toBeNull();
  });

  it("reads one document to open a person's page, and each tab's own data when that tab opens", async () => {
    m.person = amina({ projectsWaiting: 2, summary: summary({ lessonsDone: 1, units: { "ai-1-1": 1 } }) });
    m.progress = [row("ai-1-1-1", "ai-1-1")];
    m.subs = [{ id: "p1", lessonId: "iot-1-2-2", unitId: "iot-1-2", text: "My sensor", status: "submitted" }];
    wrap(<PersonDetail />);
    // Progress, the default: the profile's own summary, nothing else read or downloaded.
    expect(screen.getByRole("tab", { name: "Progress" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Capabilities" })).toBeTruthy();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(m.calls).toMatchObject({ progress: 0, subs: 0, certs: 0, staff: 0 });
    expect(m.loaded).toEqual([]);
    // The Projects tab is named with the count waiting, from the profile.
    expect(tabNames()).toEqual(["Progress", "Courses", "Projects 2", "Account"]);
    openTab("Courses");
    expect(await screen.findByText("Lesson one")).toBeTruthy();
    expect(m.calls.progress).toBeGreaterThan(0);
    expect(m.calls.certs).toBeGreaterThan(0);
    expect(m.calls).toMatchObject({ subs: 0, staff: 0 });
    openTab("Projects 2");
    expect(await screen.findByText("My sensor")).toBeTruthy();
    expect(m.calls.subs).toBeGreaterThan(0);
    expect(m.calls.staff).toBe(0);
    openTab("Account");
    expect(screen.getByLabelText("Teacher")).toBeTruthy();
    expect(m.calls.staff).toBeGreaterThan(0);
  });

  it("reads the person again after a review, so the tab's count follows", async () => {
    m.person = amina({ projectsWaiting: 1, summary: summary() });
    m.subs = [{ id: "p1", lessonId: "iot-1-2-2", unitId: "iot-1-2", text: "My sensor", status: "submitted" }];
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=projects" });
    expect(screen.getByRole("tab", { name: "Projects 1" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(m.reload).toHaveBeenCalledTimes(2)); // the submissions and the person
    expect(m.updates[0]).toMatchObject({ path: "users/s1/submissions/p1", data: { status: "approved" } });
  });

  it("counts the projects waiting from the list once it is read, not from a profile the server hasn't updated yet", async () => {
    // Just after a review the profile still says 2 (its count is set by a trigger a moment later); the list read says 1.
    m.person = amina({ projectsWaiting: 2, summary: summary() });
    m.subs = [{ id: "p1", lessonId: "iot-1-2-2", unitId: "iot-1-2", text: "My sensor", status: "submitted" }, { id: "p2", lessonId: "iot-1-2-3", unitId: "iot-1-2", text: "Done before", status: "approved" }];
    const first = wrap(<PersonDetail />);
    expect(tabNames()).toContain("Projects 2"); // not read yet: the profile's own number
    openTab("Projects 2");
    expect(await screen.findByRole("tab", { name: "Projects 1" })).toBeTruthy();
    first.unmount();
    // Nothing left waiting: no number at all.
    m.subs = [{ id: "p2", lessonId: "iot-1-2-3", unitId: "iot-1-2", text: "Done before", status: "approved" }];
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=projects" });
    await waitFor(() => expect(tabNames()).toContain("Projects"));
  });

  it("gives a teacher no Account tab, and ?tab=account opens Progress for them", () => {
    m.auth = { user: { uid: "t1" }, role: "teacher", orgId: "o1" };
    m.person = amina({ summary: summary() });
    wrap(<PersonDetail back="/teach" />, { url: "/admin/people/s1?tab=account" });
    expect(tabNames()).toEqual(["Progress", "Courses", "Projects"]);
    expect(screen.getByRole("tab", { name: "Progress" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("heading", { name: "Account" })).toBeNull();
    expect(m.calls.staff).toBe(0);
  });

  it("offers no role change, password reset, removal or deletion on your own page", () => {
    m.auth = { user: { uid: "a1" }, role: "orgAdmin", orgId: "o1" };
    m.person = { uid: "a1", name: "Bola Admin", email: "bola@users.darsiai.org", role: "orgAdmin", orgId: "o1", summary: summary() };
    wrap(<PersonDetail />, { url: "/admin/people/a1?tab=account" });
    const acct = within(sectionOf("Account"));
    expect(acct.queryByLabelText("Role")).toBeNull();
    expect(acct.queryByRole("button", { name: "Reset password" })).toBeNull();
    expect(acct.queryByRole("button", { name: "Remove from organization" })).toBeNull();
    expect(acct.getByText(/This is your own account/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete account and data" })).toBeNull();
  });

  it("says a refusal in the admin's language from its reason code, and puts the saved role back", async () => {
    m.person = amina({ summary: summary() });
    m.api.setMemberRole.mockRejectedValue(Object.assign(new Error("Not a member of this organization."), { code: "functions/not-found", details: { reason: "not-member" } }));
    wrap(<PersonDetail />, { lang: "ar", url: "/admin/people/s1?tab=account" });
    const role = within(sectionOf(ar["p.actions"])).getByLabelText(ar["col.role"]) as HTMLSelectElement;
    fireEvent.change(role, { target: { value: "teacher" } });
    fireEvent.click(screen.getByRole("button", { name: ar["p.saveRole"] }));
    // A new role signs the person out: asked first, naming the role.
    expect(screen.getByRole("alertdialog").textContent).toContain(arAdmin["rn.teacher"]);
    expect(m.api.setMemberRole).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: arPeople["pp.roleYes"] }));
    expect(await screen.findByText("لم يعد هذا الشخص عضوًا في هذه المؤسسة. حدّث الصفحة.")).toBeTruthy();
    expect(m.api.setMemberRole).toHaveBeenCalledWith({ orgId: "o1", uid: "s1", role: "teacher" });
    expect(screen.queryByText(/Not a member/)).toBeNull();
    expect(role.value).toBe("student");
    expect(m.patched).toEqual([]);
    // A code this phone doesn't know yet: one sentence in the admin's language, never the server's English.
    m.api.setMemberRole.mockRejectedValue(Object.assign(new Error("FirebaseError: Something new [400]"), { details: { reason: "brand-new" } }));
    fireEvent.change(role, { target: { value: "teacher" } });
    fireEvent.click(screen.getByRole("button", { name: ar["p.saveRole"] }));
    fireEvent.click(screen.getByRole("button", { name: arPeople["pp.roleYes"] }));
    expect(await screen.findByText(arStaff["st.err.generic"])).toBeTruthy();
    expect(screen.queryByText(/Something new/)).toBeNull();
  });

  it("saves a role once it is confirmed, and the lists already read follow", async () => {
    m.person = amina({ summary: summary() });
    m.api.setMemberRole.mockResolvedValue({ ok: true });
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=account" });
    const save = within(sectionOf("Account")).getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // nothing chosen yet
    fireEvent.change(within(sectionOf("Account")).getByLabelText("Role"), { target: { value: "teacher" } });
    fireEvent.click(save);
    expect(screen.getByRole("alertdialog").textContent).toMatch(/^Change .*Amina Bello.*'s role to Teacher\?/);
    fireEvent.click(screen.getByRole("button", { name: "Yes, change the role" }));
    await waitFor(() => expect(m.api.setMemberRole).toHaveBeenCalledWith({ orgId: "o1", uid: "s1", role: "teacher" }));
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(m.patched).toEqual([["o1", "s1", { role: "teacher" }]]);
  });

  it("asks on the page before removing someone (no browser dialog), and the dashboard says it was done", async () => {
    const dialog = vi.spyOn(window, "confirm");
    m.person = amina({ summary: summary() }); m.org = nile; m.members = [];
    m.api.removeMember.mockResolvedValue({ ok: true });
    pages();
    fireEvent.click(screen.getByRole("button", { name: "Remove from organization" }));
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toMatch(/^Remove .*Amina Bello.* from the organization\? They are signed out on every device/);
    // The safe answer has the focus (staff/InlineConfirm), and Escape closes the question without removing anyone.
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(ask, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove from organization" }));
    expect(m.api.removeMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(m.api.removeMember).toHaveBeenCalledWith({ orgId: "o1", uid: "s1" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/Amina Bello.* was removed from the organization\./);
    expect(m.dropped).toEqual([["o1", "s1"]]); // out of the lists already read, with no read
    // The default Back is the dashboard's People tab, where the list no longer has them.
    expect(screen.getByRole("tab", { name: "People" }).getAttribute("aria-selected")).toBe("true");
    expect(dialog).not.toHaveBeenCalled();
    dialog.mockRestore();
  });

  it("cancels a removal, and says why one was refused", async () => {
    m.person = amina({ summary: summary() });
    m.api.removeMember.mockRejectedValue(Object.assign(new Error("This is the organization's only admin."), { details: { reason: "last-admin" } }));
    wrap(<PersonDetail />, { url: "/admin/people/s1?tab=account" });
    fireEvent.click(screen.getByRole("button", { name: "Remove from organization" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove from organization" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    expect(await screen.findByText("This is the organization's only admin. Make someone else its admin first.")).toBeTruthy();
  });

  it("says the account was deleted where the admin lands", async () => {
    m.person = amina({ summary: summary() }); m.org = nile; m.members = [];
    m.api.deleteAccount.mockResolvedValue({ ok: true });
    pages();
    fireEvent.click(screen.getByRole("button", { name: "Delete account and data" }));
    fireEvent.change(screen.getByLabelText("To confirm, type delete"), { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    await waitFor(() => expect(m.api.deleteAccount).toHaveBeenCalledWith({ uid: "s1" }));
    await waitFor(() => expect(m.dropped).toEqual([["o1", "s1"]]));
    expect((await screen.findByRole("status")).textContent).toMatch(/Amina Bello.*'s account and data were deleted\./);
    expect(screen.getByRole("tab", { name: "People" }).getAttribute("aria-selected")).toBe("true");
  });

  it("titles a capstone milestone by its own name, not its lesson's", () => {
    const step = { type: "project", id: "project-m2", prompt: { en: "Milestone 2: A baseline\nTrain it." }, task: { en: "" }, deliverable: { en: "" } };
    wrap(<SubmissionCard uid="s1" sub={{ id: "p1", lessonId: "ai-capstone-submission", unitId: "ai-capstone", stepId: "project-m2", text: "Repo", status: "submitted", capstone: true } as never}
      lessonTitle="3. Project submission" step={step as never} />);
    expect(screen.getByText("Milestone 2: A baseline", { selector: "header strong" })).toBeTruthy();
    expect(screen.queryByText("3. Project submission")).toBeNull();
  });
});

describe("importing people", () => {
  const csv = (n: number) => ["name,username,role", ...Array.from({ length: n - 1 }, (_, i) => `Pupil ${i + 1},pupil.${i + 1},student`), "Grace Adeyemi,grace.a,teacher"].join("\n");
  const created = (members: Array<{ name: string; username?: string }>) => ({ results: members.map((x, k) => ({ row: k + 1, name: x.name, login: x.username ?? "", password: `pw-${x.username}`, uid: `u-${x.username}`, status: "created" })) });

  it("keeps the accounts made when a later call fails, and sends only the rest again (feat-org-import-credentials)", async () => {
    m.api.createMembers
      .mockImplementationOnce(async ({ members }: { members: Array<{ name: string; username?: string }> }) => created(members))
      .mockRejectedValueOnce(Object.assign(new Error("internal"), { code: "functions/internal" }))
      .mockImplementationOnce(async ({ members }: { members: Array<{ name: string; username?: string }> }) => created(members));
    wrap(<ImportPeople />, { url: "/admin/import" });
    const file = new File([csv(30)], "people.csv", { type: "text/csv" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.click(await screen.findByRole("button", { name: /30/ }));
    // The teacher, last in the file, goes in the first call so her students can be linked to her.
    await waitFor(() => expect(m.api.createMembers).toHaveBeenCalledTimes(2));
    const first = m.api.createMembers.mock.calls[0][0] as { members: Array<{ name: string }> };
    expect(first.members).toHaveLength(CHUNK);
    expect(first.members[0].name).toBe("Grace Adeyemi");
    expect(await screen.findByText("The connection dropped after 25 of 30. Download these logins now, then try the rest again.")).toBeTruthy();
    expect(screen.getAllByText("pw-grace.a").length).toBeGreaterThan(0); // the passwords made are kept (table and slip)
    expect(screen.getAllByText("Not sent — try again")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Try the rest again (5)" }));
    await waitFor(() => expect(m.api.createMembers).toHaveBeenCalledTimes(3));
    const again = m.api.createMembers.mock.calls[2][0] as { members: Array<{ username?: string }> };
    expect(again.members.map((x) => x.username)).toEqual(["pupil.25", "pupil.26", "pupil.27", "pupil.28", "pupil.29"]);
    await waitFor(() => expect(screen.queryByText("Not sent — try again")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByText("pw-pupil.29").length).toBeGreaterThan(0);
  });

  it("doesn't make a second account for a row a lost call already made, and numbers rows as the sheet does", async () => {
    // Names only: the server makes up each login, a new one each time a row is sent.
    const sheet = ["name,role", ...Array.from({ length: 30 }, (_, i) => `Pupil ${i + 1},student`)].join("\n");
    const made = (members: Array<{ name: string }>) => ({ results: members.map((x, k) => ({ row: k + 1, name: x.name, login: `${x.name.replace(" ", ".").toLowerCase()}.123`, password: `pw-${x.name}`, uid: `u-${x.name}`, status: "created" })) });
    m.api.createMembers
      .mockImplementationOnce(async ({ members }: { members: Array<{ name: string }> }) => made(members))
      .mockRejectedValueOnce(Object.assign(new Error("deadline-exceeded"), { code: "functions/deadline-exceeded" }))
      .mockImplementationOnce(async ({ members }: { members: Array<{ name: string }> }) => made(members));
    wrap(<ImportPeople />, { url: "/admin/import" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File([sheet], "people.csv", { type: "text/csv" })] } });
    fireEvent.click(await screen.findByRole("button", { name: /30/ }));
    expect(await screen.findByText(/The connection dropped after 25 of 30\./)).toBeTruthy();
    // The lost call had in fact made Pupil 27: it is found among the accounts this admin made, and not sent again.
    m.made = [{ uid: "u-lost-27", name: "Pupil 27", role: "student", group: null, username: "pupil.27.555", email: "pupil.27.555@users.darsiai.org" }];
    fireEvent.click(screen.getByRole("button", { name: "Try the rest again (5)" }));
    await waitFor(() => expect(m.api.createMembers).toHaveBeenCalledTimes(3));
    expect(m.madeCalls[0].slice(0, 2)).toEqual(["o1", "admin1"]);
    expect((m.api.createMembers.mock.calls[2][0] as { members: Array<{ name: string }> }).members.map((x) => x.name)).toEqual(["Pupil 26", "Pupil 28", "Pupil 29", "Pupil 30"]);
    const lost = (await screen.findByText("Made before the connection dropped: reset the password on their page")).closest("tr")!;
    expect(within(lost).getByText("Pupil 27")).toBeTruthy();
    expect(within(lost).getByText("pupil.27.555")).toBeTruthy();
    // Rows are numbered as in the sheet and its preview (the header is row 1), not 1, 2, 3 among the rows sent.
    expect(within(lost).getByText("28")).toBeTruthy();
    expect(within(screen.getAllByText("Pupil 1")[0].closest("tr")!).getByText("2")).toBeTruthy();
  });

  it("matches each account a lost call made to one row at most, never to one this import already reported", () => {
    const p = (row: number, name: string, o: Record<string, unknown> = {}) => ({ row, member: { name, role: "student" as const, ...o } });
    const acct = (uid: string, name: string, group: string | null = null) => ({ uid, name, role: "student", group, email: "" }) as never;
    const twins = [p(5, "Mona Ali", { group: "7 A" }), p(6, "Mona Ali", { group: "7  A" }), p(7, "Omar", { username: "omar.s" })];
    const { found, rest } = alreadyMade(twins, twins, [acct("x1", "Mona Ali", "7 A"), acct("known", "Mona Ali", "7 A")], new Set(["known"]));
    expect(found.map((x) => [x.p.row, x.account.uid])).toEqual([[5, "x1"]]);
    // The second twin and the row with its own login are sent (the server answers "exists" for a login it made).
    expect(rest.map((r) => r.row)).toEqual([6, 7]);
  });

  it("prints 'you will choose your own password' on slips only when that was asked for (ux-orgadmin-slip-text)", async () => {
    m.api.createMembers.mockImplementation(async ({ members }: { members: Array<{ name: string }> }) => ({ results: members.map((x, k) => ({ row: k + 1, name: x.name, login: "amina.b", password: "pw1", uid: "u1", status: "created" })) }));
    wrap(<AddPeople />, { url: "/admin/add" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Amina Bello" } });
    fireEvent.click(screen.getByRole("switch", { name: "Ask people to choose their own password at first sign-in" }));
    fireEvent.click(screen.getByRole("button", { name: "Create accounts" }));
    expect(await screen.findByText("Keep this slip safe: it has your password.")).toBeTruthy();
    expect(screen.queryByText("You will choose your own password after signing in.")).toBeNull();
    expect(m.api.createMembers.mock.calls[0][0]).toMatchObject({ mustChangePassword: false });
  });

  it("says why a row wasn't created, and what to do, in the admin's language (ux-orgadmin-server-reasons)", async () => {
    m.api.createMembers.mockResolvedValueOnce({ results: [{ row: 1, name: "Amina Bello", login: "ab", status: "error", error: "Invalid username", reason: "invalidUsername" }] });
    const ui = wrap(<AddPeople />, { url: "/admin/add", lang: "ar" });
    fireEvent.change(screen.getByLabelText(ar["field.name"]), { target: { value: "Amina Bello" } });
    fireEvent.click(screen.getByRole("button", { name: ar["add.create"] }));
    expect(await screen.findByText("خطأ — استخدم من ٣ إلى ٤٠ من الحروف اللاتينية أو الأرقام أو النقاط أو الشرطات، وابدأ بحرف أو رقم.")).toBeTruthy();
    expect(screen.queryByText(/Invalid username/)).toBeNull();
    ui.unmount();
    m.api.createMembers.mockResolvedValueOnce({ results: [{ row: 1, name: "Omar Said", login: "omar@school.org", status: "exists", error: "Account already exists", reason: "exists" }] });
    wrap(<AddPeople />, { url: "/admin/add" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Omar Said" } });
    fireEvent.click(screen.getByRole("button", { name: "Create accounts" }));
    expect(await screen.findByText("Already exists — This email already has a Darsi account: send them your invite link instead.")).toBeTruthy();
  });

  it("knows which failures may have lost a call's answer", () => {
    expect(lostCall({ code: "functions/internal" })).toBe(true);
    expect(lostCall({ code: "functions/unavailable" })).toBe(true);
    expect(lostCall({ code: "functions/deadline-exceeded" })).toBe(true);
    expect(lostCall({ code: "functions/permission-denied" })).toBe(false);
  });

  it("sends teachers and admins first, keeping each group's order", () => {
    const r = (name: string, role: "student" | "teacher" | "orgAdmin") => ({ member: { name, role } });
    expect(sendOrder([r("s1", "student"), r("t1", "teacher"), r("s2", "student"), r("a1", "orgAdmin")]).map((x) => x.member.name)).toEqual(["t1", "a1", "s1", "s2"]);
  });
});

describe("the organization's logo", () => {
  const org = { id: "o1", name: "Nile School", type: "school", status: "active" as const, createdBy: "admin1" };
  const pick = (f: File) => fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [f] } });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("offers only pictures it can shrink, and says why one was refused (ux-orgadmin-svg-logo)", async () => {
    wrap(<OrgBranding org={org} />, { url: "/admin" });
    expect(document.querySelector('input[type="file"]')!.getAttribute("accept")).not.toMatch(/svg/);
    pick(new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "logo.svg", { type: "image/svg+xml" }));
    expect(await screen.findByText("Choose a PNG, JPEG or WebP image.")).toBeTruthy();
    vi.stubGlobal("createImageBitmap", async () => { throw new DOMException("The source image could not be decoded.", "InvalidStateError"); });
    pick(new File(["x"], "logo.png", { type: "image/png" }));
    expect(await screen.findByText("This image couldn't be read. Try a PNG, JPEG or WebP file.")).toBeTruthy();
  });

  it("still says 'too big' for a picture it decoded but couldn't make small enough", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 4000, height: 4000, close() {} }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage() {} } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb: BlobCallback) => cb(new Blob([new Uint8Array(200 * 1024)], { type: "image/png" })));
    wrap(<OrgBranding org={org} />, { url: "/admin" });
    pick(new File(["x"], "logo.png", { type: "image/png" }));
    expect(await screen.findByText("This image could not be made small enough. Try a simpler logo.")).toBeTruthy();
  });
});

describe("helpers", () => {
  it("sorts people by name with nameless profiles last, and tidies a class", () => {
    expect([{ name: "Omar" }, { name: "" }, { name: "Amina" }, {}].sort(byName).map((p) => (p as { name?: string }).name)).toEqual(["Amina", "Omar", "", undefined]);
    expect(cleanGroup("  7   A ")).toBe("7 A");
    expect(cleanGroup("   ")).toBeNull();
    expect(cleanGroup("x".repeat(80))).toHaveLength(60);
  });

  it("reads staff data once: admin/data.ts holds no live listener (ux-orgadmin-live-listeners)", () => {
    expect(readFileSync(resolve(__dirname, "../src/admin/data.ts"), "utf8")).not.toMatch(/onSnapshot/);
  });

  it("leaves a course no longer offered without a completion count instead of 0", () => {
    const p = (units: Record<string, number>) => ({ uid: "u", name: "u", email: "", role: "student", summary: summary({ units }) }) as never;
    expect(byCourse([p({ "ai-1-1": 2, "data-s1": 5 })], [{ id: "ai-1-1", lessons: 2 }])).toEqual([{ id: "ai-1-1", started: 1, completed: 1 }, { id: "data-s1", started: 1, completed: null }]);
  });

  it("agrees Arabic counted words with their numbers on the teacher screens (ux-teacher-08)", () => {
    const seen: string[] = [];
    const days = (n: number) => new Date(Date.now() - (n + 0.5) * 864e5).toISOString();
    function Probe() {
      const { t } = useI18n();
      const dur = useDuration();
      seen.push(...[60, 120, 300, 900, 3600, 7200, 10800, 9000].map(dur), ...[2, 5, 11, 100].map((n) => lastActiveText(days(n), t)));
      return null;
    }
    render(<I18nProvider lang="ar"><Probe /></I18nProvider>);
    expect(seen.slice(0, 12)).toEqual(["دقيقة واحدة", "دقيقتان", "٥ دقائق", "١٥ دقيقة", "ساعة واحدة", "ساعتان", "٣ ساعات", "٢٫٥ ساعة", "منذ يومين", "منذ ٥ أيام", "منذ ١١ يومًا", "منذ ١٠٠ يوم"]);
  });
});
