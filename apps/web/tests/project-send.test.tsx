// Sending a project: a retry after a dropped connection doesn't upload the same photo again, the rules refusing it says
// so (not "check your connection"), and a file over Storage's limit is caught before anything goes up.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "../src/i18n";
import type { ProjectStep } from "../src/content/types";

const h = vi.hoisted(() => ({
  upload: vi.fn(async () => {}),
  addDoc: vi.fn(async () => ({ id: "s1" })),
  callable: vi.fn(async () => ({})),
  orgId: null as string | null,
}));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "pupil-a", displayName: "Amina" }, profile: { name: "Amina" }, orgId: h.orgId, offlineUid: null }) }));
vi.mock("../src/state/myWork", () => ({ useMyWork: () => ({}), latestFor: () => undefined, forgetMyWork: () => {} }));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({ db: {}, storage: () => ({}) }), call: () => h.callable }));
vi.mock("firebase/storage", () => ({ ref: (_s: unknown, path: string) => ({ bucket: "b", fullPath: path }), uploadBytes: h.upload, deleteObject: vi.fn(async () => {}) }));
vi.mock("firebase/firestore", () => ({ addDoc: h.addDoc, collection: () => ({}), serverTimestamp: () => 0 }));

const { ProjectView } = await import("../src/lesson/ProjectView");

const PROJECT: ProjectStep = { id: "p1", type: "project", prompt: { en: "Try it" }, task: { en: "Do it." }, deliverable: { en: "A photo." }, rubric: [{ criterion: { en: "Done" } }] };
const view = (step: ProjectStep = PROJECT) => render(<I18nProvider lang="en"><ProjectView step={step} lessonId="l1" unitId="u1" onReady={() => {}} /></I18nProvider>);
const pickFile = (container: HTMLElement, file: File) => fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [file] } });
const send = () => fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));

beforeEach(() => { localStorage.clear(); h.orgId = null; h.upload.mockClear(); h.addDoc.mockReset(); h.callable.mockReset(); });
afterEach(cleanup);

describe("sending a project", () => {
  it("says who reviews it: the teacher or admin in an organization", async () => {
    h.orgId = "org-1";
    view();
    fireEvent.change(screen.getByLabelText("Your evidence"), { target: { value: "We tried it." } });
    send();
    expect(await screen.findByText("Submitted — your teacher or admin will review it.")).toBeTruthy();
    expect(screen.queryByText(/Darsi team/)).toBeNull();
  });

  it("sends the photo it already put up when trying again after a dropped connection", async () => {
    h.addDoc.mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "unavailable" })).mockResolvedValueOnce({ id: "s1" });
    const { container } = view();
    fireEvent.change(screen.getByLabelText("Your evidence"), { target: { value: "We tried it." } });
    pickFile(container, new File(["photo"], "class.pdf", { type: "application/pdf" }));
    send();
    expect(await screen.findByText("Could not send. Check your connection and try again.")).toBeTruthy();
    send();
    expect(await screen.findByText(/The Darsi team can review it/)).toBeTruthy(); // no organization: Darsi's team reviews it
    expect(h.upload).toHaveBeenCalledTimes(1);
    const sent = (h.addDoc.mock.calls[1] as unknown[])[1] as { files: { url: string }[] };
    expect(sent.files).toHaveLength(1);
  });

  it("says the rules refused it, not the connection, when Firestore says permission-denied", async () => {
    h.addDoc.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "permission-denied" }));
    view();
    fireEvent.change(screen.getByLabelText("Your evidence"), { target: { value: "We tried it." } });
    send();
    expect(await screen.findByText(/Darsi couldn’t accept this as it is/)).toBeTruthy();
    expect(screen.queryByText(/Check your connection/)).toBeNull();
  });

  it("catches a file over 10 MB before anything is uploaded", async () => {
    const { container } = view();
    fireEvent.change(screen.getByLabelText("Your evidence"), { target: { value: "We tried it." } });
    const big = new File(["x"], "lesson-video.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    pickFile(container, big);
    send();
    await waitFor(() => expect(screen.getByText(/is larger than 10 MB/).textContent).toContain("lesson-video.pdf"));
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.addDoc).not.toHaveBeenCalled();
  });
});
