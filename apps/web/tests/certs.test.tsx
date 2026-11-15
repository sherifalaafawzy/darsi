// Certificates (recorded when earned; a capstone's needs every milestone sent), a learner's own project reviews (Me, the
// project step), the order of a learner's courses and how Home loads them.
import { act, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { CatalogEntry, ProjectStep, Unit } from "../src/content/types";
import { I18nProvider } from "../src/i18n";

// Whole screens with their settings, catalog and course loads: under a full parallel run, a second is sometimes short.
configure({ asyncUtilTimeout: 5000 });

const h = vi.hoisted(() => {
  const lesson = (id: string, steps: unknown[] = []) => ({ id, title: { en: `Lesson ${id}` }, minutes: 5, steps, tryTomorrow: { en: "T" }, slides: [], kit: [] });
  const mk = (id: string, n = 1, extra: object = {}) => ({ id, track: id.split("-")[0], level: 1, title: { en: `Course ${id}` }, summary: { en: "S" },
    lessons: Array.from({ length: n }, (_, i) => lesson(`${id}-${i + 1}`)), ...extra });
  return {
    stored: null as unknown,
    auth: { role: "learner", user: null as null | { uid: string }, profile: null as null | { name: string }, configured: false, offlineUid: null, updateProfile: vi.fn(async (_: unknown) => {}) },
    units: [] as unknown[],
    bodies: {} as Record<string, unknown>,
    failing: new Set<string>(),
    loaded: [] as string[],
    docs: [] as { id: string; data: Record<string, unknown> }[],
    reads: [] as unknown[][],
    /** Firestore reads fail (offline, nothing cached). */
    readsFail: false,
    lesson, mk,
  };
});
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => h.stored, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => h.auth }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null, forgetSettings: () => {},
  loadCatalog: async () => ({ version: 1, units: h.units }),
  loadUnit: async (id: string) => { h.loaded.push(id); if (h.failing.has(id)) throw new Error(`${id}: offline`); return h.bodies[id] ?? h.mk(id); },
}));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({ db: {}, storage: () => ({}) }), call: () => async () => ({}) }));
// The learner's own submissions, read with one getDocs (state/myWork.ts): equality filters only, as the app sends them.
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  where: (field: string, op: string, value: unknown) => ({ where: [field, op, value] }),
  orderBy: (field: string, dir: string) => ({ orderBy: [field, dir] }),
  limit: (n: number) => ({ limit: n }),
  query: (col: unknown, ...c: unknown[]) => ({ col, c }),
  getDocs: async (q: { c: { where?: [string, string, unknown] }[] }) => {
    h.reads.push(q.c);
    if (h.readsFail) throw new Error("unavailable");
    const w = q.c.find((x) => x.where)?.where;
    const docs = h.docs.filter((d) => !w || d.data[w[0]] === w[2]);
    return { size: docs.length, metadata: { fromCache: false }, docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
  },
  addDoc: async () => ({ id: "new" }), serverTimestamp: () => "now",
}));

const { certCandidates, certCode, earnedCert, legacyCertCode, milestonesSent } = await import("../src/content/cert");
const { forgetMyWork, latestPerStep, toMySubmission } = await import("../src/state/myWork");
const { SettingsProvider } = await import("../src/content/settings");
const { StoreProvider, initialState, useStore } = await import("../src/state/store");
const { Home, startAt } = await import("../src/screens/Home");
const { Me } = await import("../src/screens/Me");
const { LessonScreen } = await import("../src/screens/LessonScreen");
const { ProjectView } = await import("../src/lesson/ProjectView");

