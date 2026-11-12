import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/i18n";
import { StoreProvider } from "../src/state/store";

// /super/analytics and an organization's page say things in words, not ids, and count revenue net of refunds.
// The organization's page is in tabs: each tab reads its own data when it is first opened, the members included
// (admin/data.ts useMembers, here a fake with its patch and remove), and they are listed once, under People.
const m = vi.hoisted(() => ({
  days: [] as unknown[],
  org: null as unknown,
  orgErr: undefined as unknown,
  orgReload: vi.fn(),
  members: [] as unknown[] | undefined,
  membersErr: undefined as unknown,
  loaded: 0,
  membersReload: vi.fn(),
  patch: vi.fn(),
  remove: vi.fn(),
  useMembers: vi.fn(),
  setUserRole: vi.fn(async (..._a: unknown[]) => ({ ok: true })),
  // What only one tab needs: counted, so a test can say the other tabs never asked for it.
  useOverview: vi.fn(() => ({ data: null, reload: vi.fn() })),
  useDays: vi.fn((..._a: unknown[]) => ({ data: [] as unknown[], reload: vi.fn() })),
  usePlansConfig: vi.fn(() => ({ data: { plans: [], economics: null }, reload: vi.fn() })),
  useSites: vi.fn((..._a: unknown[]) => ({ data: [], reload: vi.fn() })),
  loadCatalog: vi.fn(async () => ({ version: 1, units: [] })),
  storageJSON: vi.fn(async (..._a: unknown[]) => null),
  storageDataUrl: vi.fn(async (..._a: unknown[]) => "data:image/png;base64,AA"),
  ssoMounts: [] as { orgId: string; platform: boolean; search: string; hash: string }[],
}));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/firebase", () => ({ db: {}, firebaseReady: true, call: () => vi.fn(async () => ({ at: "x" })), storage: async () => ({}), storageDataUrl: m.storageDataUrl, storageJSON: m.storageJSON }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "me" }, role: "superadmin", orgId: null }) }));
vi.mock("../src/content/load", async (orig) => ({ ...(await orig<typeof import("../src/content/load")>()), loadCatalog: m.loadCatalog }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useOverview: m.useOverview,
  useDays: m.useDays,
  useActiveDevices: () => ({ data: { d1: 1, d7: 2, d30: 3 }, reload: vi.fn() }),
  usePeople: () => ({ data: [], reload: vi.fn() }),
  useGaConfig: () => ({ data: { measurementId: "", apiSecret: "" }, reload: vi.fn() }),
  useOrg: () => ({ data: m.org, error: m.orgErr, reload: m.orgReload }),
  useMembers: m.useMembers,
  usePlansConfig: m.usePlansConfig,
  useSites: m.useSites,
}));
vi.mock("../src/auth/api", async (orig) => { const real = await orig<typeof import("../src/auth/api")>(); return { ...real, api: { ...real.api, setUserRole: m.setUserRole } }; });
// The two governance panels are another package's (tests/governance-*.test.tsx): here only that they are mounted.
vi.mock("../src/admin/OrgActivity", async () => { const { createElement } = await import("react"); return { OrgActivity: ({ orgId }: { orgId: string }) => createElement("p", null, `activity of ${orgId}`) }; });
vi.mock("../src/admin/OrgPolicy", async () => { const { createElement } = await import("react"); return { OrgPolicy: ({ orgId }: { orgId: string }) => createElement("p", null, `join rules of ${orgId}`) }; });
// School sign-in's own chunk (tests/sso-setup.test.tsx): a stand-in that says what it was given, and keeps what the
// address held each time it mounted (the provider's return is in the fragment, and the real panel takes it on mount).
vi.mock("../src/admin/SsoSetup", async () => {
  const { createElement } = await import("react");
  const { useLocation: where } = await import("react-router-dom");
  return {
    SsoSetup: ({ orgId, platform }: { orgId: string; platform?: boolean }) => {
      const loc = where();
      m.ssoMounts.push({ orgId, platform: platform === true, search: loc.search, hash: loc.hash });
      return createElement("p", null, `school sign-in of ${orgId}${platform ? " for a platform admin" : ""}`);
    },
  };
});

