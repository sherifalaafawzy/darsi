import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import type { ProjectStep, Unit } from "../src/content/types";

// Final projects (out/project-work/PLAN.md, v1): one per track for the upper stage, last in the course, not graded; the
// student explains it in their own words and declares any AI use. University teachers given access read the results.
const m = vi.hoisted(() => ({
  auth: { user: { uid: "s1", displayName: "Sara" } as { uid: string; displayName: string } | null, profile: { name: "Sara" }, orgId: null as string | null, role: "learner" },
  addDoc: vi.fn(async () => ({ id: "x" })),
  results: { results: [{ uid: "s1", lessonId: "ai-s3-1", accuracy: 0.8 }, { uid: "s2", lessonId: "ai-s3-1", accuracy: 0.5 }],
    work: [{ id: "w1", uid: "s1", lessonId: "ai-s3-cap", text: "My leaf model", final: true, explain: "It looks at the nearest leaves", aiUse: "none", name: "Sara" }] },
}));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({ db: {}, storage: () => ({}) }) }));
vi.mock("firebase/firestore", () => ({ addDoc: m.addDoc, collection: (...p: unknown[]) => p, serverTimestamp: () => "now" }));
vi.mock("../src/results/data", () => ({ myGrant: async () => ({ uid: "t1", units: ["ai-s3"] }), courseResults: async () => m.results }));

const { ProjectView } = await import("../src/lesson/ProjectView");
const { CourseResults } = await import("../src/results/CourseResults");

const CONTENT = {
  loadCatalog: async () => ({ version: 1, units: [{ id: "ai-s3", title: { en: "Train your own model" } }] }) as never,
  loadUnit: async () => JSON.parse(readFileSync(join(__dirname, "../../../content/units/ai-s3.json"), "utf8")) as Unit,
};
const TRACKS = ["agents", "ai", "aisec", "code", "cyber", "data", "ds", "iot", "opt"];
const unit = (t: string) => JSON.parse(readFileSync(join(__dirname, `../../../content/units/${t}-s3.json`), "utf8")) as Unit;

describe("final projects in the content", () => {
  it.each(TRACKS)("%s-s3 ends with its final project, after the four lessons and the check", (t) => {
    const u = unit(t);
    const last = u.lessons[u.lessons.length - 1];
    expect(last.id).toBe(`${t}-s3-cap`);
    expect(u.lessons.slice(0, 4).every((l) => l.steps.some((s) => s.type === "project"))).toBe(true); // the milestones
    const p = last.steps.find((s) => s.type === "project") as ProjectStep;
    expect(p.final).toBe(true);
    expect(p.rubric.length).toBeGreaterThanOrEqual(3);
    const text = JSON.stringify(last);
    expect(text).not.toContain("·");
    for (const s of last.steps) expect(JSON.stringify(s)).toContain('"ar"');
  });
});

const step = () => unit("ai").lessons.at(-1)!.steps.find((s) => s.type === "project") as ProjectStep;
const view = () => render(<I18nProvider lang="en"><ProjectView step={step()} lessonId="ai-s3-cap" unitId="ai-s3" onReady={() => {}} /></I18nProvider>);

describe("a final project", () => {
  beforeEach(() => { localStorage.clear(); m.addDoc.mockClear(); Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true }); });

  it("needs the work, an own-words explanation and an AI-use answer before it can be sent", async () => {
    view();
    const send = screen.getByRole("button", { name: "Send my final project" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Your evidence"), { target: { value: "My leaf model" } });
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Explain how it works, in your own words"), { target: { value: "Nearest leaves vote" } });
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Yes, I used AI for part of it" }));
    expect(send.disabled).toBe(true); // say how
    fireEvent.change(screen.getByLabelText("Which tool, what for, and what you changed yourself"), { target: { value: "A chatbot fixed my spelling" } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(await screen.findByText("Sent. Your teacher can see your final project now.")).toBeTruthy();
    expect(m.addDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      unitId: "ai-s3", lessonId: "ai-s3-cap", final: true, explain: "Nearest leaves vote", aiUse: "A chatbot fixed my spelling", status: "submitted", name: "Sara",
    }));
    expect(localStorage.getItem("darsi-project-draft:ai-s3-cap:final")).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull(); // nothing to score
  });

  it("keeps the writing on the phone, and offline it says so instead of sending", () => {
    const { unmount } = view();
    fireEvent.change(screen.getByLabelText("Your evidence"), { target: { value: "Draft text" } });
    unmount();
    view();
    expect((screen.getByLabelText("Your evidence") as HTMLTextAreaElement).value).toBe("Draft text");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    fireEvent.change(screen.getByLabelText("Explain how it works, in your own words"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("radio", { name: "No, I did it without AI" }));
    fireEvent.click(screen.getByRole("button", { name: "Send my final project" }));
    expect(screen.getByText(/You're offline/)).toBeTruthy();
    expect(m.addDoc).not.toHaveBeenCalled();
  });

  it("is written in Arabic too, with no middle dot", () => {
    const ar = JSON.parse(readFileSync(join(__dirname, "../src/i18n/ar.json"), "utf8")) as Record<string, string>;
    const en = JSON.parse(readFileSync(join(__dirname, "../src/i18n/en.json"), "utf8")) as Record<string, string>;
    for (const k of Object.keys(en).filter((k) => /^(project\.|results\.|access\.)/.test(k))) {
      expect(ar[k], k).toBeTruthy();
      expect(ar[k]).not.toContain("·");
    }
  });
});

describe("course results for a university teacher", () => {
  it("shows each student's scores and final projects, read only", async () => {
    m.auth = { ...m.auth, user: { uid: "t1", displayName: "Dr Amal" }, role: "learner" };
    render(<I18nProvider lang="en"><MemoryRouter><CourseResults content={CONTENT} /></MemoryRouter></I18nProvider>);
    expect(await screen.findByText("Scores per lesson")).toBeTruthy();
    expect(screen.getAllByText("Sara").length).toBeGreaterThan(0);
    expect(screen.getByText("Student 2")).toBeTruthy();
    expect(screen.getAllByText("80%").length).toBeGreaterThan(0);
    expect(screen.getByText("It looks at the nearest leaves")).toBeTruthy();
    expect(screen.getByText("No AI used")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /approve|revise|save/i })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
