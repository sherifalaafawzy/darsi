// What one learner sees: their audience (teachers or students) and their tracks, one track on Home at a time.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { CatalogEntry } from "../src/content/types";
import { I18nProvider } from "../src/i18n";

const h = vi.hoisted(() => ({ stored: null as unknown, role: "learner", units: [] as unknown[] }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => h.stored, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ role: h.role, user: null, configured: false }) }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null, forgetSettings: () => {},
  loadCatalog: async () => ({ version: 1, units: h.units }),
  loadUnit: async (id: string) => ({ id, track: id.split("-")[0], level: 1, title: { en: `Course ${id}` }, summary: { en: "S" },
    lessons: [{ id: `${id}-1`, title: { en: "First lesson" }, minutes: 5, steps: [], tryTomorrow: { en: "T" }, slides: [], kit: [] }] }),
}));

const { audienceFor, activeTrack, myTracks, useMine } = await import("../src/content/mine");
const { BUILTIN_TRACKS } = await import("../src/content/tracks");
const { SettingsProvider } = await import("../src/content/settings");
const { StoreProvider, initialState, useStore } = await import("../src/state/store");
const { Home } = await import("../src/screens/Home");
const { MyTracks } = await import("../src/screens/MyTracks");
const { Onboarding } = await import("../src/screens/Onboarding");
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
