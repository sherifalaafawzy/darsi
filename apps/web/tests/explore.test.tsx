// Platform admins can open any lesson at any step (a project included) without answering their way there; nobody else can.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../src/i18n";

const h = vi.hoisted(() => ({ role: "superadmin", stored: null as unknown }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => h.stored, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ role: h.role, user: null, configured: false }) }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null, forgetSettings: () => {},
  loadUnit: async (id: string) => ({ id, track: "ai", level: 1, title: { en: "Course" }, summary: { en: "S" }, lessons: [{
    id: "l1", title: { en: "First lesson" }, minutes: 5, tryTomorrow: { en: "T" }, slides: [], kit: [], steps: [
      { id: "s1", type: "read", prompt: { en: "Read this" }, title: { en: "Reading one" }, body: { en: "Body one" } },
      { id: "s2", type: "choice", prompt: { en: "Pick one" }, options: [{ id: "a", text: { en: "Apple" } }, { id: "b", text: { en: "Banana" } }], answer: "a" },
      { id: "s3", type: "reflect", prompt: { en: "Think about it" } },
    ] }] }),
}));

const { SettingsProvider } = await import("../src/content/settings");
const { StoreProvider, initialState, useStore } = await import("../src/state/store");
const { LessonScreen } = await import("../src/screens/LessonScreen");

let state = initialState;
function Probe() { state = useStore().state; return null; }
const open = (url: string) => render(<I18nProvider lang="en"><SettingsProvider lang="en"><StoreProvider>
  <MemoryRouter initialEntries={[url]}><Routes><Route path="/lesson/:unitId/:lessonId" element={<><LessonScreen /><Probe /></>} /><Route path="*" element={<p>elsewhere</p>} /></Routes></MemoryRouter>
</StoreProvider></SettingsProvider></I18nProvider>);

beforeEach(() => { h.role = "superadmin"; h.stored = { ...initialState, onboarded: true, lang: "en", tracks: ["ai"] }; });

describe("platform admins exploring a lesson", () => {
  it("jump to any step, skip a question, and don't get the lesson marked as finished", async () => {
    open("/lesson/u1/l1");
    const steps = await screen.findByRole("combobox", { name: "Go to step" });
    expect([...(steps as HTMLSelectElement).options].map((o) => o.text)).toEqual(["Step 1: Reading", "Step 2: Question", "Step 3: Reflection"]);
    fireEvent.change(steps, { target: { value: "1" } });
    expect(await screen.findByText("Pick one")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByText("Think about it")).toBeTruthy();
    // Nothing written yet, and Continue doesn't wait for it.
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Lesson done!")).toBeTruthy();
    await waitFor(() => expect(state.onboarded).toBe(true));
    expect(state.progress.l1).toBeUndefined();
  });

  it("opens a lesson at the step the link names", async () => {
    open("/lesson/u1/l1?step=reflect");
    expect(await screen.findByText("Think about it")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Go to step" }) as HTMLSelectElement).value).toBe("2");
  });

  it("still records a lesson an admin went through step by step", async () => {
    open("/lesson/u1/l1");
    await screen.findByText("Reading one");
    await waitFor(() => expect(state.onboarded).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // a reading is ready at once, so this isn't a skip
    fireEvent.click(await screen.findByText("Apple"));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "My thoughts on it" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Lesson done!")).toBeTruthy();
    await waitFor(() => expect(state.progress.l1?.done).toBe(true));
  });
});

describe("everyone else", () => {
  it("has no step list or Skip, and must answer before going on", async () => {
    h.role = "learner";
    open("/lesson/u1/l1?step=reflect");
    expect(await screen.findByText("Reading one")).toBeTruthy(); // the link's step is ignored
    expect(screen.queryByRole("combobox", { name: "Go to step" })).toBeNull();
    await waitFor(() => expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Pick one")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    expect((screen.getByRole("button", { name: "Check" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
