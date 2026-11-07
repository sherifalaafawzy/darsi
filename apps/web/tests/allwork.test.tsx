// Platform admins see everyone's work: every project (to review) and every certificate earned.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";

const m = vi.hoisted(() => ({
  subs: [] as unknown[],
  learners: [] as unknown[],
  calls: [] as { waiting: boolean; max: number }[],
  reload: vi.fn(),
  updated: [] as unknown[],
  sent: {} as Record<string, unknown[]>,
}));
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
  useAllSubmissions: (waiting: boolean, max: number) => { m.calls.push({ waiting, max }); return { data: m.subs, reload: m.reload }; },
  useNames: () => ({ data: { u1: "Amina Bello", u2: "Omar" } }),
  useLearners: () => ({ data: m.learners, reload: vi.fn() }),
  finishedAt: async () => "2026-10-30T09:00:00.000Z",
  sentFor: async (uid: string) => m.sent[uid] ?? [],
}));

const { ProjectsPage, CertificatesPage } = await import("../src/admin/AllWork");
const page = (ui: React.ReactNode) => render(<I18nProvider lang="en"><MemoryRouter>{ui}</MemoryRouter></I18nProvider>);

describe("every project", () => {
  beforeEach(() => { m.calls = []; m.updated = []; m.reload.mockClear(); });

  it("lists the projects waiting for a review, names whose they are, and reviews one", async () => {
    m.subs = [{ id: "s1", uid: "u1", lessonId: "ai-1-1-4", unitId: "ai-1-1", text: "My chatbot for the class", status: "submitted", createdAt: { seconds: 1793700000 } }];
    page(<ProjectsPage />);
    expect(m.calls.at(-1)).toEqual({ waiting: true, max: 50 });
    expect(screen.getByText("My chatbot for the class")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Amina Bello" }).getAttribute("href")).toBe("/super/people/u1");
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
    fireEvent.click(screen.getByRole("button", { name: "All projects" }));
    expect(m.calls.at(-1)).toEqual({ waiting: false, max: 50 });
    expect(screen.getByText("No projects here.")).toBeTruthy();
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
      { uid: "u3", name: "", email: "rana@users.darsi.app", summary: { lessonsDone: 1, units: { "ai-cap": 1 } } },
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
