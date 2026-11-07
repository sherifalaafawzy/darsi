// The org admin's and teacher's people screens (admin/): the person page, the dashboard and adding or importing people,
// with Firestore, the callables and the course files replaced, so they can be checked without the emulators.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/i18n";
import { StoreProvider } from "../src/state/store";
import ar from "../src/i18n/ar.json";

const m = vi.hoisted(() => {
  const lesson = (id: string, title: string) => ({ id, title: { en: title }, minutes: 5, steps: [], tryTomorrow: { en: "" }, slides: [], kit: [] });
  const entry = (id: string, track: string, title: string, lessons: number) => ({ id, track, level: 1, title: { en: title }, summary: { en: "" }, lessons, sizeMB: 1, available: true, src: `content/units/${id}/v1.json` });
  return {
    auth: { user: { uid: "admin1" }, role: "orgAdmin", orgId: "o1" } as { user: { uid: string } | null; role: string; orgId: string | null },
    person: null as unknown, personErr: undefined as Error | undefined, progress: [] as unknown[], subs: [] as unknown[], certs: [] as unknown[], staff: [] as unknown[] | undefined,
    members: [] as unknown[], org: null as unknown, membersLoading: false, subsLoading: false, invites: { teacher: "AAAA-BBBB-CCCC", student: "DDDD-EEEE-FFFF" } as unknown,
    reload: vi.fn(), invitesReload: vi.fn(),
    loaded: [] as string[],
    updates: [] as Array<{ path: string; data: Record<string, unknown> }>,
    failUpdate: null as Error | null,
    made: [] as unknown[], madeCalls: [] as unknown[][],
    api: { regenerateInviteCode: vi.fn(), resetMemberPassword: vi.fn(), createMembers: vi.fn(), setMemberRole: vi.fn(), removeMember: vi.fn(), setUserRole: vi.fn(), deleteAccount: vi.fn(), exportAccountData: vi.fn(), grantSuper: vi.fn(), grantCredits: vi.fn(), setSeat: vi.fn(), fillSeats: vi.fn() },
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
  writeBatch: () => {
    const ops: Array<{ path: string; data: Record<string, unknown> }> = [];
    return { update: (path: string, data: Record<string, unknown>) => { ops.push({ path, data }); }, commit: async () => { m.updates.push(...ops); } };
  },
}));
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
  useProgress: () => ({ data: m.progress, reload: m.reload }),
  useSubmissions: () => ({ data: m.subsLoading ? undefined : m.subs, loading: m.subsLoading, reload: m.reload }),
  useCerts: () => ({ data: m.certs, reload: m.reload }),
  useOrgStaff: (orgId?: string | null) => ({ data: orgId ? m.staff : undefined, reload: m.reload }),
  useMembers: () => ({ data: m.membersLoading ? undefined : m.members, loading: m.membersLoading, reload: m.reload }),
  useOrg: () => ({ data: m.org, reload: m.reload }),
  useInvites: () => ({ data: m.invites, reload: m.invitesReload }),
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
const amina = (o: Record<string, unknown> = {}) => ({ uid: "s1", name: "Amina Bello", email: "amina.b@users.darsi.app", role: "student", orgId: "o1", teacherId: "t1", ...o });
const row = (lessonId: string, unitId: string, o: Record<string, unknown> = {}) => ({ lessonId, unitId, track: unitId.split("-")[0], accuracy: 0.5, xp: 40, seconds: 300, completedAt: "2026-11-01T10:00:00Z", ...o });
const sectionOf = (heading: string) => screen.getByRole("heading", { name: heading }).closest("section")!;

