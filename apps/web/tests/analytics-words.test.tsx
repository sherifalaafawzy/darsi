import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/i18n";
import { StoreProvider } from "../src/state/store";

// /super/analytics and an organization's page say things in words, not ids, and count revenue net of refunds.
const m = vi.hoisted(() => ({
  days: [] as unknown[],
  org: null as unknown,
}));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/firebase", () => ({ db: {}, firebaseReady: true, call: () => vi.fn(async () => ({ at: "x" })), storage: async () => ({}), storageDataUrl: async () => "data:image/png;base64,AA" }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "me" }, role: "superadmin", orgId: null }) }));
vi.mock("../src/content/load", async (orig) => ({ ...(await orig<typeof import("../src/content/load")>()), loadCatalog: async () => ({ version: 1, units: [] }) }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useOverview: () => ({ data: null, reload: vi.fn() }),
  useDays: () => ({ data: m.days, reload: vi.fn() }),
  useActiveDevices: () => ({ data: { d1: 1, d7: 2, d30: 3 }, reload: vi.fn() }),
  usePeople: () => ({ data: [], reload: vi.fn() }),
  useGaConfig: () => ({ data: { measurementId: "", apiSecret: "" }, reload: vi.fn() }),
  useOrg: () => ({ data: m.org, reload: vi.fn() }),
  useMembers: () => ({ data: [], reload: vi.fn() }),
}));

const { AnalyticsPage, OrgAnalytics } = await import("../src/admin/Analytics");

const wrap = (ui: ReactNode, lang = "en") => render(<StoreProvider><I18nProvider lang={lang}><MemoryRouter>{ui}</MemoryRouter></I18nProvider></StoreProvider>);
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
    wrap(<AnalyticsPage />);
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
    wrap(<AnalyticsPage />, "ar");
    expect(screen.getByText("العربية")).toBeTruthy();
    expect(screen.queryByText("ar")).toBeNull();
  });
});

describe("an organization's page", () => {
  const Where = () => <p data-testid="at">{useLocation().pathname}</p>;
  const page = (entries: Array<string | { pathname: string; state: unknown }>) => render(<StoreProvider><I18nProvider lang="en"><MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
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
});
