// The learning report (admin/OrgReport.tsx) on a phone and in Arabic: the app bar says what the page is in words short
// enough not to be cut (whose report it is stands on the page for a platform admin); the weekly chart names its ends by
// the day each week starts, in the page's language, not "W46"; and the people and teachers tables say which cell is the
// person, so a phone shows a card with the name across it (styles/base.css .data-table; tests/staff-cards.test.tsx).
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Profile } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";

const m = vi.hoisted(() => ({ role: "orgAdmin", members: [] as unknown[] }));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: vi.fn(), firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "a1" }, role: m.role, orgId: "o1" }) }));
vi.mock("../src/content/load", async (orig) => ({ ...(await orig<typeof import("../src/content/load")>()), loadCatalog: async () => ({ version: 1, units: [] }) }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useOrg: () => ({ data: { id: "o1", name: "Nile Valley Language School", type: "school", status: "active", createdBy: "u" }, reload: vi.fn() }),
  useMembers: (orgId: unknown) => (orgId
    ? { data: m.members, partial: m.members, loaded: m.members.length, complete: true, loading: false, refreshing: false, at: 0, reload: vi.fn(), patch: vi.fn(), remove: vi.fn() }
    : { partial: [], loaded: 0, complete: false, loading: false, refreshing: false, at: 0, reload: vi.fn(), patch: vi.fn(), remove: vi.fn() }),
  useMyStudents: () => ({ data: undefined, reload: vi.fn() }),
  usePerson: () => ({ data: undefined, loading: false, reload: vi.fn() }),
}));

const { OrgReport, weekLabel } = await import("../src/admin/OrgReport");
const { weekly } = await import("../src/admin/orgStats");
const { isoWeek } = await import("../src/state/store");

const now = new Date().toISOString();
const summary = (lessonsDone: number, more: Record<string, unknown> = {}) => ({ lessonsDone, xp: 0, avgAccuracy: 0.8, lastActive: now, competencies: {}, units: {}, graded: lessonsDone, ...more });
const people = (): Profile[] => [
  { uid: "t1", name: "Hany Lotfy", email: "hany@nile-valley.example", role: "teacher", orgId: "o1" },
  { uid: "s1", name: "Ahmed Abdel-Rahman Mostafa El-Sayed", email: "student4@nile-valley.example", role: "student", orgId: "o1", teacherId: "t1", group: "5B",
    summary: summary(5, { seconds: 1800, weeks: { [isoWeek()]: 3, [isoWeek(new Date(Date.now() - 7 * 864e5))]: 2 } }) },
  { uid: "s2", name: "Laila Mansour", email: "laila@users.darsiai.org", role: "student", orgId: "o1", teacherId: "t1" },
] as unknown as Profile[];
const page = (lang = "en", at = "/admin/analytics") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[at]}><OrgReport /></MemoryRouter></I18nProvider>);

beforeEach(() => { m.role = "orgAdmin"; m.members = people(); });

describe("the day a week starts, for the chart", () => {
  it("is the Monday of the ISO week, short, in the page's language", () => {
    expect(weekLabel("2026-W46", "en")).toBe("Nov 9");
    expect(weekLabel("2026-W35", "en")).toBe("Aug 24");
    // Week 1 can start in the year before; a year that starts on a Monday starts its week 1 that day.
    expect(weekLabel("2026-W01", "en")).toBe("Dec 29");
    expect(weekLabel("2024-W01", "en")).toBe("Jan 1");
    expect(weekLabel("2020-W53", "en")).toBe("Dec 28");
    const ar = weekLabel("2026-W46", "ar-EG");
    expect(ar).toContain("نوفمبر");
    expect(ar).toContain("٩");
    expect(ar).not.toMatch(/[A-Za-z]/);
  });

  it("agrees with the week a lesson is counted in, whatever the day", () => {
    // Every day of a week is counted under the same key, and that key's label is that week's Monday.
    for (const day of ["2026-11-09", "2026-11-11", "2026-11-15"]) expect(weekLabel(isoWeek(new Date(`${day}T12:00:00`)), "en")).toBe("Nov 9");
    expect(weekLabel(isoWeek(new Date("2026-11-16T12:00:00")), "en")).toBe("Nov 16");
  });

  it("keeps what it can't read, and the week's number for a locale the browser doesn't know", () => {
    expect(weekLabel("last week", "en")).toBe("last week");
    expect(weekLabel("2026-W46", "not a locale")).toBe("W46");
  });
});

