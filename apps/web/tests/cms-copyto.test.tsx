// "Copy to another unit" in the course editor (cms/panes.tsx CopyTo): a list that can't be read and a copy that fails
// are said in the author's language (cms/entStrings failText), never as the SDK's raw English.
import { fireEvent, render, screen } from "@testing-library/react";
import type { Lesson } from "../src/content/types";
import { I18nProvider } from "../src/i18n";

const m = vi.hoisted(() => ({ listUnits: vi.fn(), copyLessonTo: vi.fn() }));
vi.mock("../src/firebase", () => ({ db: {}, storage: vi.fn(), storageJSON: vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "me" }, role: "superadmin", orgId: null }) }));
vi.mock("../src/cms/data", async (orig) => ({ ...(await orig<typeof import("../src/cms/data")>()), listUnits: m.listUnits, copyLessonTo: m.copyLessonTo }));

await import("../src/cms/strings"); // the editor's words, registered by its chunk (Cms.tsx)
const { CopyTo } = await import("../src/cms/panes");
const { Said } = await import("../src/cms/entStrings");

const lesson = { id: "u1-1", title: { en: "Is it AI?" }, minutes: 5, steps: [], tryTomorrow: { en: "" }, slides: [], kit: [] } as unknown as Lesson;
const meta = (id: string) => ({ id, owner: "public", title: { en: `Unit ${id}` }, track: "ai", level: 1, lessonCount: 1, lessons: [], rev: 1 });
const raw = (code: string) => Object.assign(new Error("Missing or insufficient permissions."), { code });
const show = (lang = "en") => render(<I18nProvider lang={lang}><CopyTo owner="public" unitId="u1" lesson={lesson} onDone={() => {}} /></I18nProvider>);

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => { m.listUnits.mockReset(); m.copyLessonTo.mockReset(); logged = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => logged.mockRestore());

it("a list of units that can't be read says why in the author's language", async () => {
  m.listUnits.mockRejectedValue(raw("permission-denied"));
  show();
  const why = await screen.findByRole("alert");
  expect(why.textContent).toMatch(/Your account isn't allowed to do this/);
  expect(why.textContent).not.toContain("Missing or insufficient permissions");
});

it("a copy that fails says why, and the editor's own words go through as they are", async () => {
  m.listUnits.mockResolvedValue([meta("u1"), meta("u2")]);
  m.copyLessonTo.mockRejectedValueOnce(raw("unavailable")).mockRejectedValueOnce(new Said("That id is taken."));
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Copy lesson" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/can't be reached right now/);
  expect(screen.getByRole("alert").textContent).not.toContain("Missing or insufficient permissions");
  fireEvent.click(screen.getByRole("button", { name: "Copy lesson" }));
  expect(await screen.findByText("That id is taken.")).toBeTruthy();
});

it("in Arabic", async () => {
  m.listUnits.mockRejectedValue(raw("unavailable"));
  show("ar");
  const why = await screen.findByRole("alert");
  expect(why.textContent).not.toMatch(/[A-Za-z]{3}/);
});

it("the unused upload string is gone from both languages", async () => {
  const en = (await import("../src/cms/strings/en.json")).default as Record<string, string>;
  const ar = (await import("../src/cms/strings/ar.json")).default as Record<string, string>;
  expect("cms.uploadFailed" in en || "cms.uploadFailed" in ar).toBe(false);
});
