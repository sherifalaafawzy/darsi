// "Share feedback": the round button's menu, the sheet (stars, topic, comment), what it sends, the offline queue,
// Home's question under a finished course, and the platform admins' page.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";

const m = vi.hoisted(() => ({
  user: null as null | { uid: string; email: string; getIdToken: () => Promise<string> },
  store: new Map<string, unknown>(),
  dispatch: vi.fn(),
  asked: {} as Record<string, number>,
  rows: [] as unknown[],
  summary: null as unknown,
  updated: [] as unknown[],
  reload: vi.fn(),
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: async () => ({}), functions: {}, firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: m.user, profile: m.user ? { name: "Amina Bello" } : null, role: m.user ? "superadmin" : "learner", orgId: null, plan: null, offlineUid: null }),
}));
vi.mock("../src/state/store", () => ({
  useStore: () => ({ state: { lang: "en", onboarded: true, tracks: ["ai"], levels: {}, weeklyLessons: 4, progress: {}, notes: {}, downloads: {}, dataSaver: false, theme: "light", feedbackAsked: m.asked }, dispatch: m.dispatch }),
}));
vi.mock("../src/platform", () => ({
  storage: {
    get: async (k: string) => m.store.get(k),
    set: async (k: string, v: unknown) => { m.store.set(k, v); },
    remove: async (k: string) => { m.store.delete(k); },
  },
}));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useFeedback: () => ({ data: m.rows, loading: false, reload: m.reload }),
  useFeedbackSummary: () => ({ data: m.summary, reload: vi.fn() }),
  setFeedbackStatus: async (id: string, status: string, uid: string) => { m.updated.push({ id, status, uid }); },
}));

const { ReportBug } = await import("../src/bugs/Fab");
const { openFeedback } = await import("../src/bugs/log");
const { flushFeedback } = await import("../src/bugs/Feedback");
const { AskCourse } = await import("../src/screens/Home");
const { FeedbackPage } = await import("../src/admin/Feedback");

const fetchMock = vi.fn();
beforeAll(() => { vi.stubGlobal("fetch", fetchMock); });
beforeEach(() => {
  m.user = null; m.store.clear(); m.dispatch.mockClear(); m.asked = {}; m.rows = []; m.summary = null; m.updated = []; m.reload.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "f1" }), { status: 201 }));
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
const app = (lang = "en", at = "/learn") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[at]}><ReportBug /></MemoryRouter></I18nProvider>);
const FAB = "Share feedback or report a problem";
const sentBody = () => JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string);

describe("the round button", () => {
  it("opens a menu of two, which Escape closes back onto the button", async () => {
    app();
    const fab = screen.getByRole("button", { name: FAB });
    expect(fab.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(fab);
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Share feedback", "Report a problem"]);
    expect(fab.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Share feedback" }));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Report a problem" }));
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(fab);
  });

  it("names itself in Arabic", () => {
    app("ar");
    fireEvent.click(screen.getByRole("button", { name: "شاركنا رأيك أو أبلغ عن مشكلة" }));
    expect(screen.getByRole("menuitem", { name: "شاركنا رأيك" })).toBeTruthy();
  });
});

