// A platform admin's own test of a school's sign-in comes back to the organization's page: the provider's callback
// sends it to /super/orgs/<id>?tab=signin#sso=<ticket>&f=<flow> (functions/src/ssoCore.ts). The page (admin/Analytics.tsx
// OrgAnalytics) has to open that tab and mount the real panel (admin/SsoSetup.tsx through OrgsAdmin's OrgSignIn), which
// takes the fragment and finishes the test with the admin's token. Everything of the page is real here but its reads:
// manageSso and /api/sso/finish are fakes. (The wizard itself: tests/sso-setup.test.tsx.)
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, type Location } from "react-router-dom";
import { webcrypto } from "node:crypto";
import type { SsoState } from "../src/auth/api";

const h = vi.hoisted(() => ({
  manage: vi.fn(),
  org: null as unknown,
  calls: [] as { url: string; body?: Record<string, unknown>; auth?: string | null }[],
  loc: null as unknown as Location,
  useOverview: vi.fn(() => ({ data: null, reload: vi.fn() })),
}));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/firebase-config", () => ({ firebaseReady: true, firebaseConfig: { apiKey: "k", projectId: "p", storageBucket: "b" }, useEmulators: false, functionsRegion: "europe-west1" }));
vi.mock("../src/firebase", () => ({ db: {}, firebaseReady: true, firebaseConfig: { apiKey: "k", projectId: "p", storageBucket: "b" }, call: () => vi.fn(async () => ({})), storage: async () => ({}), storageDataUrl: async () => "data:image/png;base64,AA", storageJSON: async () => null }));
vi.mock("../src/fb", () => ({ loadFirebase: async () => ({}), call: () => async () => ({}), storedSession: async () => null }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "boss", getIdToken: async () => "id-token" }, role: "superadmin", orgId: null }) }));
vi.mock("../src/auth/api", async (orig) => { const real = await orig<typeof import("../src/auth/api")>(); return { ...real, api: { ...real.api, manageSso: h.manage } }; });
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useOverview: h.useOverview,
  useDays: () => ({ data: [], reload: vi.fn() }),
  useOrg: () => ({ data: h.org, reload: vi.fn() }),
  useMembers: () => ({ partial: [], loaded: 0, complete: false, loading: false, refreshing: false, at: 0, reload: vi.fn(), patch: vi.fn(), remove: vi.fn() }),
  useSites: () => ({ data: [], reload: vi.fn() }),
}));
vi.mock("../src/admin/OrgActivity", () => ({ OrgActivity: () => null }));
vi.mock("../src/admin/OrgPolicy", () => ({ OrgPolicy: () => null }));

const { I18nProvider } = await import("../src/i18n");
const { StoreProvider } = await import("../src/state/store");
const { OrgAnalytics } = await import("../src/admin/Analytics");

function Where() { h.loc = useLocation(); return null; }
const page = (at: string, lang = "en") => render(<StoreProvider><I18nProvider lang={lang}><MemoryRouter initialEntries={[at]}>
  <Where />
  <Routes><Route path="/super/orgs/:orgId" element={<OrgAnalytics />} /></Routes>
</MemoryRouter></I18nProvider></StoreProvider>);

const STATE: SsoState = {
  config: null, wip: null, health: null, connected: 0, lastSignIn: null, orgMadeToMatch: 0, ssoOnly: 0,
  callbackUrl: "https://login.darsiai.org/callback/org1", signinUrl: null, switchOn: true, ceiling: { value: null, default: 2000 }, keyOk: true,
  keyCanary: true, signerOk: true,
};
const gets = () => h.manage.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((a) => a.action === "get");

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  h.manage.mockReset(); h.calls = []; h.useOverview.mockClear();
  h.manage.mockImplementation(async (a: Record<string, unknown>) => (a.action === "get" ? STATE : {}));
  h.org = { id: "org1", name: "Nile School", type: "school", status: "active", createdBy: "u" };
  vi.stubGlobal("location", { ...window.location, pathname: "/super/orgs/org1", search: "?tab=signin", hash: "", assign: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    h.calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null });
    return { ok: true, status: 200, json: async () => ({ tested: "create-student", ok: true, promoted: false }) } as Response;
  }));
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("a platform admin's test of a school's sign-in, back on the organization's page", () => {
  it("is finished on the School sign-in tab with the admin's token, and leaves the address", async () => {
    localStorage.setItem("darsi:sso", JSON.stringify({ verifier: "w".repeat(43), flow: "back0001", mode: "test", next: "/super/orgs/org1?tab=signin", at: Date.now() }));
    page("/super/orgs/org1?tab=signin#sso=TK1&f=back0001");
    expect(screen.getByRole("tab", { name: "School sign-in" }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(h.calls.find((c) => c.url === "/api/sso/finish")).toBeTruthy());
    const fin = h.calls.find((c) => c.url === "/api/sso/finish")!;
    expect(fin.auth).toBe("Bearer id-token");
    expect(fin.body).toEqual({ ticket: "TK1", verifier: "w".repeat(43) });
    // The panel read this organization's connection, and again after the test was recorded.
    await waitFor(() => expect(gets().length).toBeGreaterThanOrEqual(2));
    expect(gets().every((a) => a.orgId === "org1")).toBe(true);
    // The return is spent: gone from the address, the admin still on the tab (never thrown back to the figures).
    // (The address is cleared a tick after the panel reads again, so wait for it.)
    await waitFor(() => expect(h.loc.hash).toBe(""));
    expect(h.loc.search).toBe("?tab=signin");
    expect(screen.getByRole("tab", { name: "School sign-in" }).getAttribute("aria-selected")).toBe("true");
    expect(h.useOverview).not.toHaveBeenCalled();
    await waitFor(() => expect(localStorage.getItem("darsi:sso")).toBeNull()); // one use
    // The platform's part is there with the wizard (the ceiling a platform admin sets).
    const panel = within(screen.getByRole("tabpanel", { name: "School sign-in" }));
    expect(await panel.findByLabelText("Most members school sign-in may make")).toBeTruthy();
  });

  it("opens the same tab in Arabic, and reads the connection once when nothing came back", async () => {
    page("/super/orgs/org1?tab=signin", "ar");
    expect(screen.getByRole("tab", { name: "تسجيل الدخول عبر المدرسة" }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(gets()).toHaveLength(1));
    expect(h.calls).toEqual([]);
  });
});
