// Darsi Super's money screens (functions/src/billing.ts, payments.ts): the Super page offers Cancel renewal instead of
// a second card subscription and Renew for Paymob (sfm-05), and fills an org admin's seats from their licence
// (sfm-01); a platform admin's empty Days or Seats field never takes Super back or removes a licence, and both of those
// ask first (ux-superadmin-grant-zero-revokes).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { Org, Profile } from "../src/auth/types";

const m = vi.hoisted(() => ({
  auth: { user: { uid: "u1" }, plan: null as { id: string; until: number } | null, profile: null as Record<string, unknown> | null, role: "learner", refreshClaims: async () => {} },
  sub: null as Record<string, unknown> | null,
  api: { grantSuper: vi.fn(async () => ({ ok: true })), grantCredits: vi.fn(async () => ({ ok: true })), setOrgLicence: vi.fn(async () => ({ ok: true })), fillSeats: vi.fn(), setSeat: vi.fn(), savePlans: vi.fn(async () => ({ rev: 2 })) },
  // config/plans as /super/plans saved it: a plan for one person and a seat.
  plansCfg: { plans: [
    { id: "super_monthly", kind: "individual", period: "month", name: { en: "Super monthly", ar: "سوبر شهري" }, prices: { EGP: 149 }, credits: 300, active: true },
    { id: "super_seat", kind: "seat", period: "year", name: { en: "Seat", ar: "مقعد" }, prices: { EGP: 600 }, credits: 300, active: true },
  ], economics: { usdPerCredit: 0.002, egpPerUsd: 50 } },
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: {}, functions: {}, firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useSubscription: () => ({ data: m.sub, reload: () => {} }),
  useCredits: () => ({ data: { plan: 100, planUntil: Date.now() + 864e5, packs: 0 }, reload: () => {} }),
  usePlansConfig: () => ({ data: m.plansCfg, reload: () => {} }),
}));
// The plans page's capstone settings read Firestore themselves; they have their own tests (capstone*).
vi.mock("../src/admin/CapstoneSettings", () => ({ CapstoneSettings: () => null }));

const { I18nProvider } = await import("../src/i18n");
const { Upgrade } = await import("../src/upgrade/Upgrade");
const { SuperGrantPanel, LicencePanel, SeatsPanel } = await import("../src/admin/Super");
const { PlansPage } = await import("../src/admin/Plans");
await import("../src/upgrade/strings");

