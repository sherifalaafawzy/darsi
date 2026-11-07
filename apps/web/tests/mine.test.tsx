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

const { audienceFor, activeTrack, myTracks, placeLevels, placeStart, useMine, stagesWithCourses } = await import("../src/content/mine");
const { teachSync } = await import("../src/content/types");
const ar = (await import("../src/i18n/ar.json")).default;
const { BUILTIN_TRACKS } = await import("../src/content/tracks");
const { SettingsProvider } = await import("../src/content/settings");
const { StoreProvider, initialState, isoWeek, useStore } = await import("../src/state/store");
const { Home } = await import("../src/screens/Home");
const { Me } = await import("../src/screens/Me");
const { MyTracks } = await import("../src/screens/MyTracks");
const { Onboarding, PlacementQuiz } = await import("../src/screens/Onboarding");
const { startAt } = await import("../src/screens/Home");
const { validateUnit } = await import("../src/content/validate");

const entry = (id: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({ id, track: id.split("-")[0], level: 1, title: { en: `Course ${id}` }, summary: { en: "S" },
  lessons: 1, sizeMB: 1, available: true, src: `content/units/${id}/v1.json`, version: 1, owner: "public", ...extra });
/** Courses at every level, for both audiences, so every school stage is offered. */
const everyStage = () => [1, 2, 3, 4].flatMap((l) => [entry(`ai-t${l}`, { level: l }), entry(`ai-s${l}`, { audience: "students", level: l })]);
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
    expect(myTracks(["gone"], BUILTIN_TRACKS).map((t) => t.id)).toEqual(BUILTIN_TRACKS.map((t) => t.id));
    const mine = myTracks(["ai", "cyber"], BUILTIN_TRACKS);
    expect(activeTrack("cyber", mine)).toBe("cyber");
    expect(activeTrack("iot", mine)).toBe("ai"); // removed since: back to the first
  });

  it("checks a course's audience", () => {
    const unit = { id: "u1", track: "ai", level: 1, title: { en: "T" }, summary: { en: "S" }, lessons: [{ id: "u1-1", title: { en: "L" }, minutes: 5, steps: [{ id: "r", type: "read", body: { en: "B" } }], tryTomorrow: { en: "T" }, slides: [], kit: [] }] };
    const audience = (a: unknown) => validateUnit({ ...unit, audience: a }).filter((i) => i.at.field === "audience");
    expect(audience("students")).toEqual([]);
    expect(audience("parents")).toMatchObject([{ code: "badValue" }]);
    const teach = (x: unknown) => validateUnit({ ...unit, teach: x }).filter((i) => i.at.field === "teach");
    expect(teach("university")).toEqual([]);
    expect(teach("school")).toMatchObject([{ code: "badValue" }]);
  });
});

