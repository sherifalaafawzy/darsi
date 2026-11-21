// "Report a problem": the log of recent errors, the button and its sheet, what a report sends, the offline queue,
// and the platform admins' page.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";

const m = vi.hoisted(() => ({
  user: null as null | { uid: string; email: string; getIdToken: () => Promise<string> },
  store: new Map<string, unknown>(),
  shot: true,
  reports: [] as unknown[],
  updated: [] as unknown[],
  reload: vi.fn(),
  calls: [] as { onlyNew: boolean; max: number }[],
  loading: false,
  error: undefined as Error | undefined,
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
  useBugReports: (onlyNew: boolean, max: number) => { m.calls.push({ onlyNew, max }); return { data: m.reports, error: m.error, loading: m.loading, reload: m.reload }; },
  bugShotUrl: async (p: string) => `https://storage.test/${p}`,
}));

const { startBugLog, bugLog, notePage, openReport } = await import("../src/bugs/log");
const { ReportBug } = await import("../src/bugs/Fab");
const { redact, flushReports, inShot } = await import("../src/bugs/Report");
const { BugsPage, deviceLine } = await import("../src/admin/Bugs");

/** The round button opens a menu; "Report a problem" is one of its two items. */
function openFromFab() {
  fireEvent.click(screen.getByRole("button", { name: "Share feedback or report a problem" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Report a problem" }));
}

const fetchMock = vi.fn();
beforeAll(() => { vi.stubGlobal("fetch", fetchMock); startBugLog(); });
beforeEach(() => {
  m.user = null; m.store.clear(); m.shot = true; m.updated = []; m.reload.mockClear(); m.calls = []; m.loading = false; m.error = undefined;
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

  it("leaves the button, its note and the page's <noscript> (raw markup with scripts on) out of the picture", () => {
    const el = (html: string) => { const d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild!; };
    expect(inShot(el("<noscript>Darsi needs JavaScript to run.</noscript>"))).toBe(false);
    expect(inShot(el('<button class="bug-fab"></button>'))).toBe(false);
    expect(inShot(el('<p class="bug-note"></p>'))).toBe(false);
    expect(inShot(el('<main class="screen"></main>'))).toBe(true);
    expect(inShot(document.createTextNode("text"))).toBe(true);
  });

  it("takes a picture of the screen (without its own button), then sends the words, picture and details as a guest", async () => {
    app();
    openFromFab();
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
    // Which build (build.ts: "dev" in tests, the name vite.config.ts gives a real build), beside the entry file's name.
    expect(body.details.app).toMatchObject({ build: "dev", entry: expect.any(String) });
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
    expect(sentBody()).toMatchObject({ shot: null });
    // Of the account only its uid goes in the details: the server takes who sent it from the token alone, so the email,
    // role, organization and plan a phone could make up are no longer sent (this line asked for role and orgId before).
    expect(sentBody().details.account).toEqual({ uid: "u1" });
    expect(JSON.stringify(sentBody().details)).not.toContain("amina@school.org");
  });

  it("opens without a picture when the browser can't take one, and says so", async () => {
    m.shot = false;
    app();
    openFromFab();
    await screen.findByText(/We couldn't take a picture/);
    expect(screen.getByText("Add a picture")).toBeTruthy();
  });

  it("offline, keeps the report on the phone and sends it when the connection returns", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    app();
    openFromFab();
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
    openFromFab();
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("What went wrong?"), { target: { value: "Something is wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Send the report" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/several reports/);
  });

  it("is a modal: the browser's own where it has one, and closing puts the focus back on the button", async () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
    try {
      app();
      const fab = screen.getByRole("button", { name: "Share feedback or report a problem" });
      fab.focus();
      fireEvent.click(fab);
      fireEvent.click(await screen.findByRole("menuitem", { name: "Report a problem" }));
      const dialog = await screen.findByRole("dialog", { name: "Report a problem" });
      expect(showModal).toHaveBeenCalled();
      expect(document.activeElement).toBe(screen.getByLabelText("What went wrong?"));
      // Escape: the browser's "cancel".
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Share feedback or report a problem" }));
    } finally { delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal; }
  });

  it("without <dialog> support, Escape closes it and Tab stays inside", async () => {
    app();
    openFromFab();
    const dialog = await screen.findByRole("dialog");
    // jsdom lays nothing out: every control counts as on screen.
    const rects = vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    try {
      const send = screen.getByRole("button", { name: "Send the report" });
      send.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(send);
    } finally { rects.mockRestore(); }
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Share feedback or report a problem" }));
  });
});

describe("the reports page", () => {
  const report = { id: "b1", status: "new", text: "The quiz froze", url: "https://darsiai.org/lesson/ai-1-1/ai-1-1-2", path: "/lesson/ai-1-1/ai-1-1-2", createdAt: { seconds: 1793700000 },
    user: { uid: "u1", email: "a@b.org", name: "Amina Bello", role: "teacher", orgId: "org1", plan: null, provider: "password" },
    shot: { path: "bugReports/b1.jpg", bytes: 1000, type: "image/jpeg", w: 750, h: 1624 },
    details: { device: { ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36", viewport: [375, 812], dpr: 2 }, network: { online: true, effectiveType: "3g" }, log: { entries: [{ t: 1, kind: "error", msg: "TypeError: x is undefined" }], pages: [] } } };

  // The page's tabs read and write the address (?tab=): a router around it, started where the test says.
  const bugs = (at = "/super/bugs") => render(<I18nProvider lang="en"><MemoryRouter initialEntries={[at]}><BugsPage /></MemoryRouter></I18nProvider>);
  const openTab = () => screen.getAllByRole("tab").filter((x) => x.getAttribute("aria-selected") === "true").map((x) => x.textContent);

  it("reads the browser and screen from the details", () => {
    expect(deviceLine(report.details)).toBe("Chrome 141, Android 14 — 375 × 812 @2×");
  });

  it("shows who, where, the errors, the screenshot on demand, and marks a report fixed", async () => {
    m.reports = [report];
    m.user = { uid: "boss", email: "boss@darsi.app", getIdToken: async () => "tok" };
    bugs();
    // New and All are tabs; the new reports open first, in the panel named after the tab.
    expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual(["New", "All"]);
    expect(openTab()).toEqual(["New"]);
    expect(m.calls.at(-1)).toEqual({ onlyNew: true, max: 30 });
    expect(within(screen.getByRole("tabpanel", { name: "New" })).getByText("The quiz froze")).toBeTruthy();
    expect(screen.getByText("The quiz froze")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Amina Bello" }).getAttribute("href")).toBe("/super/people/u1");
    expect(screen.getByText("TypeError: x is undefined")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show the screenshot" }));
    expect((await screen.findByRole("img", { name: "Screenshot" })).getAttribute("src")).toBe("https://storage.test/bugReports/b1.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Mark fixed" }));
    await waitFor(() => expect(m.reload).toHaveBeenCalled());
    expect(m.updated[0]).toMatchObject({ ref: "bugReports/b1", data: { status: "fixed", statusBy: "boss" } });
  });

  it("goes between New and All by their tabs, each with its own empty state, a page at a time", () => {
    m.reports = [];
    bugs();
    expect(screen.getByText("No new reports")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(openTab()).toEqual(["All"]);
    expect(m.calls.at(-1)).toEqual({ onlyNew: false, max: 30 });
    expect(within(screen.getByRole("tabpanel", { name: "All" })).getByText("No reports yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "New" }));
    expect(m.calls.at(-1)).toEqual({ onlyNew: true, max: 30 });
    expect(screen.getByText("No new reports")).toBeTruthy();
  });

  // The list keeps the other tab's rows until this tab's arrive (admin/data.ts usePaged, `loading`): fixed and closed
  // reports sat under "New", with their buttons live, for the length of a read.
  it("a tab whose rows are still being read shows no rows from the other tab", () => {
    m.reports = [{ ...report, status: "fixed" }];
    m.loading = true;
    const tree = () => <I18nProvider lang="en"><MemoryRouter initialEntries={["/super/bugs"]}><BugsPage /></MemoryRouter></I18nProvider>;
    const view = render(tree());
    const panel = screen.getByRole("tabpanel", { name: "New" });
    expect(screen.queryByText("The quiz froze")).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
    for (const name of ["Reopen", "Mark fixed", "Close", "Delete report", "Show more"]) expect(screen.queryByRole("button", { name })).toBeNull();
    // It says it is loading, and never "No new reports" over a read that has not answered.
    expect(panel.querySelector(".loading")?.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("No new reports")).toBeNull();
    expect(screen.queryByText("No reports yet")).toBeNull();
    // Its own rows arrived.
    m.loading = false;
    view.rerender(tree());
    expect(within(screen.getByRole("tabpanel", { name: "New" })).getByText("The quiz froze")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeTruthy();
    expect(screen.getByRole("tabpanel", { name: "New" }).querySelector(".loading")).toBeNull();
  });

  // The same for a read that failed on the other tab: its error is not this tab's, which says it is loading; a
  // failed read of this tab's own says why, with Retry, and no spinner under it.
  it("a tab whose rows are still being read shows no error from the other tab", () => {
    m.reports = undefined as unknown as unknown[]; // this tab's rows never arrived
    m.error = new Error("offline");
    m.loading = true;
    const tree = () => <I18nProvider lang="en"><MemoryRouter initialEntries={["/super/bugs"]}><BugsPage /></MemoryRouter></I18nProvider>;
    const view = render(tree());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("tabpanel", { name: "New" }).querySelector(".loading")?.getAttribute("aria-busy")).toBe("true");
    m.loading = false;
    view.rerender(tree());
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByRole("tabpanel", { name: "New" }).querySelector(".loading")).toBeNull();
    expect(screen.queryByText("No new reports")).toBeNull();
    m.reports = [];
  });

  it("starts the other tab at one page again after Show more", () => {
    m.reports = Array.from({ length: 30 }, (_, i) => ({ ...report, id: `b${i}`, text: `Report ${i}`, user: null, shot: null }));
    bugs();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(m.calls.at(-1)).toEqual({ onlyNew: true, max: 60 });
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(m.calls.at(-1)).toEqual({ onlyNew: false, max: 30 });
    // Never All with New's larger page: that would be a read thrown away.
    expect(m.calls.some((c) => !c.onlyNew && c.max !== 30)).toBe(false);
  });

  it("opens every report from its own address, and the tabs are links", () => {
    m.reports = [{ ...report, status: "fixed" }];
    bugs("/super/bugs?tab=all");
    expect(openTab()).toEqual(["All"]);
    // Only that read: the new ones were never asked for.
    expect(m.calls.every((c) => !c.onlyNew && c.max === 30)).toBe(true);
    expect(within(screen.getByRole("tabpanel", { name: "All" })).getByText("The quiz froze")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "New" }).getAttribute("href")).toBe("/super/bugs");
    expect(screen.getByRole("tab", { name: "All" }).getAttribute("href")).toBe("/super/bugs?tab=all");
  });

  it("keeps Refresh a button, above the tabs, that reads the open list again", () => {
    m.reports = [];
    bugs();
    const refresh = screen.getByRole("button", { name: "Refresh" });
    // An action, not a view: it is not one of the tabs.
    expect(screen.queryByRole("tab", { name: "Refresh" })).toBeNull();
    expect(screen.getByRole("tablist", { name: "Problem reports" }).contains(refresh)).toBe(false);
    expect(refresh.compareDocumentPosition(screen.getByRole("tablist")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(refresh);
    expect(m.reload).toHaveBeenCalledTimes(1);
    // Still on the same tab, and nothing was added to the address.
    expect(openTab()).toEqual(["New"]);
  });
});
