// Platform admins see everyone's work: every project (to review) and every certificate earned.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import stEn from "../src/staff/strings/en.json";

const m = vi.hoisted(() => ({
  subs: [] as unknown[],
  learners: [] as unknown[],
  calls: [] as { waiting: boolean; max: number }[],
  reload: vi.fn(),
  updated: [] as unknown[],
  sent: {} as Record<string, unknown[]>,
  // Reads and calls that fail (staff/errors.ts words them): the projects, the learners, a certificate's date, a removal.
  subsError: undefined as unknown, learnersError: undefined as unknown, finishError: undefined as unknown,
  moderate: vi.fn(),
}));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: { moderateSubmission: (a: unknown) => m.moderate(a) } }));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: {}, functions: {}, firebaseReady: true, call: () => vi.fn() }));
vi.mock("firebase/firestore", async (orig) => ({ ...(await orig<typeof import("firebase/firestore")>()), doc: (...p: unknown[]) => p.slice(1).join("/"), updateDoc: async (ref: unknown, data: unknown) => { m.updated.push({ ref, data }); }, serverTimestamp: () => "now" }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "admin" }, role: "superadmin" }) }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null,
  loadCatalog: async () => ({ version: 1, units: [
    { id: "ai-1-1", track: "ai", level: 1, title: { en: "AI basics" }, summary: { en: "" }, lessons: 4, sizeMB: 1, available: true },
    { id: "cyber-1-1", track: "cyber", level: 1, title: { en: "Passwords" }, summary: { en: "" }, lessons: 4, sizeMB: 1, available: true },
    { id: "ai-cap", track: "ai", level: 4, title: { en: "AI capstone" }, summary: { en: "" }, lessons: 1, sizeMB: 1, available: true, kind: "capstone" },
  ] }),
  loadUnit: async (id: string) => id === "ai-cap"
    // A capstone: one lesson with two milestones (project steps that take evidence).
    ? { id, kind: "capstone", track: "ai", level: 4, title: { en: "AI capstone" }, summary: { en: "" }, lessons: [{ id: "ai-cap-1", title: { en: "Build it" }, minutes: 5, tryTomorrow: { en: "" }, slides: [], kit: [], steps: [
      { id: "m1", type: "project", prompt: { en: "Milestone 1" }, deliverable: { en: "" }, rubric: [], evidence: [{ kind: "repo" }] },
      { id: "m2", type: "project", prompt: { en: "Milestone 2" }, deliverable: { en: "" }, rubric: [], evidence: [{ kind: "links" }] },
    ] }] }
    : { id, track: "ai", level: 1, title: { en: "AI basics" }, summary: { en: "" }, lessons: [{ id: `${id}-4`, title: { en: "Your AI project" }, minutes: 5, steps: [], tryTomorrow: { en: "" }, slides: [], kit: [] }] },
}));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useAllSubmissions: (waiting: boolean, max: number) => { m.calls.push({ waiting, max }); return m.subsError ? { error: m.subsError, reload: m.reload } : { data: m.subs, reload: m.reload }; },
  useNames: () => ({ data: { u1: "Amina Bello", u2: "Omar" } }),
  useLearners: () => (m.learnersError ? { error: m.learnersError, reload: vi.fn() } : { data: m.learners, reload: vi.fn() }),
  finishedAt: async () => { if (m.finishError) throw m.finishError; return "2026-10-30T09:00:00.000Z"; },
  sentFor: async (uid: string) => m.sent[uid] ?? [],
}));

const { ProjectsPage, CertificatesPage } = await import("../src/admin/AllWork");
// The pages' tabs read and write the address (?tab=): a router around them, started where the test says.
const page = (ui: React.ReactNode, at = "/super/projects") => render(<I18nProvider lang="en"><MemoryRouter initialEntries={[at]}>{ui}</MemoryRouter></I18nProvider>);
const openTab = () => screen.getAllByRole("tab").filter((x) => x.getAttribute("aria-selected") === "true").map((x) => x.textContent);
/** The reads the page asked for, each once: the hook reads again only when (waiting, max) change. */
const reads = () => [...new Set(m.calls.map((c) => `${c.waiting ? "waiting" : "all"} ${c.max}`))];

beforeEach(() => { m.subsError = undefined; m.learnersError = undefined; m.finishError = undefined; m.moderate.mockReset(); });

