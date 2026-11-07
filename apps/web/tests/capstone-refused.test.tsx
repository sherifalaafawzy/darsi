// A capstone milestone checkCapstone refuses for what it is (FC-10): not a capstone milestone any more (not-found,
// failed-precondition) or input it doesn't accept (invalid-argument). The learner is told that, not "check your
// connection", and keeps what they wrote.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../src/i18n";
import type { ProjectStep, Unit } from "../src/content/types";

const m = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "s1", displayName: "Sara" }, profile: { name: "Sara" }, orgId: null, role: "learner" }) }));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({ db: {}, storage: () => ({}) }), call: () => m.call }));
vi.mock("firebase/firestore", () => ({ addDoc: vi.fn(), collection: (...p: unknown[]) => p, serverTimestamp: () => "now" }));

const { ProjectView } = await import("../src/lesson/ProjectView");
const { refusal } = await import("../src/lesson/capstoneText");

const capStep = () => (JSON.parse(readFileSync(join(__dirname, "../../../content/units/ai-capstone.json"), "utf8")) as Unit).lessons.at(-1)!.steps.find((s) => s.type === "project") as ProjectStep;
async function send() {
  render(<I18nProvider lang="en"><ProjectView step={capStep()} lessonId="ai-capstone-submission" unitId="ai-capstone" onReady={() => {}} /></I18nProvider>);
  fireEvent.change(screen.getByLabelText("Your evidence"), { target: { value: "My classifier" } });
  fireEvent.change(screen.getByLabelText("Explain how it works, in your own words"), { target: { value: "It counts words" } });
  fireEvent.click(screen.getByRole("radio", { name: "No, I did it without AI" }));
  const repo = screen.queryByLabelText("Your GitHub repository");
  if (repo) fireEvent.change(repo, { target: { value: "https://github.com/sara/ai-capstone" } });
  const links = screen.queryByLabelText(/Links to your work/);
  if (links) fireEvent.change(links, { target: { value: "https://huggingface.co/spaces/sara/demo" } });
  const check = document.querySelector('input[accept="application/json,.json"]');
  if (check) fireEvent.change(check, { target: { files: [new File(['{"darsi":1,"track":"ai","milestones":{}}'], "darsi-check.json", { type: "application/json" })] } });
  const btn = screen.getByRole("button", { name: "Check and send" }) as HTMLButtonElement;
  await vi.waitFor(() => expect(btn.disabled).toBe(false));
  fireEvent.click(btn);
}

beforeEach(() => { localStorage.clear(); m.call.mockReset(); Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true }); });

describe("a refused capstone send", () => {
  it("says the milestone can't be sent when checkCapstone doesn't know it as one, and keeps the work", async () => {
    m.call.mockImplementationOnce(async () => { throw Object.assign(new Error("No such capstone milestone."), { code: "functions/not-found" }); });
    await send();
    expect(await screen.findByText(/This milestone can't be sent right now/)).toBeTruthy();
    expect(screen.queryByText(/Check your connection/)).toBeNull();
    expect((screen.getByLabelText("Your evidence") as HTMLTextAreaElement).value).toBe("My classifier");
  });

  it("says what was sent wasn't accepted when checkCapstone refuses the input", async () => {
    m.call.mockImplementationOnce(async () => { throw Object.assign(new Error("bad:files"), { code: "functions/invalid-argument" }); });
    await send();
    expect(await screen.findByText(/Something you sent wasn't accepted/)).toBeTruthy();
  });

  it("maps checkCapstone's errors, and leaves any other error to the connection message", () => {
    expect(refusal({ code: "functions/not-found" })).toBe("closed");
    expect(refusal({ code: "functions/failed-precondition" })).toBe("closed");
    expect(refusal({ code: "functions/invalid-argument", message: "bad:repo" })).toBe("invalid");
    expect(refusal({ code: "functions/unavailable" })).toBeNull();
    expect(refusal(new Error("Failed to fetch"))).toBeNull();
  });
});