const entry = (id: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({ id, track: id.split("-")[0], level: 1, title: { en: `Course ${id}` }, summary: { en: "S" },
  lessons: 1, sizeMB: 1, available: true, src: `content/units/${id}/v1.json`, version: 1, owner: "public", ...extra });
const done = (unitId: string, lessonIds: string[], at = "2026-11-01T10:00:00.000Z") =>
  Object.fromEntries(lessonIds.map((id) => [id, { done: true, accuracy: 1, xp: 30, seconds: 60, completedAt: at, unitId }]));
const milestone = (id: string): ProjectStep => ({ id, type: "project", prompt: { en: `Milestone ${id}` }, task: { en: "Build it" }, deliverable: { en: "A repo" },
  rubric: [{ criterion: { en: "Works" } }], evidence: [{ kind: "repo" }] });
/** A capstone: a reading, then a lesson of two milestones (each can be passed with "submit later"). */
const capstone = (id = "ai-capstone") => ({ ...h.mk(id, 0), kind: "capstone", level: 3, audience: "students", lessons: [
  h.lesson(`${id}-description`, [{ id: "brief", type: "read", prompt: { en: "Read" }, title: { en: "Brief" }, body: { en: "B" } }]),
  h.lesson(`${id}-submission`, [milestone("project-m1"), milestone("project-m2")]),
] }) as unknown as Unit;
const sentDoc = (stepId: string, at: string, extra: object = {}) => ({ id: `${stepId}-${at}`, data: { unitId: "ai-capstone", lessonId: "ai-capstone-submission", stepId, status: "submitted", capstone: true, createdAt: at, ...extra } });

const seed = (patch: object) => { h.stored = { ...initialState, onboarded: true, lang: "en", tracks: ["ai"], ...patch }; };
let state = initialState;
function Probe() { state = useStore().state; return null; }
function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search + l.hash}</output>; }
const where = () => screen.getByTestId("where").textContent;
const show = (ui: ReactNode, url = "/me") => render(<I18nProvider lang="en"><SettingsProvider lang="en"><StoreProvider>
  <MemoryRouter initialEntries={[url]}><Routes><Route path="*" element={<>{ui}<Probe /><Where /></>} /></Routes></MemoryRouter>
</StoreProvider></SettingsProvider></I18nProvider>);
const headings = () => screen.getAllByRole("heading", { level: 2 }).map((x) => x.textContent).filter((x) => x?.startsWith("Course "));

beforeEach(() => {
  h.auth = { role: "learner", user: null, profile: null, configured: false, offlineUid: null, updateProfile: vi.fn(async (_: unknown) => {}) };
  h.units = []; h.bodies = {}; h.failing = new Set(); h.loaded = []; h.docs = []; h.reads = []; h.readsFail = false;
  state = initialState;
  forgetMyWork();
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  vi.unstubAllGlobals();
});

describe("when a certificate is earned", () => {
  it("finds finished courses from the catalog's lesson counts, without opening any", () => {
    const units = [entry("ai-a", { lessons: 2 }), entry("ai-b", { lessons: 2 }), entry("ai-c", { available: false }), entry("ai-1")];
    const progress = { ...done("ai-a", ["ai-a-1", "ai-a-2"]), ...done("ai-b", ["ai-b-1"]), ...done("ai-c", ["ai-c-1"]), "ai-1-1": { completedAt: "2026-10-01T00:00:00Z" } };
    expect(certCandidates(units, progress).map((u) => u.id)).toEqual(["ai-a", "ai-1"]); // ai-1-1 has no unitId: counted by its id
  });

  it("dates a course's certificate when its last lesson was finished", () => {
    const u = h.mk("ai-a", 2) as unknown as Unit;
    expect(earnedCert(u, done("ai-a", ["ai-a-1"]))).toBeNull();
    const p = { ...done("ai-a", ["ai-a-1"], "2026-11-01T10:00:00.000Z"), ...done("ai-a", ["ai-a-2"], "2026-11-03T10:00:00.000Z") };
    expect(earnedCert(u, p)).toEqual({ title: u.title, track: "ai", at: "2026-11-03T10:00:00.000Z" });
  });

  it("gives a capstone's certificate only when every milestone has been sent", () => {
    const u = capstone();
    const p = done("ai-capstone", ["ai-capstone-description", "ai-capstone-submission"]);
    expect(earnedCert(u, p)).toBeNull(); // a guest can't send: never
    expect(earnedCert(u, p, [])).toBeNull(); // every milestone passed with "I'll do it in class and submit later"
    const m1 = sentDoc("project-m1", "2026-11-02T09:00:00.000Z").data, m2 = sentDoc("project-m2", "2026-11-03T09:00:00.000Z").data;
    expect(earnedCert(u, p, [m1])).toBeNull();
    expect(milestonesSent(u, [m1])).toMatchObject({ sent: 1, of: 2 });
    // Sent again later, or asked to revise: it was sent. The date is when the last milestone was first sent.
    const again = { ...m1, createdAt: "2026-11-04T09:00:00.000Z", status: "revise" };
    expect(earnedCert(u, p, [again, m2, m1])).toEqual({ title: u.title, track: "ai", at: "2026-11-03T09:00:00.000Z" });
    expect(earnedCert(u, p, [{ ...m2, unitId: "iot-capstone" }, m1])).toBeNull(); // another course's milestone doesn't count
    // A capstone written without milestones (no evidence steps) has nothing to send: its lessons are enough.
    const plain = { ...u, lessons: [u.lessons[0]] } as Unit;
    expect(earnedCert(plain, p)).toEqual({ title: u.title, track: "ai", at: p["ai-capstone-description"].completedAt });
  });

  it("keeps the first record of a certificate", async () => {
    seed({});
    function Twice() {
      const { dispatch } = useStore();
      return <button onClick={() => { dispatch({ type: "earnCert", id: "ai-a", cert: { title: { en: "A" }, track: "ai", at: "2026-11-01T00:00:00Z" } }); dispatch({ type: "earnCert", id: "ai-a", cert: { title: { en: "A" }, track: "ai", at: "2026-12-01T00:00:00Z" } }); }}>earn</button>;
    }
    show(<Twice />);
    fireEvent.click(await screen.findByRole("button", { name: "earn" }));
    await waitFor(() => expect(state.certs?.["ai-a"]?.at).toBe("2026-11-01T00:00:00Z"));
  });
});