const DAY = 864e5;
const wrap = (ui: ReactNode, url = "/upgrade", lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter></I18nProvider>);
const plans = { plans: [
  { id: "super", name: { en: "Super monthly", ar: "سوبر" }, kind: "individual", period: "month", prices: { USD: 5, EGP: 200 }, credits: 300 },
  { id: "super_seat", name: { en: "Seat", ar: "مقعد" }, kind: "seat", period: "year", prices: { USD: 20, EGP: 600 }, credits: 300 },
] };
const currency = (c: "EGP" | "USD") => fireEvent.click(screen.getByRole("button", { name: c }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(plans))));
  m.auth = { user: { uid: "u1" }, plan: { id: "super", until: Date.now() + 20 * DAY }, profile: null, role: "learner", refreshClaims: async () => {} };
  for (const f of Object.values(m.api)) f.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("the Super page (sfm-05)", () => {
  it("offers Cancel renewal instead of a second card subscription, then Turn renewal back on", async () => {
    m.auth.profile = { planSource: "subscription", planRenewal: "on" };
    const setRenewal = vi.fn(async ({ renew }: { renew: boolean }) => ({ renewal: renew ? "on" as const : "off" as const, until: Date.now() + 20 * DAY }));
    wrap(<Upgrade plansUrl="/plans.json" startCheckout={vi.fn()} setRenewal={setRenewal} />);
    await screen.findByText("Super monthly");
    expect(screen.getByText(/renews by itself/)).toBeTruthy();
    for (const c of ["EGP", "USD"] as const) { currency(c); expect(screen.queryByRole("button", { name: /Pay|Renew with/ })).toBeNull(); }
    fireEvent.click(screen.getByRole("button", { name: "Cancel renewal" }));
    await screen.findByText(/Renewal cancelled. Super stays until/);
    expect(setRenewal).toHaveBeenCalledWith({ renew: false });
    expect(screen.getByText(/won't renew/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn renewal back on" }));
    await screen.findByText("Renewal is on again.");
    expect(setRenewal).toHaveBeenLastCalledWith({ renew: true });
  });

  it("labels a Paymob payment Renew while Super runs, and says when the new period starts", async () => {
    m.auth.profile = { planSource: "subscription", planRenewal: null };
    wrap(<Upgrade plansUrl="/plans.json" startCheckout={vi.fn()} />);
    await screen.findByText("Super monthly");
    currency("EGP");
    expect(screen.getByRole("button", { name: /Renew with Paymob/ })).toBeTruthy();
    expect(screen.getByText(/adds a period after/)).toBeTruthy();
    // By card too, the new period starts when this one ends (billingCore.paymentEffects keeps the time paid ahead).
    currency("USD");
    expect(screen.getByRole("button", { name: "Pay by card" })).toBeTruthy();
    expect(screen.getByText(/Paying by card now adds a period after .* renews by itself/)).toBeTruthy();
  });

  it("with Super switched off, shows only the notice, but a card subscription can still stop renewing", async () => {
    m.auth.profile = { planSource: "subscription", planRenewal: "on" };
    const setRenewal = vi.fn(async () => ({ renewal: "off" as const, until: Date.now() + 20 * DAY }));
    wrap(<Upgrade plansUrl="/plans.json" startCheckout={vi.fn()} setRenewal={setRenewal} superOn={false} />);
    expect(screen.getByText(/isn't available right now/)).toBeTruthy();
    expect(screen.queryByText(/Super adds a live tutor/)).toBeNull();
    expect(screen.queryByRole("button", { name: "EGP" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel renewal" }));
    await screen.findByText(/Renewal cancelled. Super stays until/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says why when a card subscription is already running", async () => {
    m.auth.plan = null;
    const startCheckout = vi.fn(async () => { throw new Error("FirebaseError: already-subscribed"); });
    wrap(<Upgrade plansUrl="/plans.json" startCheckout={startCheckout} />);
    await screen.findByText("Super monthly");
    currency("USD");
    fireEvent.click(screen.getByRole("button", { name: "Pay by card" }));
    await screen.findByText(/already have a card subscription/);
  });
});

describe("seats for an organization (sfm-01)", () => {
  it("starts from the licence's own seats, and explains what buying adds", async () => {
    m.auth.role = "orgAdmin"; m.auth.plan = null;
    wrap(<Upgrade plansUrl="/plans.json" startCheckout={vi.fn()} />, "/upgrade?seats=150&from=seats");
    await screen.findByText(/a seat a year/);
    expect((screen.getByLabelText("Seats") as HTMLInputElement).value).toBe("150");
    expect(screen.getByText(/the same number of seats adds a year/)).toBeTruthy();
    expect(screen.queryByText(/Renewing\?/)).toBeNull();
  });
  it("starts a licence above what one checkout sells at that most, not at 20", async () => {
    m.auth.role = "orgAdmin"; m.auth.plan = null;
    wrap(<Upgrade plansUrl="/plans.json" startCheckout={vi.fn()} />, "/upgrade?seats=50000&from=seats");
    await screen.findByText(/a seat a year/);
    expect((screen.getByLabelText("Seats") as HTMLInputElement).value).toBe("10000");
  });
  it("points an org admin who came another way to the Admin page, which knows their seats", async () => {
    m.auth.role = "orgAdmin"; m.auth.plan = null;
    wrap(<Upgrade plansUrl="/plans.json" startCheckout={vi.fn()} />);
    await screen.findByText(/a seat a year/);
    expect((screen.getByLabelText("Seats") as HTMLInputElement).value).toBe("20");
    expect(screen.getByRole("link", { name: "Open Admin" }).getAttribute("href")).toBe("/admin");
  });
  it("links an org admin from the seats panel to buy with those seats, and to renew an ended licence", () => {
    m.auth.role = "orgAdmin";
    const org = (until: number): Org => ({ id: "o1", name: "School", type: "school", status: "active", createdBy: "u1", licence: { plan: "super_seat", seats: 40, until } } as Org);
    const { unmount } = wrap(<SeatsPanel org={org(Date.now() + 9 * DAY)} members={[]} />, "/admin");
    expect(screen.getByRole("link", { name: "Renew or add seats" }).getAttribute("href")).toBe("/upgrade?seats=40&from=seats");
    unmount();
    wrap(<SeatsPanel org={org(Date.now() - DAY)} members={[]} />, "/admin");
    expect(screen.getByText(/licence ended on/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Renew the seats" }).getAttribute("href")).toBe("/upgrade?seats=40&from=seats");
  });
});

describe("a platform admin's Super and licence buttons", () => {
  const person = { uid: "u2", name: "Mona", role: "learner" } as Profile;
  it("an empty Days field can't give Super, and taking it back asks first, naming a paid provider", async () => {
    m.sub = { plan: "super", status: "active", source: "stripe", currentPeriodEnd: Date.now() + 9 * DAY };
    wrap(<SuperGrantPanel person={person} />, "/super/people/u2");
    const give = screen.getByRole("button", { name: "Give Super" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Days"), { target: { value: "" } });
    expect(give.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Days"), { target: { value: "0" } });
    expect(give.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Take back" }));
    expect(m.api.grantSuper).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/paid Stripe subscription/);
    fireEvent.click(screen.getByRole("button", { name: "Yes, take it back" }));
    await waitFor(() => expect(m.api.grantSuper).toHaveBeenCalledWith({ uid: "u2", days: 0, revoke: true }));
    fireEvent.change(screen.getByLabelText("Days"), { target: { value: "30" } });
    fireEvent.click(give);
    await waitFor(() => expect(m.api.grantSuper).toHaveBeenLastCalledWith({ uid: "u2", days: 30 }));
  });
  it("an empty Seats field can't set a licence, and removing one asks first", async () => {
    const org = { id: "o1", name: "School", type: "school", status: "active", createdBy: "u1", licence: { plan: "super_seat", seats: 5, until: Date.now() + DAY } } as Org;
    wrap(<LicencePanel org={org} />, "/super/orgs/o1");
    const set = screen.getByRole("button", { name: "Set licence" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Seats"), { target: { value: "" } });
    expect(set.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove licence" }));
    expect(m.api.setOrgLicence).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove it" }));
    await waitFor(() => expect(m.api.setOrgLicence).toHaveBeenCalledWith({ orgId: "o1", seats: 0, remove: true }));
  });
  it("words the plan, its status and its source, and follows the subscription, not a profile its trigger hasn't updated", () => {
    // Right after Give Super: the profile has no planUntil yet (billing.writeClaims runs from a trigger).
    m.sub = { plan: "super_monthly", status: "active", source: "grant", currentPeriodEnd: Date.now() + 30 * DAY };
    const { unmount } = wrap(<SuperGrantPanel person={person} />, "/super/people/u2");
    const panel = screen.getByRole("region", { name: "Darsi Super" }).textContent ?? "";
    expect(panel).toMatch(/Has Super until .+ \(their own plan\)\./);
    expect(panel).not.toMatch(/No Darsi Super/);
    expect(panel).toMatch(/Own plan: .Super monthly., active, given by Darsi, until /);
    expect(panel).not.toMatch(/super_monthly|grant/);
    unmount();
    // In Arabic, with nothing left in English: «خطته الخاصة: super_monthly، expired، عبر grant» before.
    m.sub = { plan: "super_monthly", status: "canceled", source: "stripe", currentPeriodEnd: Date.now() + 9 * DAY };
    wrap(<SuperGrantPanel person={person} />, "/super/people/u2", "ar");
    const ar = screen.getByRole("region", { name: "درسي سوبر" }).textContent ?? "";
    expect(ar).toContain("خطته الخاصة: ⁨سوبر شهري⁩، أُلغي تجديدها، مدفوعة ببطاقة عبر Stripe، حتى ");
    expect(ar).not.toMatch(/super_monthly|canceled|stripe\b/);
  });
  it("after Take back, says the plan ended even while the profile still shows it", () => {
    m.sub = { plan: "super_monthly", status: "expired", source: "grant", currentPeriodEnd: Date.now() - 1000 };
    wrap(<SuperGrantPanel person={{ ...person, planUntil: Date.now() + 20 * DAY, planSource: "subscription" }} />, "/super/people/u2");
    const panel = screen.getByRole("region", { name: "Darsi Super" }).textContent ?? "";
    expect(panel).toMatch(/No Darsi Super\./);
    expect(panel).toMatch(/Own plan: .Super monthly., given by Darsi, ended on /);
    // An organization's seat still shows from the profile.
    cleanup();
    wrap(<SuperGrantPanel person={{ ...person, planUntil: Date.now() + 20 * DAY, planSource: "org" }} />, "/super/people/u2");
    expect(screen.getByRole("region", { name: "Darsi Super" }).textContent).toMatch(/Has Super until .+ \(through their organization\)\./);
  });
});

describe("the plans page", () => {
  it("says a margin refusal in the page's language, with its numerals (it came in the server's English)", async () => {
    m.api.savePlans.mockRejectedValueOnce(Object.assign(new Error("Plan \"super_monthly\": the EGP price leaves a -2900% margin after its credits' cost; it must be at least 60%."), { details: { reason: "plan-margin", id: "super_monthly", cur: "EGP", margin: -29, min: 0.6 } }));
    wrap(<PlansPage />, "/super/plans", "ar");
    fireEvent.click(screen.getByRole("button", { name: "احفظ وانشر" }));
    await waitFor(() => expect(m.api.savePlans).toHaveBeenCalled());
    const said = await screen.findByText(/هامشًا قدره/);
    // Intl's Arabic percentages carry Arabic letter marks (U+061C) around the sign.
    expect(said.textContent!.replace(/؜/g, "")).toBe("الخطة ⁨super_monthly⁩: سعرها بعملة EGP يترك هامشًا قدره -٢٬٩٠٠٪ بعد تكلفة أرصدتها، ويجب ألا يقل الهامش عن ٦٠٪.");
    expect(said.textContent).not.toMatch(/margin|[0-9]/);
  });
  it("shows a refusal it doesn't know in the server's words", async () => {
    m.api.savePlans.mockRejectedValueOnce(new Error("FirebaseError: Platform admins only. [403]"));
    wrap(<PlansPage />, "/super/plans");
    fireEvent.click(screen.getByRole("button", { name: "Save and publish" }));
    expect((await screen.findByText("Platform admins only.")).className).toContain("err");
  });
  it("gives each plan's On sale box a 44px target", () => {
    wrap(<PlansPage />, "/super/plans");
    const boxes = screen.getAllByRole("checkbox", { name: "On sale" });
    expect(boxes).toHaveLength(2);
    for (const b of boxes) expect(b.closest("label")?.className).toBe("pick-cell");
  });
});

describe("the seats list (feat-org-seats-list)", () => {
  const org = { id: "o1", name: "School", type: "school", status: "active", createdBy: "u1", licence: { plan: "super_seat", seats: 300, until: Date.now() + 9 * DAY } } as Org;
  const member = (i: number, o: Partial<Profile> = {}) => ({ uid: `s${i}`, name: `Pupil ${String(i).padStart(3, "0")}`, email: `p${i}@users.darsi.app`, role: "student", orgId: "o1", group: i % 2 ? "5A" : "5B", ...o } as Profile);
  it("lists org admins too, finds a member by name or class, and shows more than the first hundred", () => {
    m.auth.role = "orgAdmin";
    const members = [member(0, { uid: "a1", name: "Head Teacher", role: "orgAdmin", group: null }), ...Array.from({ length: 250 }, (_, i) => member(i + 1))];
    wrap(<SeatsPanel org={org} members={members} />, "/admin");
    expect(screen.getByText("Head Teacher")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Give a seat" })).toHaveLength(100);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getAllByRole("button", { name: "Give a seat" })).toHaveLength(251);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    const search = screen.getByLabelText("Find a member (name, username or class)");
    fireEvent.change(search, { target: { value: "pupil 249" } });
    expect(screen.getAllByRole("button", { name: "Give a seat" })).toHaveLength(1);
    fireEvent.change(search, { target: { value: "5a" } });
    expect(screen.getAllByRole("button", { name: "Give a seat" })).toHaveLength(100);
    fireEvent.change(search, { target: { value: "nobody" } });
    expect(screen.getByText("No member matches.")).toBeTruthy();
  });
});