// What failed is said in the admin's language (staff/errors.ts), never as the SDK's or the server's own English.
describe("a read or a call that fails", () => {
  it("the projects: a sentence, not the SDK's message", () => {
    m.subsError = Object.assign(new Error("Failed to get documents from server."), { code: "unavailable" });
    page(<ProjectsPage />);
    expect(within(screen.getByRole("tabpanel", { name: "Waiting for review" })).getByRole("alert").textContent).toBe(stEn["st.err.unavailable"]);
    expect(screen.queryByText(/Failed to get documents/)).toBeNull();
    expect(screen.queryByText("No projects here.")).toBeNull();
  });

  it("the certificates: the list, and one certificate's date", async () => {
    m.learnersError = new Error("Missing or insufficient permissions.");
    const first = page(<CertificatesPage />, "/super/certificates");
    expect((await screen.findByRole("alert")).textContent).toBe(stEn["st.err.generic"]);
    expect(screen.queryByText(/Missing or insufficient permissions/)).toBeNull();
    first.unmount();
    m.learnersError = undefined;
    m.learners = [{ uid: "u1", name: "Amina Bello", summary: { lessonsDone: 4, units: { "ai-1-1": 4 } } }];
    m.finishError = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    page(<CertificatesPage />, "/super/certificates");
    fireEvent.click(await screen.findByRole("button", { name: "Show certificate" }));
    expect((await screen.findByRole("alert")).textContent).toBe(stEn["st.err.permissionDenied"]);
    expect(screen.queryByText(/Missing or insufficient permissions/)).toBeNull();
  });

  it("removing a project's content: a sentence, not the single word “internal”", async () => {
    m.subs = [{ id: "s1", uid: "u1", lessonId: "ai-1-1-4", unitId: "ai-1-1", text: "Something abusive", status: "submitted", createdAt: { seconds: 1793700000 } }];
    m.moderate.mockRejectedValue(Object.assign(new Error("internal"), { code: "functions/internal" }));
    page(<ProjectsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Remove content" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove content" })[0]);
    expect(await screen.findByText(stEn["st.err.internal"])).toBeTruthy();
    expect(screen.queryByText("internal")).toBeNull();
    expect(screen.getByText("Something abusive")).toBeTruthy();
  });
});

describe("every project", () => {
  beforeEach(() => { m.calls = []; m.updated = []; m.reload.mockClear(); });

  it("lists the projects waiting for a review, names whose they are, and reviews one", async () => {
    m.subs = [{ id: "s1", uid: "u1", lessonId: "ai-1-1-4", unitId: "ai-1-1", text: "My chatbot for the class", status: "submitted", createdAt: { seconds: 1793700000 } }];
    page(<ProjectsPage />);
    expect(m.calls.at(-1)).toEqual({ waiting: true, max: 50 });
    // The three views are tabs; the ones waiting for a review open first.
    expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual(["Waiting for review", "Waiting for Darsi staff only", "All projects"]);
    expect(openTab()).toEqual(["Waiting for review"]);
    expect(screen.getByRole("tabpanel", { name: "Waiting for review" })).toBeTruthy();
    expect(screen.getByText("My chatbot for the class")).toBeTruthy();
    // The person's page opens on their projects (its Projects tab), where this one is. Was /super/people/u1.
    expect(screen.getByRole("link", { name: "Amina Bello" }).getAttribute("href")).toBe("/super/people/u1?tab=projects");
    await screen.findByText("Your AI project");
    // The lesson opens at its project step (platform admins can open any step).
    expect(screen.getByRole("link", { name: "Your AI project" }).getAttribute("href")).toBe("/lesson/ai-1-1/ai-1-1-4?step=project");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(m.reload).toHaveBeenCalled());
    expect(m.updated[0]).toMatchObject({ ref: "users/u1/submissions/s1", data: { status: "approved", reviewedBy: "admin" } });
  });

  it("switches to every project", () => {
    m.subs = [];
    page(<ProjectsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "All projects" }));
    expect(m.calls.at(-1)).toEqual({ waiting: false, max: 50 });
    expect(openTab()).toEqual(["All projects"]);
    expect(screen.getByText("No projects here.")).toBeTruthy();
  });

  it("opens every project from its own address", () => {
    m.subs = [{ id: "s1", uid: "u1", lessonId: "ai-1-1-4", unitId: "ai-1-1", text: "Approved last week", status: "approved", createdAt: { seconds: 1793700000 } }];
    page(<ProjectsPage />, "/super/projects?tab=all");
    expect(openTab()).toEqual(["All projects"]);
    // Only that read: the waiting list was never asked for.
    expect(reads()).toEqual(["all 50"]);
    expect(within(screen.getByRole("tabpanel", { name: "All projects" })).getByText("Approved last week")).toBeTruthy();
    // The tabs are links to the other views; the first one has no parameter.
    expect(screen.getByRole("tab", { name: "Waiting for review" }).getAttribute("href")).toBe("/super/projects");
    expect(screen.getByRole("tab", { name: "Waiting for Darsi staff only" }).getAttribute("href")).toBe("/super/projects?tab=staff");
    expect(screen.getByRole("tab", { name: "All projects" }).getAttribute("href")).toBe("/super/projects?tab=all");
  });

  it("goes between Waiting and Darsi staff only without reading again, and keeps what was typed", () => {
    m.subs = [
      { id: "s1", uid: "u1", lessonId: "ai-1-1-4", unitId: "ai-1-1", text: "A class project", status: "submitted", createdAt: { seconds: 1793700000 } },
      { id: "s2", uid: "u2", lessonId: "ai-cap-1", unitId: "ai-cap", stepId: "m1", capstone: true, queue: "staff", text: "A milestone with no teacher", status: "submitted", createdAt: { seconds: 1793600000 } },
    ];
    page(<ProjectsPage />);
    expect(screen.getByText("A class project")).toBeTruthy();
    const typed = screen.getAllByLabelText("Feedback")[1] as HTMLTextAreaElement;
    fireEvent.change(typed, { target: { value: "Nearly there" } });
    fireEvent.click(screen.getByRole("tab", { name: "Waiting for Darsi staff only" }));
    expect(openTab()).toEqual(["Waiting for Darsi staff only"]);
    // The staff queue is a filter of the waiting list: the milestone stays, the class project goes.
    const panel = screen.getByRole("tabpanel", { name: "Waiting for Darsi staff only" });
    expect(within(panel).getByText("A milestone with no teacher")).toBeTruthy();
    expect(screen.queryByText("A class project")).toBeNull();
    // The same card, not a new one: the list under the tabs is never remounted.
    expect((screen.getByLabelText("Feedback") as HTMLTextAreaElement).value).toBe("Nearly there");
    fireEvent.click(screen.getByRole("tab", { name: "Waiting for review" }));
    expect(screen.getByText("A class project")).toBeTruthy();
    expect(reads()).toEqual(["waiting 50"]);
  });

  it("starts each tab at one page again after Show more", () => {
    m.subs = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, uid: "u1", lessonId: "ai-1-1-4", unitId: "ai-1-1", text: `Project ${i}`, status: "submitted", createdAt: { seconds: 1793700000 - i } }));
    page(<ProjectsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(m.calls.at(-1)).toEqual({ waiting: true, max: 100 });
    fireEvent.click(screen.getByRole("tab", { name: "All projects" }));
    expect(m.calls.at(-1)).toEqual({ waiting: false, max: 50 });
    // Never the new tab with the old tab's page (that would be a wasted read of 100).
    expect(reads()).toEqual(["waiting 50", "waiting 100", "all 50"]);
    fireEvent.click(screen.getByRole("tab", { name: "Waiting for review" }));
    expect(m.calls.at(-1)).toEqual({ waiting: true, max: 50 });
  });
});

