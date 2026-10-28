// What one learner sees: their audience (teachers or students) and their tracks, one track on Home at a time.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { CatalogEntry } from "../src/content/types";
import { I18nProvider } from "../src/i18n";

const h = vi.hoisted(() => ({ stored: null as unknown, role: "learner", units: [] as unknown[], placement: { version: 2, questions: [] as unknown[] } }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => h.stored, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ role: h.role, user: null, configured: false }) }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null, forgetSettings: () => {},
  loadCatalog: async () => ({ version: 1, units: h.units }),
  loadPlacement: async () => h.placement,
  loadUnit: async (id: string) => ({ id, track: id.split("-")[0], level: 1, title: { en: `Course ${id}` }, summary: { en: "S" },
    lessons: [{ id: `${id}-1`, title: { en: "First lesson" }, minutes: 5, steps: [], tryTomorrow: { en: "T" }, slides: [], kit: [] }] }),
}));

const { audienceFor, activeTrack, myTracks, useMine } = await import("../src/content/mine");
const { BUILTIN_TRACKS } = await import("../src/content/tracks");
const { SettingsProvider } = await import("../src/content/settings");
const { StoreProvider, initialState, useStore } = await import("../src/state/store");
const { Home } = await import("../src/screens/Home");
const { MyTracks } = await import("../src/screens/MyTracks");
const { Onboarding, PlacementQuiz } = await import("../src/screens/Onboarding");
const { startAt } = await import("../src/screens/Home");
const { validateUnit } = await import("../src/content/validate");

const entry = (id: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({ id, track: id.split("-")[0], level: 1, title: { en: `Course ${id}` }, summary: { en: "S" },
  lessons: 1, sizeMB: 1, available: true, src: `content/units/${id}/v1.json`, version: 1, owner: "public", ...extra });
const seed = (patch: object) => { h.stored = { ...initialState, onboarded: true, lang: "en", ...patch }; };
function Probe({ on }: { on: (s: ReturnType<typeof useStore>["state"], m: ReturnType<typeof useMine>) => void }) { on(useStore().state, useMine()); return null; }
const show = (ui: ReactNode) => render(<I18nProvider lang="en"><SettingsProvider lang="en"><StoreProvider><MemoryRouter>{ui}</MemoryRouter></StoreProvider></SettingsProvider></I18nProvider>);

beforeEach(() => {
  h.role = "learner";
  h.units = [entry("ai-t"), entry("cyber-t"), entry("iot-t"), entry("ai-s", { audience: "students" })];
});

describe("audience and tracks", () => {
  it("follows a school account's role, else what the learner said", () => {
    expect(audienceFor("student", "teachers")).toBe("students");
    expect(audienceFor("teacher", "students")).toBe("teachers");
    expect(audienceFor("learner", "students")).toBe("students");
    expect(audienceFor("superadmin")).toBe("teachers");
  });

  it("keeps the chosen tracks still on offer, in the platform's order, and every track when none is left", () => {
    expect(myTracks(["cyber", "ai"], BUILTIN_TRACKS).map((t) => t.id)).toEqual(["ai", "cyber"]);
    expect(myTracks(["gone"], BUILTIN_TRACKS).map((t) => t.id)).toEqual(["ai", "iot", "cyber"]);
    const mine = myTracks(["ai", "cyber"], BUILTIN_TRACKS);
    expect(activeTrack("cyber", mine)).toBe("cyber");
    expect(activeTrack("iot", mine)).toBe("ai"); // removed since: back to the first
  });

  it("checks a course's audience", () => {
    const unit = { id: "u1", track: "ai", level: 1, title: { en: "T" }, summary: { en: "S" }, lessons: [{ id: "u1-1", title: { en: "L" }, minutes: 5, steps: [{ id: "r", type: "read", body: { en: "B" } }], tryTomorrow: { en: "T" }, slides: [], kit: [] }] };
    const audience = (a: unknown) => validateUnit({ ...unit, audience: a }).filter((i) => i.at.field === "audience");
    expect(audience("students")).toEqual([]);
    expect(audience("parents")).toMatchObject([{ code: "badValue" }]);
  });
});

describe("Home", () => {
  it("shows only the current track's courses for teachers, and switches track from the app bar", async () => {
    seed({ tracks: ["ai", "cyber"], audience: "teachers" });
    show(<Home />);
    expect(await screen.findByRole("heading", { name: "Course ai-t" })).toBeTruthy();
    expect(screen.queryByText("Course cyber-t")).toBeNull();
    expect(screen.queryByText("Course ai-s")).toBeNull(); // for students
    expect(screen.queryByText("Course iot-t")).toBeNull(); // not one of mine
    fireEvent.click(screen.getByRole("button", { name: "AI: change track" }));
    expect(screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent)).toEqual(["AI"]);
    expect(screen.queryByRole("button", { name: /Internet of Things|IoT/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cyber security" }));
    expect(await screen.findByRole("heading", { name: "Course cyber-t" })).toBeTruthy();
    expect(screen.queryByText("Course ai-t")).toBeNull();
  });

  it("shows students their own courses, and says when a track has none yet", async () => {
    seed({ tracks: ["ai", "iot"], audience: "students", track: "ai" });
    const view = show(<Home />);
    expect(await screen.findByRole("heading", { name: "Course ai-s" })).toBeTruthy();
    expect(screen.queryByText("Course ai-t")).toBeNull();
    view.unmount();
    seed({ tracks: ["ai", "iot"], audience: "students", track: "iot" });
    show(<Home />);
    expect(await screen.findByText(/Courses for students in .* are on their way/)).toBeTruthy();
  });

  it("gives a school's student account student courses, whatever this phone said before", async () => {
    h.role = "student";
    seed({ tracks: ["ai"], audience: "teachers" });
    show(<Home />);
    expect(await screen.findByRole("heading", { name: "Course ai-s" })).toBeTruthy();
  });
});

describe("My tracks", () => {
  it("adds a track (and shows it next), removes one, and always keeps one", async () => {
    seed({ tracks: ["ai"], audience: "teachers" });
    let state = initialState;
    show(<><MyTracks /><Probe on={(s) => { state = s; }} /></>);
    await waitFor(() => expect(state.tracks).toEqual(["ai"]));
    expect(await screen.findAllByText("Courses: 1")).toHaveLength(3); // ai-t, iot-t and cyber-t, each for teachers
    fireEvent.click(screen.getByRole("checkbox", { name: /AI/ }));
    expect(screen.getByRole("status").textContent).toBe("Keep at least one track.");
    expect(state.tracks).toEqual(["ai"]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Cyber security/ }));
    expect(state).toMatchObject({ tracks: ["ai", "cyber"], track: "cyber" });
    fireEvent.click(screen.getByRole("checkbox", { name: /AI/ }));
    expect(state.tracks).toEqual(["cyber"]);
  });
});

describe("Onboarding", () => {
  it("asks teacher or student, and a student goes on to choose tracks", async () => {
    h.stored = { ...initialState, lang: "en" };
    let state = initialState;
    show(<><Onboarding /><Probe on={(s) => { state = s; }} /></>);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Who are you?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Student/ }));
    expect(state.audience).toBe("students");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "What do you want to learn?" })).toBeTruthy();
  });

  it("skips the question for a school's accounts", async () => {
    h.role = "teacher";
    h.stored = { ...initialState, lang: "en" };
    show(<Onboarding />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "What do you want to learn?" })).toBeTruthy();
  });
});

