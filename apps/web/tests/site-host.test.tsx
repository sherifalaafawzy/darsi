// The real App on an organization's own web address without Darsi's identity (TECHNICAL.md "Organization sites"):
// a visitor sees the organization's name and logo on the landing page, the account screens and onboarding's welcome,
// in the window title, and no Darsi name or mark anywhere; and a guest still never loads the Firebase SDK.
// The host is stood in for with ?site= (state/site.ts siteHost: this machine only), set before the App is imported.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  stored: {} as Record<string, unknown>,
  loadFirebase: vi.fn(async () => ({ auth: {}, db: {} })),
  sites: { v: 1, sites: { "cis.darsiai.org": { orgId: "o1", name: "CIS Training Platform", logo: null, darsi: false } } },
  auth: { user: null, profile: null, role: "learner", orgId: null, plan: null, loading: false, offlineUid: null, configured: true,
    ensureFirebase: async () => {}, refreshClaims: async () => {}, updateProfile: async () => {}, signOut: async () => {} } as Record<string, unknown>,
}));
vi.mock("../src/auth/AuthProvider", () => ({ AuthProvider: ({ children }: { children: unknown }) => children, useAuth: () => h.auth, createLearnerProfile: vi.fn(), KEPT_KEY: "darsi:keptOnDevice" }));
vi.mock("../src/platform", async (orig) => ({
  ...(await orig<typeof import("../src/platform")>()),
  storage: { get: async (k: string) => h.stored[k], set: async (k: string, v: unknown) => { h.stored[k] = v; }, remove: async (k: string) => { delete h.stored[k]; } },
}));
vi.mock("../src/fb", () => ({ loadFirebase: h.loadFirebase, call: () => async () => ({}), storedSession: async () => null }));
vi.mock("../src/analytics/track", async (orig) => ({ ...(await orig<typeof import("../src/analytics/track")>()), track: () => {} }));
vi.mock("../src/state/sync", () => ({ useCloudSync: () => {}, useLearningSync: () => {} }));
vi.mock("../src/state/orgBrand", () => ({ useOrgBrand: () => {} }));
vi.mock("../src/analytics/useAnalytics", () => ({ useAnalytics: () => {} }));
vi.mock("../src/notify/usePushRefresh", () => ({ usePushRefresh: () => {} }));
vi.mock("../src/tour/Start", () => ({ AppTour: () => null, openTour: () => {}, OPEN_TOUR: "darsi:tour" }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null, forgetSettings: () => {}, loadCatalog: async () => ({ version: 1, units: [] }),
  loadSitesFile: async () => h.sites,
}));

history.replaceState(null, "", "/?site=cis.darsiai.org");
const { App } = await import("../src/App");

const darsiText = () => /Darsi|درسي/.test(document.body.textContent ?? "");

describe("an organization's web address without Darsi's identity", () => {
  afterEach(() => { cleanup(); });

  it("shows the organization to a visitor on the landing page, in the title and in onboarding, and never loads Firebase for a guest", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "CIS Training Platform" })).toBeTruthy();
    expect(darsiText()).toBe(false);
    expect(document.querySelector(".dr-mark")).toBeNull();
    await waitFor(() => expect(document.title).toBe("CIS Training Platform"));
    // A guest's onboarding welcomes them with the organization's name.
    fireEvent.click(screen.getByRole("button", { name: "Continue without an account" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Choose your language" })).toBeTruthy();
    expect(document.querySelector(".onb-hero strong")?.textContent).toBe("CIS Training Platform");
    expect(document.querySelector(".onb-hero .dr-brand-initial")?.textContent).toBe("C");
    expect(document.querySelector(".dr-mark")).toBeNull();
    expect(darsiText()).toBe(false);
    expect(h.loadFirebase).not.toHaveBeenCalled();
  });

  it("shows its logo (its first letter, without one) and name on the account screens", async () => {
    history.replaceState(null, "", "/signin");
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome back" })).toBeTruthy();
    expect(document.querySelector(".auth-org")?.textContent).toBe("CIS Training Platform");
    expect(document.querySelector(".auth-brand .dr-brand-initial")?.textContent).toBe("C");
    expect(screen.getByRole("link", { name: /CIS Training Platform/ })).toBeTruthy();
    expect(document.querySelector(".dr-mark")).toBeNull();
    expect(darsiText()).toBe(false);
  });
});
