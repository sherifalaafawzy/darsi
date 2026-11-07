// Who has work waiting (admin/review.ts): /teach and /admin show each person's projects waiting for a review, from the
// count the submission triggers keep on the profiles they already read (functions/src/waiting.ts), first by default,
// with a total and a filter; /teach also counts and filters the students who need support.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Profile } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";

const m = vi.hoisted(() => ({ students: [] as unknown[] }));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: {}, functions: {}, firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "t1" }, role: "teacher", orgId: "o1" }) }));
vi.mock("../src/admin/data", async (orig) => ({ ...(await orig<typeof import("../src/admin/data")>()), useMyStudents: () => ({ data: m.students, reload: vi.fn() }) }));

const { Teach } = await import("../src/admin/Teach");
const { byWaiting, waitingOf, waitingTotals } = await import("../src/admin/review");

const recent = new Date(Date.now() - 864e5).toISOString();
const student = (uid: string, name: string, extra: Partial<Profile> = {}): Profile => ({
  uid, name, email: `${uid}@users.darsi.app`, role: "student", orgId: "o1", teacherId: "t1",
  summary: { lessonsDone: 2, xp: 0, avgAccuracy: 0.8, lastActive: recent, competencies: {}, units: {} }, ...extra,
});
const page = (lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter><Teach /></MemoryRouter></I18nProvider>);
const names = () => screen.getAllByRole("link").map((a) => a.textContent ?? "").filter((x) => /Amina|Bola|Chidi|Dayo/.test(x));

beforeEach(() => {
  m.students = [
    student("s1", "Amina"),
    student("s2", "Bola", { projectsWaiting: 1 }),
    student("s3", "Chidi", { projectsWaiting: 2 }),
    student("s4", "Dayo", { summary: { lessonsDone: 4, xp: 0, avgAccuracy: 0.4, lastActive: recent, competencies: {}, units: {} } }),
  ];
});

describe("/teach", () => {
  it("totals the projects waiting and puts the students who sent them first, most first", () => {
    page();
    const tile = screen.getByText("Projects to review").closest(".tile") as HTMLElement;
    expect(within(tile).getByText("3")).toBeTruthy();
    expect(within(tile).getByText("Students: 2")).toBeTruthy();
    expect(names()[0]).toMatch(/Chidi/);
    expect(names()[1]).toMatch(/Bola/);
    // Each waiting student's row says how many; the others' cell stays empty (hidden on phones).
    const chidi = screen.getByRole("link", { name: /Chidi/ }).closest("tr") as HTMLElement;
    const count = chidi.querySelector('td[data-label="To review"] > span');
    expect(count?.textContent).toBe("2");
    expect(count?.className).toContain("status-submitted");
    const amina = screen.getByRole("link", { name: /Amina/ }).closest("tr") as HTMLElement;
    expect(amina.querySelector('td[data-label="To review"]')?.textContent).toBe("");
  });

  it("shows only the students with projects to review, or only those who need support", () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Projects to review: 3" }));
    expect(names()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Projects to review: 3" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Needs support: 1" }));
    expect(names()).toEqual([expect.stringMatching(/Dayo/)]);
    fireEvent.click(screen.getByRole("button", { name: "Needs support: 1" }));
    expect(names()).toHaveLength(4);
  });

  it("speaks Arabic", () => {
    page("ar");
    expect(screen.getByText("مشاريع بانتظار المراجعة")).toBeTruthy();
    expect(screen.getAllByText("للمراجعة").length).toBeGreaterThan(0); // the sort option and the column
  });

  it("has nothing to filter when nothing waits", () => {
    m.students = [student("s1", "Amina")];
    page();
    expect(screen.queryByRole("button", { name: /Projects to review/ })).toBeNull();
  });
});

describe("review counts", () => {
  it("read only a positive whole count, and sort by it, then by name", () => {
    expect(waitingOf({ projectsWaiting: 3 })).toBe(3);
    expect(waitingOf({})).toBe(0);
    expect(waitingOf({ projectsWaiting: -1 })).toBe(0);
    expect(waitingTotals([{ projectsWaiting: 2 }, {}, { projectsWaiting: 1 }])).toEqual({ projects: 3, people: 2 });
    const list = [{ name: "B" }, { name: "A", projectsWaiting: 1 }, { name: "C", projectsWaiting: 1 }, { name: "D", projectsWaiting: 4 }];
    expect([...list].sort(byWaiting).map((x) => x.name)).toEqual(["D", "A", "C", "B"]);
  });
});
