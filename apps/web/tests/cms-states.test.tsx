// The course editor's honest states (enterprise pass, package ad-cms-org): a read that failed says why and offers
// Retry instead of a spinner that turns for ever; what a server or the SDK refused is said in the author's language;
// a catalog that is only late is a success, not a failure; the author's own Learn tab hears about a publish; the
// full-screen preview is a real modal for the keyboard; unsaved tracks are never dropped by a tap on a link; a
// spreadsheet download that can't load its chunk says so; and a field's hint is tied to its control.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import ai1 from "../../../content/retired/ai-1.json";
import type { Unit } from "../src/content/types";
import { mergeTracks } from "../src/content/tracks";
import { I18nProvider } from "../src/i18n";
import { StoreProvider } from "../src/state/store";
import entEn from "../src/cms/ent-strings/en.json";
import entAr from "../src/cms/ent-strings/ar.json";

const m = vi.hoisted(() => ({
  auth: { user: { uid: "me" }, role: "superadmin", orgId: null as string | null },
  data: { listUnits: vi.fn(), listOrgs: vi.fn(), getUnit: vi.fn(), createUnit: vi.fn(), saveUnit: vi.fn(), unitExists: vi.fn(), readPublished: vi.fn(), markSame: vi.fn(), getSettings: vi.fn(),
    unitsByTrack: vi.fn(), listTranslations: vi.fn(), getTranslation: vi.fn(), createTranslation: vi.fn(), saveTranslation: vi.fn(), deleteTranslation: vi.fn() },
  api: { publishUnit: vi.fn(), unpublishUnit: vi.fn(), deleteUnit: vi.fn(), saveSettings: vi.fn(), publishLanguage: vi.fn(), unpublishLanguage: vi.fn() },
  forget: vi.fn(),
  xlsx: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("../src/firebase", () => ({ db: {}, storage: vi.fn(), storageJSON: vi.fn() }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/cms/data", async (orig) => ({ ...(await orig<typeof import("../src/cms/data")>()), ...m.data }));
vi.mock("../src/cms/api", async (orig) => ({ ...(await orig<typeof import("../src/cms/api")>()), cmsApi: m.api }));
// The catalog the learner screens hold: the editor only tells it to read again.
vi.mock("../src/content/load", async (orig) => ({ ...(await orig<typeof import("../src/content/load")>()), forgetCatalog: m.forget }));
// The Excel writer lives in a chunk of its own (exceljs); here it is whatever the test says, and nothing is downloaded.
vi.mock("../src/cms/sheets", async (orig) => ({ ...(await orig<typeof import("../src/cms/sheets")>()), sheetXlsx: m.xlsx }));
vi.mock("../src/admin/importer", async (orig) => ({ ...(await orig<typeof import("../src/admin/importer")>()), downloadBlob: m.download }));
vi.mock("../src/cms/upload", async (orig) => ({ ...(await orig<typeof import("../src/cms/upload")>()), uploadMedia: m.upload }));

const { ContentList } = await import("../src/cms/ContentList");
const { UnitEditor: Editor } = await import("../src/cms/UnitEditor");
const { TracksPage } = await import("../src/cms/TracksPage");
const { LanguagesPage, TranslatePage } = await import("../src/cms/LanguagesPage");
const { Text, Upload } = await import("../src/cms/fields");
const { LessonPlayer } = await import("../src/screens/LessonScreen");
const UnitEditor = () => <Editor Player={LessonPlayer} />;

const unit = () => structuredClone(ai1) as unknown as Unit;
const meta = (u: Unit, extra = {}) => ({ id: u.id, owner: "public", title: u.title, track: u.track, level: u.level, lessonCount: u.lessons.length,
  lessons: u.lessons.map((l) => ({ id: l.id, title: l.title })), rev: 3, published: { version: 1, rev: 3 }, ...extra });
/** `rail`: a link of the app's own navigation, outside the page (the nav rail, the bottom nav). */
const wrap = (ui: ReactNode, url: string, path: string, lang = "en") => render(
  <StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={[url]}><Link to="/learn">Rail: Learn</Link>
    <Routes><Route path={path} element={ui} /><Route path="*" element={<p>elsewhere</p>} /></Routes></MemoryRouter></I18nProvider></StoreProvider>);
/** What a callable or the SDK throws: English words nobody should see, a code, and maybe the refusal's reason. */
const refused = (code: string, reason?: string, words = "RAW SERVER WORDS") => Object.assign(new Error(words), { code, ...(reason ? { details: { reason } } : {}) });
const openEditor = async (lang = "en", extra = {}) => {
  const u = unit();
  m.data.getUnit.mockResolvedValue({ meta: meta(u, extra), unit: u });
  wrap(<UnitEditor />, "/super/content/ai-1", "/super/content/:unitId", lang);
  return screen.findByRole("navigation", { name: lang === "ar" ? "المخطط" : "Outline" });
};

let logged: ReturnType<typeof vi.spyOn>;
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; }); // jsdom has no layout
beforeEach(() => {
  vi.clearAllMocks();
  logged = vi.spyOn(console, "error").mockImplementation(() => {}); // errorText logs the raw error for "Report a problem"
  m.auth = { user: { uid: "me" }, role: "superadmin", orgId: null };
  m.data.listOrgs.mockResolvedValue([]);
  m.data.listUnits.mockResolvedValue([]);
  m.data.createUnit.mockResolvedValue(undefined);
  m.data.saveUnit.mockResolvedValue({ rev: 4 });
  m.data.unitExists.mockResolvedValue(false);
  m.data.markSame.mockResolvedValue(null);
  m.data.readPublished.mockRejectedValue(new Error("not needed"));
});
afterEach(() => { logged.mockRestore(); });

describe("the course list", () => {
  it("says why the list could not be read, with Retry and no spinner, and Retry reads it again", async () => {
    const u = unit();
    m.data.listUnits.mockRejectedValueOnce(refused("permission-denied", undefined, "Missing or insufficient permissions.")).mockResolvedValue([meta(u)]);
    const r = wrap(<ContentList />, "/super/content", "/super/content");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Your account isn't allowed to do this/);
    expect(screen.queryByText(/Missing or insufficient/)).toBeNull(); // never the SDK's own English
    expect(r.container.querySelector(".loading")).toBeNull(); // the spinner turned for ever beside the error
    expect(screen.queryByText("No units yet")).toBeNull(); // a failed read is not an empty list
    // The page is still a page: its title and its toolbar.
    expect(screen.getByRole("heading", { name: "Lesson editor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New unit" })).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("AI basics for teachers")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(m.data.listUnits).toHaveBeenCalledTimes(2);
  });

  it("shows the spinner while the list is on its way, and only then", async () => {
    let answer: (l: unknown[]) => void = () => {};
    m.data.listUnits.mockReturnValue(new Promise((ok) => { answer = ok; }));
    const r = wrap(<ContentList />, "/super/content", "/super/content");
    await waitFor(() => expect(r.container.querySelector(".loading")).toBeTruthy());
    answer([]);
    expect(await screen.findByText("No units yet")).toBeTruthy();
    expect(r.container.querySelector(".loading")).toBeNull();
  });

  it("tells the learner screens to read the course list again after an unpublish and after a delete", async () => {
    const u = unit();
    m.data.listUnits.mockResolvedValue([meta(u), meta({ ...u, id: "u87654321", title: { en: "Sensors" }, lessons: [] })]);
    m.api.unpublishUnit.mockResolvedValue({ ok: true }); m.api.deleteUnit.mockResolvedValue({ ok: true });
    wrap(<ContentList />, "/super/content", "/super/content");
    const card = (await screen.findByText("Sensors")).closest("li") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Unpublish" }));
    fireEvent.click(within(card).getAllByRole("button", { name: "Unpublish" }).at(-1)!);
    expect(await screen.findByText(/Unpublished Sensors/)).toBeTruthy();
    expect(m.forget).toHaveBeenCalledTimes(1);
    fireEvent.click(within(card).getByRole("button", { name: "Delete unit" }));
    fireEvent.click(within(card).getByRole("button", { name: "Delete for good" }));
    await waitFor(() => expect(screen.queryByText("Sensors")).toBeNull());
    expect(m.forget).toHaveBeenCalledTimes(2);
  });

  it("says an unpublish whose course list is late is done, and a delete it stopped is not done yet", async () => {
    const u = unit();
    m.data.listUnits.mockResolvedValue([meta({ ...u, id: "u87654321", title: { en: "Sensors" }, lessons: [] })]);
    m.api.unpublishUnit.mockRejectedValue(refused("functions/unavailable", "catalog-pending"));
    wrap(<ContentList />, "/super/content", "/super/content");
    const card = (await screen.findByText("Sensors")).closest("li") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Unpublish" }));
    fireEvent.click(within(card).getAllByRole("button", { name: "Unpublish" }).at(-1)!);
    const said = await screen.findByRole("status");
    expect(said.textContent).toBe(entEn["ent.pending.unpublish"]);
    expect(screen.queryByRole("alert")).toBeNull(); // not a failure
    await waitFor(() => expect(within(card).queryByRole("button", { name: "Unpublish" })).toBeNull()); // a draft now, as Firestore has it
    expect(m.forget).not.toHaveBeenCalled(); // the list learners read has not changed yet

    m.api.deleteUnit.mockRejectedValue(refused("functions/unavailable", "catalog-pending"));
    fireEvent.click(within(card).getByRole("button", { name: "Delete unit" }));
    fireEvent.click(within(card).getByRole("button", { name: "Delete for good" }));
    expect(await screen.findByText(entEn["ent.pending.delete"])).toBeTruthy();
    expect(screen.getByText("Sensors")).toBeTruthy(); // still there, to delete again later
    expect(within(card).queryByRole("button", { name: "Delete for good" })).toBeNull(); // the question is closed
  });

  it("words a refused delete in Arabic, not in the server's English", async () => {
    const u = unit();
    m.data.listUnits.mockResolvedValue([meta({ ...u, id: "u87654321", title: { en: "Sensors", ar: "المستشعرات" }, lessons: [] })]);
    m.api.deleteUnit.mockRejectedValue(refused("functions/permission-denied", "not-unit-admin", "Only this unit's admins can do that."));
    wrap(<ContentList />, "/super/content", "/super/content", "ar");
    const card = (await screen.findByText("المستشعرات")).closest("li") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "احذف الوحدة" }));
    fireEvent.click(within(card).getByRole("button", { name: "احذف نهائيًا" }));
    expect(await screen.findByText("لا يستطيع ذلك إلا مشرفو هذه الدورة.")).toBeTruthy();
    expect(screen.queryByText(/Only this unit/)).toBeNull();
  });

  it("keeps the editor's own words for an id that is taken (they are already in the author's language)", async () => {
    const u = unit();
    m.data.unitExists.mockResolvedValue(true);
    m.data.getUnit.mockResolvedValue({ meta: meta(u, { owner: "someone-else" }), unit: u });
    wrap(<ContentList />, "/super/content", "/super/content");
    fireEvent.click(await screen.findByRole("button", { name: "Import JSON" }));
    fireEvent.change(screen.getByLabelText("Or paste the JSON"), { target: { value: JSON.stringify(u) } });
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    fireEvent.click(await screen.findByRole("button", { name: "Import and open" }));
    fireEvent.click(await screen.findByRole("button", { name: "Replace the draft" }));
    expect(await screen.findByText("A unit with the id ai-1 already exists. Open it from the list instead.")).toBeTruthy();
    expect(logged).not.toHaveBeenCalled(); // not treated as a server error
  });
});