describe("the feedback sheet", () => {
  it("needs stars, then sends them with the topic, the comment and the page's path only, as a guest", async () => {
    app("en", "/labs/neuron?code=SECRET");
    fireEvent.click(screen.getByRole("button", { name: FAB }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Share feedback" }));
    const dialog = await screen.findByRole("dialog", { name: "Share feedback" });
    expect(within(dialog).getByText("How would you rate Darsi?")).toBeTruthy();
    expect(within(dialog).getByText(/No picture of your screen, and no name/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Choose from 1 to 5 stars.");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("radio", { name: "4 of 5 stars" }));
    expect(within(dialog).getByText("Very good")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Labs" }));
    expect(within(dialog).getByRole("button", { name: "Labs" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(within(dialog).getByLabelText("Tell us more (optional)"), { target: { value: "  The neuron lab made it click  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await screen.findByText("Thank you for your feedback.");
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe("/api/feedback");
    expect(init.headers.Authorization).toBeUndefined();
    expect(sentBody()).toEqual({ rating: 4, text: "The neuron lab made it click", topic: "labs", path: "/labs/neuron", unitId: null, source: "button", lang: "en" });
    expect(JSON.stringify(sentBody())).not.toContain("SECRET");
  });

  it("signed in, sends the ID token; the rail's item opens the same sheet", async () => {
    m.user = { uid: "u1", email: "amina@school.org", getIdToken: async () => "tok" };
    app();
    openFeedback();
    const dialog = await screen.findByRole("dialog", { name: "Share feedback" });
    expect(within(dialog).getByText(/the page you were on and your account/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("radio", { name: "5 of 5 stars" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await screen.findByText("Thank you for your feedback.");
    expect(fetchMock.mock.calls.at(-1)![1].headers.Authorization).toBe("Bearer tok");
  });

  it("offline, keeps it on the phone and sends it when the connection returns", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    app();
    openFeedback();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "2 of 5 stars" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await screen.findByText(/Saved on this device/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(m.store.get("darsi:feedback")).toHaveLength(1);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await flushFeedback(null, null);
    expect(sentBody()).toMatchObject({ rating: 2, queuedAt: expect.any(String) });
    expect(m.store.has("darsi:feedback")).toBe(false);
  });

  it("tells the person to wait when they've sent too many", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    app();
    openFeedback();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "3 of 5 stars" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/several times/);
  });

  it("in Arabic, its stars are counted in Arabic digits", async () => {
    app("ar");
    openFeedback();
    const dialog = await screen.findByRole("dialog", { name: "شاركنا رأيك" });
    expect(within(dialog).getByRole("radio", { name: "٤ من ٥ نجوم" })).toBeTruthy();
  });
});

describe("Home's question under a finished course", () => {
  it("a star opens the sheet on that course with those stars, and the course isn't asked about again", async () => {
    render(<I18nProvider lang="en"><MemoryRouter initialEntries={["/learn"]}><AskCourse id="ai-2-1" title="AI at work" /><ReportBug /></MemoryRouter></I18nProvider>);
    expect(screen.getByRole("group", { name: "How was this course?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4 of 5 stars" }));
    expect(m.dispatch).toHaveBeenCalledWith({ type: "set", patch: { feedbackAsked: { "ai-2-1": expect.any(Number) } } });
    const dialog = await screen.findByRole("dialog", { name: "Share feedback" });
    expect(within(dialog).getByText("How would you rate ⁨AI at work⁩?")).toBeTruthy();
    expect((within(dialog).getByRole("radio", { name: "4 of 5 stars" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await screen.findByText("Thank you for your feedback.");
    expect(sentBody()).toMatchObject({ rating: 4, unitId: "ai-2-1", source: "course" });
  });

  it("Not now puts it aside for good", () => {
    render(<I18nProvider lang="en"><MemoryRouter><AskCourse id="ai-2-1" title="AI at work" /></MemoryRouter></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(m.dispatch).toHaveBeenCalledWith({ type: "set", patch: { feedbackAsked: { "ai-2-1": expect.any(Number) } } });
  });
});

describe("/super/feedback", () => {
  it("shows the figures, each message in full, and marks one as read", async () => {
    m.user = { uid: "boss", email: "boss@darsi.test", getIdToken: async () => "tok" };
    m.summary = { all: { n: 12, avg: 4.25 }, recent: { n: 3, avg: 3 }, stars: [1, 0, 2, 4, 5] };
    m.rows = [
      { id: "f1", status: "new", rating: 5, text: "Loved it", topic: "videos", path: "/learn", unitId: "ai-2-1", source: "course", lang: "en", createdAt: { seconds: 1794400000 }, user: { uid: "u1", email: "a@b.c", name: "Amina", role: "teacher", orgId: null } },
      { id: "f2", status: "new", rating: 2, text: "", topic: null, path: "/labs", unitId: null, source: "button", lang: "ar", createdAt: null, user: null },
    ];
    render(<I18nProvider lang="en"><MemoryRouter initialEntries={["/super/feedback"]}><FeedbackPage /></MemoryRouter></I18nProvider>);
    expect(screen.getByText("4.3")).toBeTruthy();
    expect(screen.getByText("From 12 ratings")).toBeTruthy();
    expect(screen.getByText("Loved it")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Amina" }).getAttribute("href")).toBe("/super/people/u1");
    expect(screen.getByText(/Not signed in/)).toBeTruthy();
    expect(screen.getByText("No comment.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Mark as read" })[0]);
    await waitFor(() => expect(m.updated).toEqual([{ id: "f1", status: "read", uid: "boss" }]));
    expect(m.reload).toHaveBeenCalled();
  });

  it("reads in Arabic", () => {
    m.summary = { all: { n: 0, avg: null }, recent: { n: 0, avg: null }, stars: [0, 0, 0, 0, 0] };
    render(<I18nProvider lang="ar"><MemoryRouter initialEntries={["/super/feedback"]}><FeedbackPage /></MemoryRouter></I18nProvider>);
    expect(screen.getByRole("heading", { name: "الآراء" })).toBeTruthy();
    expect(screen.getByText("لا جديد. قُرئت كل الرسائل.")).toBeTruthy();
  });
});
