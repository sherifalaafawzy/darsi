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
  ] }),
  loadUnit: async (id: string) => ({ id, track: "ai", level: 1, title: { en: "AI basics" }, summary: { en: "" }, lessons: [{ id: `${id}-4`, title: { en: "Your AI project" }, minutes: 5, steps: [], tryTomorrow: { en: "" }, slides: [], kit: [] }] }),
}));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useAllSubmissions: (waiting: boolean, max: number) => { m.calls.push({ waiting, max }); return { data: m.subs, reload: m.reload }; },
  useNames: () => ({ data: { u1: "Amina Bello", u2: "Omar" } }),
  useLearners: () => ({ data: m.learners, reload: vi.fn() }),
  finishedAt: async () => "2026-10-30T09:00:00.000Z",
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
