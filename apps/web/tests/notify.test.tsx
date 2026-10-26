import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { Org } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";

// Push notifications without a browser push service or Firebase: push.ts is checked against stubbed browser APIs and a
// stubbed firebase/messaging; the Me panel and the SuperAdmin composer run with push.ts and the callables mocked.
const m = vi.hoisted(() => ({
  vapid: "test-vapid",
  auth: { user: { uid: "u1" }, profile: null, role: "learner", orgId: null, configured: true, offlineUid: null } as { user: { uid: string } | null; profile: unknown; role: string; orgId: string | null; configured: boolean; offlineUid: string | null },
  store: { state: { weeklyLessons: 4, lang: "en" }, ready: true },
  push: { support: "ok" as string, perm: "default" as NotificationPermission, on: false },
  enablePush: vi.fn(), disablePush: vi.fn(), savePrefs: vi.fn(), refreshPush: vi.fn(),
  api: { sendBroadcast: vi.fn(), registerDevice: vi.fn(async () => ({ ok: true })), unregisterDevice: vi.fn(async () => ({ ok: true })), updateNotifyPrefs: vi.fn(async () => ({ ok: true })), reviewOrg: vi.fn() },
  fb: { app: {}, auth: { currentUser: { uid: "u1" } as { uid: string } | null } },
  getToken: vi.fn(async () => "tok-1"), deleteToken: vi.fn(async () => true),
  orgs: { pending: [] as Org[], active: [] as Org[] },
  broadcasts: [] as unknown[] | undefined,
  reload: vi.fn(),
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { apiKey: "test-key" }, useEmulators: false, functionsRegion: "europe-west1", get vapidKey() { return m.vapid; } }));
vi.mock("../src/fb", () => ({ loadFirebase: vi.fn(async () => m.fb), call: () => vi.fn(), storedSession: async () => null }));
vi.mock("firebase/messaging", () => ({ getMessaging: () => ({ messaging: true }), getToken: m.getToken, deleteToken: m.deleteToken }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/state/store", () => ({ useStore: () => m.store }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/notify/push", async (orig) => ({
  ...(await orig<typeof import("../src/notify/push")>()),
  pushSupport: () => m.push.support,
  permission: () => m.push.perm,
  pushOn: (uid?: string | null) => Boolean(uid) && m.push.on,
  enablePush: m.enablePush, disablePush: m.disablePush, savePrefs: m.savePrefs, refreshPush: m.refreshPush,
}));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useOrgsByStatus: (status: "pending" | "active") => ({ data: m.orgs[status] }),
  usePerson: () => ({ data: null }),
  useBroadcasts: () => ({ data: m.broadcasts, reload: m.reload }),
}));

const real = await vi.importActual<typeof import("../src/notify/push")>("../src/notify/push");
const { loadFirebase } = await import("../src/fb");
const { NotificationsPanel } = await import("../src/notify/NotificationsPanel");
const { usePushRefresh } = await import("../src/notify/usePushRefresh");
const { SuperAdmin } = await import("../src/admin/SuperAdmin");

const wrap = (ui: ReactNode, lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter>{ui}</MemoryRouter></I18nProvider>);
const CATS = { reminders: true, reviews: true, staff: true, news: true };
const org = (o: Partial<Org>): Org => ({ id: "o1", name: "Al-Noor School", type: "school", status: "active", createdBy: "u9", city: "Cairo", country: "Egypt", createdAt: { seconds: 1792800000 }, ...o });

