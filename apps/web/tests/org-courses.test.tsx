// Course visibility in organizations (TECHNICAL.md): what a member's phone keeps (state/orgBrand.ts brandUpdate), what
// they then see on Home and in onboarding (content/mine.ts), and the admin's Courses panel saving the right shape.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { Org, Profile, Role } from "../src/auth/types";
import type { CatalogEntry } from "../src/content/types";
import { I18nProvider } from "../src/i18n";

const h = vi.hoisted(() => ({
  stored: null as unknown, role: "learner" as string, orgId: null as string | null,
  units: [] as unknown[], placement: { version: 2, questions: [] as unknown[] },
  save: vi.fn(async (r: { courses: unknown }) => ({ courses: r.courses })),
}));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => h.stored, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ role: h.role, orgId: h.orgId, user: h.orgId ? { uid: "me" } : null, configured: false }) }));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: vi.fn(), firebaseReady: true, call: vi.fn(), storageJSON: vi.fn(async () => null) }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: { setOrgCourses: (r: { courses: unknown }) => h.save(r) } }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null, forgetSettings: () => {},
  loadCatalog: async () => ({ version: 1, units: h.units }),
  loadPlacement: async () => h.placement,
  loadUnit: async (id: string) => ({ id, track: id.split("-")[0], level: 1, title: { en: `Course ${id}` }, summary: { en: "S" },
    lessons: [{ id: `${id}-1`, title: { en: "First lesson" }, minutes: 5, steps: [], tryTomorrow: { en: "T" }, slides: [], kit: [] }] }),
}));

const { brandUpdate } = await import("../src/state/orgBrand");
const { useMine } = await import("../src/content/mine");
const { SettingsProvider } = await import("../src/content/settings");
const { StoreProvider, initialState } = await import("../src/state/store");
const { Home } = await import("../src/screens/Home");
const { Onboarding } = await import("../src/screens/Onboarding");
const { OrgCoursesPanel } = await import("../src/admin/OrgCourses");

