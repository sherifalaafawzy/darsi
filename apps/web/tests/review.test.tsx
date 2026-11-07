// Reviewing a project (admin/SubmissionCard.tsx, admin/WorkBody.tsx): reviewers see everything the learner sent (the
// explanation and AI use a final project or capstone milestone asks for, and every file), which milestone it is, the AI
// review by the rubric's criteria; and files are read through Storage with the reviewer's own sign-in, never through a
// download-token link that works for whoever holds it.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/i18n";
import type { Lesson, ProjectStep } from "../src/content/types";

const m = vi.hoisted(() => ({ role: "teacher", blobs: [] as string[], fail: false, blobType: "image/jpeg" }));
vi.mock("../src/firebase-config", async (orig) => ({ ...(await orig<typeof import("../src/firebase-config")>()), firebaseConfig: { storageBucket: "darsi-f0685" } }));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, functions: {}, firebaseReady: true, storage: async () => ({}), call: () => vi.fn() }));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({ storage: async () => ({}) }), call: () => vi.fn() }));
vi.mock("firebase/storage", () => ({
  ref: (_s: unknown, path: string) => path,
  getBlob: async (path: string) => { m.blobs.push(path); if (m.fail) throw new Error("storage/unauthorized"); return new Blob(["x"], { type: m.blobType }); },
}));
vi.mock("firebase/firestore", async (orig) => ({ ...(await orig<typeof import("firebase/firestore")>()), doc: (...p: unknown[]) => p.slice(1).join("/"), updateDoc: async () => {}, serverTimestamp: () => "now" }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "me" }, role: m.role }) }));

const { SubmissionCard, projectStep } = await import("../src/admin/SubmissionCard");
const { stepName } = await import("../src/admin/WorkBody");
const { evidencePath, shownType } = await import("../src/admin/evidence");

const url = (name: string, token = true) => `https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/${encodeURIComponent(`submissions/o1/s1/ai-capstone/${name}`)}${token ? "?alt=media&token=secret" : ""}`;
const step = (id: string, title: string, final = false): ProjectStep => ({
  type: "project", id, prompt: { en: `${title}\n\nWhat to do.`, ar: `${title} (ar)\n\nماذا تفعل.` }, task: { en: "Task" }, deliverable: { en: "Files" },
  rubric: [{ criterion: { en: "Licence and source are named" } }, { criterion: { en: "Validation metrics are complete" } }], evidence: [{ kind: "repo" }], ...(final ? { final: true } : {}),
} as ProjectStep);
const lesson = { id: "ai-capstone-submission", title: { en: "3. Project submission" }, minutes: 60, steps: [step("project-m1", "Milestone 1: A data card"), step("project-m2", "Milestone 2: A baseline")], tryTomorrow: { en: "" }, slides: [], kit: [] } as unknown as Lesson;
const milestone = {
  id: "sub1", lessonId: "ai-capstone-submission", unitId: "ai-capstone", stepId: "project-m2", orgId: "o1", status: "submitted" as const, createdAt: { seconds: 1793700000 },
  text: "My baseline is in results/baseline.json.", explain: "TF-IDF counts words; the regression weighs them.", aiUse: "I asked a chatbot to explain TF-IDF.",
  fileUrl: url("ai-capstone-submission-1-cm.png"), fileName: "cm.png",
  files: [{ url: url("ai-capstone-submission-1-cm.png"), name: "cm.png", type: "image/png" }, { url: url("ai-capstone-submission-2-note.m4a"), name: "note.m4a", type: "audio/mp4" }],
  capstone: true, repo: "https://github.com/sara/reviews", links: [], queue: "teacher" as const,
  checks: [{ id: "repo", ok: true, en: "The repository is public.", ar: "المستودع عام." }],
  aiReview: { status: "done" as const, scores: [{ criterion: 0, score: 3, en: "Clear source.", ar: "مصدر واضح." }, { criterion: 1, score: 2, en: "Add recall.", ar: "أضف الاستدعاء." }], summary: { en: "Good start.", ar: "بداية جيدة." }, next: { en: "", ar: "" } },
};
const wrap = (ui: ReactNode, lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter>{ui}</MemoryRouter></I18nProvider>);

