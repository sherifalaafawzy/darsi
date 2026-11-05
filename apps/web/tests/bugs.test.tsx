// "Report a problem": the log of recent errors, the button and its sheet, what a report sends, the offline queue,
// and the platform admins' page.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";

const m = vi.hoisted(() => ({
  user: null as null | { uid: string; email: string; getIdToken: () => Promise<string> },
  store: new Map<string, unknown>(),
  shot: true,
  reports: [] as unknown[],
  updated: [] as unknown[],
  reload: vi.fn(),
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: async () => ({}), functions: {}, firebaseReady: true, call: () => vi.fn() }));
vi.mock("firebase/firestore", async (orig) => ({ ...(await orig<typeof import("firebase/firestore")>()), doc: (...p: unknown[]) => p.slice(1).join("/"), updateDoc: async (ref: unknown, data: unknown) => { m.updated.push({ ref, data }); }, serverTimestamp: () => "now" }));
vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: m.user, profile: m.user ? { name: "Amina Bello" } : null, role: m.user ? "teacher" : "learner", orgId: m.user ? "org1" : null, plan: null, offlineUid: null }),
}));
vi.mock("../src/state/store", () => ({
  useStore: () => ({ state: { lang: "en", onboarded: true, tracks: ["ai"], levels: { ai: 2 }, weeklyLessons: 4, progress: { a: {}, b: {} }, notes: {}, downloads: { "ai-1-1": "done" }, dataSaver: false, theme: "light", weeks: {}, name: "" } }),
}));
vi.mock("../src/platform", () => ({
  storage: {
    get: async (k: string) => m.store.get(k),
    set: async (k: string, v: unknown) => { m.store.set(k, v); },
    remove: async (k: string) => { m.store.delete(k); },
  },
}));
// jsdom draws nothing: the screenshot library hands back a canvas that says what it would have drawn.
vi.mock("modern-screenshot", () => ({
  domToCanvas: async (_: Element, o: { width: number; height: number; filter: (n: Node) => boolean }) => {
    if (!m.shot) throw new Error("no canvas");
    const fab = document.querySelector(".bug-fab");
    if (fab && o.filter(fab)) throw new Error("the button must be left out of the picture");
    return { width: o.width, height: o.height, toDataURL: () => "data:image/jpeg;base64,/9j/4AAQ" };
  },
}));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useBugReports: () => ({ data: m.reports, reload: m.reload }),
  bugShotUrl: async (p: string) => `https://storage.test/${p}`,
}));

const { startBugLog, bugLog, notePage, openReport } = await import("../src/bugs/log");
const { ReportBug } = await import("../src/bugs/Fab");
const { redact, flushReports } = await import("../src/bugs/Report");
const { BugsPage, deviceLine } = await import("../src/admin/Bugs");

const fetchMock = vi.fn();
beforeAll(() => { vi.stubGlobal("fetch", fetchMock); startBugLog(); });
beforeEach(() => {
  m.user = null; m.store.clear(); m.shot = true; m.updated = []; m.reload.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "abcdef123456" }), { status: 201 }));
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
const app = () => render(<I18nProvider lang="en"><MemoryRouter initialEntries={["/lesson/ai-1-1/ai-1-1-2?step=3"]}><ReportBug /></MemoryRouter></I18nProvider>);
const sentBody = () => JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string);

describe("the log", () => {
  it("keeps errors, rejections, console errors and failed requests, without query strings", async () => {
    window.dispatchEvent(new ErrorEvent("error", { message: "Boom", error: new Error("Boom") }));
    console.error("React says", new Error("bad prop"));
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    await fetch("/content/units/x.json?token=secret");
    const log = bugLog().entries.map((e) => `${e.kind}: ${e.msg}`);
    expect(log).toContain("error: Boom");
    expect(log).toContain("console: React says Error: bad prop");
    expect(log).toContain("request: GET /content/units/x.json 404");
    expect(JSON.stringify(bugLog())).not.toContain("secret");
  });
  it("leaves out requests their own code cancelled", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await fetch("/listen").catch(() => {});
    expect(bugLog().entries.some((e) => e.msg.includes("/listen"))).toBe(false);
  });
  it("notes each page once", () => {
    notePage("/learn"); notePage("/learn"); notePage("/labs");
    expect(bugLog().pages.slice(-2).map((p) => p.path)).toEqual(["/learn", "/labs"]);
  });
});

