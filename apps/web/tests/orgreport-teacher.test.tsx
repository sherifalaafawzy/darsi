import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Profile } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";

// /teach/analytics: a teacher's own learning opens on the framework where it counts, and their Excel export is about
// their students (named so), with scores as percentages and Arabic sheets right to left.
const m = vi.hoisted(() => ({
  me: null as unknown,
  students: [] as unknown[],
  saved: [] as Array<{ blob: Blob; name: string }>,
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: vi.fn(), firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "t1" }, role: "teacher", orgId: "o1" }) }));
vi.mock("../src/content/load", async (orig) => ({ ...(await orig<typeof import("../src/content/load")>()), loadCatalog: async () => ({ version: 1, units: [] }) }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useOrg: () => ({ data: { id: "o1", name: "Nile Valley School", type: "school", status: "active", createdBy: "u" }, reload: vi.fn() }),
  useMembers: () => ({ data: undefined, reload: vi.fn() }),
  useMyStudents: () => ({ data: m.students, reload: vi.fn() }),
  usePerson: () => ({ data: m.me, reload: vi.fn() }),
}));
vi.mock("../src/admin/importer", async (orig) => ({ ...(await orig<typeof import("../src/admin/importer")>()), downloadBlob: (blob: Blob, name: string) => { m.saved.push({ blob, name }); } }));

const { OrgReport } = await import("../src/admin/OrgReport");
const ExcelJS = (await import("exceljs")).default;

const summary = (lessonsDone: number, competencies: Record<string, number>, avgAccuracy = 0.7) =>
  ({ lessonsDone, xp: 0, avgAccuracy, lastActive: new Date().toISOString(), competencies, units: {}, graded: lessonsDone });
const page = (lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter><OrgReport mode="teacher" /></MemoryRouter></I18nProvider>);
const read = async (blob: Blob) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await blob.arrayBuffer()); return wb; };

beforeEach(() => {
  m.saved = [];
  // Ten lessons, all with DigComp codes: nothing on the UNESCO teachers' items.
  m.me = { uid: "t1", name: "Hoda Salem", email: "hoda@school.org", role: "teacher", orgId: "o1", summary: summary(10, { "DC.1.1": 7, "DC.1.2": 3 }) } satisfies Profile;
  m.students = [{ uid: "s1", name: "Omar", email: "omar@users.darsi.app", role: "student", orgId: "o1", teacherId: "t1", group: "5A", summary: summary(4, {}, 0.96) }];
});

describe("a teacher's report", () => {
  it("opens their own learning on the framework with their evidence", async () => {
    page();
    const mine = (await screen.findByRole("heading", { name: "My own learning" })).closest("section")!;
    expect((within(mine).getByRole("combobox") as HTMLSelectElement).value).toBe("digcomp");
  });

  it("exports their students under their own name, with percentages", async () => {
    page();
    fireEvent.click(await screen.findByRole("button", { name: "Export to Excel" }));
    await waitFor(() => expect(m.saved).toHaveLength(1));
    expect(m.saved[0].name).toBe("darsi-Hoda-Salem-students.xlsx");
    const wb = await read(m.saved[0].blob);
    const sum = wb.worksheets[0];
    expect(sum.getRow(1).values).toEqual([undefined, "My students' learning", "Nile Valley School — Hoda Salem"]);
    expect(sum.getCell("B7").numFmt).toBe("0%");
    const people = wb.worksheets[1];
    const score = people.getRow(1).values as unknown[];
    const col = score.indexOf("Accuracy");
    expect(col).toBeGreaterThan(0);
    expect(people.getRow(2).getCell(col).value).toBe(0.96);
    expect(people.getRow(2).getCell(col).numFmt).toBe("0%");
    expect(wb.worksheets.every((ws) => !ws.views[0]?.rightToLeft)).toBe(true);
  });

  it("writes Arabic sheets right to left", async () => {
    page("ar");
    fireEvent.click(await screen.findByRole("button", { name: "تصدير إلى Excel" }));
    await waitFor(() => expect(m.saved).toHaveLength(1));
    const wb = await read(m.saved[0].blob);
    expect(wb.worksheets.every((ws) => ws.views[0]?.rightToLeft === true)).toBe(true);
  });
});