beforeEach(() => {
  m.role = "teacher"; m.blobs = []; m.fail = false; m.blobType = "image/jpeg";
  URL.createObjectURL = vi.fn(() => "blob:shown");
  URL.revokeObjectURL = vi.fn();
});

describe("a capstone milestone's review card", () => {
  it("shows the milestone, the explanation, the AI use, every file and the AI review by criterion", () => {
    wrap(<SubmissionCard uid="s1" sub={milestone} lessonTitle="3. Project submission" step={projectStep(lesson, milestone.stepId)} />);
    expect(screen.getByText("Milestone 2: A baseline")).toBeTruthy();
    expect(screen.getByText("How it works, in the student's words")).toBeTruthy();
    expect(screen.getByText(milestone.explain)).toBeTruthy();
    expect(screen.getByText("AI use")).toBeTruthy();
    expect(screen.getByText(milestone.aiUse)).toBeTruthy();
    // Both files, not only the first; nothing is downloaded until one is opened.
    expect(screen.getByRole("button", { name: "cm.png" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "note.m4a" })).toBeTruthy();
    expect(m.blobs).toEqual([]);
    // The AI review names the rubric's criteria, not "Criterion 1", "Criterion 2".
    expect(screen.getByText("Licence and source are named")).toBeTruthy();
    expect(screen.getByText("Validation metrics are complete")).toBeTruthy();
    expect(screen.queryByText("Criterion 1")).toBeNull();
    // No link anywhere hands out a file's token.
    expect(document.querySelector('a[href*="token="]')).toBeNull();
  });

  it("names the milestone in Arabic too, and says when no AI was used", () => {
    wrap(<SubmissionCard uid="s1" sub={{ ...milestone, aiUse: "none" }} lessonTitle="٣. تسليم المشروع" step={projectStep(lesson, "project-m2")} />, "ar");
    expect(screen.getByText("Milestone 2: A baseline (ar)")).toBeTruthy();
    expect(screen.getByText("لم يستخدم الذكاء الاصطناعي")).toBeTruthy();
    expect(screen.getByText("كيف يعمل، بكلمات الطالب")).toBeTruthy();
  });

  it("takes platform admins to the very milestone, not the lesson's first project step", () => {
    m.role = "superadmin";
    wrap(<SubmissionCard uid="s1" sub={milestone} lessonTitle="3. Project submission" step={projectStep(lesson, "project-m2")} />);
    // Titled by the milestone itself, not by its lesson ("3. Project submission" holds all five).
    expect(screen.getByRole("link", { name: "Milestone 2: A baseline" }).getAttribute("href")).toBe("/lesson/ai-capstone/ai-capstone-submission?step=project-m2");
    expect(screen.queryByText("3. Project submission")).toBeNull();
  });

  it("shows the site each of the learner's links opens first and in bold", () => {
    const sub = { ...milestone, links: ["https://darsi-signin.example/login?next=1", "https://xn--drsi-zqa.example/"] };
    wrap(<SubmissionCard uid="s1" sub={sub} lessonTitle="3. Project submission" />);
    const phish = screen.getByRole("link", { name: /darsi-signin\.example/ });
    expect(phish.querySelector("strong")?.textContent).toBe("darsi-signin.example");
    expect(phish.textContent).toContain("/login?next=1");
    expect(phish.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("link", { name: /xn--drsi-zqa\.example/ })).toBeTruthy(); // a look-alike name, as the browser reads it
    expect(screen.getByRole("link", { name: /github\.com/ }).querySelector("strong")?.textContent).toBe("github.com");
  });

  it("still shows a project whose unit isn't loaded (no milestone name, criteria by number)", () => {
    wrap(<SubmissionCard uid="s1" sub={milestone} lessonTitle="" />);
    expect(screen.queryByText("Milestone 2: A baseline")).toBeNull();
    expect(screen.getByText(milestone.explain)).toBeTruthy();
    expect(screen.getByText("Criterion 1")).toBeTruthy(); // lesson/CapstoneParts.tsx: CT.criterion, in the reader's digits
  });
});