describe("every certificate", () => {
  it("lists each finished course from the summaries and opens its certificate", async () => {
    m.learners = [
      { uid: "u1", name: "Amina Bello", summary: { lessonsDone: 6, units: { "ai-1-1": 4, "cyber-1-1": 2 } } },
      { uid: "u2", name: "Omar", summary: { lessonsDone: 8, units: { "ai-1-1": 4, "cyber-1-1": 4 } } },
    ];
    page(<CertificatesPage />);
    await screen.findAllByText("AI basics");
    // Amina finished one course, Omar two: three certificates, two people.
    expect(screen.getAllByRole("button", { name: "Show certificate" }).length).toBe(3);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pass" } });
    expect(screen.getAllByRole("button", { name: "Show certificate" }).length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Show certificate" }));
    await screen.findByText(/DRS-CYBER-1-1-/);
    expect(screen.getAllByText("Omar").length).toBeGreaterThan(1);
  });
});

describe("capstone certificates", () => {
  it("count only when every milestone was sent, carry the account's own name, and date from the last milestone", async () => {
    m.learners = [
      { uid: "u3", name: "", email: "rana@users.darsiai.org", summary: { lessonsDone: 1, units: { "ai-cap": 1 } } },
      { uid: "u4", name: "Zed", summary: { lessonsDone: 1, units: { "ai-cap": 1 } } },
    ];
    m.sent = {
      u3: [{ unitId: "ai-cap", lessonId: "ai-cap-1", stepId: "m1", createdAt: "2026-10-29T09:00:00.000Z" }, { unitId: "ai-cap", lessonId: "ai-cap-1", stepId: "m2", createdAt: "2026-11-02T09:00:00.000Z" }],
      // Zed finished the lessons but sent only the first milestone ("later" sends nothing).
      u4: [{ unitId: "ai-cap", lessonId: "ai-cap-1", stepId: "m1", createdAt: "2026-10-29T09:00:00.000Z" }],
    };
    page(<CertificatesPage />);
    await screen.findByText("AI capstone");
    expect(screen.getAllByRole("button", { name: "Show certificate" }).length).toBe(1);
    expect(screen.queryByText("Zed")).toBeNull();
    // No profile name: the list names the login, and the certificate says "—", as the learner's own (Me) does.
    expect(screen.getByRole("link", { name: "rana" }).getAttribute("href")).toBe("/super/people/u3");
    fireEvent.click(screen.getByRole("button", { name: "Show certificate" }));
    await screen.findByText(/^DRS-AI-CAP-[0-9A-Z]{4}-[0-9A-Z]{4}$/); // from the course, the time and the account (cert.ts certCode), not the name
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/November 2, 2026/)).toBeTruthy();
  });
});
