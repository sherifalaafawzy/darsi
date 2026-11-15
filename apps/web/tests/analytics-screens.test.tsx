import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/i18n";
import { StoreProvider } from "../src/state/store";

// /super/analytics and the organization branding panel, with Firestore, Storage and the callables replaced.
const m = vi.hoisted(() => ({
  auth: { user: { uid: "me" }, role: "superadmin", orgId: null as string | null },
  overview: null as unknown,
  days: [] as unknown[],
  saved: [] as unknown[],
  // A read or a save a test makes fail, or holds open.
  overviewErr: undefined as unknown,
  reloads: vi.fn(),
  saveGa: vi.fn(),
  refreshStats: vi.fn(async (..._a: unknown[]) => ({ at: "x" })),
  uploads: [] as Array<{ path: string; type: string }>,
  updates: [] as Array<{ path: string; data: Record<string, unknown> }>,
  // What only one tab needs: counted, so a test can say the other tabs never asked for it.
  usePeople: vi.fn((..._a: unknown[]) => ({ data: [], reload: vi.fn() })),
  useGaConfig: vi.fn(() => ({ data: { measurementId: "", apiSecret: "" }, reload: vi.fn() })),
  loadCatalog: vi.fn(async () => ({ version: 1, units: [{ id: "ai-1-1", track: "ai", level: 1, title: { en: "AI basics" }, summary: { en: "" }, lessons: 4, sizeMB: 1, available: true }] })),
}));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/firebase", () => ({ db: {}, firebaseReady: true, call: () => m.refreshStats, storage: async () => ({}), storageDataUrl: async () => "data:image/png;base64,AA" }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, ...p: string[]) => p.join("/"), updateDoc: async (path: string, data: Record<string, unknown>) => { m.updates.push({ path, data }); } }));
vi.mock("firebase/storage", () => ({ ref: (_s: unknown, path: string) => path, uploadBytes: async (path: string, b: Blob) => { m.uploads.push({ path, type: b.type }); }, deleteObject: async () => {} }));
vi.mock("../src/content/load", async (orig) => ({ ...(await orig<typeof import("../src/content/load")>()), loadCatalog: m.loadCatalog }));
// The Google Analytics connection goes through the setGaConfig callable (admin/data.ts saveGaConfig, kept real here).
vi.mock("../src/auth/api", async (orig) => { const real = await orig<typeof import("../src/auth/api")>(); return { ...real, api: { ...real.api, setGaConfig: m.saveGa } }; });
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useOverview: () => ({ data: m.overviewErr ? undefined : m.overview, error: m.overviewErr, reload: m.reloads }),
  useDays: () => ({ data: m.days, reload: vi.fn() }),
  useActiveDevices: () => ({ data: { d1: 12, d7: 340, d30: 900 }, reload: vi.fn() }),
  usePeople: m.usePeople,
  useGaConfig: m.useGaConfig,
  useMembers: () => ({ data: [] }),
}));
// jsdom has no canvas or image decoding: a logo "decodes" to 512 px, and like an old browser it can only write PNG.
vi.stubGlobal("createImageBitmap", async () => ({ width: 512, height: 512, close() {} }));
HTMLCanvasElement.prototype.getContext = (() => ({ drawImage() {} })) as unknown as HTMLCanvasElement["getContext"];
HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(["png"], { type: "image/png" })); };

const { AnalyticsPage } = await import("../src/admin/Analytics");
const { OrgBranding } = await import("../src/admin/OrgBranding");

// `at`: the address the page opens at (its tab is ?tab=…).
const wrap = (ui: ReactNode, at = "/super/analytics") => render(<StoreProvider><I18nProvider lang="en"><MemoryRouter initialEntries={[at]}>{ui}</MemoryRouter></I18nProvider></StoreProvider>);
const open = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
const today = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  m.saved = []; m.uploads = []; m.updates = []; m.auth.orgId = null; m.overviewErr = undefined;
  m.usePeople.mockClear(); m.useGaConfig.mockClear(); m.loadCatalog.mockClear(); m.reloads.mockClear();
  m.saveGa.mockReset(); m.saveGa.mockImplementation(async (...a: unknown[]) => { m.saved.push(a); });
  m.refreshStats.mockReset(); m.refreshStats.mockImplementation(async () => ({ at: "x" }));
});