beforeEach(() => {
  vi.clearAllMocks();
  m.auth = { user: { uid: "admin1" }, role: "orgAdmin", orgId: "o1" };
  m.membersLoading = false; m.subsLoading = false;
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
    // Only the course's real lessons are listed.
    expect(await screen.findByText("Lesson one")).toBeTruthy();
    expect(screen.queryByText("ai-1-1-zz")).toBeNull();
  });

  it("downloads only the courses with results or projects, and names one no longer offered (ux-teacher-05, -07)", async () => {
    m.person = amina({ summary: summary({ lessonsDone: 1, units: { "ai-1-1": 1 } }) });
    m.progress = [row("ai-1-1-1", "ai-1-1"), row("data-s1-1", "data-s1"), row("data-s1-2", "data-s1"), row("gone-9-1", "gone-9")];
    m.subs = [{ id: "p1", lessonId: "iot-1-2-2", unitId: "iot-1-2", text: "My sensor", status: "submitted" }];
    wrap(<PersonDetail />);
    expect(await screen.findByText("Lesson one")).toBeTruthy();
    await waitFor(() => expect([...m.loaded].sort()).toEqual(["ai-1-1", "iot-1-2"])); // never cyber-1-1, never all of them
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
    expect(within(sectionOf("Projects")).getByText("Lesson two")).toBeTruthy();
  });

  it("names a course no longer offered from the person's certificate, and marks it done (users/{uid}/certs)", async () => {
    m.person = amina({ summary: summary({ lessonsDone: 2, units: { "ai-1-1": 1 } }) });
    m.progress = [row("ai-1-1-1", "ai-1-1"), row("data-s1-1", "data-s1"), row("data-s1-2", "data-s1")];
    m.certs = [{ id: "data-s1", title: { en: "Data for beginners" }, track: "data", at: "2026-10-20T10:00:00.000Z" }];
    wrap(<PersonDetail />);
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
    wrap(<PersonDetail />, { url: "/admin/people/s1" });
    const teacher = await screen.findByLabelText("Teacher") as HTMLSelectElement;
    expect(teacher.value).toBe("t1");
    expect(teacher.selectedOptions[0].textContent).toBe("Grace Adeyemi");
    expect([...teacher.options].map((o) => o.textContent)).toContain("Bola Admin"); // admins who teach can be picked
    expect(screen.getAllByLabelText("Role")).toHaveLength(1); // "Role and organization" only
    expect(within(sectionOf("Account")).queryByLabelText("Role")).toBeNull();
  });

  it("gives an org admin the role picker, and a teacher who left shows as a former teacher", async () => {
    m.person = amina({ teacherId: "gone", summary: summary() });
    wrap(<PersonDetail />);
    expect(within(sectionOf("Account")).getByLabelText("Role")).toBeTruthy();
    const teacher = screen.getByLabelText("Teacher") as HTMLSelectElement;
    expect(teacher.selectedOptions[0].textContent).toBe("Former teacher");
  });

  it("saves a class with its spaces tidied, says so, and reads the person again", async () => {
    m.person = amina({ summary: summary() });
    wrap(<PersonDetail />);
    const input = screen.getByLabelText("Group") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  7   A " } });
    fireEvent.blur(input);
    await waitFor(() => expect(m.updates).toEqual([{ path: "users/s1", data: { group: "7 A" } }]));
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(m.reload).toHaveBeenCalled();
  });

  it("shows a reset password in its own left-to-right element, so Arabic can't move its last '!' (ux-orgadmin-reset-pw-bidi)", async () => {
    m.person = amina({ summary: summary() });
    m.api.resetMemberPassword.mockResolvedValue({ login: "amina.b@users.darsi.app", password: "9BSkqzWp!" });
    wrap(<PersonDetail />, { lang: "ar" });
    fireEvent.click(screen.getByRole("button", { name: ar["p.resetPw"] }));
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
    { uid: "s1", name: "Amina Bello", email: "amina.b@users.darsi.app", role: "student", orgId: "o1", summary: summary({ lessonsDone: 2, competencies: { "S.TA.U": 2 } }) },
    { uid: "s2", name: "Omar Said", email: "omar.s@users.darsi.app", role: "student", orgId: "o1", group: "6B" },
    { uid: "t1", name: "Grace Adeyemi", email: "grace@school.org", role: "teacher", orgId: "o1" },
    { uid: "x9", email: "nameless@users.darsi.app", role: "student", orgId: "o1" },
  ];
  beforeEach(() => { m.members = people(); m.org = { id: "o1", name: "Nile School", type: "school", status: "active", createdBy: "admin1" }; });

  it("lists competency coverage from the members' summaries, downloading no course (ux-orgadmin-dashboard-units)", async () => {
    wrap(<AdminHome />, { url: "/admin" });
    const cov = within(sectionOf("Capability coverage"));
    expect(cov.getByText("S.TA.U")).toBeTruthy();
    expect(cov.getByText("25%")).toBeTruthy(); // 1 of 4 members
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(m.loaded).toEqual([]);
    // A nameless member is listed (last), not dropped.
    expect(screen.getByText("nameless")).toBeTruthy();
  });

  it("asks before making a new invite code, shows it worked, and shows a failure (ux-orgadmin-invite-regenerate)", async () => {
    m.api.regenerateInviteCode.mockResolvedValueOnce({ code: "NEWW-CODE-XXXX" }).mockRejectedValueOnce(Object.assign(new Error("internal"), { code: "functions/internal" }));
    wrap(<AdminHome />, { url: "/admin" });
    fireEvent.click(screen.getAllByRole("button", { name: "New code" })[0]);
    expect(screen.getByText(/Make a new teacher code\? The old code and its links stop working\./)).toBeTruthy();
    expect(m.api.regenerateInviteCode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Make a new code" }));
    await waitFor(() => expect(m.api.regenerateInviteCode).toHaveBeenCalledWith({ orgId: "o1", role: "teacher" }));
    expect(await screen.findByText("New code made. The old one no longer works.")).toBeTruthy();
    expect(m.invitesReload).toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "New code" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Make a new code" }));
    expect(await screen.findByText("internal")).toBeTruthy();
  });

  it("gives several people a class or a teacher at once (feat-org-bulk-classes)", async () => {
    wrap(<AdminHome />, { url: "/admin" });
    fireEvent.click(screen.getByLabelText("Select Amina Bello"));
    fireEvent.click(screen.getByLabelText("Select Grace Adeyemi"));
    expect(screen.getByText("Selected: 2")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Class (choose or type)"), { target: { value: " 7   A " } });
    fireEvent.click(screen.getByRole("button", { name: "Set class" }));
    await waitFor(() => expect(m.updates).toEqual([{ path: "users/s1", data: { group: "7 A" } }, { path: "users/t1", data: { group: "7 A" } }]));
    expect(await screen.findByText("Saved. People updated: 2.")).toBeTruthy();
    expect(m.reload).toHaveBeenCalled();
    // A teacher goes only to the students selected.
    m.updates = [];
    fireEvent.click(screen.getByLabelText("Select Omar Said"));
    fireEvent.click(screen.getByLabelText("Select Grace Adeyemi"));
    fireEvent.change(screen.getByLabelText("Teacher"), { target: { value: "t1" } });
    fireEvent.click(screen.getByRole("button", { name: "Set teacher" }));
    await waitFor(() => expect(m.updates).toEqual([{ path: "users/s2", data: { teacherId: "t1" } }]));
  });

  it("has a Refresh button, since nothing is pushed live (ux-orgadmin-live-listeners)", () => {
    wrap(<AdminHome />, { url: "/admin" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(m.reload).toHaveBeenCalled();
    expect(m.invitesReload).toHaveBeenCalled();
  });
});

describe("while staff pages load, on your own page, and when the server refuses (release walk-through)", () => {
  const nile = { id: "o1", name: "Nile School", type: "school", status: "active", createdBy: "admin1" };
  /** The person page and the dashboard it goes back to, as the app routes them. */
  const pages = (lang = "en") => render(
    <StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={["/admin/people/s1"]}>
      <Routes><Route path="/admin/people/:uid" element={<PersonDetail />} /><Route path="/admin" element={<AdminHome />} /></Routes>
    </MemoryRouter></I18nProvider></StoreProvider>,
  );

  it("says the dashboard is loading, never 'Members 0' or 'No people yet' (which invited a second import)", () => {
    m.membersLoading = true; m.org = nile;
    wrap(<AdminHome />, { url: "/admin" });
    expect(screen.getByText("Members", { selector: ".tile span" }).nextElementSibling?.textContent).toBe("…");
    expect(screen.queryByText("No people yet")).toBeNull();
    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
  });

  it("counts members by their role names, in capitals and plural", () => {
    m.org = nile;
    m.members = [amina(), { uid: "t1", name: "Grace", role: "teacher", orgId: "o1" }, { uid: "a1", name: "Bola", role: "orgAdmin", orgId: "o1" }];
    wrap(<AdminHome />, { url: "/admin" });
    expect(screen.getByText("Teachers: 1 · Students: 1 · Admins: 1")).toBeTruthy();
    expect(screen.getAllByText("Student").length).toBeGreaterThan(0); // the table's role column
  });

  it("shows a person's projects as loading, not '0' and 'No projects submitted yet'", () => {
    m.person = amina({ summary: summary() }); m.subsLoading = true;
    wrap(<PersonDetail />);
    expect(screen.getByText("Projects", { selector: "dt" }).nextElementSibling?.textContent).toBe("…");
    expect(screen.queryByText("No projects submitted yet.")).toBeNull();
  });

  it("offers no role change, password reset, removal or deletion on your own page", () => {
    m.auth = { user: { uid: "a1" }, role: "orgAdmin", orgId: "o1" };
    m.person = { uid: "a1", name: "Bola Admin", email: "bola@users.darsi.app", role: "orgAdmin", orgId: "o1", summary: summary() };
    wrap(<PersonDetail />, { url: "/admin/people/a1" });
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
    wrap(<PersonDetail />, { lang: "ar" });
    const role = within(sectionOf(ar["p.actions"])).getByLabelText(ar["col.role"]) as HTMLSelectElement;
    fireEvent.change(role, { target: { value: "teacher" } });
    fireEvent.click(screen.getByRole("button", { name: ar["p.saveRole"] }));
    expect(await screen.findByText("لم يعد هذا الشخص عضوًا في هذه المؤسسة. حدّث الصفحة.")).toBeTruthy();
    expect(screen.queryByText(/Not a member/)).toBeNull();
    expect(role.value).toBe("student");
    // A code this phone doesn't know yet: the server's own words, without the SDK's prefix.
    m.api.setMemberRole.mockRejectedValue(Object.assign(new Error("FirebaseError: Something new [400]"), { details: { reason: "brand-new" } }));
    fireEvent.change(role, { target: { value: "teacher" } });
    fireEvent.click(screen.getByRole("button", { name: ar["p.saveRole"] }));
    expect(await screen.findByText("Something new")).toBeTruthy();
  });

  it("asks on the page before removing someone (no browser dialog), and the dashboard says it was done", async () => {
    const dialog = vi.spyOn(window, "confirm");
    m.person = amina({ summary: summary() }); m.org = nile; m.members = [];
    m.api.removeMember.mockResolvedValue({ ok: true });
    pages();
    fireEvent.click(screen.getByRole("button", { name: "Remove from organization" }));
    expect(screen.getByRole("alert").textContent).toMatch(/^Remove .*Amina Bello.* from the organization\? They are signed out on every device/);
    expect(m.api.removeMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(m.api.removeMember).toHaveBeenCalledWith({ orgId: "o1", uid: "s1" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/Amina Bello.* was removed from the organization\./);
    expect(dialog).not.toHaveBeenCalled();
    dialog.mockRestore();
  });

  it("cancels a removal, and says why one was refused", async () => {
    m.person = amina({ summary: summary() });
    m.api.removeMember.mockRejectedValue(Object.assign(new Error("This is the organization's only admin."), { details: { reason: "last-admin" } }));
    wrap(<PersonDetail />);
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
    expect((await screen.findByRole("status")).textContent).toMatch(/Amina Bello.*'s account and data were deleted\./);
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
    m.made = [{ uid: "u-lost-27", name: "Pupil 27", role: "student", group: null, username: "pupil.27.555", email: "pupil.27.555@users.darsi.app" }];
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