describe("the languages list", () => {
  it("says why the drafts could not be read, with Retry and no spinner; the built-in languages still show", async () => {
    m.data.listTranslations.mockRejectedValueOnce(refused("unavailable", undefined, "Failed to get documents from server.")).mockResolvedValue([]);
    const r = wrap(<LanguagesPage />, "/super/languages", "/super/languages");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/The service can't be reached right now/);
    expect(r.container.querySelector(".loading")).toBeNull();
    expect(screen.getByText("English")).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(m.data.listTranslations).toHaveBeenCalledTimes(2);
  });
});

describe("publishing from the editor", () => {
  it("says a refused publish in Arabic, by its reason", async () => {
    m.api.publishUnit.mockRejectedValue(refused("functions/permission-denied", "not-unit-admin", "Only this unit's admins can do that."));
    await openEditor("ar");
    fireEvent.click(await screen.findByRole("button", { name: "انشر" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("لا يستطيع ذلك إلا مشرفو هذه الدورة.")).toBeTruthy();
    expect(screen.queryByText(/Only this unit/)).toBeNull();
    expect(m.forget).not.toHaveBeenCalled();
  });

  it("says a save that failed in the author's language, and keeps the draft", async () => {
    m.data.saveUnit.mockRejectedValue(refused("unavailable", undefined, "Failed to reach Cloud Firestore backend."));
    await openEditor();
    fireEvent.change(screen.getAllByLabelText(/Title/)[0], { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/The service can't be reached right now/);
    expect(screen.queryByText(/Cloud Firestore backend/)).toBeNull();
    expect((screen.getAllByLabelText(/Title/)[0] as HTMLInputElement).value).toBe("Changed");
  });

  it("tells the learner screens to read the course list again, once, after a publish", async () => {
    m.api.publishUnit.mockResolvedValue({ version: 2 });
    await openEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));
    expect(await screen.findByText(/Published as version 2/)).toBeTruthy();
    expect(m.forget).toHaveBeenCalledTimes(1);
  });

  it("says a publish whose course list is late is published and will show within minutes, not that it failed", async () => {
    m.api.publishUnit.mockRejectedValue(refused("functions/unavailable", "catalog-pending", "Saved, but the course list could not be updated just now."));
    await openEditor();
    // What Firestore holds after the publish: the read that follows the refusal finds version 2 of this draft.
    const u = unit();
    m.data.getUnit.mockResolvedValue({ meta: meta(u, { published: { version: 2, rev: 3 } }), unit: u });
    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));
    const said = await screen.findByRole("status");
    expect(within(said).getByText(entEn["ent.pending.publish"])).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Saved, but the course list could not/)).toBeNull();
    expect(screen.getAllByText("Published (v2)").length).toBeGreaterThan(0); // the status in the app bar follows
    expect(m.forget).not.toHaveBeenCalled(); // the list learners read has not changed yet
  });

  it("still treats a draft someone else saved as a conflict, and errors in the draft as errors to fix", async () => {
    m.api.publishUnit.mockRejectedValueOnce(refused("functions/aborted", "changed"))
      .mockRejectedValueOnce(Object.assign(refused("functions/invalid-argument", "draft-invalid"), { details: { reason: "draft-invalid", issues: [{ at: {}, code: "required", level: "error" }] } }));
    await openEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));
    expect(await screen.findByText(/Someone else saved this unit while you were editing/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(m.api.publishUnit).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("RAW SERVER WORDS")).toBeNull();
  });

  it("says an unpublish whose course list is late is done", async () => {
    m.api.unpublishUnit.mockRejectedValue(refused("functions/unavailable", "catalog-pending"));
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Unpublish" }).at(-1)!);
    expect(await screen.findByText(entEn["ent.pending.unpublish"])).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Unpublish" })).toBeNull()); // a draft now
  });

  it("tells the learner screens to read the course list again after an unpublish and a delete made in the editor", async () => {
    m.api.unpublishUnit.mockResolvedValue({ ok: true }); m.api.deleteUnit.mockResolvedValue({ ok: true });
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Unpublish" }).at(-1)!);
    expect(await screen.findByText(/Unpublished\. Learners no longer see this unit/)).toBeTruthy();
    expect(m.forget).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete unit" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    expect(await screen.findByText("elsewhere")).toBeTruthy(); // back at the list, which says it was deleted
    expect(m.forget).toHaveBeenCalledTimes(2);
  });

  it("says a delete the late course list stopped is not done yet, and stays on the unit, now a draft", async () => {
    m.api.deleteUnit.mockRejectedValue(refused("functions/unavailable", "catalog-pending"));
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Delete unit" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    expect(within(await screen.findByRole("alert")).getByText(entEn["ent.pending.delete"])).toBeTruthy();
    expect(screen.queryByText("elsewhere")).toBeNull(); // the unit is still there, to delete again later
    expect(screen.queryByText("RAW SERVER WORDS")).toBeNull();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Unpublish" })).toBeNull()); // as Firestore has it
    expect(screen.getByRole("button", { name: "Delete unit" }).getAttribute("aria-busy")).toBeNull(); // and Delete can be pressed again
    expect(m.forget).not.toHaveBeenCalled(); // the list learners read has not changed yet
  });
});

