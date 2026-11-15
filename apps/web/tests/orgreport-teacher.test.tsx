import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Profile } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";

// /teach/analytics: a teacher's own learning opens on the framework where it counts, and their Excel export is about
// their students (named so), with scores as percentages and Arabic sheets right to left. The report is in tabs
// (admin/Tabs.tsx, ?tab=): the filters and Export stay above them; the organization's report (/admin/analytics) has no
// "My learning" and names its classes tab for the teachers' table too. An organization's people come through
// admin/data.ts useMembers (here a fake): nothing is counted until the list is whole, the people table shows 100 rows
// at a time, and a failed read or export is said with a way on.
const m = vi.hoisted(() => ({
  me: null as unknown,
  meLoading: false,
  students: [] as unknown[],
  members: undefined as unknown[] | undefined,
  membersErr: undefined as unknown,
  loaded: 0,
  useMembers: vi.fn(),
  reload: vi.fn(),
  failSave: false,
  saved: [] as Array<{ blob: Blob; name: string }>,
  /** Whose evidence for a framework item was worked out (orgStats.itemEvidence), in order. */
  evidence: [] as string[],
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: vi.fn(), firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "t1" }, role: "teacher", orgId: "o1" }) }));
vi.mock("../src/content/load", async (orig) => ({ ...(await orig<typeof import("../src/content/load")>()), loadCatalog: async () => ({ version: 1, units: [] }) }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useOrg: () => ({ data: { id: "o1", name: "Nile Valley School", type: "school", status: "active", createdBy: "u" }, reload: vi.fn() }),
  useMembers: m.useMembers,
  useMyStudents: () => ({ data: m.students, reload: vi.fn() }),
  usePerson: () => ({ data: m.me, loading: m.meLoading, reload: vi.fn() }),
}));
vi.mock("../src/admin/importer", async (orig) => ({ ...(await orig<typeof import("../src/admin/importer")>()), downloadBlob: (blob: Blob, name: string) => { if (m.failSave) throw new Error("The download was blocked"); m.saved.push({ blob, name }); } }));

// Counts whose framework items are worked out: the People tab does that only for the rows it shows.
vi.mock("../src/admin/orgStats", async (orig) => {
  const real = await orig<typeof import("../src/admin/orgStats")>();
  return { ...real, itemEvidence: (p: Profile, it: Parameters<typeof real.itemEvidence>[1]) => { m.evidence.push(p.uid); return real.itemEvidence(p, it); } };
});

const { OrgReport } = await import("../src/admin/OrgReport");
const ExcelJS = (await import("exceljs")).default;

const summary = (lessonsDone: number, competencies: Record<string, number>, avgAccuracy = 0.7) =>
  ({ lessonsDone, xp: 0, avgAccuracy, lastActive: new Date().toISOString(), competencies, units: {}, graded: lessonsDone });
const page = (lang = "en", at = "/teach/analytics") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[at]}><OrgReport mode="teacher" /></MemoryRouter></I18nProvider>);
const orgPage = (at = "/admin/analytics") => render(<I18nProvider lang="en"><MemoryRouter initialEntries={[at]}><OrgReport /></MemoryRouter></I18nProvider>);
const read = async (blob: Blob) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await blob.arrayBuffer()); return wb; };
const tabNames = () => screen.getAllByRole("tab").map((x) => x.textContent);
const open = (name: string) => screen.getByRole("tab", { name }).getAttribute("aria-selected") === "true";
const omar = (group?: string) => ({ uid: "s1", name: "Omar", email: "omar@users.darsi.app", role: "student", orgId: "o1", teacherId: "t1", ...(group ? { group } : {}), summary: summary(4, {}, 0.96) });

