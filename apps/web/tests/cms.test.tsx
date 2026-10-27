import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import ai1 from "../../../content/units/ai-1.json";
import type { TrackDef, Unit } from "../src/content/types";
import { mergeTracks } from "../src/content/tracks";
import { I18nProvider } from "../src/i18n";
import { StoreProvider } from "../src/state/store";

// The course editor reads and saves through cms/data (Firestore) and publishes through cms/api (Cloud Functions);
// both are fakes here, so the screens can be checked without the emulators.
const m = vi.hoisted(() => ({
  auth: { user: { uid: "me" }, role: "superadmin", orgId: null as string | null },
  list: [] as unknown[],
  got: null as unknown,
  data: { listUnits: vi.fn(), getUnit: vi.fn(), createUnit: vi.fn(), saveUnit: vi.fn(), unitExists: vi.fn(), copyLessonTo: vi.fn(), getSettings: vi.fn(), unitsByTrack: vi.fn(),
    listTranslations: vi.fn(), getTranslation: vi.fn(), createTranslation: vi.fn(), saveTranslation: vi.fn(), deleteTranslation: vi.fn() },
  api: { publishUnit: vi.fn(), unpublishUnit: vi.fn(), deleteUnit: vi.fn(), saveSettings: vi.fn(), publishLanguage: vi.fn(), unpublishLanguage: vi.fn() },
}));
vi.mock("../src/firebase", () => ({ db: {}, storage: vi.fn() }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/cms/data", async (orig) => ({ ...(await orig<typeof import("../src/cms/data")>()), ...m.data }));
vi.mock("../src/cms/api", async (orig) => ({ ...(await orig<typeof import("../src/cms/api")>()), cmsApi: m.api }));

const { ContentList } = await import("../src/cms/ContentList");
const { UnitEditor: Editor } = await import("../src/cms/UnitEditor");
const { TracksPage, slugOf } = await import("../src/cms/TracksPage");
const { LanguagesPage, TranslatePage } = await import("../src/cms/LanguagesPage");
const { setLanguages, useLanguages } = await import("../src/i18n");
const { LessonPlayer } = await import("../src/screens/LessonScreen");
const UnitEditor = () => <Editor Player={LessonPlayer} />; // App passes the player the same way
const { parseFill } = await import("../src/cms/steps");

const unit = () => structuredClone(ai1) as unknown as Unit;
const meta = (u: Unit, extra = {}) => ({ id: u.id, owner: "public", title: u.title, track: u.track, level: u.level, lessonCount: u.lessons.length,
  lessons: u.lessons.map((l) => ({ id: l.id, title: l.title })), rev: 3, published: { version: 1, rev: 3 }, ...extra });
const wrap = (ui: ReactNode, url: string, path: string) => render(
  <StoreProvider><I18nProvider lang="en"><MemoryRouter initialEntries={[url]}><Routes><Route path={path} element={ui} /><Route path="*" element={<p>elsewhere</p>} /></Routes></MemoryRouter></I18nProvider></StoreProvider>);
const outline = () => screen.findByRole("navigation", { name: "Outline" });
const saved = () => m.data.saveUnit.mock.calls[m.data.saveUnit.mock.calls.length - 1][0] as Unit;
const openEditor = async () => {
  const u = unit(); m.got = { meta: meta(u), unit: u };
  wrap(<UnitEditor />, "/super/content/ai-1", "/super/content/:unitId");
  return outline();
};

beforeAll(() => { Element.prototype.scrollIntoView = () => {}; }); // jsdom has no layout
beforeEach(() => {
  vi.clearAllMocks();
  m.auth = { user: { uid: "me" }, role: "superadmin", orgId: null };
  m.data.listUnits.mockImplementation(async () => m.list);
  m.data.getUnit.mockImplementation(async () => m.got);
  m.data.createUnit.mockResolvedValue(undefined);
  m.data.saveUnit.mockResolvedValue({ rev: 4 });
  m.data.unitExists.mockResolvedValue(false);
});

describe("ContentList", () => {
  const three = () => {
    const u = unit();
    return [meta(u), meta({ ...u, id: "u12345678", track: "cyber", title: { en: "Phishing basics" }, lessons: [] }, { published: null }),
      meta({ ...u, id: "u87654321", track: "iot", level: 2, title: { en: "Sensors" }, lessons: [] }, { published: { version: 2, rev: 1 } })];
  };

  it("lists the platform's units by track, with their status and lesson titles", async () => {
    m.list = three();
    wrap(<ContentList />, "/super/content", "/super/content");
    expect(await screen.findByText("AI basics for teachers")).toBeTruthy();
    expect(m.data.listUnits).toHaveBeenCalledWith("public");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent?.split("Units")[0])).toEqual(["AI", "IoT", "Cyber security"]);
    expect(screen.getByText("Published (v1)")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByText("Changes not published (v2 is live)")).toBeTruthy();
    expect(screen.getByText("How chatbots write")).toBeTruthy();
  });

  it("filters by status and searches lesson titles", async () => {
    m.list = three();
    wrap(<ContentList />, "/super/content", "/super/content");
    fireEvent.click(await screen.findByRole("button", { name: "Drafts" }));
    expect(screen.getByText("Phishing basics")).toBeTruthy();
    expect(screen.queryByText("Sensors")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Any" }));
    fireEvent.change(screen.getByLabelText("Search unit and lesson titles"), { target: { value: "chatbots" } });
    expect(screen.getByText("AI basics for teachers")).toBeTruthy();
    expect(screen.queryByText("Phishing basics")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search unit and lesson titles"), { target: { value: "nothing like this" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(screen.getByText("Sensors")).toBeTruthy();
  });

  it("duplicates a unit under new ids, and deletes one after asking", async () => {
    m.list = three(); m.got = { meta: three()[0], unit: unit() };
    m.api.deleteUnit.mockResolvedValue({ ok: true });
    wrap(<ContentList />, "/super/content", "/super/content");
    await screen.findByText("AI basics for teachers");
    fireEvent.click(screen.getAllByRole("button", { name: "Duplicate" })[0]);
    await waitFor(() => expect(m.data.createUnit).toHaveBeenCalled());
    const [owner, copy] = m.data.createUnit.mock.calls[0];
    expect(owner).toBe("public");
    expect(copy.id).toMatch(/^u[a-z0-9]{8}$/);
    expect(copy.title.en).toBe("AI basics for teachers (copy)");
    expect(copy.lessons.every((l: { id: string }) => l.id.startsWith(`${copy.id}-`))).toBe(true);
    expect(await screen.findByText("AI basics for teachers (copy)", { selector: "bdi" })).toBeTruthy();

    const card = screen.getByText("Sensors").closest("li")!;
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Delete unit" }));
    expect(m.api.deleteUnit).not.toHaveBeenCalled();
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Delete for good" }));
    await waitFor(() => expect(m.api.deleteUnit).toHaveBeenCalledWith({ unitId: "u87654321" }));
    await waitFor(() => expect(screen.queryByText("Sensors")).toBeNull());
  });

  it("creates a new unit for the platform with a generated id and one lesson", async () => {
    wrap(<ContentList />, "/super/content", "/super/content");
    fireEvent.click(await screen.findByRole("button", { name: "New unit" }));
    fireEvent.change(screen.getAllByLabelText(/Title/)[0], { target: { value: "Data and privacy" } });
    fireEvent.click(screen.getByRole("radio", { name: /^Cyber security/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Level 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Create unit" }));
    await waitFor(() => expect(m.data.createUnit).toHaveBeenCalled());
    const [owner, created, uid] = m.data.createUnit.mock.calls[0];
    expect(owner).toBe("public"); expect(uid).toBe("me");
    expect(created.id).toMatch(/^u[a-z0-9]{8}$/);
    expect(created).toMatchObject({ title: { en: "Data and privacy" }, track: "cyber", level: 3 });
    expect(created.lessons).toHaveLength(1);
    expect(created.lessons[0].id.startsWith(`${created.id}-`)).toBe(true);
  });

  it("imports a unit for an org with fresh ids", async () => {
    m.auth = { user: { uid: "me" }, role: "orgAdmin", orgId: "org1" };
    wrap(<ContentList />, "/admin/content", "/admin/content");
    fireEvent.click(await screen.findByRole("button", { name: "Import JSON" }));
    fireEvent.change(screen.getByLabelText("Or paste the JSON"), { target: { value: JSON.stringify(ai1) } });
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    expect(await screen.findByText(/3 lessons, with 0 errors and 0 warnings/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Import and open" }));
    await waitFor(() => expect(m.data.createUnit).toHaveBeenCalled());
    const [owner, created] = m.data.createUnit.mock.calls[0];
    expect(owner).toBe("org1");
    expect(created.id).toMatch(/^u[a-z0-9]{8}$/);
    expect(created.lessons.every((l: { id: string }) => l.id.startsWith(`${created.id}-`))).toBe(true);
    expect(m.data.listUnits).toHaveBeenCalledWith("org1");
    expect(screen.queryByRole("button", { name: "Tracks and levels" })).toBeNull(); // platform admins only
  });

  it("refuses bad JSON", async () => {
    wrap(<ContentList />, "/super/content", "/super/content");
    fireEvent.click(await screen.findByRole("button", { name: "Import JSON" }));
    fireEvent.change(screen.getByLabelText("Or paste the JSON"), { target: { value: "{ nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    expect(await screen.findByText("This isn't valid JSON.")).toBeTruthy();
  });
});

describe("UnitEditor", () => {
  it("publishes a valid unit", async () => {
    m.api.publishUnit.mockResolvedValue({ version: 2 });
    const nav = await openEditor();
    fireEvent.click(within(nav).getByRole("button", { name: /Checks/ }));
    expect(await screen.findByText("No errors: ready to publish")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(m.api.publishUnit).toHaveBeenCalledWith({ unitId: "ai-1" }));
    expect(await screen.findByText(/Published as version 2/)).toBeTruthy();
  });

  it("blocks Publish while there are errors and jumps to the step from the checks list", async () => {
    const u = unit(); const q = u.lessons[0].steps.find((s) => s.type === "choice") as { answer: string }; q.answer = "zzz";
    m.got = { meta: meta(u), unit: u };
    wrap(<UnitEditor />, "/super/content/ai-1", "/super/content/:unitId");
    fireEvent.click(await screen.findByRole("button", { name: "Fix the errors (1) to publish" }));
    expect((screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText("Errors to fix before publishing: 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /The answer must be one of the options/ }));
    expect(await screen.findByLabelText("Correct answer")).toBeTruthy(); // the choice step's form is open
    expect(screen.getByRole("heading", { name: "Step 3: Choose one" })).toBeTruthy();
  });

  it("saves edits, and reports when someone else saved first", async () => {
    m.data.saveUnit.mockResolvedValueOnce({ rev: 4 }).mockResolvedValueOnce({ conflict: true });
    await openEditor();
    const title = screen.getAllByLabelText(/Title/)[0];
    fireEvent.change(title, { target: { value: "AI basics, revised" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(m.data.saveUnit).toHaveBeenCalledWith(expect.objectContaining({ title: expect.objectContaining({ en: "AI basics, revised" }) }), 3, "me"));
    expect(await screen.findByText("Draft saved.")).toBeTruthy();
    fireEvent.change(title, { target: { value: "AI basics, again" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(m.data.saveUnit).toHaveBeenLastCalledWith(expect.anything(), 4, "me"));
    expect(await screen.findByText(/Someone else saved this unit/)).toBeTruthy();
  });

  it("picks the track and a level that track has", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("radio", { name: "Level 4" }));
    fireEvent.click(screen.getByRole("radio", { name: /^IoT/ }));
    expect(screen.getByRole("radio", { name: /^IoT/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saved()).toMatchObject({ track: "iot", level: 4 }));
  });

  it("adds a step between two others, from the kinds of step", async () => {
    const nav = await openEditor();
    fireEvent.click(within(nav).getByRole("button", { name: /Is it AI\?/ }));
    fireEvent.click(within(nav).getAllByRole("button", { name: "Add a step here" })[2]);
    fireEvent.click(await screen.findByRole("button", { name: /^True or false/ }));
    expect(screen.getByRole("heading", { name: "Step 3: True or false" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(m.data.saveUnit).toHaveBeenCalled());
    expect(saved().lessons[0].steps.map((s) => s.id).slice(0, 4)).toEqual(["v", "read", "truefalse1", "q1"]);
  });

  it("duplicates a lesson under a new id", async () => {
    const nav = await openEditor();
    fireEvent.click(within(nav).getByRole("button", { name: /Is it AI\?/ }));
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(await within(nav).findByRole("button", { name: /Is it AI\? \(copy\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(m.data.saveUnit).toHaveBeenCalled());
    const [first, copy] = saved().lessons;
    expect(copy.id).not.toBe(first.id);
    expect(copy.id.startsWith("ai-1-")).toBe(true);
    expect(copy.title.en).toBe("Is it AI? (copy)");
    expect(copy.steps).toEqual(first.steps);
  });

  it("deletes a step without asking, and Undo brings it back", async () => {
    const nav = await openEditor();
    fireEvent.click(within(nav).getByRole("button", { name: /Is it AI\?/ }));
    fireEvent.click(within(nav).getByRole("button", { name: /Choose one/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete step" }));
    expect(await screen.findByText("Step deleted.")).toBeTruthy();
    expect(within(nav).queryByRole("button", { name: /Choose one/ })).toBeNull();
    fireEvent.click(within(screen.getByText("Step deleted.").parentElement!).getByRole("button", { name: "Undo" }));
    expect(await within(nav).findByRole("button", { name: /Choose one/ })).toBeTruthy();
  });

  it("undoes typing with Ctrl+Z and redoes it with Ctrl+Y", async () => {
    await openEditor();
    fireEvent.change(screen.getAllByLabelText(/Title/)[0], { target: { value: "A" } });
    fireEvent.change(screen.getAllByLabelText(/Title/)[0], { target: { value: "AB" } });
    act(() => { fireEvent.keyDown(window, { key: "z", ctrlKey: true }); });
    await waitFor(() => expect((screen.getAllByLabelText(/Title/)[0] as HTMLInputElement).value).toBe("AI basics for teachers"));
    act(() => { fireEvent.keyDown(window, { key: "y", ctrlKey: true }); });
    await waitFor(() => expect((screen.getAllByLabelText(/Title/)[0] as HTMLInputElement).value).toBe("AB"));
  });

  it("copies a lesson into another unit", async () => {
    const u = unit();
    m.list = [meta(u), meta({ ...u, id: "u12345678", title: { en: "Sensors" } })];
    m.data.copyLessonTo.mockResolvedValue({ title: { en: "Sensors" } });
    const nav = await openEditor();
    fireEvent.click(within(nav).getByRole("button", { name: /How chatbots write/ }));
    fireEvent.click(screen.getByRole("button", { name: "Copy to another unit" }));
    expect(await screen.findByRole("option", { name: /Sensors/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy lesson" }));
    await waitFor(() => expect(m.data.copyLessonTo).toHaveBeenCalledWith("u12345678", expect.objectContaining({ id: "ai-1-2" }), "me"));
    expect(await screen.findByText("Copied to Sensors.")).toBeTruthy();
  });

  it("asks before leaving with unsaved changes", async () => {
    await openEditor();
    fireEvent.change(screen.getAllByLabelText(/Title/)[0], { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText(/Leave without saving\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.queryByText(/Leave without saving\?/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave without saving" }));
    expect(await screen.findByText("elsewhere")).toBeTruthy();
    expect(m.data.saveUnit).not.toHaveBeenCalled();
  });

  it("previews the open lesson without recording anything", async () => {
    const nav = await openEditor();
    fireEvent.click(within(nav).getByRole("button", { name: /Is it AI\?/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview" }));
    const dialog = await screen.findByRole("dialog", { name: "Preview" });
    expect(within(dialog).getAllByText("What makes something AI?").length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "العربية" }));
    expect((await within(dialog).findAllByText("ما الذي يجعل الشيء ذكاءً اصطناعيًا؟")).length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("TracksPage", () => {
  const data: TrackDef = { id: "data", name: { en: "Data science", ar: "علم البيانات" }, icon: "chart", tone: "leaf", levels: 6, order: 3 };
  beforeEach(() => {
    m.data.getSettings.mockResolvedValue({ rev: 2, tracks: mergeTracks([data]) });
    m.data.unitsByTrack.mockResolvedValue(new Map([["data", [{ id: "u1", title: { en: "Charts" }, level: 5 }]]]));
  });
  const page = async () => { wrap(<TracksPage />, "/super/tracks", "/super/tracks"); return screen.findByRole("button", { name: /Data science/ }); };

  it("adds a track with a suggested id and saves the whole list", async () => {
    m.api.saveSettings.mockImplementation(async ({ tracks }: { tracks: TrackDef[] }) => ({ rev: 3, tracks }));
    await page();
    fireEvent.click(screen.getByRole("button", { name: "Add a track" }));
    fireEvent.change(screen.getAllByLabelText(/^Name/)[0], { target: { value: "Robotics club" } });
    expect((screen.getByLabelText("Id") as HTMLInputElement).value).toBe("robotics-club");
    fireEvent.click(screen.getByRole("radio", { name: /^Purple/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Science" }));
    fireEvent.click(screen.getByRole("button", { name: "More levels" }));
    fireEvent.click(screen.getByRole("button", { name: "Save tracks" }));
    await waitFor(() => expect(m.api.saveSettings).toHaveBeenCalled());
    const { rev, tracks } = m.api.saveSettings.mock.calls[0][0];
    expect(rev).toBe(2);
    expect(tracks.map((t: TrackDef) => t.id)).toEqual(["ai", "iot", "cyber", "data", "robotics-club"]);
    expect(tracks[4]).toMatchObject({ name: { en: "Robotics club" }, tone: "lilac", icon: "flask", levels: 5, order: 4 });
    expect(tracks.some((t: TrackDef) => "builtIn" in t)).toBe(false);
    expect(await screen.findByText(/Saved\. Phones get the new tracks/)).toBeTruthy();
    expect(screen.getAllByText("Built-in")).toHaveLength(3); // the saved list comes back without the marks
  });

  it("keeps the levels and the track that units use", async () => {
    fireEvent.click(await page());
    expect(screen.getByText("Units use this track. Move them to another track before deleting it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete track" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fewer levels" }));
    expect((screen.getByRole("button", { name: "Fewer levels" }) as HTMLButtonElement).disabled).toBe(true); // units use level 5
  });

  it("explains a refused save", async () => {
    m.api.saveSettings.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "functions/failed-precondition", details: { conflicts: [{ track: "data", reason: "levels", units: ["u1"] }] } }))
      .mockRejectedValueOnce(Object.assign(new Error("x"), { code: "functions/aborted", details: { conflict: true } }));
    fireEvent.click(await page());
    fireEvent.click(screen.getByRole("switch", { name: "Hide from learners" }));
    fireEvent.click(screen.getByRole("button", { name: "Save tracks" }));
    expect(await screen.findByText("Not saved: units still use what you changed.")).toBeTruthy();
    expect(screen.getByText("Data science: these units use higher levels: Charts.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save tracks" }));
    expect(await screen.findByText(/Someone else saved the tracks/)).toBeTruthy();
  });

  it("refuses to save a track without a name", async () => {
    await page();
    fireEvent.click(screen.getByRole("button", { name: "Add a track" }));
    fireEvent.click(screen.getByRole("button", { name: "Save tracks" }));
    expect(await screen.findByText(/Fix the marked fields first/)).toBeTruthy();
    expect(m.api.saveSettings).not.toHaveBeenCalled();
  });

  it("suggests ids from names", () => {
    expect(slugOf("Data science")).toBe("data-science");
    expect(slugOf("  3D Printing & Design ")).toBe("track-3d-printing-design");
    expect(slugOf("Électronique")).toBe("electronique");
    expect(slugOf("علوم")).toBe("");
  });
});

describe("Languages", () => {
  const fr = { code: "fr", native: "Français", english: "French", dir: "ltr" as const, numerals: "fr" };
  const draft = (messages: Record<string, string>, extra = {}) => ({ ...fr, messages, rev: 2, published: null, ...extra });
  afterEach(() => act(() => setLanguages([])));

  it("lists the built-in languages and the drafts with their progress", async () => {
    m.data.listTranslations.mockResolvedValue([draft({ "common.continue": "Continuer" })]);
    wrap(<LanguagesPage />, "/super/languages", "/super/languages");
    expect(await screen.findByText("Français")).toBeTruthy();
    expect(screen.getByText("العربية")).toBeTruthy();
    expect(screen.getAllByText("Built in")).toHaveLength(2);
    expect(screen.getByText(/Translated: 1 of/)).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
  });

  it("adds a language from the list, right to left for Persian", async () => {
    m.data.listTranslations.mockResolvedValue([draft({})]);
    m.data.createTranslation.mockResolvedValue(undefined);
    wrap(<LanguagesPage />, "/super/languages", "/super/languages");
    fireEvent.click(await screen.findByRole("button", { name: "Add a language" }));
    expect(screen.queryByRole("option", { name: /French/ })).toBeNull(); // already added
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "fa" } });
    expect(screen.getByRole("radio", { name: "Right to left" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Add and start translating" }));
    await waitFor(() => expect(m.data.createTranslation).toHaveBeenCalledWith(expect.objectContaining({ code: "fa", native: "فارسی", english: "Persian", dir: "rtl", numerals: "fa" }), "me"));
    expect(await screen.findByText("elsewhere")).toBeTruthy(); // went on to /super/languages/fa
  });

  it("finds what's missing or broken, blocks publishing until placeholders match, then publishes", async () => {
    m.data.getTranslation.mockResolvedValue(draft({ "common.continue": "Continuer", "q.found": "trouvés", "old.key": "x" }));
    m.data.saveTranslation.mockImplementation(async (_d: unknown, rev: number) => ({ rev: rev + 1 }));
    m.api.publishLanguage.mockResolvedValue({ version: 1, languages: [{ ...fr, version: 1 }] });
    let pickers: string[] = [];
    const Spy = () => { pickers = useLanguages().map((l) => l.code); return null; };
    wrap(<><TranslatePage /><Spy /></>, "/super/languages/fr", "/super/languages/:code");
    fireEvent.click(await screen.findByRole("button", { name: /To fix \(1\)/ }));
    expect(screen.getByText("q.found")).toBeTruthy();
    expect(screen.getByText("Use exactly these, as in English: {n} {total}")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText(/Not published yet: 1 translations need fixing/)).toBeTruthy();
    expect(m.api.publishLanguage).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("French"), { target: { value: "{n} sur {total} trouvés" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(m.api.publishLanguage).toHaveBeenCalledWith({ code: "fr" }));
    // Saved first, without the key the app no longer has.
    expect(m.data.saveTranslation.mock.calls[0][0].messages).toEqual({ "common.continue": "Continuer", "q.found": "{n} sur {total} trouvés" });
    expect(await screen.findByText(/Published as version 1/)).toBeTruthy();
    expect(pickers).toEqual(["en", "ar", "fr"]); // pickers offer it at once
  });

  it("imports translations from a spreadsheet, skipping keys the app doesn't have", async () => {
    m.data.getTranslation.mockResolvedValue(draft({}));
    wrap(<TranslatePage />, "/super/languages/fr", "/super/languages/:code");
    const input = (await screen.findByText("Import a spreadsheet (.xlsx or .csv)")).parentElement!.querySelector("input")!;
    const csv = new File([["key,English,fr", "common.continue,Continue,Continuer", "home.title,Learn,Apprendre", "nope,x,y", ""].join("\n")], "fr.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [csv] } });
    expect(await screen.findByText("Read 2 translations from the file. Save to keep them. Skipped 1 rows with keys the app doesn't have.")).toBeTruthy();
    expect(screen.getByText(/Translated: 2 of/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy(); // not saved until asked
  });

  it("lets the lesson editor show fields for an added language, and checks what's missing in it", async () => {
    act(() => setLanguages([{ ...fr, version: 1 }]));
    const nav = await openEditor();
    expect(screen.getAllByLabelText(/^Title/)).toHaveLength(2);
    fireEvent.click(within(nav).getByRole("button", { name: "Français" }));
    expect(screen.getAllByLabelText(/^Title/)).toHaveLength(3);
    fireEvent.click(within(nav).getByRole("button", { name: /Checks/ }));
    expect(await screen.findByText(/Français.*texts not translated/)).toBeTruthy();
    fireEvent.click(within(nav).getByRole("button", { name: "Français" })); // and hide them again
    await waitFor(() => expect(screen.queryByText(/Français.*texts not translated/)).toBeNull());
  });
});

describe("editor strings", () => {
  it("exist in English and Arabic, including every key built at run time", async () => {
    const en = (await import("../src/cms/strings/en.json")).default as Record<string, string>;
    const ar = (await import("../src/cms/strings/ar.json")).default as Record<string, string>;
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    const { ARTS, SLIDE_LAYOUTS, TRACK_TONE_IDS } = await import("../src/content/validate");
    const { STEP_MENU } = await import("../src/cms/steps");
    const { TRACK_ICONS } = await import("../src/cms/TracksPage");
    const codes = ["required", "minItems", "duplicateId", "badId", "lessonIdPrefix", "badValue", "range", "answerNotInOptions", "answersNotInOptions",
      "fillBlanks", "fillAnswers", "fillBank", "badUrl", "checkpoint", "tooLarge", "missingLang", "unknownCompetency", "noSlides"];
    const dynamic = [...codes.map((c) => `cms.issue.${c}`), ...ARTS.map((a) => `cms.art.${a}`),
      ...SLIDE_LAYOUTS.map((x) => `cms.layout.${x}`), ...["x", "y", "w", "h"].map((k) => `cms.spot.${k}`), ...["draft", "live", "changed"].map((s) => `cms.status.${s}`),
      ...["draft", "live", "changed"].map((s) => `cms.filter.${s}`), ...STEP_MENU.map((s) => `cms.stepHint.${s}`),
      ...TRACK_TONE_IDS.map((x) => `cms.tone.${x}`), ...TRACK_ICONS.map((x) => `cms.icon.${x}`)];
    for (const k of dynamic) expect(en[k], k).toBeTruthy();
    for (const v of Object.values(ar)) expect(v).not.toContain("·"); // reads as Arabic zero
  });
});

describe("parseFill", () => {
  it("turns bracketed answers into blanks and a word bank", () => {
    expect(parseFill("A sensor turns [heat] into a [number].", "word, light، water")).toEqual({
      sentence: ["A sensor turns ", { blank: 0 }, " into a ", { blank: 1 }, "."],
      answers: ["heat", "number"],
      bank: ["heat", "number", "word", "light", "water"],
    });
    expect(parseFill("No blanks", "").answers).toEqual([]);
  });
});