describe("the weekly chart's ends", () => {
  it.each([["en", "en"], ["ar", "ar-EG"]])("are dates in the page's language, never \"W46\" (%s)", (lang, locale) => {
    const { container } = page(lang);
    const ends = Array.from(container.querySelectorAll(".an-axis > span")).map((x) => x.textContent);
    const weeks = weekly([]);
    expect(ends[0]).toBe(weekLabel(weeks[0].week, locale));
    expect(ends[2]).toBe(weekLabel(weeks[11].week, locale));
    for (const end of [ends[0], ends[2]]) expect(end).not.toMatch(/W\d/);
    if (lang === "ar") expect(`${ends[0]}${ends[2]}`).not.toMatch(/[A-Za-z]/);
    // Each bar still says which week it is and how many lessons, for a pointer or a screen reader.
    const bars = Array.from(container.querySelectorAll(".an-chart rect title")).map((x) => x.textContent);
    expect(bars).toHaveLength(12);
    expect(bars[11]).toBe(`${weekLabel(weeks[11].week, locale)}: ${lang === "ar" ? "٣" : "3"}`);
    expect(bars[10]).toBe(`${weekLabel(weeks[10].week, locale)}: ${lang === "ar" ? "٢" : "2"}`);
    expect(container.querySelector(".an-chart svg")!.getAttribute("aria-label")).toBeTruthy();
  });
});

describe("the app bar's title", () => {
  it.each([["en", "Learning report"], ["ar", "تقرير التعلّم"]])("is the report's name alone, short enough for a phone (%s)", (lang, title) => {
    page(lang);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe(title);
    // An organization's own admin has one organization: its name is not repeated on the page.
    expect(screen.queryByText("Nile Valley Language School")).toBeNull();
  });

  it("a platform admin, who reads many organizations' reports, sees whose it is on the page", () => {
    m.role = "superadmin";
    page("ar");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("تقرير التعلّم");
    const name = screen.getByText("Nile Valley Language School");
    // A Latin name inside an Arabic page keeps its own direction, and it is on the page, not in the bar.
    expect(name.tagName).toBe("BDI");
    expect(name.closest("main")).toBeTruthy();
    expect(name.closest("header")).toBeNull();
  });
});

describe("the people and teachers tables as cards", () => {
  const cellsOf = (row: HTMLElement) => Array.from(row.querySelectorAll("td"));

  it("People: the person is the main cell, an address may break before its @, and dashes are marked to be left out", () => {
    page("en", "/admin/analytics?tab=people");
    const table = within(screen.getByRole("tabpanel", { name: "People" })).getByRole("table");
    const ahmed = cellsOf(within(table).getByRole("link", { name: /Ahmed/ }).closest("tr")!);
    expect(ahmed.map((c) => c.getAttribute("data-cell"))).toEqual(["main", null, null, null, null, null, null, null]);
    expect(ahmed.filter((c) => c.hasAttribute("data-empty"))).toHaveLength(0);
    expect(within(ahmed[0]).getByText("student4@nile-valley.example").innerHTML).toBe("student4<wbr>@nile-valley.example");
    // Not started, no class: class, score and time have nothing to say on a card; lessons (0), secure items, last
    // active and the status stay.
    const laila = cellsOf(within(table).getByRole("link", { name: /Laila/ }).closest("tr")!);
    expect(laila.filter((c) => c.hasAttribute("data-empty")).map((c) => c.getAttribute("data-label"))).toEqual(["Group", "Accuracy", "Learning time"]);
    expect(laila.filter((c) => !c.hasAttribute("data-empty")).map((c) => c.getAttribute("data-label"))).toEqual(["Name", "Lessons", "Secure", "Last active", "Status"]);
  });

  it("Teachers: the teacher is the main cell, and a score nobody has yet is marked", () => {
    page("en", "/admin/analytics?tab=classes");
    const row = screen.getByRole("link", { name: /Hany Lotfy/ }).closest("tr")!;
    const cells = cellsOf(row);
    expect(cells[0].getAttribute("data-cell")).toBe("main");
    expect(cells.slice(1).every((c) => !c.hasAttribute("data-cell"))).toBe(true);
    // The teacher has no lessons of their own (no score); their students have one.
    expect(cells.filter((c) => c.hasAttribute("data-empty")).map((c) => c.getAttribute("data-label"))).toEqual(["Own score"]);
  });

  it("Tracks and courses: the track or course is the main cell, its numbers plain labelled values", () => {
    const withWork = people();
    withWork[1] = { ...withWork[1], summary: { ...withWork[1].summary!, tracks: { ai: { n: 5, g: 5, acc: 4, sec: 1800 } }, units: { "ai-1-1": 5 } } } as unknown as Profile;
    m.members = withWork;
    page("en", "/admin/analytics?tab=courses");
    const rows = Array.from(document.querySelectorAll("[role=tabpanel]:not([hidden]) tbody tr"));
    expect(rows).toHaveLength(2); // one track, one course
    for (const row of rows) {
      const cells = cellsOf(row as HTMLElement);
      expect(cells[0].getAttribute("data-cell")).toBe("main");
      expect(cells.slice(1).every((c) => !c.hasAttribute("data-cell") && !!c.getAttribute("data-label"))).toBe(true);
    }
  });

  it("the same in Arabic", () => {
    page("ar", "/admin/analytics?tab=people");
    fireEvent.click(screen.getByRole("tab", { name: "الأشخاص" }));
    const rows = Array.from(document.querySelectorAll("[role=tabpanel]:not([hidden]) tbody tr"));
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.querySelector("td")!.getAttribute("data-cell")).toBe("main");
  });
});