describe("Me's certificates", () => {
  it("opens only the courses whose lessons are all finished, and one that fails to load hides no other certificate", async () => {
    h.units = [entry("ai-a", { lessons: 2 }), entry("ai-b"), entry("ai-c"), entry("ai-d"), entry("ai-e")];
    h.bodies["ai-a"] = h.mk("ai-a", 2);
    h.failing.add("ai-c");
    seed({ name: "Amina", progress: { ...done("ai-a", ["ai-a-1", "ai-a-2"]), ...done("ai-b", ["ai-b-1"]), ...done("ai-c", ["ai-c-1"]) } });
    show(<Me />);
    expect(await screen.findByText("Course ai-a")).toBeTruthy();
    expect(await screen.findByText("Course ai-b")).toBeTruthy();
    expect([...new Set(h.loaded)].sort()).toEqual(["ai-a", "ai-b", "ai-c"]); // never the courses not finished
    await waitFor(() => expect(Object.keys(state.certs ?? {}).sort()).toEqual(["ai-a", "ai-b"]));
  });

  it("keeps a certificate whose course was unpublished, and a replay changes neither its date nor its code", async () => {
    const at = "2026-10-01T10:00:00.000Z";
    seed({ name: "Amina", certs: { "ai-old": { title: { en: "A retired course" }, track: "ai", at } }, progress: done("ai-old", ["ai-old-1"], "2026-11-05T10:00:00.000Z") });
    show(<Me />);
    expect(await screen.findByText("A retired course")).toBeTruthy();
    expect(screen.getByText(certCode("ai-old", at))).toBeTruthy();
    expect(screen.queryByText("Finish a unit to earn your first certificate.")).toBeNull();
  });

  it("keeps a certificate's code when the learner renames themselves, the codes already shown included", async () => {
    const at = "2026-10-01T10:00:00.000Z";
    // Saved before codes were kept (no certCodes): the code it showed then, from the name, is frozen at this load.
    const { certCodes: _, ...before } = initialState;
    h.stored = { ...before, onboarded: true, lang: "en", tracks: ["ai"], name: "Mona Hassan", certs: { "ai-old": { title: { en: "A course from before" }, track: "ai", at } } };
    const old = legacyCertCode("ai-old", "Mona Hassan", at);
    show(<Me />);
    expect(await screen.findByText(old)).toBeTruthy();
    await waitFor(() => expect(state.certs?.["ai-old"].code).toBe(old));
    fireEvent.change(screen.getByLabelText("Your name (for certificates)"), { target: { value: "Mona Hassana" } });
    expect(state.name).toBe("Mona Hassana");
    expect(screen.getByText(old)).toBeTruthy(); // it was DRS-AI-OLD-B…, and became C… with the extra letter
    expect(legacyCertCode("ai-old", "Mona Hassana", at)).not.toBe(old);
  });

  it("gives a certificate earned signed in a code from the course, the time and the account, which nothing else moves", () => {
    const at = "2026-11-04T08:00:00.000Z";
    const code = certCode("ai-4-1", at, "uid-amina");
    expect(code).toMatch(/^DRS-AI-4-1-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(certCode("ai-4-1", at, "uid-amina")).toBe(code); // the same on every device
    expect(certCode("ai-4-1", "2026-11-04T08:00:00Z", "uid-amina")).toBe(code); // the same moment, written another way
    expect(certCode("ai-4-1", at, "uid-other")).not.toBe(code); // another account
    expect(certCode("ai-4-1", "2026-11-04T08:00:01.000Z", "uid-amina")).not.toBe(code); // another moment
    expect(certCode("ai-4-2", at, "uid-amina")).not.toBe(code.replace("AI-4-1", "AI-4-2")); // not just the course swapped in
  });

  it("gives a guest no capstone certificate for lessons passed with \"submit later\", and says what is missing", async () => {
    h.units = [entry("ai-capstone", { lessons: 2, kind: "capstone", level: 3, audience: "students" })];
    h.bodies["ai-capstone"] = capstone();
    seed({ audience: "students", progress: done("ai-capstone", ["ai-capstone-description", "ai-capstone-submission"]) });
    show(<Me />);
    expect(await screen.findByText("Send every milestone for review to finish this capstone and earn its certificate.")).toBeTruthy();
    expect(screen.getByText(/To send your work for review, sign in/)).toBeTruthy();
    expect(screen.getByText("Finish a unit to earn your first certificate.")).toBeTruthy();
    expect(screen.queryByText("Certificate of completion")).toBeNull();
    expect(state.certs).toBeUndefined();
    expect(h.reads).toEqual([]); // a guest's phone never reads Firestore
  });

  it("counts a signed-in learner's sent milestones, and gives the certificate once all are sent", async () => {
    h.auth.user = { uid: "s1" };
    h.units = [entry("ai-capstone", { lessons: 2, kind: "capstone", level: 3, audience: "students" })];
    h.bodies["ai-capstone"] = capstone();
    h.docs = [sentDoc("project-m1", "2026-11-02T09:00:00.000Z")];
    seed({ audience: "students", progress: done("ai-capstone", ["ai-capstone-description", "ai-capstone-submission"]) });
    const view = show(<Me />);
    expect(await screen.findByText("Milestones sent: 1 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send my milestones" }));
    expect(where()).toBe("/lesson/ai-capstone/ai-capstone-submission?step=project-m2");
    view.unmount();
    forgetMyWork();
    h.docs.push(sentDoc("project-m2", "2026-11-03T09:00:00.000Z"));
    show(<Me />);
    expect(await screen.findByText("Certificate of completion")).toBeTruthy();
    await waitFor(() => expect(state.certs?.["ai-capstone"]?.at).toBe("2026-11-03T09:00:00.000Z"));
    expect(screen.queryByText(/Send every milestone/)).toBeNull();
  });
});