describe("Report a problem", () => {
  it("hides secrets in the page address", () => {
    expect(redact("https://darsiai.org/signup?code=ABCD-EFGH-JKLM&org=1")).toBe("https://darsiai.org/signup?code=%E2%80%A6&org=1");
  });

  it("takes a picture of the screen (without its own button), then sends the words, picture and details as a guest", async () => {
    app();
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    const dialog = await screen.findByRole("dialog", { name: "Report a problem" });
    expect(screen.queryByRole("button", { name: "Report a problem" })).toBeNull();
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe("data:image/jpeg;base64,/9j/4AAQ");
    expect(screen.getByText("That you aren't signed in")).toBeTruthy();
    // Too short: nothing is sent.
    fireEvent.click(screen.getByRole("button", { name: "Send the report" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("bug"), expect.anything());
    fireEvent.change(screen.getByLabelText("What went wrong?"), { target: { value: "The Continue button does nothing" } });
    fireEvent.click(screen.getByRole("button", { name: "Send the report" }));
    await screen.findByText("Thank you. We got your report.");
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe("/api/bug");
    expect(init.headers.Authorization).toBeUndefined();
    const body = sentBody();
    expect(body).toMatchObject({ text: "The Continue button does nothing", shot: "data:image/jpeg;base64,/9j/4AAQ", url: "http://localhost:3000/" });
    expect(body.details).toMatchObject({ account: null, learner: { lessonsDone: 2, tracks: ["ai"], downloads: ["ai-1-1"] }, device: { viewport: [window.innerWidth, window.innerHeight] } });
    expect(body.details.log.pages.at(-1).path).toBe("/lesson/ai-1-1/ai-1-1-2");
    expect(screen.getByText(/ABCDEF12/)).toBeTruthy();
  });

  it("signed in, sends the ID token, and the picture can be left out", async () => {
    m.user = { uid: "u1", email: "amina@school.org", getIdToken: async () => "tok" };
    app();
    openReport(); // the nav rail's item
    await screen.findByRole("dialog");
    expect(screen.getByText("Your account: ⁨Amina Bello⁩")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /Send this picture/ }));
    fireEvent.change(screen.getByLabelText("What went wrong?"), { target: { value: "My certificate has the wrong name" } });
    fireEvent.click(screen.getByRole("button", { name: "Send the report" }));
    await screen.findByText("Thank you. We got your report.");
    expect(fetchMock.mock.calls.at(-1)![1].headers.Authorization).toBe("Bearer tok");
    expect(sentBody()).toMatchObject({ shot: null, details: { account: { uid: "u1", role: "teacher", orgId: "org1" } } });
  });

  it("opens without a picture when the browser can't take one, and says so", async () => {
    m.shot = false;
    app();
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    await screen.findByText(/We couldn't take a picture/);
    expect(screen.getByText("Add a picture")).toBeTruthy();
  });

  it("offline, keeps the report on the phone and sends it when the connection returns", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    app();
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("What went wrong?"), { target: { value: "Downloads stop at 40%" } });
    fireEvent.click(screen.getByRole("button", { name: "Send the report" }));
    await screen.findByText(/Saved on this device/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((m.store.get("darsi:reports") as unknown[])).toHaveLength(1);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await flushReports(null, null);
    expect(sentBody()).toMatchObject({ text: "Downloads stop at 40%" });
    expect(sentBody().details.queuedAt).toBeTruthy();
    expect(m.store.has("darsi:reports")).toBe(false);
  });

  it("tells the person to wait when they've sent too many", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    app();
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("What went wrong?"), { target: { value: "Something is wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Send the report" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/several reports/);
  });
});

describe("the reports page", () => {
  const report = { id: "b1", status: "new", text: "The quiz froze", url: "https://darsiai.org/lesson/ai-1-1/ai-1-1-2", path: "/lesson/ai-1-1/ai-1-1-2", createdAt: { seconds: 1793700000 },
    user: { uid: "u1", email: "a@b.org", name: "Amina Bello", role: "teacher", orgId: "org1", plan: null, provider: "password" },
    shot: { path: "bugReports/b1.jpg", bytes: 1000, type: "image/jpeg", w: 750, h: 1624 },
    details: { device: { ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36", viewport: [375, 812], dpr: 2 }, network: { online: true, effectiveType: "3g" }, log: { entries: [{ t: 1, kind: "error", msg: "TypeError: x is undefined" }], pages: [] } } };

  it("reads the browser and screen from the details", () => {
    expect(deviceLine(report.details)).toBe("Chrome 141, Android 14 — 375 × 812 @2×");
  });

  it("shows who, where, the errors, the screenshot on demand, and marks a report fixed", async () => {
    m.reports = [report];
    m.user = { uid: "boss", email: "boss@darsi.app", getIdToken: async () => "tok" };
    render(<I18nProvider lang="en"><MemoryRouter><BugsPage /></MemoryRouter></I18nProvider>);
    expect(screen.getByText("The quiz froze")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Amina Bello" }).getAttribute("href")).toBe("/super/people/u1");
    expect(screen.getByText("TypeError: x is undefined")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show the screenshot" }));
    expect((await screen.findByRole("img", { name: "Screenshot" })).getAttribute("src")).toBe("https://storage.test/bugReports/b1.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Mark fixed" }));
    await waitFor(() => expect(m.reload).toHaveBeenCalled());
    expect(m.updated[0]).toMatchObject({ ref: "bugReports/b1", data: { status: "fixed", statusBy: "boss" } });
  });
});
