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
  call: vi.fn(async (_: unknown) => ({ id: "c1", queue: "staff", checks: [{ id: "repo", ok: true, en: "Repository found", ar: "وُجد المستودع" }], aiReview: null })),
  results: { results: [{ uid: "s1", lessonId: "ai-s3-1", accuracy: 0.8 }, { uid: "s2", lessonId: "ai-s3-1", accuracy: 0.5 }],
    work: [{ id: "w1", uid: "s1", lessonId: "ai-s3-cap", text: "My leaf model", final: true, explain: "It looks at the nearest leaves", aiUse: "none", name: "Sara" }] },
}));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({ db: {}, storage: () => ({}) }), call: () => m.call }));
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

const capstone = (t: string) => JSON.parse(readFileSync(join(__dirname, `../../../content/units/${t}-capstone.json`), "utf8")) as Unit;

describe("final projects in the content", () => {
  it.each(TRACKS)("%s-s3 keeps its lessons but no longer has a final project (the capstone replaced it)", (t) => {
    const u = unit(t);
    expect(u.lessons.some((l) => l.id === `${t}-s3-cap`)).toBe(false);
    expect(JSON.stringify(u)).not.toContain('"final":true');
    expect(u.lessons.slice(0, 4).every((l) => l.steps.some((s) => s.type === "project"))).toBe(true); // the milestones
  });
  it.each(TRACKS)("%s-capstone ends with its final project, in both languages", (t) => {
    const u = capstone(t);
    expect(u.kind).toBe("capstone");
    expect(u.level).toBe(3);
    const last = u.lessons[u.lessons.length - 1];
    const p = last.steps.find((s) => s.type === "project") as ProjectStep;
    expect(p.final).toBe(true);
    expect(p.evidence?.some((e) => e.kind === "release")).toBe(true);
    expect(p.rubric.length).toBeGreaterThanOrEqual(3);
    for (const l of u.lessons.slice(0, -1)) expect(JSON.stringify(l)).not.toContain('"final":true');
    const text = JSON.stringify(last);
    expect(text).not.toContain("·");
    for (const s of last.steps) expect(JSON.stringify(s)).toContain('"ar"');
  });
});

/** The ai capstone's final milestone without its capstone fields: a plain final project. */
const capStep = () => capstone("ai").lessons.at(-1)!.steps.find((s) => s.type === "project") as ProjectStep;
const step = (): ProjectStep => { const { evidence: _e, setup: _s, starterRepo: _r, hours: _h, milestone: _m, ...p } = capStep(); return p; };
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

describe("a capstone milestone", () => {
  beforeEach(() => { localStorage.clear(); m.call.mockClear(); m.addDoc.mockClear(); Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true }); });
  const capView = () => render(<I18nProvider lang="en"><ProjectView step={capStep()} lessonId="ai-capstone-5" unitId="ai-capstone" onReady={() => {}} /></I18nProvider>);

  it("needs a GitHub repository and a readable darsi-check.json, then sends through checkCapstone, not straight to Firestore", async () => {
    capView();
    expect(screen.getByRole("link", { name: /darsi-org\/ai-capstone/ })).toBeTruthy();
    const send = screen.getByRole("button", { name: "Check and send" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Your evidence"), { target: { value: "My classifier" } });
    fireEvent.change(screen.getByLabelText("Explain how it works, in your own words"), { target: { value: "It counts words" } });
    fireEvent.click(screen.getByRole("radio", { name: "No, I did it without AI" }));
    fireEvent.change(screen.getByLabelText("Your GitHub repository"), { target: { value: "https://gitlab.com/me/x" } });
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Your GitHub repository"), { target: { value: "https://github.com/sara/ai-capstone" } });
    expect(send.disabled).toBe(true); // the demo link (url evidence) and the check file are still missing
    fireEvent.change(screen.getByLabelText(/Links to your work/), { target: { value: "https://huggingface.co/spaces/sara/demo" } });
    expect(send.disabled).toBe(true);
    const file = new File(['{"darsi":1,"track":"ai","milestones":{}}'], "darsi-check.json", { type: "application/json" });
    fireEvent.change(document.querySelector('input[accept="application/json,.json"]')!, { target: { files: [file] } });
    await vi.waitFor(() => expect(send.disabled).toBe(false));
    fireEvent.click(send);
    expect(await screen.findByText(/The Darsi team reviews it/)).toBeTruthy();
    expect(screen.getByText("Repository found")).toBeTruthy();
    expect(m.call).toHaveBeenCalledWith(expect.objectContaining({ unitId: "ai-capstone", lessonId: "ai-capstone-5", repo: "https://github.com/sara/ai-capstone", links: ["https://huggingface.co/spaces/sara/demo"], aiUse: "none" }));
    expect(m.addDoc).not.toHaveBeenCalled();
  });
});