describe("a learner's own project reviews", () => {
  it("lists each project's newest version in Me, with its status and the reviewer's feedback, and opens it to send again", async () => {
    h.auth.user = { uid: "s1" };
    h.units = [entry("ai-a", { lessons: 2 })];
    h.bodies["ai-a"] = h.mk("ai-a", 2);
    h.docs = [
      { id: "new", data: { unitId: "ai-a", lessonId: "ai-a-1", stepId: "project", status: "revise", feedback: "Add the photo of your chart.", createdAt: { seconds: 1762300000 } } },
      { id: "old", data: { unitId: "ai-a", lessonId: "ai-a-1", stepId: "project", status: "submitted", createdAt: { seconds: 1762000000 } } },
      { id: "ok", data: { unitId: "ai-a", lessonId: "ai-a-2", stepId: "project", status: "approved", feedback: "Well done.", createdAt: { seconds: 1762100000 } } },
    ];
    seed({});
    show(<Me />);
    expect(await screen.findByRole("heading", { name: "My projects" })).toBeTruthy();
    expect(await screen.findByText("Add the photo of your chart.")).toBeTruthy();
    expect(screen.getByText("Well done.")).toBeTruthy();
    expect(screen.getByText("Needs revision")).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
    expect(screen.queryByText("Waiting for review")).toBeNull(); // only the newest version of each project
    expect(await screen.findByText("Lesson ai-a-1")).toBeTruthy(); // its lesson's title
    expect(h.reads).toHaveLength(1); // one read, no listener
    fireEvent.click(screen.getByRole("button", { name: "Send a new version" }));
    expect(where()).toBe("/lesson/ai-a/ai-a-1?step=project");
  });

  it("says where projects will show when there are none yet, and shows guests nothing", async () => {
    h.auth.user = { uid: "s1" };
    seed({});
    const view = show(<Me />);
    expect(await screen.findByText("Projects you send for review show here, with the feedback on them.")).toBeTruthy();
    view.unmount();
    h.auth.user = null;
    show(<Me />);
    await screen.findByRole("heading", { name: "Certificates" });
    expect(screen.queryByRole("heading", { name: "My projects" })).toBeNull();
  });

  it("shows the latest review on the project step itself", async () => {
    h.auth.user = { uid: "s1" };
    h.docs = [
      { id: "a", data: { unitId: "ai-a", lessonId: "ai-a-1", stepId: "project", status: "submitted", createdAt: "2026-11-01T10:00:00.000Z" } },
      { id: "b", data: { unitId: "ai-a", lessonId: "ai-a-1", stepId: "project", status: "revise", feedback: "Two sentences about the neighbours' vote, please.", createdAt: "2026-11-02T10:00:00.000Z" } },
    ];
    const step = { ...milestone("project"), evidence: undefined } as ProjectStep;
    render(<I18nProvider lang="en"><ProjectView step={step} lessonId="ai-a-1" unitId="ai-a" onReady={() => {}} /></I18nProvider>);
    expect(await screen.findByText("Two sentences about the neighbours' vote, please.")).toBeTruthy();
    expect(screen.getByText("Needs revision")).toBeTruthy();
    expect(screen.getByText("Make the changes below, then send it again.")).toBeTruthy();
    expect(h.reads[0]).toEqual([{ where: ["lessonId", "==", "ai-a-1"] }]);
  });

  it("reopens a lesson the learner finished at the step a link names, and records nothing again", async () => {
    h.bodies["u1"] = { ...h.mk("u1", 0), lessons: [h.lesson("l1", [
      { id: "s1", type: "read", prompt: { en: "Read this" }, title: { en: "Reading one" }, body: { en: "Body one" } },
      { id: "s2", type: "reflect", prompt: { en: "Think about it" } },
    ])] };
    const before = done("u1", ["l1"], "2026-11-01T10:00:00.000Z");
    seed({ progress: before });
    const view = render(<I18nProvider lang="en"><SettingsProvider lang="en"><StoreProvider><MemoryRouter initialEntries={["/lesson/u1/l1?step=s2"]}>
      <Routes><Route path="/lesson/:unitId/:lessonId" element={<><LessonScreen /><Probe /></>} /></Routes></MemoryRouter></StoreProvider></SettingsProvider></I18nProvider>);
    expect(await screen.findByText("Think about it")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Lesson done!")).toBeTruthy();
    expect(state.progress.l1.completedAt).toBe(before.l1.completedAt);
    view.unmount();
    seed({}); // not finished: the link's step is ignored
    render(<I18nProvider lang="en"><SettingsProvider lang="en"><StoreProvider><MemoryRouter initialEntries={["/lesson/u1/l1?step=s2"]}>
      <Routes><Route path="/lesson/:unitId/:lessonId" element={<LessonScreen />} /></Routes></MemoryRouter></StoreProvider></SettingsProvider></I18nProvider>);
    expect(await screen.findByText("Reading one")).toBeTruthy();
  });

  it("reads a submission whatever shape its time has, and keeps the newest of each step", () => {
    const a = toMySubmission("a", { lessonId: "l1", stepId: "project", status: "approved", createdAt: { seconds: 1762000000 } })!;
    const b = toMySubmission("b", { lessonId: "l1", stepId: "project", status: "odd", createdAt: null })!;
    expect(a.createdAt).toBe(new Date(1762000000 * 1000).toISOString());
    expect(b.status).toBe("submitted");
    expect(toMySubmission("c", { stepId: "x" })).toBeNull();
    expect(latestPerStep([a, b]).map((s) => s.id)).toEqual(["b"]); // not stamped yet: just sent
  });
});

describe("the name on certificates", () => {
  it("is the account's name when signed in, and what is typed is saved to the account", async () => {
    h.auth.user = { uid: "s1" };
    h.auth.profile = { name: "Amina Okafor" };
    seed({ name: "Dr. Amina" });
    show(<Me />);
    await waitFor(() => expect(state.name).toBe("Amina Okafor"));
    fireEvent.change(screen.getByLabelText("Your name (for certificates)"), { target: { value: "Dr. Amina Okafor" } });
    expect(state.name).toBe("Dr. Amina Okafor");
    await waitFor(() => expect(h.auth.updateProfile).toHaveBeenCalledWith({ name: "Dr. Amina Okafor" }), { timeout: 3000 });
    expect(h.auth.updateProfile).toHaveBeenCalledTimes(1);
  });

  it("keeps a name typed here when Me opens again, though the profile read at sign-in still has the old one", async () => {
    h.auth.user = { uid: "s2" };
    h.auth.profile = { name: "Kwame" };
    seed({ name: "Kwame" });
    const first = show(<Me />);
    fireEvent.change(await screen.findByLabelText("Your name (for certificates)"), { target: { value: "Kwame Asante" } });
    first.unmount(); // leaving Me saves at once
    expect(h.auth.updateProfile).toHaveBeenCalledWith({ name: "Kwame Asante" });
    seed({ name: "Kwame Asante" }); // the phone's copy; AuthProvider's profile is still the one read at sign-in
    const again = show(<Me />);
    await screen.findByLabelText("Your name (for certificates)");
    await new Promise((r) => setTimeout(r, 20));
    expect(state.name).toBe("Kwame Asante");
    again.unmount();
    seed({ name: "" }); // emptied: the account's name comes back
    show(<Me />);
    await waitFor(() => expect(state.name).toBe("Kwame Asante"));
  });

  it("stays on the phone for guests", async () => {
    seed({ name: "Kofi" });
    show(<Me />);
    fireEvent.change(await screen.findByLabelText("Your name (for certificates)"), { target: { value: "Kofi Mensah" } });
    await new Promise((r) => setTimeout(r, 900));
    expect(h.auth.updateProfile).not.toHaveBeenCalled();
    expect(state.name).toBe("Kofi Mensah");
  });
});

describe("Home", () => {
  it("lists courses in the order they are taken, whatever order the catalog has", async () => {
    h.units = ["ai-u4", "ai-u1", "ai-u2", "ai-u3"].map((id) => entry(id, { level: 4, teach: "university" })).concat(entry("ai-4-1", { level: 4 }));
    seed({ audience: "teachers", teach: "university" });
    const view = show(<Home />, "/learn");
    await waitFor(() => expect(headings()).toEqual(["Course ai-u1", "Course ai-u2", "Course ai-u3", "Course ai-u4"]));
    view.unmount();
    h.units = ["ai-s4", "ai-d3", "ai-d1", "ai-d2"].map((id) => entry(id, { level: 4, audience: "students" }));
    seed({ audience: "students", stage: "university" });
    show(<Home />, "/learn");
    await waitFor(() => expect(headings()).toEqual(["Course ai-d1", "Course ai-d2", "Course ai-d3", "Course ai-s4"]));
    // A track's capstone comes after the other courses of its level.
    const r = startAt([entry("ai-capstone", { level: 3, kind: "capstone" }), entry("ai-s3", { level: 3 }), entry("ai-s10", { level: 3 }), entry("ai-s9", { level: 3 })], 3);
    expect(r.current.map((u) => u.id)).toEqual(["ai-s3", "ai-s9", "ai-s10", "ai-capstone"]);
  });

  it("says when a course isn't on the phone, with Retry, and loads it once the connection is back", async () => {
    h.units = [entry("ai-t")];
    h.failing.add("ai-t");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    seed({ audience: "teachers" });
    show(<Home />, "/learn");
    expect(await screen.findByText(/This course isn’t on this phone yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    h.failing.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(await screen.findByRole("button", { name: "Start" })).toBeTruthy();
  });

  it("offers Retry when a course fails to load online", async () => {
    h.units = [entry("ai-t")];
    h.failing.add("ai-t");
    seed({ audience: "teachers" });
    show(<Home />, "/learn");
    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    h.failing.clear();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Start" })).toBeTruthy();
  });

  it("loads the first course at once, the others as they come near the screen, and folded ones when opened", async () => {
    const watched: { el: Element; see: () => void }[] = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(private cb: (xs: { isIntersecting: boolean }[]) => void) {}
      observe(el: Element) { watched.push({ el, see: () => this.cb([{ isIntersecting: true }]) }); }
      disconnect() {}
    });
    h.units = [entry("ai-1", { level: 1 }), entry("ai-2", { level: 2 }), entry("ai-3", { level: 3 })];
    seed({ audience: "teachers", levels: { ai: 2 } });
    show(<Home />, "/learn");
    expect(await screen.findByRole("button", { name: "Start" })).toBeTruthy();
    expect(h.loaded).toEqual(["ai-2"]);
    expect(screen.getByRole("heading", { name: "Course ai-3" })).toBeTruthy(); // its title and summary, from the catalog
    act(() => watched[0].see());
    await waitFor(() => expect(h.loaded).toEqual(["ai-2", "ai-3"]));
    expect(watched).toHaveLength(1); // the folded course isn't even on the page yet
    fireEvent.click(screen.getByText("Earlier levels (1)"));
    await waitFor(() => expect(watched).toHaveLength(2));
    act(() => watched[1].see());
    await waitFor(() => expect(h.loaded).toEqual(["ai-2", "ai-3", "ai-1"]));
  });

  it("doesn't count a capstone passed with \"submit later\" as finished: no certificate and no move up", async () => {
    h.units = [entry("ai-capstone", { lessons: 2, kind: "capstone", level: 3, audience: "students" })];
    h.bodies["ai-capstone"] = capstone();
    seed({ audience: "students", stage: "upper", progress: done("ai-capstone", ["ai-capstone-description", "ai-capstone-submission"]) });
    show(<Home />, "/learn");
    expect(await screen.findByText("Send every milestone for review to finish this capstone and earn its certificate.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Unit complete/ })).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(state.levels.ai).toBeUndefined();
    expect(state.certs).toBeUndefined();
  });

  it("finishes a capstone once every milestone is sent: its certificate, and the next level", async () => {
    h.auth.user = { uid: "s1" };
    h.units = [entry("ai-capstone", { lessons: 2, kind: "capstone", level: 3, audience: "students" })];
    h.bodies["ai-capstone"] = capstone();
    h.docs = [sentDoc("project-m1", "2026-11-02T09:00:00.000Z"), sentDoc("project-m2", "2026-11-03T09:00:00.000Z", { status: "approved" })];
    seed({ audience: "students", stage: "upper", progress: done("ai-capstone", ["ai-capstone-description", "ai-capstone-submission"]) });
    show(<Home />, "/learn");
    await waitFor(() => expect(state.certs?.["ai-capstone"]?.at).toBe("2026-11-03T09:00:00.000Z"));
    await waitFor(() => expect(state.levels.ai).toBe(4));
  });

  it("doesn't send a learner back to a milestone it can't tell was sent, and doesn't call a signed-in learner a guest", async () => {
    h.auth.user = { uid: "s1" };
    h.readsFail = true; // offline, nothing cached
    h.units = [entry("ai-capstone", { lessons: 2, kind: "capstone", level: 3, audience: "students" })];
    h.bodies["ai-capstone"] = capstone();
    seed({ audience: "students", stage: "upper", progress: done("ai-capstone", ["ai-capstone-description", "ai-capstone-submission"]) });
    const home = show(<Home />, "/learn");
    expect(await screen.findByText(/Send every milestone for review/)).toBeTruthy();
    await waitFor(() => expect(h.reads.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("button", { name: "Send my milestones" })).toBeNull();
    expect(screen.queryByText(/sign in or create an account/)).toBeNull();
    home.unmount();
    show(<Me />);
    expect(await screen.findByText(/Send every milestone for review/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send my milestones" })).toBeNull();
    expect(screen.queryByText(/sign in or create an account/)).toBeNull();
  });

  it("says a signed-in learner whose phone started offline isn't a guest", async () => {
    h.auth.offlineUid = "s1" as never;
    h.units = [entry("ai-capstone", { lessons: 2, kind: "capstone", level: 3, audience: "students" })];
    h.bodies["ai-capstone"] = capstone();
    seed({ audience: "students", stage: "upper", progress: done("ai-capstone", ["ai-capstone-description", "ai-capstone-submission"]) });
    show(<Home />, "/learn");
    expect(await screen.findByText(/Send every milestone for review/)).toBeTruthy();
    expect(screen.queryByText(/sign in or create an account/)).toBeNull();
    expect(h.reads).toEqual([]);
  });

  it("starts above the learner's level when nothing is at it, and moves them up from there", async () => {
    h.units = [entry("ai-s3", { level: 3, audience: "students" }), entry("ai-s4", { level: 4, audience: "students" })];
    seed({ audience: "students", stage: "upper", levels: { ai: 1 } });
    const view = show(<Home />, "/learn");
    expect(await screen.findByText("There’s no Beginner course for you in AI yet, so start here.")).toBeTruthy();
    expect(await screen.findByText("Start here: Intermediate · Upper secondary")).toBeTruthy(); // once its course has loaded; their own stage
    expect(screen.queryByText(/^Your level/)).toBeNull();
    view.unmount();
    state = initialState;
    seed({ audience: "students", stage: "upper", levels: { ai: 1 }, progress: done("ai-s3", ["ai-s3-1"]) });
    const after = show(<Home />, "/learn");
    await waitFor(() => expect(state.levels.ai).toBe(4));
    // Moved up past their own stage: the level alone, never a stage that isn't theirs.
    expect(await screen.findByText("Your level: Advanced")).toBeTruthy();
    expect(screen.queryByText(/so start here/)).toBeNull();
    after.unmount();
    // Only top-level courses: finishing one makes that the learner's level.
    state = initialState;
    h.units = [entry("ai-4-1", { level: 4 })];
    seed({ audience: "teachers", teach: "university", levels: { ai: 2 }, progress: done("ai-4-1", ["ai-4-1-1"]) });
    show(<Home />, "/learn");
    await waitFor(() => expect(state.levels.ai).toBe(4));
    expect(await screen.findByText("Your level: Advanced")).toBeTruthy();
  });

  it("loads the course that becomes first after a level-up, though it hasn't come into view", async () => {
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} }); // never reports anything in view
    h.units = [entry("ai-1", { level: 1 }), entry("ai-2", { level: 2 })];
    seed({ audience: "teachers", levels: { ai: 1 }, progress: done("ai-1", ["ai-1-1"]) });
    show(<Home />, "/learn");
    await waitFor(() => expect(state.levels.ai).toBe(2));
    expect(await screen.findByText("Your level: Elementary")).toBeTruthy();
    expect(h.loaded).toContain("ai-2");
  });

  it("names each step's state on the path, for screen readers", async () => {
    h.units = [entry("ai-t", { lessons: 2 })];
    h.bodies["ai-t"] = h.mk("ai-t", 2);
    seed({ audience: "teachers", progress: done("ai-t", ["ai-t-1"]) });
    show(<Home />, "/learn");
    expect(await screen.findByRole("button", { name: "Lesson ai-t-1 — Done" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lesson ai-t-2 — Up next" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Certificates — Not earned yet" })).toBeTruthy();
  });

  it("opens the kit at the finished course, as notes and slides for students", async () => {
    // At the top level, so finishing the course moves nobody up (and its block away) while the test clicks.
    h.units = [entry("ai-t", { level: 4 }), entry("ai-s", { level: 4, audience: "students" })];
    seed({ audience: "teachers", levels: { ai: 4 }, progress: done("ai-t", ["ai-t-1"]) });
    const view = show(<Home />, "/learn");
    fireEvent.click(await screen.findByRole("button", { name: "Unit complete — open your classroom kit" }));
    expect(where()).toBe("/kit#ai-t-1");
    view.unmount();
    seed({ audience: "students", levels: { ai: 4 }, progress: done("ai-s", ["ai-s-1"]) });
    show(<Home />, "/learn");
    fireEvent.click(await screen.findByRole("button", { name: "Unit complete — open your notes and slides" }));
    expect(where()).toBe("/kit#ai-s-1");
  });

  it("gives focus back to the track button when the track menu closes", async () => {
    h.units = [entry("ai-t"), entry("cyber-t")];
    seed({ audience: "teachers", tracks: ["ai", "cyber"] });
    show(<Home />, "/learn");
    const button = await screen.findByRole("button", { name: "AI: change track" });
    fireEvent.click(button);
    const pick = screen.getByRole("button", { name: "Cyber security" });
    fireEvent.keyDown(pick, { key: "Escape" });
    expect(screen.queryByRole("group", { name: /tracks/i })).toBeNull();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "Cyber security" }));
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("Cyber security: change track"));
  });

  it("records a course's certificate when its last lesson is done", async () => {
    h.units = [entry("ai-t")];
    seed({ audience: "teachers", progress: done("ai-t", ["ai-t-1"], "2026-11-04T08:00:00.000Z") });
    show(<Home />, "/learn");
    // With its code, set now (a guest's: no account in it), so a rename or a replay never changes it.
    await waitFor(() => expect(state.certs?.["ai-t"]).toEqual({ title: { en: "Course ai-t" }, track: "ai", at: "2026-11-04T08:00:00.000Z", code: certCode("ai-t", "2026-11-04T08:00:00.000Z") }));
  });
});
