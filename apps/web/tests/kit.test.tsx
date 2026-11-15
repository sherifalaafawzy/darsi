// Kit: a students' course shows the learner's notes, slides and worksheet (not a classroom kit), and a course that can't
// load offline says so with Retry instead of spinning for ever. The catalog, the units and the store are fakes here.
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../src/i18n";
import type { AppState } from "../src/state/store";

const h = vi.hoisted(() => ({
  state: {} as Partial<AppState>,
  audience: "teachers" as "teachers" | "students",
  all: false,
  fail: new Set<string>(),
  loaded: [] as string[],
}));
const entry = (id: string, audience?: "students") => ({ id, track: "ai", level: 4, title: { en: `Course ${id}`, ar: `الدورة ${id}` }, summary: { en: "" }, lessons: 1, sizeMB: 1, available: true, src: `content/units/${id}/v1.json`, version: 1, ...(audience ? { audience } : {}) });
const unit = (id: string) => ({
  id, track: "ai", level: 4, title: { en: `Course ${id}` }, summary: { en: "" },
  lessons: [{ id: `${id}-1`, title: { en: "One" }, steps: [{ type: "video", id: "v", sizeMB: 1.4 }], kit: [
    { kind: "plan", title: { en: "Notes" }, base: `${id}-1/plan`, formats: ["pdf"], pages: 2 },
    { kind: "worksheet", title: { en: "Sheet" }, base: `${id}-1/sheet`, formats: ["pdf"], pages: 1 },
    { kind: "video", title: { en: "The lesson video" }, path: `/media/${id}-1/video-{lang}`, formats: ["mp4"], pages: 0 },
    { kind: "slides", title: { en: "Slides" }, base: `${id}-1/slides`, formats: ["pdf"], pages: 0 },
  ] }],
});
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadCatalog: async () => ({ version: 1, units: [entry("t1"), entry("s1", "students"), entry("t2"), entry("s2", "students")] }),
  loadUnit: async (id: string) => { h.loaded.push(id); if (h.fail.has(id)) throw new TypeError("Failed to fetch"); return unit(id); },
}));
vi.mock("../src/content/mine", () => ({ useMine: () => ({ isMine: () => true, audience: h.audience, all: h.all, tracks: [{ id: "ai" }], levelName: () => "Advanced" }) }));
vi.mock("../src/state/store", () => ({ useStore: () => ({ state: h.state, dispatch: vi.fn(), ready: true }) }));

const { Kit } = await import("../src/screens/Kit");
const show = (lang = "en") => render(<I18nProvider lang={lang}><Kit /></I18nProvider>);
const online = (on: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, value: on });

beforeEach(() => { h.state = { lang: "en", progress: { "t1-1": {}, "s1-1": {} } as never }; h.audience = "teachers"; h.all = false; h.fail = new Set(); h.loaded = []; online(true); });
afterEach(() => online(true));

describe("Kit", () => {
  it("labels a students' course as the learner's notes, and a worksheet as a worksheet", async () => {
    h.audience = "students";
    show();
    expect(await screen.findByRole("heading", { name: "Notes and slides" })).toBeTruthy();
    expect((await screen.findAllByText(/^Your notes/)).length).toBe(1);
    expect(screen.getAllByText(/^Your classroom kit/).length).toBe(1); // the teachers' course in the same list
    expect(screen.getAllByText("Lesson notes").length).toBe(1);
    expect(screen.getAllByText("Lesson plan").length).toBe(1);
    expect(screen.getAllByText("Worksheet").length).toBe(2);
  });

  it("a course that can't load offline says so, with Retry, instead of spinning", async () => {
    h.fail = new Set(["t1"]);
    online(false);
    show();
    expect(await screen.findByText("This course isn’t on this phone yet. Connect to the internet to open it, and download it to use it offline.")).toBeTruthy();
    expect(screen.getByText("Course t1")).toBeTruthy();
    h.fail = new Set();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect((await screen.findAllByText(/^Your classroom kit/)).length).toBe(1);
  });

  it("lists courses with no finished lesson as one locked line each, after the kits that are open, and never loads them", async () => {
    // t2 has a lesson done, recorded with its unitId; s2 and the others' lessons aren't finished.
    h.state = { lang: "en", progress: { "t1-1": {}, "x-9": { unitId: "t2" } } as never };
    show();
    const locked = await screen.findByRole("region", { name: "Still locked" });
    expect(locked.textContent).toContain("Finish a lesson in ⁨Course s1⁩ to open its notes and slides.");
    expect(locked.textContent).toContain("Finish a lesson in ⁨Course s2⁩ to open its notes and slides.");
    expect(locked.textContent).not.toContain("Course t");
    await screen.findAllByText(/^Your classroom kit/);
    expect(h.loaded.sort()).toEqual(["t1", "t2"]);
    // The open kits come first in the page.
    const kits = screen.getAllByText(/^Your classroom kit/)[0];
    expect(kits.compareDocumentPosition(locked) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("never says “0 pages”: the lesson video shows its size, a printout without a page count shows nothing", async () => {
    h.state = { lang: "en", progress: { "t1-1": {} } as never };
    show();
    await screen.findAllByText(/^Your classroom kit/);
    expect(screen.queryByText(/0 pages/)).toBeNull();
    expect(screen.getByText("1.4 MB")).toBeTruthy();
    expect(screen.getByText("2 pages")).toBeTruthy();
    expect(screen.getByText("1 page")).toBeTruthy();
  });

  it("in Arabic, counts pages with the right forms and gives the video's size", async () => {
    h.state = { lang: "ar", progress: { "t1-1": {} } as never };
    show("ar");
    await screen.findAllByText(/^حقيبتك الصفّية/);
    expect(screen.queryByText(/٠ صفح/)).toBeNull();
    expect(screen.getByText("صفحتان")).toBeTruthy();
    expect(screen.getByText("صفحة واحدة")).toBeTruthy();
    expect(screen.getByText("١٫٤ ميغابايت")).toBeTruthy();
  });

  it("is open for a platform admin: every course, none locked, each loaded only when opened", async () => {
    h.all = true;
    h.state = { lang: "en", progress: {} as never };
    show();
    const rows = await screen.findAllByText(/^Course [ts]\d$/);
    expect(rows.map((r) => r.textContent)).toEqual(["Course s1", "Course s2", "Course t1", "Course t2"]);
    expect(screen.queryByText("Still locked")).toBeNull();
    expect(h.loaded).toEqual([]);
    fireEvent.click(screen.getByText("Course s2"));
    expect((await screen.findAllByText(/^Your notes/)).length).toBe(1);
    expect(h.loaded).toEqual(["s2"]);
    expect(screen.queryByText("Finish a lesson to open its notes and slides.")).toBeNull();
    expect(screen.getAllByRole("button", { name: "PDF" }).length).toBe(3);
  });
});