describe("AnalyticsPage", () => {
  const filled = () => {
    m.overview = {
      at: "2026-11-01T02:30:00Z", lessons: 1520, xp: 0, avgAccuracy: 0.74, weeks: {},
      users: { total: 410, byRole: {}, new7: 25, new30: 80, active7: 120, active30: 260, withLessons: 300 },
      orgs: { o1: { name: "Nile School", country: "EG", members: 60, teachers: 10, students: 50, active7: 30, active30: 45, lessons: 400, xp: 0, avgAccuracy: 0.7 } },
      orgsByStatus: { active: 1, pending: 2 },
    };
    m.days = [{ day: today, n: 50, off: 10, dev: 12, lessons: { n: 9, track: { ai: 7, iot: 2 }, unit: { "ai-1-1": 7 }, acc: 630, accN: 9 }, sessions: { n: 20, installed: 5, lang: { ar: 15, en: 5 }, role: { guest: 8, teacher: 12 } }, labs: { neuron: 3 }, capstone: { calls: 6, reviews: 4, usd: 0.0041 } }];
  };

  it("shows accounts, active phones, lessons and the top courses, tracks and organizations, each under its tab", async () => {
    filled();
    wrap(<AnalyticsPage />);
    // Overview, the tab the page opens on.
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("340")).toBeTruthy(); // phones active in 7 days
    expect(screen.getByText("Today 12, 30 days 900, guests included")).toBeTruthy();
    expect(screen.getByText("410")).toBeTruthy();
    expect(screen.getByText("1,520")).toBeTruthy();
    expect(screen.getByText("2 waiting for approval")).toBeTruthy();
    expect(screen.getByText(/20% of activity happened offline/)).toBeTruthy();
    expect(screen.getByText("Milestones sent: 6, cost at the provider: $0.004")).toBeTruthy(); // capstone AI reviews (checkCapstone)
    // The other tabs' content is not on the page until they are opened.
    expect(screen.queryByText("Nile School")).toBeNull();
    expect(screen.queryByText("Guest")).toBeNull();
    open("Learning");
    expect(await screen.findByText("AI basics")).toBeTruthy(); // the course's title, not its id
    open("Organizations");
    expect(screen.getByText("Nile School")).toBeTruthy();
    open("Audience");
    expect(screen.getByText("Guest")).toBeTruthy();
    open("Google Analytics");
    expect(screen.getByText(/Off: Darsi counts usage itself/)).toBeTruthy();
    expect(screen.getByRole("tabpanel", { name: "Google Analytics" })).toBeTruthy();
  });

  it("opens each tab from its address", async () => {
    filled();
    let page = wrap(<AnalyticsPage />, "/super/analytics?tab=learning");
    expect(await screen.findByText("AI basics")).toBeTruthy();
    expect(screen.queryByText("340")).toBeNull(); // the Overview tab was never opened
    page.unmount();
    page = wrap(<AnalyticsPage />, "/super/analytics?tab=audience");
    expect(screen.getByText("Guest")).toBeTruthy();
    page.unmount();
    page = wrap(<AnalyticsPage />, "/super/analytics?tab=orgs");
    expect(screen.getByRole("link", { name: /Nile School/ }).getAttribute("href")).toBe("/super/orgs/o1");
    // On a phone the row is a card: the organization across its top, its four numbers as labelled pairs (base.css .data-table).
    expect(Array.from(screen.getByRole("link", { name: /Nile School/ }).closest("tr")!.querySelectorAll("td")).map((c) => c.getAttribute("data-cell"))).toEqual(["main", null, null, null, null]);
    page.unmount();
    page = wrap(<AnalyticsPage />, "/super/analytics?tab=people");
    expect(screen.getByRole("tabpanel", { name: "People" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    page.unmount();
    wrap(<AnalyticsPage />, "/super/analytics?tab=ga");
    expect(screen.getByText(/Off: Darsi counts usage itself/)).toBeTruthy();
    // The update time, Refresh and every tab stay above whichever tab is open.
    expect(screen.getByText(/^Accounts and organizations counted /)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeTruthy();
    expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual(["Overview", "Learning", "Audience", "Organizations", "People", "Google Analytics"]);
  });

  it("reads the accounts, the Google Analytics connection and the course titles only when their tab is opened", async () => {
    filled();
    wrap(<AnalyticsPage />);
    expect(screen.getByText("410")).toBeTruthy();
    expect(m.usePeople).not.toHaveBeenCalled();
    expect(m.useGaConfig).not.toHaveBeenCalled();
    expect(m.loadCatalog).not.toHaveBeenCalled();
    open("People");
    expect(m.usePeople).toHaveBeenCalledWith("", 50);
    expect(m.useGaConfig).not.toHaveBeenCalled();
    open("Google Analytics");
    expect(m.useGaConfig).toHaveBeenCalled();
    expect(m.loadCatalog).not.toHaveBeenCalled();
    open("Learning");
    await waitFor(() => expect(m.loadCatalog).toHaveBeenCalledTimes(1));
    // Coming back to a tab reads nothing again: its panel was kept.
    open("Overview"); open("Learning");
    expect(m.loadCatalog).toHaveBeenCalledTimes(1);
  });

  it("connects Google Analytics with the app's measurement ID and an API secret", async () => {
    m.overview = null; m.days = [];
    wrap(<AnalyticsPage />, "/super/analytics?tab=ga");
    fireEvent.change(screen.getByLabelText("Measurement ID"), { target: { value: "G-ABC123XYZ" } });
    fireEvent.change(screen.getByLabelText("Measurement Protocol API secret"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.saved).toEqual([[{ measurementId: "G-ABC123XYZ", apiSecret: "s3cret" }]]));
  });

  it("says an over-long API secret in words of its own, and sends nothing", async () => {
    m.overview = null; m.days = [];
    const logged = vi.spyOn(console, "error");
    wrap(<AnalyticsPage />, "/super/analytics?tab=ga");
    fireEvent.change(screen.getByLabelText("Measurement ID"), { target: { value: "G-ABC123XYZ" } });
    fireEvent.change(screen.getByLabelText("Measurement Protocol API secret"), { target: { value: "x".repeat(101) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/The API secret is too long: it has at most 100 characters/);
    expect(m.saveGa).not.toHaveBeenCalled();
    // Refused here, not by the server: nothing is logged as an error for "Report a problem" to carry.
    expect(logged).not.toHaveBeenCalledWith("[staff]", "bad-ga-secret", expect.anything());
    logged.mockRestore();
  });

  it("takes a measurement ID of only spaces as none, as the server does", async () => {
    m.overview = null; m.days = [];
    wrap(<AnalyticsPage />, "/super/analytics?tab=ga");
    fireEvent.change(screen.getByLabelText("Measurement ID"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Measurement Protocol API secret"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.saved).toEqual([[{ measurementId: "", apiSecret: "s3cret" }]]));
  });

  it.each([
    ["bad-ga-secret", /The API secret is too long/],
    ["bad-ga", /A measurement ID looks like G-ABC123XYZ/],
    ["not-super", /Only platform admins can do that/],
  ])("says the server's “%s” refusal in the admin's language", async (reason, words) => {
    m.overview = null; m.days = [];
    m.saveGa.mockRejectedValue(Object.assign(new Error("RAW SERVER WORDS"), { code: "functions/invalid-argument", details: { reason } }));
    wrap(<AnalyticsPage />, "/super/analytics?tab=ga");
    fireEvent.change(screen.getByLabelText("Measurement ID"), { target: { value: "G-ABC123XYZ" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const said = await within(screen.getByRole("tabpanel", { name: "Google Analytics" })).findByRole("status");
    expect(said.textContent).toMatch(words);
    expect(said.textContent).not.toMatch(/RAW SERVER WORDS/);
  });
});

describe("AnalyticsPage, when something fails", () => {
  const denied = () => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });

  it("shows Save as busy while the Google Analytics connection is being saved, and sends it once", async () => {
    m.overview = null; m.days = [];
    let done!: () => void;
    m.saveGa.mockImplementation((...a: unknown[]) => new Promise<void>((r) => { done = () => { m.saved.push(a); r(); }; }));
    wrap(<AnalyticsPage />, "/super/analytics?tab=ga");
    fireEvent.change(screen.getByLabelText("Measurement ID"), { target: { value: "G-ABC123XYZ" } });
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.click(save);
    await waitFor(() => expect(save.getAttribute("aria-busy")).toBe("true"));
    fireEvent.click(save); // a second press while it is saving does nothing
    expect(m.saveGa).toHaveBeenCalledTimes(1);
    done();
    await waitFor(() => expect(save.getAttribute("aria-busy")).toBeNull());
    expect(await screen.findByText(/^Saved. Phones' next batches go to Google Analytics/)).toBeTruthy();
  });

  it("says a failed save in the admin's language, never the SDK's own words", async () => {
    m.overview = null; m.days = [];
    m.saveGa.mockRejectedValue(denied());
    wrap(<AnalyticsPage />, "/super/analytics?tab=ga");
    fireEvent.change(screen.getByLabelText("Measurement ID"), { target: { value: "G-ABC123XYZ" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const said = await within(screen.getByRole("tabpanel", { name: "Google Analytics" })).findByRole("status");
    expect(said.textContent).toMatch(/Your account isn't allowed to do this/);
    expect(said.textContent).not.toMatch(/insufficient permissions/);
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-busy")).toBeNull();
  });

  it("a read that failed says why above the tabs, with Retry that reads again", () => {
    m.overviewErr = denied(); m.days = [];
    wrap(<AnalyticsPage />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/Your account isn't allowed to do this/);
    expect(alert.textContent).not.toMatch(/insufficient permissions/);
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(m.reloads).toHaveBeenCalled();
    expect(screen.getByRole("tablist")).toBeTruthy(); // the page stays: its tabs, Refresh and the other figures
  });

  it("a Refresh the server refused is said in the admin's language", async () => {
    m.overview = null; m.days = [];
    m.refreshStats.mockRejectedValue(Object.assign(new Error("deadline"), { code: "functions/deadline-exceeded" }));
    wrap(<AnalyticsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/This took too long and was stopped/);
  });
});

describe("OrgBranding", () => {
  const org = { id: "o1", name: "Nile School", type: "school", status: "active" as const, createdBy: "u", brand: { logo: "orgs/o1/brand/logo-abcdef.png", v: 2 } };
  it("renames the organization and uploads a new logo under its brand folder", async () => {
    m.auth.orgId = "o1";
    wrap(<OrgBranding org={org} />);
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Nile Academy" } });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "logo.png", { type: "image/png" })] } });
    await screen.findByRole("button", { name: "Remove the logo" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/Saved\./);
    expect(m.uploads).toHaveLength(1);
    expect(m.uploads[0].path).toMatch(/^orgs\/o1\/brand\/logo-[a-z0-9]{6,32}\.png$/);
    expect(m.updates).toEqual([{ path: "orgs/o1", data: { name: "Nile Academy", brand: { logo: m.uploads[0].path, v: 3 } } }]);
  });
  it("refuses a name that is too short", async () => {
    wrap(<OrgBranding org={org} />);
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "N" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The name needs 2 to 80 characters.")).toBeTruthy();
    expect(m.updates).toEqual([]);
  });
});