describe("Home", () => {
  it("shows platform admins every course in every track at once, and opens one", async () => {
    h.role = "superadmin";
    h.units = [entry("ai-t"), entry("ai-s", { audience: "students", level: 2 }), entry("cyber-t"), entry("iot-s", { audience: "students" })];
    seed({ tracks: ["cyber"], audience: "teachers", track: "cyber" });
    show(<Home />);
    expect(await screen.findByRole("button", { name: "All tracks: change track" })).toBeTruthy();
    for (const name of ["Course ai-t", "Course ai-s", "Course cyber-t", "Course iot-s"]) expect(screen.getByText(name)).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).map((x) => x.textContent)).toEqual(["AI", "IoT", "Cyber security"]); // the platform's track order
    expect(screen.getAllByText("For students").length).toBe(2);
    // Nothing is loaded until a course is opened.
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    fireEvent.click(screen.getByText("Course cyber-t"));
    expect(await screen.findByRole("button", { name: "Start" })).toBeTruthy();
  });

  it("lets platform admins pick one track, and go back to all of them", async () => {
    h.role = "superadmin";
    h.units = [entry("ai-t"), entry("ai-s", { audience: "students", level: 2 }), entry("ai-u1", { level: 4, teach: "university" }), entry("cyber-t")];
    seed({ tracks: ["cyber"], audience: "teachers", track: "cyber" });
    let seen: ReturnType<typeof useMine> | null = null;
    let state = initialState;
    show(<><Home /><Probe on={(s, m) => { seen = m; state = s; }} /></>);
    fireEvent.click(await screen.findByRole("button", { name: "All tracks: change track" }));
    expect(screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent)).toEqual(["All tracks"]);
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(state).toMatchObject({ adminTrack: "ai", track: "cyber" }); // the learner's own pick is left alone
    await screen.findByRole("heading", { name: "Course ai-s" });
    await screen.findByRole("heading", { name: "Course ai-u1" });
    expect(screen.getByRole("heading", { name: "Course ai-t" })).toBeTruthy();
    expect(screen.getAllByText("For students").length).toBe(1);
    expect(screen.getAllByText("For university teachers").length).toBe(1);
    expect(screen.queryByText("Course cyber-t")).toBeNull();
    // Every track, hidden ones too, whatever they picked; Kit and Downloads take every course.
    expect(seen!.all).toBe(true);
    expect(seen!.tracks.map((t) => t.id)).toEqual(BUILTIN_TRACKS.map((t) => t.id));
    expect(seen!.isMine(entry("iot-x", { audience: "students" }))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "AI: change track" }));
    fireEvent.click(screen.getByRole("button", { name: "All tracks" }));
    expect(state.adminTrack).toBeUndefined();
    expect(await screen.findByText("Course cyber-t")).toBeTruthy();
  });

  it("keeps everyone else to their own audience and tracks", async () => {
    seed({ tracks: ["cyber"], audience: "teachers" });
    let seen: ReturnType<typeof useMine> | null = null;
    show(<Probe on={(_, m) => { seen = m; }} />);
    await waitFor(() => expect(seen).not.toBeNull());
    expect(seen!.all).toBe(false);
    expect(seen!.isMine(entry("cyber-x", { audience: "students" }))).toBe(false);
    expect(seen!.isMine(entry("ai-x"))).toBe(false);
  });

  it("pins university courses first for university teachers, and hides them from everyone else", async () => {
    h.units = [entry("ai-t"), entry("ai-u1", { level: 4, teach: "university" })];
    seed({ tracks: ["ai"], audience: "teachers", teach: "university" });
    const a = show(<Home />);
    await screen.findByRole("heading", { name: "Course ai-u1" });
    const names = () => screen.getAllByRole("heading").map((x) => x.textContent).filter((x) => x?.startsWith("Course "));
    expect(names()).toEqual(["Course ai-u1"]); // the school course is folded away, and isn't loaded until the fold opens
    fireEvent.click(screen.getByText("Earlier levels (1)"));
    await waitFor(() => expect(names()).toEqual(["Course ai-u1", "Course ai-t"]));
    a.unmount();
    // The old "secondary" (ages 12–18) is lower secondary, which does not see university courses.
    seed({ tracks: ["ai"], audience: "teachers", teach: "secondary" });
    let state = initialState;
    show(<><Home /><Probe on={(s) => { state = s; }} /></>);
    expect(await screen.findByRole("heading", { name: "Course ai-t" })).toBeTruthy();
    expect(screen.queryByText("Course ai-u1")).toBeNull();
    await waitFor(() => expect(state.teach).toBe("lower"));
  });

  it("starts a teacher at the level for where they teach, and keeps later courses in reach", async () => {
    h.units = [1, 2, 3, 4].map((level) => entry(`ai-${level}`, { level })).concat(entry("ai-u1", { level: 4, teach: "university" }));
    const headings = () => screen.getAllByRole("heading", { level: 2 }).map((x) => x.textContent);
    seed({ tracks: ["ai"], audience: "teachers", teach: "primary" });
    const primary = show(<Home />);
    expect(await screen.findByText("Your level: Beginner")).toBeTruthy();
    await waitFor(() => expect(headings()[0]).toBe("Course ai-1"));
    expect(screen.queryByText("Course ai-u1")).toBeNull();
    expect(screen.queryByText(/Earlier levels/)).toBeNull();
    primary.unmount();
    seed({ tracks: ["ai"], audience: "teachers", teach: "lower" });
    const lower = show(<Home />);
    expect(await screen.findByText("Your level: Elementary")).toBeTruthy();
    await waitFor(() => expect(headings().slice(0, 2)).toEqual(["Course ai-2", "Course ai-3"]));
    expect(screen.getByText("Earlier levels (1)")).toBeTruthy();
    expect(screen.queryByText("Course ai-u1")).toBeNull();
    lower.unmount();
    seed({ tracks: ["ai"], audience: "teachers", teach: "upper" });
    const upper = show(<Home />);
    expect(await screen.findByText("Your level: Intermediate")).toBeTruthy();
    await waitFor(() => expect(headings().slice(0, 2)).toEqual(["Course ai-3", "Course ai-4"]));
    expect(screen.getByText("Earlier levels (2)")).toBeTruthy();
    upper.unmount();
    seed({ tracks: ["ai"], audience: "teachers", teach: "university" });
    show(<Home />);
    // At the top level a university teacher's level is their university course. The school course at that level folds
    // away under its own name, not with the earlier levels.
    expect(await screen.findAllByText("Your level: Advanced")).toHaveLength(1);
    await waitFor(() => expect(headings()[0]).toBe("Course ai-u1"));
    expect(screen.getByText("Earlier levels (3)")).toBeTruthy();
    expect(screen.getByText("Also at your level, for school teachers (1)")).toBeTruthy();
  });

  it("says the weekly goal is met rather than \"5 of 4\", in Arabic with the right plural", async () => {
    seed({ tracks: ["ai"], audience: "teachers", weeklyLessons: 4, weeks: { [isoWeek()]: 3 } });
    const a = show(<Home />);
    expect(await screen.findByText("This week: 3 of 4 lessons")).toBeTruthy();
    a.unmount();
    seed({ tracks: ["ai"], audience: "teachers", weeklyLessons: 4, weeks: { [isoWeek()]: 5 } });
    const b = show(<Home />);
    expect(await screen.findByText("This week: 5 lessons, goal met")).toBeTruthy();
    b.unmount();
    seed({ tracks: ["ai"], audience: "teachers", weeklyLessons: 2, weeks: { [isoWeek()]: 2 }, lang: "ar" });
    render(<I18nProvider lang="ar"><SettingsProvider lang="ar"><StoreProvider><MemoryRouter><Home /></MemoryRouter></StoreProvider></SettingsProvider></I18nProvider>);
    expect(await screen.findByText("هذا الأسبوع: درسان، تحقّق الهدف")).toBeTruthy();
  });

  it("starts the earlier levels folded again on another track", async () => {
    h.units = [entry("ai-1"), entry("ai-2", { level: 2 }), entry("cyber-1"), entry("cyber-2", { level: 2 })];
    seed({ tracks: ["ai", "cyber"], audience: "teachers", levels: { ai: 2, cyber: 2 } });
    show(<Home />);
    fireEvent.click(await screen.findByText("Earlier levels (1)"));
    expect(await screen.findByRole("heading", { name: "Course ai-1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "AI: change track" }));
    fireEvent.click(screen.getByRole("button", { name: "Cyber security" }));
    expect(await screen.findByRole("heading", { name: "Course cyber-2" })).toBeTruthy();
    expect((screen.getByText("Earlier levels (1)").closest("details") as HTMLDetailsElement).open).toBe(false);
    expect(screen.queryByRole("heading", { name: "Course cyber-1" })).toBeNull();
  });

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
    fireEvent.click(screen.getByRole("checkbox", { name: /^AI(?! (agents|security))/ }));
    expect(screen.getByRole("status").textContent).toBe("Keep at least one track.");
    expect(state.tracks).toEqual(["ai"]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Cyber security/ }));
    expect(state).toMatchObject({ tracks: ["ai", "cyber"], track: "cyber" });
    fireEvent.click(screen.getByRole("checkbox", { name: /^AI(?! (agents|security))/ }));
    expect(state.tracks).toEqual(["cyber"]);
  });
});