/** A browser that can do web push: service worker, PushManager and Notification with the given permission. */
const reg = { pushManager: { getSubscription: vi.fn(async () => null) } };
function pushBrowser(perm: NotificationPermission = "granted", answer: NotificationPermission = perm) {
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve(reg), getRegistration: async () => reg } });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission: perm, requestPermission: vi.fn(async () => answer) });
}
const userAgent = (ua: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
const saved = () => JSON.parse(localStorage.getItem("darsi:push") ?? "null");

beforeEach(() => {
  vi.clearAllMocks();
  m.vapid = "test-vapid";
  m.auth = { user: { uid: "u1" }, profile: null, role: "learner", orgId: null, configured: true, offlineUid: null };
  m.store.state = { weeklyLessons: 4, lang: "en" };
  m.push = { support: "ok", perm: "default", on: false };
  m.fb.auth.currentUser = { uid: "u1" };
  m.getToken.mockResolvedValue("tok-1");
  m.orgs = { pending: [], active: [] }; m.broadcasts = [];
});
afterEach(() => {
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear();
});

describe("push.ts", () => {
  it("says what this browser can do", () => {
    expect(real.pushSupport()).toBe("unsupported"); // jsdom: no service worker or PushManager
    pushBrowser();
    expect(real.pushSupport()).toBe("ok");
    m.vapid = "";
    expect(real.pushSupport()).toBe("unconfigured");
  });

  it("asks iPhone users to add Darsi to the Home Screen first, and knows old iOS can't", () => {
    userAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148");
    expect(real.pushSupport()).toBe("ios-install");
    userAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148");
    expect(real.pushSupport()).toBe("unsupported");
  });

  it("enables: permission, token for our service worker, registerDevice, then remembers it for this account", async () => {
    pushBrowser("default", "granted");
    const prefs = { lang: "ar" as const, hourLocal: 7, cats: CATS, weeklyGoal: 3 };
    expect(await real.enablePush(prefs)).toBe("granted");
    expect(m.getToken).toHaveBeenCalledWith({ messaging: true }, { vapidKey: "test-vapid", serviceWorkerRegistration: reg });
    expect(m.api.registerDevice).toHaveBeenCalledWith({ token: "tok-1", tz: expect.any(String), ...prefs });
    expect(saved()).toEqual({ token: "tok-1", on: true, uid: "u1" });
    expect(real.pushOn("u1")).toBe(true);
    expect(real.pushOn("someone-else")).toBe(false);
  });

  it("registers nothing when the person doesn't allow notifications", async () => {
    pushBrowser("default", "denied");
    expect(await real.enablePush({ lang: "en", hourLocal: 18, cats: CATS, weeklyGoal: 4 })).toBe("denied");
    expect(m.api.registerDevice).not.toHaveBeenCalled();
    expect(saved()).toBeNull();
  });

  it("disables: the server forgets the token, FCM revokes it, and the phone forgets it", async () => {
    pushBrowser();
    localStorage.setItem("darsi:push", JSON.stringify({ token: "tok-1", on: true, uid: "u1" }));
    await real.disablePush();
    expect(m.api.unregisterDevice).toHaveBeenCalledWith({ token: "tok-1" });
    expect(m.deleteToken).toHaveBeenCalled();
    expect(saved()).toBeNull();
  });

  it("refresh skips guests and people who never opted in, without loading Firebase", async () => {
    pushBrowser();
    await real.refreshPush({ lang: "en", hourLocal: 18, cats: CATS, weeklyGoal: 4 });
    expect(loadFirebase).not.toHaveBeenCalled();
    expect(m.api.registerDevice).not.toHaveBeenCalled();
  });

  it("refresh re-registers a rotated token and drops the old one", async () => {
    pushBrowser();
    localStorage.setItem("darsi:push", JSON.stringify({ token: "old", on: true, uid: "u1" }));
    m.getToken.mockResolvedValue("new");
    await real.refreshPush({ lang: "en", hourLocal: 20, cats: CATS, weeklyGoal: 5 });
    expect(m.api.registerDevice).toHaveBeenCalledWith({ token: "new", tz: expect.any(String), lang: "en", hourLocal: 20, cats: CATS, weeklyGoal: 5 });
    expect(m.api.unregisterDevice).toHaveBeenCalledWith({ token: "old" });
    expect(saved()).toEqual({ token: "new", on: true, uid: "u1" });
  });

  it("refresh never moves one account's token to another, and stops when notifications were blocked since", async () => {
    pushBrowser();
    localStorage.setItem("darsi:push", JSON.stringify({ token: "tok-1", on: true, uid: "u2" }));
    await real.refreshPush({ lang: "en", hourLocal: 18, cats: CATS, weeklyGoal: 4 });
    expect(m.api.registerDevice).not.toHaveBeenCalled();

    pushBrowser("denied");
    localStorage.setItem("darsi:push", JSON.stringify({ token: "tok-1", on: true, uid: "u1" }));
    await real.refreshPush({ lang: "en", hourLocal: 18, cats: CATS, weeklyGoal: 4 });
    expect(m.api.registerDevice).not.toHaveBeenCalled();
    expect(m.api.unregisterDevice).toHaveBeenCalledWith({ token: "tok-1" });
    expect(saved()).toBeNull();
  });

  it("signing out unregisters this phone for that account only", async () => {
    pushBrowser();
    localStorage.setItem("darsi:push", JSON.stringify({ token: "tok-1", on: true, uid: "u1" }));
    await real.pushSignOut("u2");
    expect(m.api.unregisterDevice).not.toHaveBeenCalled();
    await real.pushSignOut("u1");
    expect(m.api.unregisterDevice).toHaveBeenCalledWith({ token: "tok-1" });
    expect(saved()).toBeNull();
  });

  it("builds prefs from the server's copy, with defaults and a clamped weekly goal", () => {
    expect(real.prefsFrom(undefined, 4)).toEqual({ hourLocal: 18, cats: CATS, weeklyGoal: 4 });
    expect(real.prefsFrom({ hourLocal: 7, cats: { news: false } }, 30)).toEqual({ hourLocal: 7, cats: { ...CATS, news: false }, weeklyGoal: 14 });
    expect(real.prefsFrom({ hourLocal: 25 }, 0).hourLocal).toBe(18);
  });
});

describe("NotificationsPanel", () => {
  const master = () => screen.getByRole("switch", { name: /Notifications on this phone/ });

  it("tells guests to sign in", () => {
    m.auth.user = null;
    wrap(<NotificationsPanel />);
    expect(screen.getByText(/Create an account or sign in/)).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("says when notifications aren't set up yet", () => {
    m.push.support = "unconfigured";
    wrap(<NotificationsPanel />);
    expect(screen.getByText(/aren’t set up for Darsi yet/)).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("asks iPhone users to add Darsi to the Home Screen", () => {
    m.push.support = "ios-install";
    wrap(<NotificationsPanel />);
    expect(screen.getByText(/add Darsi to your Home Screen/)).toBeTruthy();
  });

  it("explains how to allow notifications after they were blocked", () => {
    m.push.perm = "denied";
    wrap(<NotificationsPanel />);
    expect(screen.getByText(/blocked for Darsi in this browser/)).toBeTruthy();
    expect(screen.getByText(/Site settings/)).toBeTruthy();
  });

  it("turns on with the defaults and the local weekly goal, then saves a new reminder time", async () => {
    m.enablePush.mockResolvedValue("granted");
    m.savePrefs.mockResolvedValue({ ok: true });
    wrap(<NotificationsPanel />);
    expect(master().getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("switch", { name: /Learning reminders/ })).toBeNull();
    fireEvent.click(master());
    await waitFor(() => expect(m.enablePush).toHaveBeenCalledWith({ lang: "en", hourLocal: 18, cats: CATS, weeklyGoal: 4 }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", expect.stringContaining("at most one reminder a day"));
    expect(master().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("switch", { name: /Learning reminders/ })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Project feedback/ })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Announcements/ })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /Staff alerts/ })).toBeNull(); // learners get no staff alerts
    fireEvent.change(screen.getByLabelText("Reminder time"), { target: { value: "20" } });
    await waitFor(() => expect(m.savePrefs).toHaveBeenCalledWith({ hourLocal: 20, cats: CATS, weeklyGoal: 4 }));
  });

  it("stays off, and says why, when the permission prompt is dismissed", async () => {
    m.enablePush.mockResolvedValue("default");
    wrap(<NotificationsPanel />);
    fireEvent.click(master());
    expect(await screen.findByText(/still off/)).toBeTruthy();
    expect(master().getAttribute("aria-checked")).toBe("false");
  });

  it("shows the server's choices and staff alerts for staff, and saves a category", async () => {
    m.push = { support: "ok", perm: "granted", on: true };
    m.auth.role = "teacher";
    m.auth.profile = { uid: "u1", notify: { on: true, hourLocal: 7, cats: { ...CATS, news: false } } };
    m.savePrefs.mockResolvedValue({ ok: true });
    wrap(<NotificationsPanel />);
    expect((screen.getByLabelText("Reminder time") as HTMLSelectElement).value).toBe("7");
    expect(screen.getByRole("switch", { name: /Announcements/ }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("switch", { name: /Staff alerts/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /Project feedback/ }));
    await waitFor(() => expect(m.savePrefs).toHaveBeenCalledWith({ hourLocal: 7, cats: { ...CATS, news: false, reviews: false }, weeklyGoal: 4 }));
  });

  it("puts a category back and says so when saving fails", async () => {
    m.push = { support: "ok", perm: "granted", on: true };
    m.savePrefs.mockRejectedValue(new Error("offline"));
    wrap(<NotificationsPanel />);
    const reviews = screen.getByRole("switch", { name: /Project feedback/ });
    fireEvent.click(reviews);
    expect(await screen.findByText(/Couldn’t update notifications/)).toBeTruthy();
    expect(reviews.getAttribute("aria-checked")).toBe("true");
  });

  it("turns off", async () => {
    m.push = { support: "ok", perm: "granted", on: true };
    m.disablePush.mockResolvedValue(undefined);
    wrap(<NotificationsPanel />);
    fireEvent.click(master());
    await waitFor(() => expect(m.disablePush).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("switch", { name: /Learning reminders/ })).toBeNull());
  });

  it("uses Arabic text without the middle dot", () => {
    m.push = { support: "ok", perm: "granted", on: true };
    const { container } = wrap(<NotificationsPanel />, "ar");
    expect(screen.getByRole("switch", { name: /الإشعارات على هذا الهاتف/ })).toBeTruthy();
    expect(container.textContent).not.toContain("·");
  });
});

describe("usePushRefresh", () => {
  function Probe() { usePushRefresh(); return null; }

  it("does nothing for guests or people who never opted in", () => {
    m.auth.user = null; m.push.on = true;
    render(<Probe />);
    m.auth = { ...m.auth, user: { uid: "u-off" }, profile: { uid: "u-off" } }; m.push.on = false;
    render(<Probe />);
    expect(m.refreshPush).not.toHaveBeenCalled();
  });

  it("waits for the profile, then refreshes once per app start with the person's own choices", () => {
    m.push.on = true; m.refreshPush.mockResolvedValue(undefined);
    m.auth = { ...m.auth, user: { uid: "u-on" }, profile: null };
    m.store.state = { weeklyLessons: 6, lang: "ar" };
    const { rerender } = render(<Probe />);
    expect(m.refreshPush).not.toHaveBeenCalled();
    m.auth = { ...m.auth, profile: { uid: "u-on", notify: { hourLocal: 12, cats: { news: false } } } };
    rerender(<Probe />);
    expect(m.refreshPush).toHaveBeenCalledWith({ lang: "ar", hourLocal: 12, cats: { ...CATS, news: false }, weeklyGoal: 6 });
    m.auth = { ...m.auth, profile: { uid: "u-on", notify: { hourLocal: 12 } } };
    rerender(<Probe />);
    render(<Probe />); // the router remounts on sign-in; still once
    expect(m.refreshPush).toHaveBeenCalledTimes(1);
  });
});

describe("SuperAdmin announcements", () => {
  beforeEach(() => {
    m.auth.role = "superadmin";
    m.orgs.active = [org({ id: "o2", name: "Sunrise University", type: "university" })];
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const fill = () => {
    type("Title (English)", "  Exam week tips ");
    type("Message (English)", "Five short lessons to help your class revise.");
    type("Title (Arabic)", "نصائح أسبوع الامتحانات");
    type("Message (Arabic)", "خمسة دروس قصيرة تساعد صفّك على المراجعة.");
  };
  const send = () => fireEvent.click(screen.getByRole("button", { name: "Send announcement" }));

  it("requires both languages and sends nothing until they are filled in", () => {
    wrap(<SuperAdmin />);
    send();
    expect(screen.getAllByText("Required")).toHaveLength(4);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(m.api.sendBroadcast).not.toHaveBeenCalled();
  });

  it("counts characters and writes the Arabic fields right to left", () => {
    wrap(<SuperAdmin />);
    type("Title (English)", "Hello");
    expect(screen.getByText("5/60")).toBeTruthy();
    expect(screen.getByLabelText("Title (Arabic)").getAttribute("dir")).toBe("rtl");
    expect(screen.getByLabelText("Message (Arabic)").getAttribute("lang")).toBe("ar");
  });

  it("confirms, then sends the trimmed text to one role with the chosen link", async () => {
    m.api.sendBroadcast.mockResolvedValue({ id: "b1", results: { en: "m1", ar: "m2" } });
    wrap(<SuperAdmin />);
    fill();
    type("Who gets it", "role");
    type("Role", "student");
    type("Opens when tapped", "/labs");
    send();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Students"));
    await waitFor(() => expect(m.api.sendBroadcast).toHaveBeenCalledWith({
      title: { en: "Exam week tips", ar: "نصائح أسبوع الامتحانات" },
      body: { en: "Five short lessons to help your class revise.", ar: "خمسة دروس قصيرة تساعد صفّك على المراجعة." },
      link: "/labs",
      audience: { type: "role", role: "student" },
    }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Announcement sent.");
    expect(m.reload).toHaveBeenCalled();
    expect((screen.getByLabelText("Title (English)") as HTMLInputElement).value).toBe("");
  });

  it("needs an organization for an organization audience", async () => {
    m.api.sendBroadcast.mockResolvedValue({ id: "b2", results: { en: "m1", ar: null } });
    wrap(<SuperAdmin />);
    fill();
    type("Who gets it", "org");
    send();
    expect(screen.getAllByText("Choose an organization").length).toBeGreaterThan(1); // the empty option and the error
    expect(m.api.sendBroadcast).not.toHaveBeenCalled();
    type("Organization", "o2");
    send();
    await waitFor(() => expect(m.api.sendBroadcast).toHaveBeenCalledWith(expect.objectContaining({ link: "/learn", audience: { type: "org", orgId: "o2" } })));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Arabic version failed"));
  });

  it("sends nothing when the confirm dialog is cancelled", () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    wrap(<SuperAdmin />);
    fill();
    send();
    expect(m.api.sendBroadcast).not.toHaveBeenCalled();
  });

  it("lists recent announcements with their audience", () => {
    m.broadcasts = [
      { id: "b1", title: { en: "Exam week tips", ar: "نصائح أسبوع الامتحانات" }, audience: { type: "org", orgId: "o2" }, sentAt: { seconds: 1792800000 } },
      { id: "b2", title: { en: "New IoT unit", ar: "وحدة جديدة" }, audience: { type: "role", role: "teacher" }, sentAt: { seconds: 1792700000 } },
    ];
    wrap(<SuperAdmin />);
    expect(screen.getByText("Exam week tips")).toBeTruthy();
    expect(screen.getAllByText("Sunrise University").length).toBe(2); // the recent list and the active organizations
    expect(screen.getByText("Teachers")).toBeTruthy();
  });

  it("shows Arabic titles and numerals on the Arabic screen", () => {
    m.broadcasts = [{ id: "b1", title: { en: "Exam week tips", ar: "نصائح أسبوع الامتحانات" }, audience: { type: "all" }, sentAt: { seconds: 1792800000 } }];
    const { container } = wrap(<SuperAdmin />, "ar");
    expect(screen.getByText("نصائح أسبوع الامتحانات")).toBeTruthy();
    expect(screen.getAllByText("٠ من ٦٠")).toHaveLength(2);
    expect(container.textContent).not.toContain("·");
  });
});