beforeEach(() => {
  m.saved = []; m.evidence = []; m.failSave = false; m.membersErr = undefined; m.loaded = 0; m.reload.mockClear();
  // The member list as admin/data.ts gives it: `data` only once every page has arrived.
  m.useMembers.mockReset();
  m.useMembers.mockImplementation((orgId: unknown) => (orgId
    ? { data: m.members, partial: m.members ?? [], loaded: m.members?.length ?? m.loaded, complete: !!m.members, loading: !m.members && !m.membersErr, refreshing: false, error: m.membersErr, at: 0, reload: m.reload, patch: vi.fn(), remove: vi.fn() }
    : { partial: [], loaded: 0, complete: false, loading: false, refreshing: false, at: 0, reload: m.reload, patch: vi.fn(), remove: vi.fn() }));
  // Ten lessons, all with DigComp codes: nothing on the UNESCO teachers' items.
  m.me = { uid: "t1", name: "Hoda Salem", email: "hoda@school.org", role: "teacher", orgId: "o1", summary: summary(10, { "DC.1.1": 7, "DC.1.2": 3 }) } satisfies Profile;
  m.meLoading = false;
  m.students = [omar("5A")];
  m.members = undefined;
});

describe("a teacher's report", () => {
  it("reads their own students, never the organization's member list", async () => {
    page();
    await screen.findByRole("heading", { name: "Who needs attention" });
    expect(m.useMembers.mock.calls.every((c) => c[0] === null)).toBe(true);
  });

  it("opens their own learning on the framework with their evidence", async () => {
    page("en", "/teach/analytics?tab=me");
    const mine = (await screen.findByRole("heading", { name: "My own learning" })).closest("section")!;
    expect((within(mine).getByRole("combobox") as HTMLSelectElement).value).toBe("digcomp");
    expect(open("My learning")).toBe(true);
    // The link went straight there: the overview was never worked out.
    expect(screen.queryByText("Who needs attention")).toBeNull();
  });

  it("waits for their own profile, so a link to their own learning doesn't open the overview first", async () => {
    // The students have answered, the teacher's own profile hasn't: no tabs yet (they would lack "My learning").
    m.meLoading = true;
    const mine = m.me;
    m.me = undefined;
    const at = (lang: string) => <I18nProvider lang={lang}><MemoryRouter initialEntries={["/teach/analytics?tab=me"]}><OrgReport mode="teacher" /></MemoryRouter></I18nProvider>;
    const { rerender, container } = render(at("en"));
    await waitFor(() => expect(container.querySelector(".loading")).toBeTruthy());
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Who needs attention")).toBeNull();
    m.meLoading = false;
    m.me = mine;
    rerender(at("en"));
    expect(await screen.findByRole("heading", { name: "My own learning" })).toBeTruthy();
    expect(screen.queryByText("Who needs attention")).toBeNull();
  });

  it("shows the students when their own profile can't be read", async () => {
    m.me = undefined; // the read failed: not loading, and nothing came
    page("en", "/teach/analytics?tab=me");
    await screen.findByRole("heading", { name: "Who needs attention" });
    expect(tabNames()).toEqual(["Overview", "Standards", "Tracks & courses", "Classes", "People"]);
  });

  it("opens on the overview, with the other sections one tab away", async () => {
    page();
    expect(await screen.findByRole("heading", { name: "Who needs attention" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Sections of this page" })).toBeTruthy();
    expect(tabNames()).toEqual(["Overview", "Standards", "Tracks & courses", "Classes", "People", "My learning"]);
    expect(open("Overview")).toBe(true);
    // Nothing of a tab nobody opened is on the page.
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText("My own learning")).toBeNull();
    // The filters, Export and Refresh are above the tabs, whatever the tab.
    fireEvent.click(screen.getByRole("tab", { name: "My learning" }));
    expect(screen.getByRole("heading", { name: "My own learning" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export to Excel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Standards" }));
    expect(within(screen.getByRole("tabpanel", { name: "Standards" })).getByRole("heading", { name: "Standards" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Tracks & courses" }));
    expect(within(screen.getByRole("tabpanel", { name: "Tracks & courses" })).getByRole("heading", { name: "Courses" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Classes" }));
    expect(within(screen.getByRole("tabpanel", { name: "Classes" })).getByRole("cell", { name: "5A" })).toBeTruthy();
    // A teacher reads only their own students: no table of teachers.
    expect(screen.queryByRole("heading", { name: "Teachers" })).toBeNull();
  });

  it("opens the people at ?tab=people", async () => {
    page("en", "/teach/analytics?tab=people");
    const panel = await screen.findByRole("tabpanel", { name: "People" });
    expect(within(panel).getByText("Omar")).toBeTruthy();
    expect(within(panel).getByRole("searchbox")).toBeTruthy();
    expect(screen.queryByText("Who needs attention")).toBeNull();
  });

  it("a status on the overview opens People with that filter; un-choosing only clears it", async () => {
    page();
    // Omar is on track: "Inactive" leaves nobody in the table.
    fireEvent.click(await screen.findByRole("button", { name: /^Inactive/ }));
    expect(open("People")).toBe(true);
    // The chip left the page with its panel: focus is on the tab that opened, not on nothing.
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "People" }));
    expect(screen.getByText(/Choose one to see those people on the People tab\./)).toBeTruthy(); // the hint says where they went
    const panel = screen.getByRole("tabpanel", { name: "People" });
    expect(within(panel).queryByText("Omar")).toBeNull();
    expect(within(panel).getByRole("button", { name: "Inactive" })).toBeTruthy(); // the chip that clears the filter
    // Back on the overview the status is still chosen; un-choosing it stays there.
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    const chip = screen.getByRole("button", { name: /^Inactive/ });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chip);
    expect(screen.getByRole("button", { name: /^Inactive/ }).getAttribute("aria-pressed")).toBe("false");
    expect(open("Overview")).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "People" }));
    expect(within(screen.getByRole("tabpanel", { name: "People" })).getByText("Omar")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Inactive" })).toBeNull();
    // The other way: chosen on the overview, cleared by the chip beside the search.
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    fireEvent.click(screen.getByRole("button", { name: /^Not started/ }));
    expect(open("People")).toBe(true);
    expect(screen.queryByText("Omar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Not started" }));
    expect(screen.getByText("Omar")).toBeTruthy();
    expect(open("People")).toBe(true);
  });

  it("keeps the search while another tab is open", async () => {
    page("en", "/teach/analytics?tab=people");
    fireEvent.change(await screen.findByRole("searchbox"), { target: { value: "nobody" } });
    expect(screen.queryByText("Omar")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.queryByRole("searchbox")).toBeNull(); // the long table is taken off the page, not hidden
    fireEvent.click(screen.getByRole("tab", { name: "People" }));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("nobody");
    expect(screen.queryByText("Omar")).toBeNull();
  });

  it("has no Classes tab without classes", async () => {
    m.students = [omar()];
    page("en", "/teach/analytics?tab=classes");
    await screen.findByRole("heading", { name: "Who needs attention" }); // a tab that isn't there opens the overview
    expect(tabNames()).toEqual(["Overview", "Standards", "Tracks & courses", "People", "My learning"]);
  });

  it("names the tabs in Arabic", async () => {
    page("ar");
    await screen.findByRole("tablist", { name: "أقسام هذه الصفحة" });
    expect(tabNames()).toEqual(["نظرة عامة", "المعايير", "المسارات والدورات", "الفصول", "الأشخاص", "تعلّمي"]);
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

describe("an organization's report", () => {
  beforeEach(() => { m.members = [m.me, ...m.students]; });

  it("has no \"My learning\", and its classes tab names the teachers too", async () => {
    orgPage("/admin/analytics?tab=me"); // a teacher's link, opened on the organization's report: the overview
    await screen.findByRole("heading", { name: "Who needs attention" });
    expect(tabNames()).toEqual(["Overview", "Standards", "Tracks & courses", "Classes & teachers", "People"]);
    expect(open("Overview")).toBe(true);
    expect(screen.queryByText("My own learning")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Classes & teachers" }));
    const panel = screen.getByRole("tabpanel", { name: "Classes & teachers" });
    expect(within(panel).getByRole("heading", { name: "Teachers" })).toBeTruthy();
    expect(within(panel).getByText("Hoda Salem")).toBeTruthy();
    expect(within(panel).getByRole("heading", { name: "Classes" })).toBeTruthy();
  });

  it("keeps the classes tab for the teachers' table when there are no classes", async () => {
    m.members = [m.me, omar()];
    orgPage("/admin/analytics?tab=classes");
    const panel = await screen.findByRole("tabpanel", { name: "Classes & teachers" });
    expect(within(panel).getByRole("heading", { name: "Teachers" })).toBeTruthy();
    expect(within(panel).queryByRole("heading", { name: "Classes" })).toBeNull();
  });

  it("asks for the members with their whole summaries (the report view)", async () => {
    orgPage();
    await screen.findByRole("tablist");
    expect(m.useMembers).toHaveBeenCalledWith("o1", "report");
  });

  it("shows the same figures for the same members", async () => {
    const student = (uid: string, lessonsDone: number, avgAccuracy: number, group: string) =>
      ({ uid, name: uid, email: `${uid}@users.darsi.app`, role: "student", orgId: "o1", teacherId: "t1", group, summary: { ...summary(lessonsDone, {}, avgAccuracy), seconds: 600 } });
    m.members = [m.me, student("amal", 6, 0.9, "5A"), student("bola", 4, 0.5, "5A"), student("chidi", 2, 0.7, "5B")];
    orgPage();
    await screen.findByRole("heading", { name: "Who needs attention" });
    const tile = (label: string) => screen.getAllByText(label).map((x) => x.closest(".tile")).find(Boolean)!.querySelector("strong")!.textContent;
    expect(tile("Students")).toBe("3");
    expect(tile("Lessons finished")).toBe("12");
    expect(tile("Average score")).toBe("70%");
    expect(screen.getByRole("button", { name: /^On track/ }).textContent).toMatch(/2$/);
    expect(screen.getByRole("button", { name: /^Needs support/ }).textContent).toMatch(/1$/);
    fireEvent.click(screen.getByRole("tab", { name: "Classes & teachers" }));
    const panel = within(screen.getByRole("tabpanel", { name: "Classes & teachers" }));
    const cells = (name: string) => within(panel.getByText(name).closest("tr")!).getAllByRole("cell").map((c) => c.textContent);
    // Her own lessons and score, then her students: how many, active, their average, how many need support.
    expect(cells("Hoda Salem").slice(1)).toEqual(["10", "70%", expect.stringMatching(/^0 of /), "3", "3", "70%", "1"]);
    expect(cells("5A")).toEqual(["5A", "2", "2", "10", "70%", "1", "0"]);
    expect(cells("5B")).toEqual(["5B", "1", "1", "2", "70%", "0", "0"]);
  });

  describe("a long member list", () => {
    const school = (n: number) => [m.me, ...Array.from({ length: n }, (_, i) => ({ uid: `s${i}`, name: `Student ${String(i).padStart(3, "0")}`, email: `s${i}@users.darsi.app`, role: "student", orgId: "o1", teacherId: "t1", summary: summary(1 + (i % 5), {}, 0.8) }))];
    const dataRows = () => within(screen.getByRole("tabpanel", { name: "People" })).getAllByRole("row").length - 1;

    it("works nothing out until the list is whole, and says how many people have loaded", () => {
      m.members = undefined; m.loaded = 2000;
      orgPage();
      expect(screen.getByRole("status").textContent).toBe("People loaded so far: 2,000");
      expect(screen.queryByRole("tablist")).toBeNull();
      expect(screen.queryByText("Who needs attention")).toBeNull();
      // Nothing is exported from a list that is still arriving.
      expect(screen.getByRole("button", { name: "Export to Excel" })).toHaveProperty("disabled", true);
      expect(screen.queryByText("No one matches these filters yet.")).toBeNull();
    });

    it("shows the people table 100 rows at a time", async () => {
      m.members = school(250);
      orgPage("/admin/analytics?tab=people");
      await screen.findByRole("tabpanel", { name: "People" });
      expect(dataRows()).toBe(100);
      expect(screen.getByText("Showing 100 of 250")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Show 100 more" }));
      expect(dataRows()).toBe(200);
      fireEvent.click(screen.getByRole("button", { name: "Show 100 more" }));
      expect(dataRows()).toBe(250);
      expect(screen.queryByRole("button", { name: "Show 100 more" })).toBeNull();
    });

    it("counts each person's secure items only for the rows on screen, once per list and framework", async () => {
      m.members = school(250);
      orgPage("/admin/analytics?tab=people");
      await screen.findByRole("tabpanel", { name: "People" });
      const who = () => new Set(m.evidence);
      expect(who().size).toBe(100); // not the 251 members
      const calls = m.evidence.length;
      fireEvent.click(screen.getByRole("button", { name: "Show 100 more" }));
      expect(who().size).toBe(200);
      const more = m.evidence.length;
      expect(more).toBeGreaterThan(calls);
      // A search, then clearing it: the rows shown were counted already.
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Student 00" } });
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
      expect(m.evidence.length).toBe(more);
    });

    it("starts from the top again after a search, and finds someone past the first 100", async () => {
      m.members = school(250);
      orgPage("/admin/analytics?tab=people");
      const box = await screen.findByRole("searchbox");
      expect(screen.queryByText("Student 240")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Show 100 more" }));
      fireEvent.change(box, { target: { value: "Student 24" } });
      expect(dataRows()).toBe(10); // 240 to 249
      expect(screen.getByText("Student 240")).toBeTruthy();
      fireEvent.change(box, { target: { value: "" } });
      expect(dataRows()).toBe(100);
    });

    it("still exports every person, not only the rows on screen", async () => {
      m.members = school(250);
      orgPage("/admin/analytics?tab=people");
      fireEvent.click(await screen.findByRole("button", { name: "Export to Excel" }));
      await waitFor(() => expect(m.saved).toHaveLength(1));
      const wb = await read(m.saved[0].blob);
      expect(wb.worksheets[1].rowCount).toBe(251); // the header and 250 students
      // The teacher's name comes from the one look-up table.
      const head = wb.worksheets[1].getRow(1).values as unknown[];
      expect(wb.worksheets[1].getRow(2).getCell(head.indexOf("Teacher")).value).toBe("Hoda Salem");
    });
  });

  describe("when something fails", () => {
    const denied = () => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });

    it("an export that fails is announced in the admin's language, and can be tried again", async () => {
      m.failSave = true;
      orgPage();
      const go = await screen.findByRole("button", { name: "Export to Excel" });
      fireEvent.click(go);
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toMatch(/^The Excel file could not be made\. Something went wrong and this didn't go through\. Try again\./);
      expect(alert.textContent).not.toMatch(/The download was blocked/); // never a raw error's own words
      await waitFor(() => expect(go.getAttribute("aria-busy")).toBeNull());
      m.failSave = false;
      fireEvent.click(go);
      await waitFor(() => expect(m.saved).toHaveLength(1));
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("shows Export as busy while the file is made", async () => {
      orgPage();
      const go = await screen.findByRole("button", { name: "Export to Excel" });
      fireEvent.click(go);
      expect(go.getAttribute("aria-busy")).toBe("true");
      await waitFor(() => expect(m.saved).toHaveLength(1));
      await waitFor(() => expect(go.getAttribute("aria-busy")).toBeNull());
    });

    it("members that could not be read: the app bar and Back stay, with the reason and Retry", () => {
      m.members = undefined; m.membersErr = denied();
      orgPage();
      expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Learning report"); // the page's title, in its app bar: the report's name alone
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/Your account isn't allowed to do this/);
      expect(alert.textContent).not.toMatch(/insufficient permissions/);
      fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
      expect(m.reload).toHaveBeenCalled();
      expect(screen.queryByRole("tablist")).toBeNull();
    });

    it("a refresh that failed keeps the report on screen, and says it may be out of date", async () => {
      m.membersErr = denied(); // with the members an earlier read brought
      orgPage();
      await screen.findByRole("heading", { name: "Who needs attention" });
      expect(screen.getByRole("alert").textContent).toMatch(/This couldn't be refreshed.*Your account isn't allowed to do this/);
      expect(screen.getByRole("tablist")).toBeTruthy();
    });
  });

  it("the tabs give way to \"nobody\" when the filters leave no one", async () => {
    orgPage();
    await screen.findByRole("tablist");
    fireEvent.click(screen.getByRole("button", { name: "Teachers" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Group" }), { target: { value: "5A" } });
    expect(screen.getByText("No one matches these filters yet.")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});