describe("where a teacher teaches", () => {
  it("names the four places in Arabic without a middot", () => {
    for (const k of ["onb.teach", "onb.teachBody", "onb.teacherD", "me.teach", "onb.placementBody"] as const) {
      expect(ar[k], k).toBeTruthy();
      expect(ar[k], k).not.toContain("·");
    }
  });

  it("copies a place onto an empty phone, writes a choice, and does nothing until the profile is read", () => {
    expect(teachSync(undefined, "university", false)).toEqual({});
    expect(teachSync("upper", undefined, false)).toEqual({});
    expect(teachSync(undefined, "university", true)).toEqual({ pull: "university" });
    expect(teachSync(undefined, "secondary", true)).toEqual({ pull: "lower", push: "lower" });
    expect(teachSync("lower", "secondary", true)).toEqual({});
    expect(teachSync("upper", "primary", true)).toEqual({ push: "upper" });
    expect(teachSync("upper", "upper", true)).toEqual({});
  });

  it("lets a teacher change where they teach in Me", async () => {
    h.units = [...h.units, ...everyStage()];
    seed({ tracks: ["ai"], audience: "teachers", teach: "primary" });
    let state = initialState;
    show(<><Me /><Probe on={(s) => { state = s; }} /></>);
    expect(await screen.findByRole("heading", { name: "Where I teach" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Where I study" })).toBeNull();
    await waitFor(() => expect(state.teach).toBe("primary"));
    expect(screen.getByRole("radio", { name: /Primary school/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: /University or college/ }));
    expect(state.teach).toBe("university");
  });
});

describe("Onboarding", () => {
  it("asks teacher or student, and a student goes on to choose tracks", async () => {
    h.units = [...h.units, ...everyStage()];
    h.stored = { ...initialState, lang: "en" };
    let state = initialState;
    show(<><Onboarding /><Probe on={(s) => { state = s; }} /></>);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Who are you?" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /A student/ }));
    expect(state.audience).toBe("students");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Where do you study?" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Upper secondary/ }));
    expect(state.stage).toBe("upper");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "What do you want to learn?" })).toBeTruthy();
  });

  it("asks a teacher where they teach, and will not continue until they choose", async () => {
    h.units = [...h.units, ...everyStage()];
    h.stored = { ...initialState, lang: "en" };
    let state = initialState;
    show(<><Onboarding /><Probe on={(s) => { state = s; }} /></>);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("radio", { name: /A teacher/ }));
    expect(state.audience).toBe("teachers");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Where do you teach?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Lower secondary/ }));
    expect(state.teach).toBe("lower");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "What do you want to learn?" })).toBeTruthy();
  });

  it("asks a school's student accounts where they study, and its teachers where they teach", async () => {
    h.role = "student";
    h.stored = { ...initialState, lang: "en" };
    const students = show(<Onboarding />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Where do you study?" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Who are you?" })).toBeNull();
    students.unmount();
    h.role = "teacher";
    h.stored = { ...initialState, lang: "en" };
    show(<Onboarding />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Where do you teach?" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Who are you?" })).toBeNull();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("starting at your level", () => {
  const q = (track: string, audience: string, level: number, n: number) => ({ id: `${track}-${audience}-${level}-${n}`, track, audience, level, type: "choice",
    prompt: { en: `${track} ${audience} level ${level} question ${n}` }, options: [{ id: "a", text: { en: "right" } }, { id: "b", text: { en: "wrong" } }], answer: "a", explain: { en: "E" } });
  beforeEach(() => {
    h.placement = { version: 2, questions: ["ai", "cyber"].flatMap((tr) => ["teachers", "students"].flatMap((au) => [1, 2, 3, 4].flatMap((lv) => [1, 2, 3].map((n) => q(tr, au, lv, n))))) };
    h.units = everyStage(); // a course at every level for both audiences in AI: the check may place anywhere
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
    expect(done).toHaveBeenCalledWith({ ai: 2 }, 1); // and one track asked about
  });

  it("puts focus on each question, since Continue goes disabled with the last one", async () => {
    seed({ tracks: ["ai", "cyber"], audience: "students" });
    show(<PlacementQuiz tracks={["ai"]} onDone={vi.fn()} />);
    const first = await screen.findByRole("heading", { name: /^ai students level 1 question/ });
    expect(document.activeElement).toBe(first);
    await answer(true);
    const second = screen.getAllByRole("heading", { name: /^ai students level 1 question/ })[0];
    expect(second).not.toBe(first);
    expect(document.activeElement).toBe(second);
  });

  it("shows a question's code above its answers", async () => {
    h.placement = { version: 2, questions: [1, 2, 3].map((n) => ({ ...q("ai", "students", 1, n), snippet: { lang: "python", text: "best = 0\nprint(best)" } })) };
    seed({ tracks: ["ai"], audience: "students" });
    show(<PlacementQuiz tracks={["ai"]} onDone={vi.fn()} />);
    const code = await screen.findByLabelText("Code");
    expect(code.getAttribute("dir")).toBe("ltr");
    expect(code.textContent).toContain("print(best)");
  });

  it("starts a student at their school stage, and moves down when that level is new to them", async () => {
    seed({ tracks: ["ai", "cyber"], audience: "students", stage: "upper" });
    const done = vi.fn();
    show(<PlacementQuiz tracks={["ai"]} onDone={done} />);
    expect(await screen.findByText(/^ai students level 3 question/)).toBeTruthy();
    await answer(false); // level 3 is new
    expect(screen.getByText(/^ai students level 2 question/)).toBeTruthy();
    await answer(true); await answer(true); // level 2 known: start at 3
    expect(done).toHaveBeenCalledWith({ ai: 3 }, 1);
  });

  it("starts a student at their stage's course without the check, with the stage beside the level", async () => {
    h.units = [entry("ai-s", { audience: "students" }), entry("ai-s3", { level: 3, audience: "students" })];
    seed({ tracks: ["ai"], audience: "students", stage: "upper" });
    show(<Home />);
    expect(await screen.findByText("Your level: Intermediate · Upper secondary")).toBeTruthy();
  });

  describe("agrees with Home on what is offered (only university-level courses live)", () => {
    // The live catalog of 2026-11: teachers' Advanced and university courses, and students' upper-secondary and Advanced ones.
    const live = () => [entry("ai-4-1", { level: 4 }), entry("ai-u1", { level: 4, teach: "university" }),
      entry("code-s3", { level: 3, audience: "students" }), entry("code-s4", { level: 4, audience: "students" })];
    beforeEach(() => {
      h.units = live();
      h.placement = { version: 2, questions: [...h.placement.questions, ...["teachers", "students"].flatMap((au) => [1, 2, 3, 4].flatMap((lv) => [1, 2, 3].map((n) => q("code", au, lv, n))))] };
    });
    /** Onboarding from the language step to the check's result, with the answers already chosen in the store. */
    const toResult = async (answers: "dontKnow" | "right") => {
      const next = async () => { const b = await screen.findByRole("button", { name: "Continue" }); await waitFor(() => expect((b as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(b); };
      for (let i = 0; i < 5; i++) await next(); // language, who, where, tracks, time
      fireEvent.click(await screen.findByRole("button", { name: "Start the check" }));
      const result = () => screen.queryByRole("heading", { name: "Here’s where you start" });
      for (;;) {
        await waitFor(() => expect(result() ?? screen.queryByRole("button", { name: "I don’t know yet" })).toBeTruthy());
        if (result()) return result();
        if (answers === "right") throw new Error("asked a question that couldn't move the learner");
        fireEvent.click(screen.getByRole("button", { name: "I don’t know yet" }));
      }
    };

    it("places a university teacher who misses everything at the university courses, not at a Beginner course nobody has", async () => {
      h.stored = { ...initialState, lang: "en", audience: "teachers", teach: "university", tracks: ["ai"] };
      let state = initialState;
      const view = show(<><Onboarding /><Probe on={(s) => { state = s; }} /></>);
      await toResult("dontKnow");
      expect(screen.queryByText(/^ai teachers level [123]/)).toBeNull(); // never walked down into school-teacher questions
      expect(screen.getByText("No questions were needed: these are the levels with courses for you now.")).toBeTruthy();
      expect(screen.getByText("Advanced")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Start learning" }));
      await waitFor(() => expect(state).toMatchObject({ onboarded: true, levels: { ai: 4 } }));
      view.unmount();
      h.stored = state;
      show(<Home />);
      expect(await screen.findByText("Your level: Advanced")).toBeTruthy();
      expect(screen.queryByText(/so start here/)).toBeNull();
    });

    it("never calls a university student who misses a track a primary pupil, and Home starts where the check said", async () => {
      h.stored = { ...initialState, lang: "en", audience: "students", stage: "university", tracks: ["code"] };
      let state = initialState;
      const view = show(<><Onboarding /><Probe on={(s) => { state = s; }} /></>);
      await toResult("dontKnow");
      expect(screen.getByText("Intermediate")).toBeTruthy(); // the lowest level with a course for them, without another stage's name
      expect(screen.queryByText(/Primary|Beginner|Upper secondary/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Start learning" }));
      await waitFor(() => expect(state.levels).toEqual({ code: 3 }));
      view.unmount();
      h.stored = state;
      show(<Home />);
      expect(await screen.findByText("Your level: Intermediate")).toBeTruthy();
    });

    it("keeps an upper-secondary student at their own stage, its course first, and the university one above it", async () => {
      h.stored = { ...initialState, lang: "en", audience: "students", stage: "upper", tracks: ["code"] };
      let state = initialState;
      const view = show(<><Onboarding /><Probe on={(s) => { state = s; }} /></>);
      await toResult("right"); // nothing to ask: one level for them
      expect(screen.getByText("Intermediate · Upper secondary")).toBeTruthy();
      expect(screen.queryByText(/University or college/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Start learning" }));
      await waitFor(() => expect(state.levels).toEqual({ code: 3 }));
      view.unmount();
      h.stored = state;
      show(<Home />);
      expect(await screen.findByText("Your level: Intermediate · Upper secondary")).toBeTruthy();
      const headings = () => screen.getAllByRole("heading", { level: 2 }).map((x) => x.textContent);
      await waitFor(() => expect(headings().slice(0, 2)).toEqual(["Course code-s3", "Course code-s4"]));
      expect(screen.queryByText(/Earlier levels/)).toBeNull();
    });
  });

  it("knows the levels the check may place at: courses for the learner, a student no higher than their stage", () => {
    const units = [entry("ai-t1", { level: 1 }), entry("ai-4-1", { level: 4 }), entry("ai-u1", { level: 4, teach: "university" }), entry("ai-gone", { level: 2, available: false }),
      entry("ai-s3", { level: 3, audience: "students" }), entry("ai-s4", { level: 4, audience: "students" })];
    const teacher = { audience: "teachers" as const, uni: false };
    expect(placeLevels(units, "ai", 4, teacher)).toEqual([1, 4]); // not 2: unpublished
    expect(placeLevels(units, "ai", 4, { ...teacher, uni: true, stage: "university" as const })).toEqual([1, 4]);
    expect(placeLevels([entry("ai-u1", { level: 4, teach: "university" })], "ai", 4, teacher)).toEqual([1, 2, 3, 4]); // none for them: every level
    expect(placeLevels(units, "ai", 4, { audience: "students", uni: false, stage: "upper" })).toEqual([3]);
    expect(placeLevels(units, "ai", 4, { audience: "students", uni: false, stage: "university" })).toEqual([3, 4]);
    expect(placeLevels(units, "ai", 4, { audience: "students", uni: false, stage: "primary" })).toEqual([3]); // nothing at or below: the lowest
    expect(placeLevels(undefined, "ai", 4, { audience: "students", uni: false, stage: "lower" })).toEqual([1, 2]); // no catalog yet
    expect(placeStart([3, 4], 1)).toBe(3);
    expect(placeStart([1, 2], 4)).toBe(2);
    expect(placeStart([1, 4], 4)).toBe(4);
  });

  it("starts a teacher at the level for where they teach", async () => {
    seed({ tracks: ["ai"], audience: "teachers", teach: "upper" });
    const done = vi.fn();
    show(<PlacementQuiz tracks={["ai"]} onDone={done} />);
    expect(await screen.findByText(/^ai teachers level 3 question/)).toBeTruthy();
    await answer(false);
    expect(screen.getByText(/^ai teachers level 2 question/)).toBeTruthy();
    await answer(true); await answer(true);
    expect(done).toHaveBeenCalledWith({ ai: 3 }, 1);
  });

  it("checks each of your tracks in turn, and \"I don't know yet\" ends a track", async () => {
    seed({ tracks: ["ai", "cyber"], audience: "teachers" });
    const done = vi.fn();
    show(<PlacementQuiz onDone={done} />);
    expect(await screen.findByText(/^ai teachers level 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "I don’t know yet" }));
    expect(await screen.findByText(/^cyber teachers level 1/)).toBeTruthy();
    for (let i = 0; i < 8; i++) await answer(true); // every level passed
    expect(done).toHaveBeenCalledWith({ ai: 1, cyber: 4 }, 2);
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

describe("stages with courses", () => {
  it("offers a stage only when a published course is written for it", () => {
    const units = [entry("ai-s1", { audience: "students", level: 1 }), entry("ai-s4", { audience: "students", level: 4 }), entry("ai-2-1", { level: 2 }),
      entry("ai-u1", { level: 4, teach: "university" }), entry("ai-s2", { audience: "students", level: 2, available: false })];
    expect(stagesWithCourses(units, "students")).toEqual(["primary", "university"]);
    expect(stagesWithCourses(units, "teachers")).toEqual(["lower", "university"]); // the university courses count for university
    expect(stagesWithCourses(units, "students", new Set(["cyber"]))).toEqual(["primary", "lower", "upper", "university"]); // no course in a visible track: every stage
    expect(stagesWithCourses(undefined, "teachers")).toHaveLength(4); // no catalog yet (or offline)
  });

  it("onboarding and Me show only stages that have courses (only university courses published)", async () => {
    h.units = [entry("ai-s4", { audience: "students", level: 4 }), entry("ai-u1", { level: 4, teach: "university" })];
    h.stored = { ...initialState, lang: "en" };
    const onb = show(<Onboarding />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("radio", { name: /A teacher/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual([expect.stringMatching(/^University or college/)]));
    onb.unmount();
    seed({ audience: "students", stage: "primary" }); // chose primary before its courses were unpublished
    show(<Me />);
    const group = await screen.findByRole("radiogroup", { name: "Where I study" });
    await waitFor(() => expect(group.querySelectorAll("[role=radio]")).toHaveLength(1));
    expect(group.textContent).toMatch(/University or college/);
    h.units = [];
  });
});