describe("an ordinary project's card", () => {
  it("has no explanation or AI section, shows its one older file, and never a link to another site", () => {
    const sub = { id: "p1", lessonId: "ai-1-1-4", unitId: "ai-1-1", text: "We sorted pictures in class.", status: "approved" as const, fileUrl: url("ai-1-1-4-1-photo.jpg"), fileName: "photo.jpg" };
    wrap(<SubmissionCard uid="s1" sub={sub} lessonTitle="Your AI project" />);
    expect(screen.queryByText("AI use")).toBeNull();
    expect(screen.getByRole("button", { name: "photo.jpg" })).toBeTruthy();
    wrap(<SubmissionCard uid="s1" sub={{ ...sub, id: "p2", fileUrl: "https://darsi-signin.example/login", fileName: "evil.pdf" }} lessonTitle="Your AI project" />);
    expect(screen.queryByRole("button", { name: "evil.pdf" })).toBeNull();
  });
});

describe("opening a file", () => {
  it("reads it through Storage with the reviewer's sign-in (the token is ignored) and shows it in the card", async () => {
    wrap(<SubmissionCard uid="s1" sub={milestone} lessonTitle="3. Project submission" />);
    fireEvent.click(screen.getByRole("button", { name: "cm.png" }));
    const img = await screen.findByRole("img", { name: "cm.png" });
    expect(img.getAttribute("src")).toBe("blob:shown");
    expect(m.blobs).toEqual(["submissions/o1/s1/ai-capstone/ai-capstone-submission-1-cm.png"]);
  });

  it("plays a voice note even when Storage says octet-stream (the emulator), and offers a PDF only to save", async () => {
    m.blobType = "application/octet-stream";
    wrap(<SubmissionCard uid="s1" sub={milestone} lessonTitle="3. Project submission" />);
    fireEvent.click(screen.getByRole("button", { name: "note.m4a" }));
    await waitFor(() => expect(document.querySelector("audio.sub-media")).not.toBeNull());
    const pdf = { ...milestone, id: "sub2", files: [{ url: url("ai-capstone-submission-3-report.pdf"), name: "report.pdf", type: "application/pdf" }] };
    wrap(<SubmissionCard uid="s1" sub={pdf} lessonTitle="3. Project submission" />);
    fireEvent.click(screen.getByRole("button", { name: "report.pdf" }));
    const save = await screen.findByRole("link", { name: /Save/ });
    expect(save.getAttribute("download")).toBe("report.pdf");
    expect(save.getAttribute("href")).toBe("blob:shown");
  });

  it("says so when the file can't be read (no access, or offline)", async () => {
    m.fail = true;
    wrap(<SubmissionCard uid="s1" sub={milestone} lessonTitle="3. Project submission" />);
    fireEvent.click(screen.getByRole("button", { name: "cm.png" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't open this file/);
  });
});

describe("helpers", () => {
  it("find the step a project answers: by id, else a lesson's only project step", () => {
    expect(projectStep(lesson, "project-m1")?.id).toBe("project-m1");
    expect(projectStep(lesson, "gone")).toBeUndefined();
    expect(projectStep(lesson)).toBeUndefined(); // two project steps: which one is unknown
    const one = { ...lesson, steps: [lesson.steps[0]] } as Lesson;
    expect(projectStep(one)?.id).toBe("project-m1");
    expect(stepName(projectStep(one), (x) => x?.en ?? "")).toBe("Milestone 1: A data card");
  });

  it("take an attachment's Storage path from its link, token or not, and refuse anything else", () => {
    expect(evidencePath(url("a-1-x.jpg"))).toBe("submissions/o1/s1/ai-capstone/a-1-x.jpg");
    expect(evidencePath(url("a-1-x.jpg", false))).toBe("submissions/o1/s1/ai-capstone/a-1-x.jpg");
    expect(evidencePath("https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/submissions%2F..%2Fx")).toBeNull();
    expect(evidencePath("https://darsi-signin.example/submissions/x")).toBeNull();
  });

  it("show only photos, sound and mp4 video in the card; PDFs and anything else are only saved", () => {
    expect(shownType("image/png", undefined, "a.png")).toBe("image/png");
    expect(shownType("application/octet-stream", "audio/mp4", "a.m4a")).toBe("audio/mp4");
    expect(shownType("application/octet-stream", undefined, "a.jpg")).toBe("image/jpeg");
    expect(shownType("image/svg+xml", "image/svg+xml", "a.svg")).toBe("application/octet-stream");
    expect(shownType("text/html", undefined, "a.html")).toBe("application/octet-stream");
    expect(shownType("application/pdf", undefined, "a.pdf")).toBe("application/pdf");
  });
});
