// A platform admin's switch turns Darsi Super off for everyone: phones read it from content/settings.json and hide
// Super (the tutor button, the Me card, anything for sale), and remember it for the next start.
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const m = vi.hoisted(() => ({ settings: null as unknown }));
vi.mock("../src/content/load", async (orig) => ({ ...(await orig<typeof import("../src/content/load")>()), loadSettings: async () => m.settings, forgetSettings: () => {} }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "u1" }, plan: { id: "super", until: Date.now() + 864e5 }, profile: null, role: "learner", refreshClaims: async () => {} }) }));

const { I18nProvider } = await import("../src/i18n");
const { SettingsProvider, useSuperOn } = await import("../src/content/settings");
const { Upgrade } = await import("../src/upgrade/Upgrade");
await import("../src/upgrade/strings");

function Probe() { return <p>{useSuperOn().on ? "super on" : "super off"}</p>; }
const app = (child = <Probe />) => <I18nProvider lang="en"><SettingsProvider lang="en"><MemoryRouter>{child}</MemoryRouter></SettingsProvider></I18nProvider>;

describe("Darsi Super on or off for everyone", () => {
  beforeEach(() => localStorage.clear());

  it("is on when the settings don't say otherwise", async () => {
    m.settings = { version: 1, tracks: [] };
    render(app());
    await waitFor(() => expect(screen.getByText("super on")).toBeTruthy());
  });

  it("follows the settings and remembers off for the next start", async () => {
    m.settings = { version: 2, tracks: [], super: false };
    const { unmount } = render(app());
    await waitFor(() => expect(screen.getByText("super off")).toBeTruthy());
    unmount();
    m.settings = null; // offline next time: the remembered value, with no flash of Super
    render(app());
    expect(screen.getByText("super off")).toBeTruthy();
  });

  it("the Super page sells nothing while it's off", () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ plans: [{ id: "super", name: { en: "Super" }, kind: "individual", period: "month", prices: { USD: 5, EGP: 200 }, credits: 300 }] })));
    vi.stubGlobal("fetch", fetchSpy);
    render(app(<Upgrade plansUrl="/plans.json" startCheckout={vi.fn()} superOn={false} />));
    expect(screen.getByText(/Darsi Super isn't available right now/)).toBeTruthy();
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByRole("button", { name: /Paymob|Stripe/ })).toBeNull();
    // Only the notice: no pitch above it, and the plans aren't even read.
    expect(screen.queryByText(/Super adds a live tutor/)).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("main").children).toHaveLength(1);
    expect(JSON.stringify(fetchSpy.mock.calls)).not.toContain("plans.json");
    vi.unstubAllGlobals();
  });
});