const entry = (id: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({ id, track: id.split("-")[0], level: 1, title: { en: `Course ${id}` }, summary: { en: "S" },
  lessons: 1, sizeMB: 1, available: true, src: `content/units/${id}/v1.json`, version: 1, owner: "public", ...extra });
const seed = (patch: object) => { h.stored = { ...initialState, onboarded: true, lang: "en", ...patch }; };
const org = (courses?: string[]) => ({ org: { id: "o1", name: "Nile School", v: 0, ...(courses ? { courses } : {}) } });
let mine: ReturnType<typeof useMine> | null = null;
function Probe() { mine = useMine(); return null; }
const show = (ui: ReactNode, path = "/learn") => render(<I18nProvider lang="en"><SettingsProvider lang="en"><StoreProvider><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></StoreProvider></SettingsProvider></I18nProvider>);

beforeEach(() => {
  h.role = "learner"; h.orgId = null; mine = null; h.save.mockClear();
  h.units = [entry("ai-t"), entry("cyber-t"), entry("iot-t"), entry("ai-s", { audience: "students" }), entry("cyber-s", { audience: "students", level: 2 })];
});

describe("what a member's phone keeps (brandUpdate)", () => {
  const courses = { mode: "chosen", teachers: ["ai-t"], students: ["ai-s"], groups: { "7A": ["cyber-s"] } };
  it("the courses for their role and their class, worked out when the org document is read", () => {
    expect(brandUpdate("o1", { name: "Nile School", courses }, undefined, { role: "student", group: "7A" }))
      .toEqual({ brand: { id: "o1", name: "Nile School", v: 0, courses: ["ai-s", "cyber-s"] }, fetchLogo: null });
    // A teacher in a class gets the class's list too; the phone still shows them only courses for teachers (isMine).
    expect(brandUpdate("o1", { name: "Nile School", courses }, undefined, { role: "teacher", group: "7A" })?.brand.courses).toEqual(["ai-t", "cyber-s"]);
    expect(brandUpdate("o1", { name: "Nile School", courses }, undefined, { role: "teacher", group: null })?.brand.courses).toEqual(["ai-t"]);
    // Admins, an organization that hasn't chosen, and a damaged field: every course (no list kept).
    expect(brandUpdate("o1", { name: "Nile School", courses }, undefined, { role: "orgAdmin" })?.brand).not.toHaveProperty("courses");
    expect(brandUpdate("o1", { name: "Nile School", courses: { mode: "all" } }, undefined, { role: "student" })?.brand).not.toHaveProperty("courses");
    expect(brandUpdate("o1", { name: "Nile School", courses: { mode: "chosen", students: "all" } }, undefined, { role: "student" })?.brand).not.toHaveProperty("courses");
  });
  it("nothing to do when nothing changed; a narrowed list keeps the logo already downloaded", () => {
    const have = { id: "o1", name: "Nile School", v: 2, logo: "data:image/webp;base64,AA", courses: ["ai-s", "cyber-s"] };
    const doc = { name: "Nile School", brand: { logo: "orgs/o1/brand/logo-abc123.webp", v: 2 }, courses };
    expect(brandUpdate("o1", doc, have, { role: "student", group: "7A" })).toBeNull();
    expect(brandUpdate("o1", doc, have, { role: "student", group: "7B" })).toEqual({ brand: { ...have, courses: ["ai-s"] }, fetchLogo: null });
    expect(brandUpdate("o1", { ...doc, courses: { mode: "all" } }, have, { role: "student", group: "7A" })).toEqual({ brand: { id: "o1", name: "Nile School", v: 2, logo: have.logo }, fetchLogo: null });
  });
});

describe("what a member sees", () => {
  it("a teacher: only the courses chosen for them, in the tracks that have them (never a student's course)", async () => {
    h.role = "teacher";
    seed({ tracks: [], ...org(["cyber-t", "ai-s"]) });
    show(<><Probe /><Home /></>);
    await waitFor(() => expect(mine?.tracks.map((x) => x.id)).toEqual(["cyber"]));
    expect(mine!.chosenByOrg).toBe(true);
    expect(mine!.offered.map((x) => x.id)).toEqual(["cyber"]);
    expect(mine!.isMine(entry("cyber-t"))).toBe(true);
    expect(mine!.isMine(entry("ai-t"))).toBe(false);
    expect(mine!.isMine(entry("ai-s", { audience: "students" }))).toBe(false);
    expect(await screen.findByText("Course cyber-t")).toBeTruthy();
    expect(screen.queryByText("Course ai-t")).toBeNull();
  });

  it("a student: their own list, and a track chosen before the list arrived falls back to one with courses", async () => {
    h.role = "student";
    seed({ tracks: ["ai"], track: "ai", stage: "lower", ...org(["cyber-s"]) });
    show(<><Probe /><Home /></>);
    await waitFor(() => expect(mine?.tracks.map((x) => x.id)).toEqual(["cyber"]));
    expect(await screen.findByText("Course cyber-s")).toBeTruthy();
    expect(screen.queryByText("Course ai-s")).toBeNull();
  });

  it("an org admin sees every course, whatever is stored", async () => {
    h.role = "orgAdmin";
    seed({ tracks: [], audience: "teachers", ...org(["cyber-t"]) });
    show(<><Probe /><Home /></>);
    await waitFor(() => expect(mine).not.toBeNull());
    expect(mine!.chosenByOrg).toBe(false);
    expect(mine!.tracks.length).toBeGreaterThan(3);
    expect(mine!.isMine(entry("ai-t"))).toBe(true);
    expect(await screen.findByText("Course ai-t")).toBeTruthy();
  });

  it("someone without an organization's choice sees what they saw before", async () => {
    h.role = "teacher";
    seed({ tracks: [], ...org() });
    show(<Probe />);
    await waitFor(() => expect(mine).not.toBeNull());
    expect(mine!.chosenByOrg).toBe(false);
    expect(mine!.isMine(entry("ai-t"))).toBe(true);
  });

  it("with nothing chosen for them, Home says their organization chooses, not \"add a track\"", async () => {
    h.role = "student";
    seed({ tracks: [], stage: "lower", ...org([]) });
    show(<Home />);
    expect(await screen.findByText("Your organization hasn't chosen courses for you yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add or remove tracks" })).toBeNull();
  });
});