describe("starting at your level", () => {
  const q = (track: string, audience: string, level: number, n: number) => ({ id: `${track}-${audience}-${level}-${n}`, track, audience, level, type: "choice",
    prompt: { en: `${track} ${audience} level ${level} question ${n}` }, options: [{ id: "a", text: { en: "right" } }, { id: "b", text: { en: "wrong" } }], answer: "a", explain: { en: "E" } });
  beforeEach(() => {
    h.placement = { version: 2, questions: ["ai", "cyber"].flatMap((tr) => ["teachers", "students"].flatMap((au) => [1, 2, 3, 4].flatMap((lv) => [1, 2, 3].map((n) => q(tr, au, lv, n))))) };
  });
  const answer = async (right: boolean) => {
    fireEvent.click(await screen.findByRole("button", { name: right ? /right/ : /wrong/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  };

  it("asks only your audience's questions, two per level, and stops at the first level not passed", async () => {
    seed({ tracks: ["ai", "cyber"], audience: "students" });
    const done = vi.fn();
    show(<PlacementQuiz tracks={["ai"]} onDone={done} />);
    expect(await screen.findByText(/^ai students level 1 question/)).toBeTruthy();
    await answer(true); await answer(true); // level 1 passed
    expect(screen.getByText(/^ai students level 2 question/)).toBeTruthy();
    await answer(true); await answer(false); // level 2 not passed: start there
    expect(done).toHaveBeenCalledWith({ ai: 2 });
  });

  it("checks each of your tracks in turn, and \"I don't know yet\" ends a track", async () => {
    seed({ tracks: ["ai", "cyber"], audience: "teachers" });
    const done = vi.fn();
    show(<PlacementQuiz onDone={done} />);
    expect(await screen.findByText(/^ai teachers level 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "I don’t know yet" }));
    expect(await screen.findByText(/^cyber teachers level 1/)).toBeTruthy();
    for (let i = 0; i < 8; i++) await answer(true); // every level passed
    expect(done).toHaveBeenCalledWith({ ai: 1, cyber: 4 });
  });

  it("orders Home from your level up, with earlier levels folded away", () => {
    const u = (id: string, level: number, available = true) => ({ id, level, available });
    const r = startAt([u("a1", 1), u("a3", 3), u("a2", 2), u("a4", 4, false), u("a2b", 2, false)], 2);
    expect(r.current.map((x) => x.id)).toEqual(["a2", "a2b"]);
    expect(r.later.map((x) => x.id)).toEqual(["a3", "a4"]);
    expect(r.earlier.map((x) => x.id)).toEqual(["a1"]);
  });

  it("shows your level's course first, and moves you up when you finish it", async () => {
    h.units = [entry("ai-t"), entry("ai-two", { level: 2 }), entry("ai-three", { level: 3 })];
    seed({ tracks: ["ai"], audience: "teachers", levels: { ai: 2 } });
    let state = initialState;
    const view = show(<><Home /><Probe on={(s) => { state = s; }} /></>);
    expect(await screen.findByText("Your level: Elementary")).toBeTruthy();
    const headings = () => screen.getAllByRole("heading", { level: 2 }).map((x) => x.textContent);
    await waitFor(() => expect(headings().slice(0, 2)).toEqual(["Course ai-two", "Course ai-three"]));
    expect(screen.getByText("Earlier levels (1)")).toBeTruthy();
    view.unmount();
    seed({ tracks: ["ai"], audience: "teachers", levels: { ai: 2 }, progress: { "ai-two-1": { done: true, accuracy: 1, xp: 30, seconds: 60, completedAt: "2026-10-28T00:00:00Z" } } });
    show(<><Home /><Probe on={(s) => { state = s; }} /></>);
    await waitFor(() => expect(state.levels.ai).toBe(3));
  });
});