const { AnalyticsPage, OrgAnalytics } = await import("../src/admin/Analytics");

// `at`: the address the page opens at (its tab is ?tab=…).
const wrap = (ui: ReactNode, lang = "en", at = "/super/analytics") => render(<StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={[at]}>{ui}</MemoryRouter></I18nProvider></StoreProvider>);
const open = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

beforeEach(() => {
  vi.clearAllMocks();
  m.members = []; m.membersErr = undefined; m.orgErr = undefined; m.loaded = 0; m.ssoMounts = [];
  // The member list as admin/data.ts gives it: `data` only once it is whole. Asked for nobody (null): nothing.
  m.useMembers.mockImplementation((orgId: unknown) => (orgId
    ? { data: m.membersErr ? undefined : m.members, partial: m.members ?? [], loaded: m.members?.length ?? m.loaded, complete: !!m.members, loading: !m.members && !m.membersErr, refreshing: false, error: m.membersErr, at: 0, reload: m.membersReload, patch: m.patch, remove: m.remove }
    : { partial: [], loaded: 0, complete: false, loading: false, refreshing: false, at: 0, reload: m.membersReload, patch: m.patch, remove: m.remove }));
  m.useDays.mockImplementation(() => ({ data: m.days, reload: vi.fn() }));
});
const today = new Date().toISOString().slice(0, 10);
const day = { day: today, n: 10, sessions: { n: 6, lang: { ar: 4, en: 2 } }, screens: { learn: 9, lab: 2, labs: 3, signin: 1, someday: 1 },
  revenue: { EGP: { value: 1000, n: 2 } }, refunds: { EGP: { value: 300, n: 1 } } };