describe("the full-screen preview", () => {
  const openPreview = async () => {
    const nav = await openEditor();
    fireEvent.click(within(nav).getByRole("button", { name: /Is it AI\?/ }));
    const button = await screen.findByRole("button", { name: "Preview" });
    button.focus(); // as a keyboard or a click leaves it
    fireEvent.click(button);
    return { button, dialog: await screen.findByRole("dialog", { name: "Preview" }) };
  };
  const tab = (shiftKey = false) => fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey });

  it("takes the focus, makes the editor behind it inert, and gives the focus back to the Preview button on Close", async () => {
    const { button, dialog } = await openPreview();
    expect(document.activeElement).toBe(dialog);
    expect(dialog.getAttribute("tabindex")).toBe("-1");
    const main = document.querySelector("main.ed")!, bar = document.querySelector(".ed-bar")!;
    for (const behind of [main, bar]) { expect(behind.hasAttribute("inert")).toBe(true); expect(behind.getAttribute("aria-hidden")).toBe("true"); }
    expect(dialog.hasAttribute("inert")).toBe(false);
    // The preview's own Close (the lesson inside has one too, as learners see it).
    fireEvent.click(within(dialog.querySelector(".ed-preview-bar") as HTMLElement).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    for (const behind of [main, bar]) { expect(behind.hasAttribute("inert")).toBe(false); expect(behind.hasAttribute("aria-hidden")).toBe(false); }
    expect(document.activeElement).toBe(button);
  });

  it("keeps Tab inside: from the last control to the first, and back with Shift+Tab", async () => {
    const { dialog } = await openPreview();
    const items = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex='-1'])")];
    const first = items[0], last = items.at(-1)!;
    expect(items.length).toBeGreaterThan(1);
    // Shift+Tab on the dialog itself (where the focus starts) would walk out backwards.
    expect(tab(true)).toBe(false); // prevented
    expect(document.activeElement).toBe(last);
    expect(tab()).toBe(false);
    expect(document.activeElement).toBe(first);
    expect(tab(true)).toBe(false);
    expect(document.activeElement).toBe(last);
    // In the middle Tab is the browser's own.
    first.focus();
    expect(tab()).toBe(true);
  });

  it("gives the focus back on Escape too", async () => {
    const { button } = await openPreview();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(button);
    expect(document.querySelector("main.ed")!.hasAttribute("inert")).toBe(false);
  });

  it("leaves nothing inert when the editor goes away with the preview open", async () => {
    // Something that outlives the editor and sits beside the preview (the layout's offline notice is one).
    const u = unit();
    m.data.getUnit.mockResolvedValue({ meta: meta(u), unit: u });
    const Page = ({ on }: { on: boolean }) => (
      <StoreProvider><I18nProvider lang="en"><MemoryRouter initialEntries={["/super/content/ai-1"]}>
        <div><p data-testid="beside">offline</p>{on && <Routes><Route path="/super/content/:unitId" element={<UnitEditor />} /></Routes>}</div>
      </MemoryRouter></I18nProvider></StoreProvider>);
    const r = render(<Page on />);
    fireEvent.click(within(await screen.findByRole("navigation", { name: "Outline" })).getByRole("button", { name: /Is it AI\?/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview" }));
    await screen.findByRole("dialog", { name: "Preview" });
    expect(screen.getByTestId("beside").hasAttribute("inert")).toBe(true);
    r.rerender(<Page on={false} />);
    expect(screen.getByTestId("beside").hasAttribute("inert")).toBe(false);
    expect(screen.getByTestId("beside").hasAttribute("aria-hidden")).toBe(false);
  });
});

describe("the tracks page", () => {
  const page = async () => {
    m.data.getSettings.mockResolvedValue({ rev: 2, tracks: mergeTracks([]) });
    m.data.unitsByTrack.mockResolvedValue(new Map());
    wrap(<TracksPage />, "/super/tracks", "/super/tracks");
    return screen.findByRole("button", { name: "Add a track" });
  };

  it("holds a tap on a link while tracks are not saved, asks on the page, and Stay keeps the edits", async () => {
    fireEvent.click(await page());
    fireEvent.click(screen.getByRole("link", { name: "Rail: Learn" }));
    expect(await screen.findByText(/Leave without saving\?/)).toBeTruthy();
    expect(screen.queryByText("elsewhere")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.queryByText(/Leave without saving\?/)).toBeNull();
    expect(screen.getByLabelText("Id")).toBeTruthy(); // the new track's form is still open
  });

  it("goes where the link led on “Leave without saving”, and saves nothing", async () => {
    fireEvent.click(await page());
    fireEvent.click(screen.getByRole("link", { name: "Rail: Learn" }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave without saving" }));
    expect(await screen.findByText("elsewhere")).toBeTruthy();
    expect(m.api.saveSettings).not.toHaveBeenCalled();
  });

  it("saves, then goes where the link led, on “Save and leave”", async () => {
    m.api.saveSettings.mockImplementation(async ({ tracks }: { tracks: unknown[] }) => ({ rev: 3, tracks }));
    await page();
    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]); // a change that is valid as it is
    fireEvent.click(screen.getByRole("link", { name: "Rail: Learn" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save and leave" }));
    expect(await screen.findByText("elsewhere")).toBeTruthy();
    expect(m.api.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("lets a link through when nothing changed", async () => {
    await page();
    fireEvent.click(screen.getByRole("link", { name: "Rail: Learn" }));
    expect(await screen.findByText("elsewhere")).toBeTruthy();
  });

  it("says a failed read and a refused save in the admin's language", async () => {
    m.data.getSettings.mockRejectedValue(refused("permission-denied", undefined, "Missing or insufficient permissions."));
    m.data.unitsByTrack.mockResolvedValue(new Map());
    wrap(<TracksPage />, "/super/tracks", "/super/tracks", "ar");
    expect(await screen.findByText(/حسابك لا يملك صلاحية هذا الإجراء/)).toBeTruthy();
    expect(screen.queryByText(/Missing or insufficient/)).toBeNull();
  });
});

describe("the language spreadsheet", () => {
  const fr = { code: "fr", native: "Français", english: "French", dir: "ltr" as const, numerals: "fr" };
  const sheet = async () => {
    m.data.getTranslation.mockResolvedValue({ ...fr, messages: { "common.continue": "Continuer" }, rev: 2, published: null });
    wrap(<TranslatePage />, "/super/languages/fr?tab=sheet", "/super/languages/:code");
    return screen.findByRole("button", { name: "Download (.xlsx)" });
  };

  it("announces an Excel download whose chunk did not load, and the CSV download beside it still works", async () => {
    m.xlsx.mockRejectedValue(new TypeError("Failed to fetch dynamically imported module"));
    fireEvent.click(await sheet());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(entEn["ent.lang.xlsxFailed"]);
    expect(screen.queryByText(/dynamically imported/)).toBeNull();
    expect(m.download).not.toHaveBeenCalled();
    // The button is itself again (not left spinning), and CSV needs no chunk.
    expect(screen.getByRole("button", { name: "Download (.xlsx)" }).getAttribute("aria-busy")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Download (.csv)" }));
    expect(m.download).toHaveBeenCalledWith(expect.any(Blob), "darsi-fr.csv");
  });

  it("shows the Excel button as busy while the file is made, then downloads it", async () => {
    let done: (b: Blob) => void = () => {};
    m.xlsx.mockReturnValue(new Promise<Blob>((ok) => { done = ok; }));
    const button = await sheet();
    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("true"));
    fireEvent.click(button); // a second press while it is busy makes no second file
    done(new Blob(["x"]));
    await waitFor(() => expect(m.download).toHaveBeenCalledWith(expect.any(Blob), "darsi-fr.xlsx"));
    expect(m.xlsx).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a field's hint", () => {
  it("is tied to its control, and a field without one points at nothing", () => {
    render(<I18nProvider lang="en"><Text label="Id" hint="Small letters and dashes" value="geo" onChange={() => {}} /><Text label="Name" value="" onChange={() => {}} /></I18nProvider>);
    const id = screen.getByLabelText("Id"), hint = screen.getByText("Small letters and dashes");
    expect(hint.id).toBeTruthy();
    expect(id.getAttribute("aria-describedby")).toBe(hint.id);
    expect(screen.getByLabelText("Name").hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("an upload", () => {
  const pick = (file: File) => {
    render(<I18nProvider lang="ar"><Upload label="الفيديو" kind="video" owner="public" unitId="u1" base="video-ar" onDone={() => {}} onClear={() => {}} /></I18nProvider>);
    fireEvent.change(document.querySelector<HTMLInputElement>("input[type=file]")!, { target: { files: [file] } });
  };
  /** The file input as it is now (the progress bar takes its place while a file goes up). */
  const input = () => document.querySelector<HTMLInputElement>("input[type=file]");

  it("says in Arabic why Storage refused the file, tied to the file input, never Storage's English", async () => {
    m.upload.mockReturnValue({ cancel: () => {}, done: Promise.reject(Object.assign(new Error("Firebase Storage: User does not have permission to access 'content/media/u1/x.mp4'. (storage/unauthorized)"), { code: "storage/unauthorized" })) });
    pick(new File(["x"], "lesson.mp4", { type: "video/mp4" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/حسابك لا يملك صلاحية/);
    expect(alert.textContent).not.toMatch(/Firebase Storage/);
    expect(alert.id).toBeTruthy();
    expect(input()!.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("says nothing when the author cancelled it", async () => {
    m.upload.mockReturnValue({ cancel: () => {}, done: Promise.reject(Object.assign(new Error("cancelled"), { code: "storage/canceled" })) });
    pick(new File(["x"], "lesson.mp4", { type: "video/mp4" }));
    await waitFor(() => expect(m.upload).toHaveBeenCalled());
    await waitFor(() => expect(input()).toBeTruthy()); // back from the progress bar
    expect(screen.queryByRole("alert")).toBeNull();
    expect(input()!.hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("the new strings", () => {
  it("exist in English and Arabic, with no middle dot in Arabic", () => {
    expect(Object.keys(entAr).sort()).toEqual(Object.keys(entEn).sort());
    for (const [key, text] of Object.entries(entAr)) {
      expect(text.trim(), key).not.toBe("");
      expect(text, key).not.toMatch(/·/);
      expect(text, key).toMatch(/[؀-ۿ]/);
    }
  });
});