describe("onboarding with an organization's choice", () => {
  it("offers only the stages, tracks and levels that have courses the member may see", async () => {
    h.role = "student";
    h.units = [entry("ai-s1", { audience: "students" }), entry("iot-s1", { audience: "students" }), entry("cyber-s2", { audience: "students", level: 2 }), entry("cyber-s3", { audience: "students", level: 3 })];
    seed({ onboarded: false, tracks: [], ...org(["cyber-s2"]) });
    show(<Onboarding />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Where do you study?" })).toBeTruthy();
    // Only lower secondary has a course chosen for them (cyber-s2 is level 2).
    await waitFor(() => expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual([expect.stringMatching(/^Lower secondary/)]));
    fireEvent.click(screen.getByRole("radio", { name: /Lower secondary/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "What do you want to learn?" })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("checkbox").map((c) => c.textContent)).toEqual(["Cyber security"]));
    expect(screen.getByText(/Your organization chooses your courses/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cyber security" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the check" }));
    // No questions in this test's placement: it places them where their visible courses are, in Cyber security only.
    const result = await screen.findByRole("button", { name: "Start learning" });
    const page = result.closest("main")!;
    expect(within(page).getByText("Cyber security")).toBeTruthy();
    expect(within(page).queryByText("AI")).toBeNull();
    expect(page.textContent).toMatch(/Elementary/);
  });

  it("lets a member go on when nothing is chosen for them yet, and says why", async () => {
    h.role = "teacher";
    seed({ onboarded: false, tracks: [], teach: "lower", ...org([]) });
    show(<Onboarding />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("radio", { name: /Lower secondary/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/hasn't chosen courses for you yet/)).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("the admin's Courses panel", () => {
  const theOrg = (courses?: unknown): Org => ({ id: "o1", name: "Nile School", type: "school", status: "active", createdBy: "u1", ...(courses ? { courses } : {}) });
  const person = (uid: string, role: Role, group?: string): Profile => ({ uid, name: uid, email: `${uid}@users.darsi.app`, role, orgId: "o1", group: group ?? null });
  const members = [person("t1", "teacher"), person("s1", "student", "7A"), person("s2", "student", "7A"), person("s3", "student", "7B"), person("a1", "orgAdmin", "7A")];
  const units = () => [entry("ai-t"), entry("ai-u1", { level: 4, teach: "university" }), entry("ai-s", { audience: "students" }), entry("cyber-s", { audience: "students", level: 2 }),
    entry("uabcdefgh", { track: "cyber", audience: "students", owner: "o1", title: { en: "Our own course" } })];
  const panel = (courses?: unknown, wide = false) => {
    window.matchMedia = ((q: string) => ({ matches: wide && q.includes("900"), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    return render(<I18nProvider lang="en"><MemoryRouter initialEntries={["/admin/courses"]}><Routes>
      <Route path="/admin/courses" element={<><Link to="/admin">Back to the dashboard</Link><OrgCoursesPanel org={theOrg(courses)} members={members} /></>} />
      <Route path="/admin" element={<p>Dashboard</p>} />
    </Routes></MemoryRouter></I18nProvider>);
  };
  beforeEach(() => { h.role = "orgAdmin"; h.orgId = "o1"; h.units = units(); });
  afterEach(() => { delete (window as { matchMedia?: unknown }).matchMedia; });
  const save = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
  const box = (name: RegExp | string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

  it("on a phone: starts with every course ticked, then who first and a checklist, and saves the right shape", async () => {
    panel();
    expect((await screen.findByRole("radio", { name: /Everyone sees every course/ })).getAttribute("aria-checked")).toBe("true");
    expect(save().disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Choose which courses each group sees/ }));
    expect(screen.getByText(/Every course is ticked to start with/)).toBeTruthy();
    expect(screen.getByText("Changes not saved")).toBeTruthy();
    // Who: all teachers, all students and each class among the members, with how many people each covers.
    const who = screen.getAllByRole("button", { pressed: false }).concat(screen.getAllByRole("button", { pressed: true })).map((b) => b.textContent);
    expect(who).toEqual(expect.arrayContaining([expect.stringMatching(/^All teachersPeople: 1/), expect.stringMatching(/^All studentsPeople: 3/), expect.stringMatching(/^7APeople: 2/), expect.stringMatching(/^7BPeople: 1/)]));
    // All teachers (the first): only courses for teachers, all ticked.
    expect(box(/Course ai-t/).checked).toBe(true);
    expect(box(/Course ai-u1/).checked).toBe(true);
    expect(screen.queryByRole("checkbox", { name: /Course ai-s/ })).toBeNull();
    fireEvent.click(box(/Course ai-u1/));
    fireEvent.click(screen.getByRole("button", { name: /^All students/ }));
    expect(box(/Our own course/).checked).toBe(true);
    fireEvent.click(box(/Course cyber-s/));
    // A class of students: only courses for students, none ticked yet.
    fireEvent.click(screen.getByRole("button", { name: /^7A/ }));
    expect(box(/Course cyber-s/).checked).toBe(false);
    expect(screen.queryByRole("checkbox", { name: /Course ai-t/ })).toBeNull();
    fireEvent.click(box(/Course cyber-s/));
    fireEvent.click(save());
    await waitFor(() => expect(h.save).toHaveBeenCalledWith({ orgId: "o1", courses: { mode: "chosen", teachers: ["ai-t"], students: ["ai-s", "uabcdefgh"], groups: { "7A": ["cyber-s"] } } }));
    expect(await screen.findByText(/Saved\. People see the change the next time they open Darsi or sign in/)).toBeTruthy();
    expect(save().disabled).toBe(true);
  });

  it("on a wide screen: a grid with \"all in this track\", and a dash where a course isn't for that column", async () => {
    panel({ mode: "chosen", teachers: ["ai-t"], students: [], groups: {} }, true);
    expect((await screen.findByRole("radio", { name: /Choose which courses each group sees/ })).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("table")).toBeTruthy();
    expect(box("All teachers: Course ai-t").checked).toBe(true);
    expect(screen.queryByRole("checkbox", { name: "All teachers: Course ai-s" })).toBeNull();
    expect(screen.getAllByText("Not for this group").length).toBeGreaterThan(0);
    // Every course for students in Cyber security, for all students: cyber-s and the organization's own course.
    fireEvent.click(box("All in this track (Cyber security): All students"));
    fireEvent.click(box("7B: Course ai-s"));
    fireEvent.click(box("All teachers: Course ai-t"));
    fireEvent.click(save());
    await waitFor(() => expect(h.save).toHaveBeenCalledWith({ orgId: "o1", courses: { mode: "chosen", teachers: [], students: ["cyber-s", "uabcdefgh"], groups: { "7B": ["ai-s"] } } }));
  });

  it("goes back to every course, and keeps a class a saved choice names even when no one is in it now", async () => {
    panel({ mode: "chosen", teachers: ["ai-t"], students: ["ai-s"], groups: { "8C": ["cyber-s"] } }, true);
    expect(await screen.findByText("8C")).toBeTruthy();
    expect(screen.getByText("No one in this class now")).toBeTruthy();
    expect(box("8C: Course cyber-s").checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Everyone sees every course/ }));
    fireEvent.click(save());
    await waitFor(() => expect(h.save).toHaveBeenCalledWith({ orgId: "o1", courses: { mode: "all" } }));
  });

  it("asks on the page before leaving with changes, and shows a refusal in the admin's words", async () => {
    panel({ mode: "chosen", teachers: ["ai-t"], students: [], groups: {} });
    fireEvent.click(await screen.findByRole("checkbox", { name: /Course ai-t/ }));
    fireEvent.click(screen.getByRole("link", { name: "Back to the dashboard" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Leave without saving\? Your changes will be lost/);
    expect(screen.queryByText("Dashboard")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.queryByRole("alert")).toBeNull();
    h.save.mockRejectedValueOnce(Object.assign(new Error("At most 2000"), { details: { reason: "courses-total" } }));
    fireEvent.click(save());
    expect(await screen.findByText(/Too many choices: at most 2,000 in all/)).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Back to the dashboard" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Leave without saving" })); });
    expect(await screen.findByText("Dashboard")).toBeTruthy();
  });
});