describe("platform analytics", () => {
  it("counts revenue net of refunds", () => {
    m.days = [day];
    wrap(<AnalyticsPage />);
    expect(screen.getByText("Net revenue (30 days)")).toBeTruthy();
    expect(screen.getByText(/EGP\s*700/)).toBeTruthy();
    expect(screen.getByText("Purchases: 2, refunds: 1 (taken off)")).toBeTruthy();
  });

  it("names languages and screens instead of showing their codes", () => {
    m.days = [day];
    wrap(<AnalyticsPage />, "en", "/super/analytics?tab=audience");
    expect(screen.getByText("Arabic")).toBeTruthy();
    expect(screen.getByText("English")).toBeTruthy();
    expect(screen.getAllByText("Learn").length).toBeGreaterThan(0);
    // /lab and /labs are one screen.
    expect(screen.getAllByText("Labs")).toHaveLength(1);
    expect(screen.getByText("Sign in")).toBeTruthy();
    expect(screen.getByText("someday")).toBeTruthy(); // a screen without a name keeps its id
    expect(screen.queryByText("signin")).toBeNull();
  });

  it("names languages in Arabic on an Arabic page", () => {
    m.days = [day];
    wrap(<AnalyticsPage />, "ar", "/super/analytics?tab=audience");
    expect(screen.getByText("العربية")).toBeTruthy();
    expect(screen.queryByText("ar")).toBeNull();
  });

  it("names its tabs in Arabic, with the open one marked", () => {
    m.days = [day];
    wrap(<AnalyticsPage />, "ar", "/super/analytics?tab=audience");
    expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual(["نظرة عامة", "التعلّم", "الجمهور", "المؤسسات", "الأشخاص", "Google Analytics"]);
    expect(screen.getByRole("tab", { name: "الجمهور" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("an organization's page", () => {
  const Where = () => <p data-testid="at">{useLocation().pathname}</p>;
  const hope = { id: "o1", name: "Hope NGO", type: "company", status: "active", createdBy: "u" };
  const sara = { uid: "s1", name: "Sara", email: "sara@users.darsi.app", role: "student", orgId: "o1" };
  const tabNames = () => screen.getAllByRole("tab").map((x) => x.textContent);
  const page = (entries: Array<string | { pathname: string; state: unknown }>, lang = "en") => render(<StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
    <Routes>
      <Route path="/super/orgs/:orgId" element={<OrgAnalytics />} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter></I18nProvider></StoreProvider>);

  it("says the organization's type in words", () => {
    m.org = { id: "o1", name: "Hope NGO", type: "ngo", status: "active", createdBy: "u", city: "Cairo", country: "Egypt" };
    page(["/super/orgs/o1"]);
    expect(screen.getByText(/^NGO.+Cairo.+Egypt$/)).toBeTruthy(); // the subtitle under the name
    expect(screen.queryByText(/^ngo/)).toBeNull();
  });

  it("goes back to Analytics when opened from there", () => {
    m.org = { id: "o1", name: "Hope NGO", type: "company", status: "active", createdBy: "u" };
    page(["/super/analytics", { pathname: "/super/orgs/o1", state: { back: "/super/analytics" } }]);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("at").textContent).toBe("/super/analytics");
  });

  it("still goes back to Analytics after a look at other tabs", () => {
    m.org = hope;
    page(["/super/analytics", { pathname: "/super/orgs/o1", state: { back: "/super/analytics" } }]);
    open("People");
    expect(screen.getByRole("tabpanel", { name: "People" })).toBeTruthy();
    open("Status");
    expect(screen.getByRole("heading", { name: "Delete this organization" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("at").textContent).toBe("/super/analytics");
  });

  it("goes to the organizations from anywhere else, never round to the page before (the report's Back comes here)", () => {
    m.org = { id: "o1", name: "Hope NGO", type: "company", status: "active", createdBy: "u" };
    page(["/super/orgs/o1/report", "/super/orgs/o1"]);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("at").textContent).toBe("/super/orgs");
  });

  it("goes back to the organizations when opened directly", () => {
    m.org = { id: "o1", name: "Hope NGO", type: "company", status: "active", createdBy: "u" };
    page(["/super/orgs/o1"]);
    expect(screen.getByText("Company", { selector: "small" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("at").textContent).toBe("/super/orgs");
  });

  it("has its sections as tabs, and opens on the figures", () => {
    m.org = { ...hope, memberCount: 37 };
    page(["/super/orgs/o1"]);
    expect(tabNames()).toEqual(["Overview", "People", "Courses", "Darsi Super", "Invite", "School sign-in", "Settings", "Records", "Status"]);
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Full learning report" })).toBeTruthy();
    expect(screen.getByText("Lessons in the last 30 days")).toBeTruthy();
    // The members tile is the organization's own count until the platform's figures have it: no member is read for it.
    expect(screen.getByText("Members").closest(".tile")!.querySelector("strong")!.textContent).toBe("37");
    // Nothing of the other tabs is on the page yet.
    expect(screen.queryByText("Add a person")).toBeNull();
    expect(screen.queryByText("Delete this organization")).toBeNull();
    // An active organization has nothing to say above its tabs.
    expect(screen.queryByText("This organization is suspended.")).toBeNull();
    expect(screen.queryByText("Deletion in progress")).toBeNull();
  });

  it("reads the members only once a tab that lists them is opened, and keeps them from then on", () => {
    m.org = hope;
    m.members = [sara];
    page(["/super/orgs/o1"]);
    expect(m.useMembers).toHaveBeenCalled();
    expect(m.useMembers.mock.calls.every((c) => c[0] === null)).toBe(true); // asked for nobody's members yet
    open("Settings"); open("Records"); open("Status");
    expect(m.useMembers.mock.calls.every((c) => c[0] === null)).toBe(true);
    open("People");
    expect(m.useMembers).toHaveBeenLastCalledWith("o1");
    open("Overview");
    expect(m.useMembers).toHaveBeenLastCalledWith("o1"); // not dropped again: the list under People stays as it is
  });

  it("reads the plans, the web addresses, the logo and the catalogs only when their tab is opened", async () => {
    m.org = { ...hope, brand: { logo: "orgs/o1/brand/logo-abcdef.png", v: 1 } };
    page(["/super/orgs/o1"]);
    expect(m.useOverview).toHaveBeenCalled(); // the Overview tab's own figures
    expect(m.usePlansConfig).not.toHaveBeenCalled();
    expect(m.useSites).not.toHaveBeenCalled();
    expect(m.storageDataUrl).not.toHaveBeenCalled();
    expect(m.loadCatalog).not.toHaveBeenCalled();
    expect(m.storageJSON).not.toHaveBeenCalled();
    open("Darsi Super");
    expect(m.usePlansConfig).toHaveBeenCalled();
    expect(m.useSites).not.toHaveBeenCalled();
    open("Settings");
    expect(m.useSites).toHaveBeenCalledWith("o1");
    await waitFor(() => expect(m.storageDataUrl).toHaveBeenCalledWith("orgs/o1/brand/logo-abcdef.png"));
    expect(screen.getByRole("link", { name: /Manage/ }).getAttribute("href")).toBe("/super/domains?org=o1");
    expect(m.loadCatalog).not.toHaveBeenCalled();
    open("Courses");
    await waitFor(() => expect(m.loadCatalog).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(m.storageJSON).toHaveBeenCalledWith("orgs/o1/catalog.json"));
  });

  it("opened at another tab, never reads the Overview tab's figures", () => {
    m.org = hope;
    page(["/super/orgs/o1?tab=people"]);
    expect(screen.getByRole("heading", { name: "Add a person" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Members" })).toBeTruthy();
    expect(m.useOverview).not.toHaveBeenCalled();
    expect(m.useDays).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Full learning report" })).toBeNull();
  });

  it("lists the members once, under People, each with a link, a role and Remove", () => {
    m.org = hope;
    m.members = [sara];
    page(["/super/orgs/o1?tab=people"]);
    expect(screen.getByRole("link", { name: /Sara/ }).getAttribute("href")).toBe("/super/people/s1");
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
    expect((screen.getByRole("link", { name: /Sara/ }).closest("tr")!.querySelector("select") as HTMLSelectElement).value).toBe("student");
    // One list on the page: no second table of the same people under another tab.
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getAllByText("Sara")).toHaveLength(1);
    expect(tabNames()).not.toContain("Members & roles");
  });

  it("after a role change or a removal, mends the list it holds instead of reading every member again", async () => {
    m.org = hope;
    m.members = [{ uid: "a1", name: "Amina", email: "a1@users.darsi.app", role: "orgAdmin", orgId: "o1" }, sara];
    page(["/super/orgs/o1?tab=people"]);
    const row = () => screen.getByRole("link", { name: /Sara/ }).closest("tr")!;
    fireEvent.change(row().querySelector("select")!, { target: { value: "teacher" } });
    // Every change of role is asked first (tests/org-manage.test.tsx).
    expect(m.setUserRole).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Change the role" }));
    await waitFor(() => expect(m.setUserRole).toHaveBeenCalledWith({ uid: "s1", role: "teacher", orgId: "o1" }));
    await waitFor(() => expect(m.patch).toHaveBeenCalledWith("s1", { role: "teacher" }));
    fireEvent.click(within(row()).getByRole("button", { name: "Remove" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(m.setUserRole).toHaveBeenCalledWith({ uid: "s1", role: "learner" }));
    await waitFor(() => expect(m.remove).toHaveBeenCalledWith("s1"));
    expect(m.membersReload).not.toHaveBeenCalled();
    expect(m.orgReload).not.toHaveBeenCalled();
  });

  it("says how many members have loaded while a long list arrives, never \"No people yet\"", () => {
    m.org = hope;
    m.members = undefined;
    m.loaded = 3000;
    page(["/super/orgs/o1?tab=people"]);
    expect(within(screen.getByRole("tabpanel", { name: "People" })).getByRole("status").textContent).toBe("People loaded so far: 3,000");
    expect(screen.queryByText("No people yet")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("heading", { name: "Add a person" })).toBeTruthy(); // adding someone does not wait for the list
  });

  it("members that could not be read say why with Retry, never \"No people yet\"", () => {
    m.org = hope;
    m.members = undefined;
    m.membersErr = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    page(["/super/orgs/o1?tab=people"]);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/Your account isn't allowed to do this/);
    expect(screen.queryByText("No people yet")).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(m.membersReload).toHaveBeenCalled();
    // The seats wait for the members too: the same reason there, not an empty list.
    open("Darsi Super");
    expect(within(screen.getByRole("tabpanel", { name: "Darsi Super" })).getByRole("alert").textContent).toMatch(/Your account isn't allowed to do this/);
  });

  it("has Settings hold the details, the look and the web addresses", () => {
    m.org = hope;
    page(["/super/orgs/o1?tab=settings"]);
    const heads = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(heads[0]).toBe("Details");
    expect(heads.length).toBe(3);
    expect(screen.queryByText("Add a person")).toBeNull();
    expect(screen.queryByText("Delete this organization")).toBeNull();
  });

  it("has who can join under Invite, taken off the page when another tab opens (its leave guard asks inside it)", () => {
    m.org = hope;
    page(["/super/orgs/o1?tab=join"]);
    expect(within(screen.getByRole("tabpanel", { name: "Invite" })).getByText("join rules of o1")).toBeTruthy();
    open("Overview");
    expect(screen.queryByText("join rules of o1")).toBeNull();
  });

  it("has Records hold what was done in it and its data as files", () => {
    m.org = hope;
    page(["/super/orgs/o1?tab=records"]);
    const panel = within(screen.getByRole("tabpanel", { name: "Records" }));
    expect(panel.getByText("activity of o1")).toBeTruthy();
    expect(panel.getByRole("heading", { name: "Export this organization's data" })).toBeTruthy();
    expect(panel.getByRole("button", { name: "Export the data" })).toBeTruthy();
  });

  it("has Status hold suspending it and, last, deleting it", () => {
    m.org = hope;
    page(["/super/orgs/o1?tab=status"]);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Status", "Delete this organization"]);
    expect(screen.getByRole("button", { name: "Suspend" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Delete organization" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says a suspended organization is suspended on every tab, with the way to Status", () => {
    m.org = { ...hope, status: "suspended", suspended: { reason: "Contract ended" } };
    page(["/super/orgs/o1"]);
    expect(screen.getByText("This organization is suspended.")).toBeTruthy();
    const go = screen.getByRole("link", { name: "Open Status" });
    expect(go.getAttribute("href")).toBe("/super/orgs/o1?tab=status");
    fireEvent.click(go);
    expect(screen.getByRole("tab", { name: "Status" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open Status" })).toBeNull(); // already there
    // Its members keep learning and its settings stay reachable: every tab is still offered.
    expect(tabNames()).toHaveLength(9);
  });

  it("still goes back to Analytics after following a notice's link to Status", () => {
    m.org = { ...hope, status: "suspended", suspended: { reason: "Contract ended" } };
    page(["/super/analytics", { pathname: "/super/orgs/o1", state: { back: "/super/analytics" } }]);
    fireEvent.click(screen.getByRole("link", { name: "Open Status" }));
    expect(screen.getByRole("tab", { name: "Status" }).getAttribute("aria-selected")).toBe("true");
    // The link passes on where the admin came from, as choosing a tab does.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("at").textContent).toBe("/super/analytics");
  });

  it("offers an organization that is being deleted only its people, its records and the deletion to continue", () => {
    m.org = { ...hope, status: "deleting", deletingMembers: "release", deletingReleased: 40 };
    m.members = [sara];
    page(["/super/orgs/o1"]);
    expect(tabNames()).toEqual(["Overview", "People", "Records", "Status"]);
    expect(screen.getByText("Deletion in progress")).toBeTruthy();
    const go = screen.getByRole("link", { name: "Continue the deletion" });
    expect(go.getAttribute("href")).toBe("/super/orgs/o1?tab=status");
    fireEvent.click(go);
    const status = within(screen.getByRole("tabpanel", { name: "Status" }));
    expect(status.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(status.getByRole("status").textContent).toBe("People handled so far: 40");
    expect(status.queryByRole("button", { name: "Suspend" })).toBeNull();
    expect(status.queryByRole("button", { name: "Delete organization" })).toBeNull();
    // Its people can be looked at, not changed (the server refuses while it is being deleted).
    open("People");
    const people = within(screen.getByRole("tabpanel", { name: "People" }));
    expect(people.getByRole("link", { name: /Sara/ })).toBeTruthy();
    expect(people.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(people.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("Add a person")).toBeNull();
  });

  it("offers only the figures and the people for an organization that isn't there", () => {
    m.org = null;
    m.members = Array.from({ length: 130 }, (_, i) => ({ uid: `u${i}`, name: `Person ${String(i).padStart(3, "0")}`, email: `u${i}@users.darsi.app`, role: "student", orgId: "gone" }));
    page(["/super/orgs/gone?tab=settings"]);
    expect(tabNames()).toEqual(["Overview", "People"]);
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    // Whoever still names it: to look at, 100 rows at a time.
    open("People");
    const people = within(screen.getByRole("tabpanel", { name: "People" }));
    expect(people.getAllByRole("row")).toHaveLength(101);
    expect(people.queryByRole("button", { name: "Remove" })).toBeNull();
    fireEvent.click(people.getByRole("button", { name: "Show 100 more" }));
    expect(people.getAllByRole("row")).toHaveLength(131);
    expect(people.queryByRole("button", { name: "Show 100 more" })).toBeNull();
  });

  it("has the organization's school sign-in on a tab of its own, loaded only when it is opened", async () => {
    m.org = hope;
    page(["/super/orgs/o1"]);
    open("Settings"); open("Status");
    expect(m.ssoMounts).toEqual([]);
    open("School sign-in");
    expect(screen.getByRole("tab", { name: "School sign-in" }).getAttribute("href")).toBe("/super/orgs/o1?tab=signin");
    // The panel its own admins have, with the platform's part (the ceiling, the keys).
    expect(await screen.findByText("school sign-in of o1 for a platform admin")).toBeTruthy();
    expect(within(screen.getByRole("tabpanel", { name: "School sign-in" })).getByText("school sign-in of o1 for a platform admin")).toBeTruthy();
    // Kept behind another tab, hidden and not rendered again: what was typed in its wizard (a client secret, the
    // teachers' addresses) is only on the page, and a look at People must not lose it. Returning reads nothing again.
    const panel = screen.getByText("school sign-in of o1 for a platform admin");
    open("People");
    expect(screen.getByRole("tab", { name: "People" }).getAttribute("aria-selected")).toBe("true");
    expect(panel.isConnected).toBe(true);
    expect(panel.closest("[role=tabpanel]")?.hasAttribute("hidden")).toBe(true);
    open("School sign-in");
    // The same element: shown again, not made again (a new mount would start the wizard from what the server kept).
    expect(screen.getByText("school sign-in of o1 for a platform admin")).toBe(panel);
    expect(panel.closest("[role=tabpanel]")?.hasAttribute("hidden")).toBe(false);
  });

  it("takes a platform admin's test of the school's sign-in where the provider sends it back: ?tab=signin#sso=…", async () => {
    m.org = hope;
    page(["/super/orgs/o1?tab=signin#sso=TICKET&f=FLOW"]);
    expect(screen.getByRole("tab", { name: "School sign-in" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("school sign-in of o1 for a platform admin")).toBeTruthy();
    // The panel that finishes the test is on the screen, for this organization, with the return still in the address:
    // nothing on the way (the page, its tabs) took the fragment or sent the admin to another tab.
    expect(m.ssoMounts[0]).toEqual({ orgId: "o1", platform: true, search: "?tab=signin", hash: "#sso=TICKET&f=FLOW" });
    expect(m.useOverview).not.toHaveBeenCalled(); // the Overview tab was never opened on the way
  });

  it("waits for the organization with a return in the address, then hands it to the panel", async () => {
    m.org = undefined;
    // The same tree each time: the router keeps its address over a re-render.
    const tree = () => <StoreProvider><I18nProvider lang="en"><MemoryRouter initialEntries={["/super/orgs/o1?tab=signin#sso=TICKET&f=FLOW"]}>
      <Routes><Route path="/super/orgs/:orgId" element={<OrgAnalytics />} /></Routes>
    </MemoryRouter></I18nProvider></StoreProvider>;
    const view = render(tree());
    // Not read yet: the tab is the open one (never the default), and says so.
    expect(screen.getByRole("tab", { name: "School sign-in" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "School sign-in" }).textContent).toBe("Loading…");
    expect(m.ssoMounts).toEqual([]);
    m.org = hope;
    view.rerender(tree());
    expect(await screen.findByText("school sign-in of o1 for a platform admin")).toBeTruthy();
    expect(m.ssoMounts[0]).toEqual({ orgId: "o1", platform: true, search: "?tab=signin", hash: "#sso=TICKET&f=FLOW" });
  });

  it("has no school sign-in tab for an organization that is gone or being deleted: its address opens the figures", () => {
    m.org = { ...hope, status: "deleting", deletingMembers: "release" };
    const first = page(["/super/orgs/o1?tab=signin#sso=TICKET&f=FLOW"]);
    expect(tabNames()).not.toContain("School sign-in");
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    first.unmount();
    m.org = null;
    page(["/super/orgs/gone?tab=signin"]);
    expect(tabNames()).toEqual(["Overview", "People"]);
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    expect(m.ssoMounts).toEqual([]);
  });

  it("says Loading in a tab opened by its link before the organization is read", () => {
    m.org = undefined;
    page(["/super/orgs/o1?tab=settings"]);
    expect(screen.getByRole("tab", { name: "Settings" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Settings" }).textContent).toBe("Loading…");
  });

  it("an organization that could not be read keeps the way back, says why and offers Retry", () => {
    m.org = undefined;
    m.orgErr = Object.assign(new Error("Failed to get document because the client is offline."), { code: "unavailable" });
    page(["/super/analytics", { pathname: "/super/orgs/o1", state: { back: "/super/analytics" } }]);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/The service can't be reached right now/);
    expect(alert.textContent).not.toMatch(/client is offline/); // never the SDK's own English
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(m.orgReload).toHaveBeenCalled();
    expect(screen.queryByRole("tablist")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("at").textContent).toBe("/super/analytics");
  });

  it("names its tabs and its notices in Arabic", () => {
    m.org = { ...hope, status: "suspended" };
    page(["/super/orgs/o1"], "ar");
    expect(tabNames()).toEqual(["نظرة عامة", "الأشخاص", "الدورات", "درسي سوبر", "الدعوة", "تسجيل الدخول عبر المدرسة", "الإعدادات", "السجلات", "الحالة"]);
    expect(screen.getByText("هذه المؤسسة موقوفة.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "افتح الحالة" })).toBeTruthy();
  });

  it("holds a tab while Courses has unsaved choices, asks in the panel, and drops them only on Leave", async () => {
    m.org = hope;
    page(["/super/orgs/o1?tab=courses"]);
    fireEvent.click(await screen.findByText("Choose which courses each group sees"));
    await waitFor(() => expect(screen.getByText("Changes not saved")).toBeTruthy());
    // The tab is a link: the panel's leave guard holds it and asks where the admin is looking.
    open("People");
    expect(screen.getByRole("tab", { name: "Courses" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Courses" }).textContent).toMatch(/Leave without saving\?/);
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.getByRole("tab", { name: "Courses" }).getAttribute("aria-selected")).toBe("true");
    open("People");
    fireEvent.click(screen.getByRole("button", { name: "Leave without saving" }));
    expect(screen.getByRole("tab", { name: "People" }).getAttribute("aria-selected")).toBe("true");
    // Not kept while hidden: nothing is left behind to hold the next click with a question nobody sees.
    expect(screen.queryByText("Changes not saved")).toBeNull();
    open("Courses");
    expect(await screen.findByText("All saved")).toBeTruthy();
    open("Overview");
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
  });
});
