// The course editor, the Languages page and the Tracks page after the release walkthrough: work typed on the
// Languages page saves by itself and is never lost to the app's own navigation, leaving asks inline (never a browser
// dialog), the checks name fields as the forms do (in the author's language) and take the cursor to them, and the
// small editor fixes (instruction label, capstone milestone fields, short status in the app bar).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ai1 from "../../../content/retired/ai-1.json";
import type { Unit } from "../src/content/types";
import { mergeTracks } from "../src/content/tracks";
import { I18nProvider } from "../src/i18n";
import en from "../src/i18n/en.json";
import { StoreProvider } from "../src/state/store";

const m = vi.hoisted(() => ({
  data: { listUnits: vi.fn(), getUnit: vi.fn(), createUnit: vi.fn(), saveUnit: vi.fn(), unitExists: vi.fn(), readPublished: vi.fn(), markSame: vi.fn(), getSettings: vi.fn(),
    unitsByTrack: vi.fn(), listTranslations: vi.fn(), getTranslation: vi.fn(), createTranslation: vi.fn(), saveTranslation: vi.fn(), deleteTranslation: vi.fn() },
  api: { publishUnit: vi.fn(), unpublishUnit: vi.fn(), deleteUnit: vi.fn(), saveSettings: vi.fn(), publishLanguage: vi.fn(), unpublishLanguage: vi.fn() },
}));
vi.mock("../src/firebase", () => ({ db: {}, storage: vi.fn(), storageJSON: vi.fn() }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "me" }, role: "superadmin", orgId: null }) }));
vi.mock("../src/cms/data", async (orig) => ({ ...(await orig<typeof import("../src/cms/data")>()), ...m.data }));
vi.mock("../src/cms/api", async (orig) => ({ ...(await orig<typeof import("../src/cms/api")>()), cmsApi: m.api }));

const { UnitEditor: Editor } = await import("../src/cms/UnitEditor");
const { TranslatePage } = await import("../src/cms/LanguagesPage");
const { TracksPage } = await import("../src/cms/TracksPage");
const { LessonPlayer } = await import("../src/screens/LessonScreen");
const UnitEditor = () => <Editor Player={LessonPlayer} />;

/** The app's own navigation (a rail link), outside the page: it leaves without asking the page. */
function Rail() { const nav = useNavigate(); return <button type="button" onClick={() => nav("/learn")}>Rail: Learn</button>; }
const wrap = (ui: ReactNode, url: string, path: string, lang = "en") => render(
  <StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={[url]}><Rail />
    <Routes><Route path={path} element={ui} /><Route path="*" element={<p>elsewhere</p>} /></Routes></MemoryRouter></I18nProvider></StoreProvider>);

const unit = () => structuredClone(ai1) as unknown as Unit;
const meta = (u: Unit, extra = {}) => ({ id: u.id, owner: "public", title: u.title, track: u.track, level: u.level, lessonCount: u.lessons.length,
  lessons: u.lessons.map((l) => ({ id: l.id, title: l.title })), rev: 3, published: { version: 1, rev: 3 }, ...extra });
const openEditor = async (u = unit(), lang = "en") => {
  m.data.getUnit.mockResolvedValue({ meta: meta(u), unit: u });
  wrap(<UnitEditor />, `/super/content/${u.id}`, "/super/content/:unitId", lang);
  return screen.findByRole("navigation", { name: lang === "ar" ? "المخطط" : "Outline" });
};
const fr = { code: "fr", native: "Français", english: "French", dir: "ltr" as const, numerals: "fr" };
const openFrench = async () => {
  m.data.getTranslation.mockResolvedValue({ ...fr, messages: { "common.continue": "Continuer" }, rev: 2, published: null });
  wrap(<TranslatePage />, "/super/languages/fr", "/super/languages/:code");
  return screen.findByRole("heading", { name: "The app's words" });
};
/** A UI string on the first page of the list, typed in French. */
const KEY = Object.keys(en)[1];
const typeFrench = (value: string) => fireEvent.change(document.getElementById(`ed-s-${KEY}`)!, { target: { value } });

let confirmSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
beforeEach(() => {
  vi.clearAllMocks();
  confirmSpy = vi.spyOn(window, "confirm");
  m.data.saveUnit.mockResolvedValue({ rev: 4 });
  m.data.saveTranslation.mockImplementation(async (_d: unknown, rev: number) => ({ rev: rev + 1 }));
  m.data.markSame.mockResolvedValue(null);
  m.data.readPublished.mockRejectedValue(new Error("not needed"));
});
afterEach(() => { expect(confirmSpy).not.toHaveBeenCalled(); confirmSpy.mockRestore(); }); // never a browser dialog

describe("Languages page: nothing typed is lost", () => {
  it("saves by itself a few seconds after the last change", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await openFrench();
      typeFrench("Retour");
      expect(screen.getByText("Saving soon…")).toBeTruthy();
      await act(async () => { vi.advanceTimersByTime(3100); });
      await waitFor(() => expect(m.data.saveTranslation).toHaveBeenCalledTimes(1));
      expect(m.data.saveTranslation.mock.calls[0][0].messages).toMatchObject({ [KEY]: "Retour" });
      expect(m.data.saveTranslation.mock.calls[0][1]).toBe(2);
      expect(await screen.findByText(/Saved at/)).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  it("saves what was just typed when the app's own navigation leaves the page", async () => {
    await openFrench();
    typeFrench("Retour");
    fireEvent.click(screen.getByRole("button", { name: "Rail: Learn" }));
    expect(await screen.findByText("elsewhere")).toBeTruthy();
    await waitFor(() => expect(m.data.saveTranslation).toHaveBeenCalledTimes(1));
    expect(m.data.saveTranslation.mock.calls[0][0].messages).toMatchObject({ [KEY]: "Retour" });
  });

  it("saves before Back, and asks inline only when that save fails", async () => {
    await openFrench();
    typeFrench("Retour");
    m.data.saveTranslation.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const ask = (await screen.findByText("Leave without saving? Your changes will be lost.")).parentElement!;
    fireEvent.click(within(ask).getByRole("button", { name: "Stay here" }));
    expect(screen.queryByText(/Leave without saving\?/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("elsewhere")).toBeTruthy();
    expect(m.data.saveTranslation.mock.calls.at(-1)![0].messages).toMatchObject({ [KEY]: "Retour" });
  });

  it("leaves without saving only when asked to, and then saves nothing on the way out", async () => {
    await openFrench();
    typeFrench("Retour");
    m.data.saveTranslation.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave without saving" }));
    expect(await screen.findByText("elsewhere")).toBeTruthy();
    expect(m.data.saveTranslation).toHaveBeenCalledTimes(1); // the failed one
  });
});

describe("Unit editor", () => {
  it("saves what was just typed when the app's own navigation leaves the editor", async () => {
    await openEditor();
    fireEvent.change(screen.getAllByLabelText(/Title/)[0], { target: { value: "Typed, then left" } });
    fireEvent.click(screen.getByRole("button", { name: "Rail: Learn" }));
    expect(await screen.findByText("elsewhere")).toBeTruthy();
    await waitFor(() => expect(m.data.saveUnit).toHaveBeenCalledTimes(1));
    expect(m.data.saveUnit.mock.calls[0][0].title.en).toBe("Typed, then left");
  });

  it("names fields as the forms do, and takes the cursor to one inside “More about this lesson”", async () => {
    const u = unit(); u.lessons[0].tryTomorrow = { en: "", ar: "" }; u.summary = { en: "", ar: u.summary.ar };
    const nav = await openEditor(u);
    expect((await screen.findByText("Summary (English)")).closest("li")!.textContent).toBe("Summary (English): Required."); // the unit pane's own list
    expect(screen.queryByText("summary.en")).toBeNull();
    fireEvent.click(within(nav).getByRole("button", { name: /Checks/ }));
    const item = await screen.findByRole("button", { name: /Lesson 1 › Try it in class tomorrow \(English\)/ });
    expect(item.textContent).toContain("Required.");
    expect(item.textContent).not.toContain("tryTomorrow");
    fireEvent.click(item);
    const more = await screen.findByText(/^More about this lesson/);
    expect((more.closest("details") as HTMLDetailsElement).open).toBe(true);
    await waitFor(() => expect(document.activeElement?.getAttribute("lang")).toBe("en"));
    const label = document.querySelector(`label[for="${document.activeElement!.id}"]`)!;
    expect(label.textContent).toMatch(/^Try it in class tomorrow/);
  });

  it("names a step's fields and the lesson's empty list, never the raw path", async () => {
    const u = unit(); u.lessons[1].steps = [];
    const q = u.lessons[0].steps.find((s) => s.type === "choice") as { options: { text: { en: string } }[] }; q.options[1].text.en = "";
    const nav = await openEditor(u);
    fireEvent.click(within(nav).getByRole("button", { name: /Checks/ }));
    expect(await screen.findByRole("button", { name: /Lesson 2 › Steps/ })).toBeTruthy();
    // The validator gives an option's text without its number: named by the field, and the empty one gets the cursor.
    fireEvent.click(screen.getByRole("button", { name: /Lesson 1 › Step 3 \(Choose one\) › Text \(English\)/ }));
    expect(await screen.findByRole("heading", { name: "Step 3: Choose one" })).toBeTruthy();
    await waitFor(() => expect((document.activeElement as HTMLInputElement).value).toBe(""));
    expect(document.activeElement?.closest(".ed-item")?.querySelector(".ed-item-head strong")?.textContent).toBe("Option B");
    expect(screen.queryByText("steps")).toBeNull();
    expect(screen.queryByText("text.en")).toBeNull();
  });

  it("names fields in Arabic in the Arabic editor", async () => {
    const u = unit(); u.summary = { en: "", ar: u.summary.ar };
    await openEditor(u, "ar");
    await screen.findByRole("navigation", { name: "المخطط" });
    await waitFor(() => expect(document.querySelector(".ed-here li")?.textContent).toBe("الملخّص (English): مطلوب."));
  });

  it("calls a reading's line its instruction, not a question", async () => {
    const nav = await openEditor();
    fireEvent.click(within(nav).getByRole("button", { name: /Is it AI\?/ }));
    fireEvent.click(within(nav).getAllByRole("button", { name: /^Read/ })[0]);
    expect(await screen.findAllByLabelText(/^Instruction/)).toHaveLength(2);
    expect(screen.queryByLabelText(/^Question or instruction/)).toBeNull();
  });

  it("leaves a capstone milestone's hours empty until set, with a hint that reads as one", async () => {
    const cap = JSON.parse(readFileSync(join(__dirname, "../../../content/units/ai-capstone.json"), "utf8")) as Unit;
    for (const l of cap.lessons) for (const s of l.steps) if (s.type === "project") delete s.hours;
    const nav = await openEditor(cap);
    const first = cap.lessons.find((l) => l.steps.some((s) => s.type === "project"))!;
    fireEvent.click(within(nav).getByRole("button", { name: new RegExp(first.title.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
    fireEvent.click(within(nav).getAllByRole("button", { name: /Project/ }).at(-1)!);
    expect((await screen.findByLabelText("Hours of work") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("A short id, such as m1")).toBeTruthy();
    expect(screen.getAllByText(/^What to submit$/).length).toBeGreaterThan(0); // no colon in the editor's label
  });

  it("says its status short in the app bar, with the full words for screen readers", async () => {
    await openEditor();
    const pill = screen.getByTitle("Published (v1)");
    expect(within(pill).getByText("Published (v1)")).toBeTruthy();
    expect(within(pill).getByText("Published").getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Tracks page", () => {
  it("asks inline before Back drops changes not saved", async () => {
    m.data.getSettings.mockResolvedValue({ rev: 2, tracks: mergeTracks([]) });
    m.data.unitsByTrack.mockResolvedValue(new Map());
    wrap(<TracksPage />, "/super/tracks", "/super/tracks");
    fireEvent.click(await screen.findByRole("button", { name: "Add a track" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stay here" }));
    expect(screen.queryByText(/Leave without saving\?/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave without saving" }));
    expect(await screen.findByText("elsewhere")).toBeTruthy();
    expect(m.api.saveSettings).not.toHaveBeenCalled();
  });
});
