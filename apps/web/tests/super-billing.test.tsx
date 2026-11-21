// Darsi Super's money screens (functions/src/billing.ts, payments.ts): the Super page offers Cancel renewal instead of
// a second card subscription and Renew for Paymob (sfm-05), and fills an org admin's seats from their licence
// (sfm-01); a platform admin's empty Days or Seats field never takes Super back or removes a licence, and both of those
// ask first (ux-superadmin-grant-zero-revokes). /super/plans is three tabs (admin/Tabs): Plans, Switches, Revenue check.
// Forms that must not lose work (ad-forms-safety): one seat given or taken changes its own row without reading the
// members again, "Give the free seats" calls again while the server says there is more, a credits read that failed is
// not a balance of 0, turning Super off asks first, and the plans' number fields keep what was typed.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { Org, Profile } from "../src/auth/types";

const m = vi.hoisted(() => ({
  auth: { user: { uid: "u1" }, plan: null as { id: string; until: number } | null, profile: null as Record<string, unknown> | null, role: "learner", refreshClaims: async () => {} },
  sub: null as Record<string, unknown> | null,
  api: { grantSuper: vi.fn(async () => ({ ok: true })), grantCredits: vi.fn(async () => ({ ok: true })), setOrgLicence: vi.fn(async () => ({ ok: true })), fillSeats: vi.fn(), setSeat: vi.fn(), savePlans: vi.fn(async () => ({ rev: 2 })),
    setSuperOn: vi.fn(async ({ on }: { on: boolean }) => ({ on })) },
  // credits/{uid} as the grant panel reads it: the document, or a read that failed, or one still on its way.
  credits: { data: undefined as { plan: number; planUntil: number; packs: number } | undefined, error: undefined as Error | undefined, loading: false, reload: vi.fn() },
  applied: [] as boolean[],
  // config/plans as /super/plans saved it: a plan for one person and a seat.
  plansCfg: { plans: [
    { id: "super_monthly", kind: "individual", period: "month", name: { en: "Super monthly", ar: "سوبر شهري" }, prices: { EGP: 149 }, credits: 300, active: true },
    { id: "super_seat", kind: "seat", period: "year", name: { en: "Seat", ar: "مقعد" }, prices: { EGP: 600 }, credits: 300, active: true },
  ], economics: { usdPerCredit: 0.002, egpPerUsd: 50 } },
  // Darsi Super for everyone (content/settings), and the documents the Switches tab's capstone settings read.
  superOn: true,
  reads: [] as string[],
  patched: [] as unknown[][],
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: {}, functions: {}, firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/content/settings", async (orig) => ({ ...(await orig<typeof import("../src/content/settings")>()), useSuperOn: () => ({ on: m.superOn, apply: (on: boolean) => { m.applied.push(on); } }) }));
// The capstone settings (admin/CapstoneSettings, with tests of their own) read config/capstone and today's analytics
// day themselves when they mount: the plans page must not mount them before their tab is opened.
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<typeof import("firebase/firestore")>()),
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  getDoc: async (path: string) => {
    m.reads.push(path);
    const data: Record<string, unknown> = path === "config/capstone" ? { ai: true, perDay: 5, maxPerDay: 300, callsPerDay: 20 } : {};
    return { data: () => data, get: (k: string) => data[k] };
  },
}));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  // The members the staff screens share (useMembers): what a screen puts into them without a read.
  patchMembers: (...a: unknown[]) => { m.patched.push(a); },
  useSubscription: () => ({ data: m.sub, reload: () => {} }),
  useCredits: () => m.credits,
  usePlansConfig: () => ({ data: m.plansCfg, reload: () => {} }),
}));

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
  m.superOn = true; m.reads = []; m.applied = []; m.patched = [];
  m.credits = { data: { plan: 100, planUntil: Date.now() + 864e5, packs: 0 }, error: undefined, loading: false, reload: vi.fn() };
  // The staff kit logs the raw error it words (bugs/log.ts keeps it for "Report a problem"): quiet here.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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

  // A personal account opened through its school's sign-in: startCheckout and setRenewal refuse it (functions
  // ssoStore.ts refuseSsoSession). "Check your connection and try again" would be false: trying again never works.
  const refusal = () => Object.assign(new Error("Sign in with your own Darsi login to do this."), { code: "functions/failed-precondition", details: { reason: "sso-own-login" } });
  const OWN = { en: "You are signed in through your school. Sign in with your own Darsi login", ar: "أنت مسجّل الدخول عبر مدرستك. لتفعل ذلك سجّل الدخول بحسابك الخاص" };

  it.each([["en", "Pay by card", /payment page didn't open/], ["ar", "ادفع بالبطاقة", /صفحة الدفع/]] as const)("buying in a school session (%s) says to use the account's own login, not to check the connection", async (lang, pay, wrong) => {
    m.auth.plan = null;
    const startCheckout = vi.fn(async () => { throw refusal(); });
    wrap(<Upgrade plansUrl="/plans.json" startCheckout={startCheckout} />, "/upgrade", lang);
    await screen.findByRole("heading", { name: lang === "ar" ? "سوبر" : "Super monthly" });
    currency("USD");
    fireEvent.click(screen.getByRole("button", { name: pay }));
    await waitFor(() => expect(startCheckout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByRole("status").some((n) => n.className === "notice err" && n.textContent!.startsWith(OWN[lang]))).toBe(true));
    expect(screen.queryByText(wrong)).toBeNull();
  });

  it.each([["en", "Cancel renewal", /That didn't work/], ["ar", "ألغِ التجديد", /لم ينجح ذلك/]] as const)("cancelling renewal in a school session (%s) says the same", async (lang, cancel, wrong) => {
    m.auth.profile = { planSource: "subscription", planRenewal: "on" };
    const setRenewal = vi.fn(async () => { throw refusal(); });
    wrap(<Upgrade plansUrl="/plans.json" startCheckout={vi.fn()} setRenewal={setRenewal} />, "/upgrade", lang);
    fireEvent.click(await screen.findByRole("button", { name: cancel }));
    await waitFor(() => expect(setRenewal).toHaveBeenCalledWith({ renew: false }));
    await waitFor(() => expect(screen.getAllByRole("status").some((n) => n.className === "notice err" && n.textContent!.startsWith(OWN[lang]))).toBe(true));
    expect(screen.queryByText(wrong)).toBeNull();
    expect(screen.getByRole("button", { name: cancel })).toBeTruthy(); // nothing changed: still renewing
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
    expect(screen.getByRole("link", { name: "Open Admin" }).getAttribute("href")).toBe("/admin?tab=seats"); // the Super seats tab
  });
  it("takes a seat count typed with Arabic or Persian digits (a number field handed back nothing, and the count fell to 1)", async () => {
    m.auth.role = "orgAdmin"; m.auth.plan = null;
    const startCheckout = vi.fn(async () => ({ url: "#paid" }));
    vi.stubGlobal("location", { ...location, assign: vi.fn() });
    wrap(<Upgrade plansUrl="/plans.json" startCheckout={startCheckout} />);
    await screen.findByText(/a seat a year/);
    currency("USD");
    const field = screen.getByLabelText("Seats") as HTMLInputElement;
    expect(field.type).toBe("text");
    expect(field.inputMode).toBe("numeric");
    expect(field.dir).toBe("ltr");
    fireEvent.change(field, { target: { value: "٢٥" } });
    expect(field.value).toBe("25");
    expect(screen.getByRole("button", { name: "Buy for a year ($500)" })).toBeTruthy(); // 25 seats at $20
    fireEvent.change(field, { target: { value: "۱۲" } });
    expect(field.value).toBe("12");
    // Latin digits as before: an emptied field is 1, and no more than one checkout sells.
    fireEvent.change(field, { target: { value: "" } });
    expect(field.value).toBe("1");
    fireEvent.change(field, { target: { value: "99999" } });
    expect(field.value).toBe("10000");
    // What a number field never let in (a slipped letter, a thousands separator) is dropped, not taken for "nothing".
    fireEvent.change(field, { target: { value: "30x" } });
    expect(field.value).toBe("30");
    fireEvent.change(field, { target: { value: "١٬٢٠٠" } });
    expect(field.value).toBe("1200");
    fireEvent.change(field, { target: { value: "٢٥" } });
    fireEvent.click(screen.getByRole("button", { name: /Buy for a year/ }));
    await waitFor(() => expect(startCheckout).toHaveBeenCalledWith(expect.objectContaining({ plan: "super_seat", currency: "USD", seats: 25 })));
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
  it("says where seats are given and where a licence is set that a seat brings no tutor credits yet", () => {
    // billing.ts setSeat and fillSeats give Super and write nothing to credits/{uid} (docs/SUPER.md "a seat brings no
    // credits yet"): a seat holder's first question to the tutor is refused until they have credits some other way.
    const EN = "A seat gives Darsi Super, but no tutor credits yet. Until it does, each person needs a credit pack, or credits added by a platform admin.";
    const AR = "المقعد يمنح درسي سوبر، لكنه لا يتضمن أرصدة المعلّم بعد. حتى ذلك الحين يحتاج كل شخص إلى باقة أرصدة، أو إلى أرصدة يضيفها أحد مشرفي المنصة.";
    const org = { id: "o1", name: "School", type: "school", status: "active", createdBy: "u1", licence: { plan: "super_seat", seats: 40, until: Date.now() + 9 * DAY } } as Org;
    for (const [lang, said] of [["en", EN], ["ar", AR]] as const) {
      m.auth.role = "orgAdmin";
      wrap(<SeatsPanel org={org} members={[]} />, "/admin?tab=seats", lang);
      expect(screen.getByText(said).className).toBe("muted small");
      cleanup();
      // A platform admin setting an invoiced licence reads it too, with a licence or before the first one.
      m.auth.role = "superadmin";
      wrap(<LicencePanel org={org} />, "/super/orgs/o1", lang);
      expect(screen.getByText(said)).toBeTruthy();
      cleanup();
      wrap(<LicencePanel org={{ ...org, licence: undefined }} />, "/super/orgs/o1", lang);
      expect(screen.getByText(said)).toBeTruthy();
      cleanup();
    }
    // On an organization's own site Darsi's name becomes the organization's: the sentence must not then say the
    // organization's team adds credits, so it names platform admins, not Darsi.
    for (const text of [EN, AR]) expect(text.match(/Darsi|درسي/g)).toHaveLength(1);
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
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toMatch(/paid Stripe subscription/);
    // Asked on the page (staff/InlineConfirm): Cancel has the focus, and Escape closes it with nothing taken back.
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(ask, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Take back" }));
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
    const ask = screen.getByRole("alertdialog");
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove licence" }));
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
  it("says a refusal it doesn't know in the admin's language, never the server's raw words (was: the server's English)", async () => {
    m.api.savePlans.mockRejectedValueOnce(Object.assign(new Error("FirebaseError: Platform admins only. [403]"), { code: "functions/permission-denied" }));
    wrap(<PlansPage />, "/super/plans");
    fireEvent.click(screen.getByRole("button", { name: "Save and publish" }));
    expect((await screen.findByText(/^Your account isn't allowed to do this/)).className).toContain("err");
    expect(screen.queryByText(/Platform admins only/)).toBeNull();
    cleanup();
    m.api.savePlans.mockRejectedValueOnce(Object.assign(new Error("permission-denied"), { code: "functions/permission-denied" }));
    wrap(<PlansPage />, "/super/plans", "ar");
    fireEvent.click(screen.getByRole("button", { name: "احفظ وانشر" }));
    expect(await screen.findByText(/^حسابك لا يملك صلاحية هذا الإجراء/)).toBeTruthy();
  });
  it("names each plan in the page's language where it offers them (they were always in English)", () => {
    wrap(<PlansPage />, "/super/plans?tab=check", "ar");
    expect(within(screen.getByRole("tabpanel")).getAllByRole("option").slice(0, 2).map((o) => o.textContent)).toEqual(["سوبر شهري", "مقعد"]);
    cleanup();
    const org = { id: "o1", name: "School", type: "school", status: "active", createdBy: "u1" } as Org;
    wrap(<LicencePanel org={org} />, "/super/orgs/o1", "ar");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["مقعد"]);
  });
  it("gives each plan's On sale box a 44px target", () => {
    wrap(<PlansPage />, "/super/plans");
    const boxes = screen.getAllByRole("checkbox", { name: "On sale" });
    expect(boxes).toHaveLength(2);
    for (const b of boxes) expect(b.closest("label")?.className).toBe("pick-cell");
  });
});

describe("the plans page's tabs", () => {
  const tab = (name: string | RegExp) => screen.getByRole("tab", { name });
  const today = `analytics/${new Date().toISOString().slice(0, 10)}`;
  /** The "Super is off" line that is not inside any tab's panel. */
  const offAbove = () => screen.queryAllByText(/^Off: Super is hidden everywhere/).filter((el) => !el.closest('[role="tabpanel"]'));

  it("opens on Plans, and reads the capstone settings only when Switches is opened, once", async () => {
    wrap(<PlansPage />, "/super/plans");
    expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual(["Plans", "Switches", "Revenue check"]);
    expect(tab("Plans").getAttribute("aria-selected")).toBe("true");
    const plansPanel = screen.getByRole("tabpanel", { name: "Plans" });
    expect(within(plansPanel).getByRole("heading", { name: "Costs and margin" })).toBeTruthy();
    expect(within(plansPanel).getByRole("button", { name: "Add a plan" })).toBeTruthy();
    // Neither switch nor the revenue check is on the page yet, and nothing of theirs was read.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("heading", { name: "Darsi Super for everyone" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "AI reviews of capstone milestones" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Check the revenue event" })).toBeNull();
    expect(m.reads).toEqual([]);

    fireEvent.click(tab("Switches"));
    const switches = screen.getByRole("tabpanel", { name: "Switches" });
    expect(within(switches).getByRole("button", { name: "Turn Super off" })).toBeTruthy();
    expect(await within(switches).findByText(/^On: each milestone/)).toBeTruthy();
    expect([...m.reads].sort()).toEqual([today, "config/capstone"]);
    // Plans left the view (kept, hidden), and coming back to Switches reads nothing again.
    expect(screen.queryByRole("heading", { name: "Costs and margin" })).toBeNull();
    fireEvent.click(tab("Plans"));
    fireEvent.click(tab("Switches"));
    await new Promise((r) => setTimeout(r, 0));
    expect(m.reads).toHaveLength(2);
  });

  it("opens Switches and Revenue check from their links", async () => {
    const { unmount } = wrap(<PlansPage />, "/super/plans?tab=switches");
    expect(tab("Switches").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Darsi Super for everyone" })).toBeTruthy();
    await waitFor(() => expect(m.reads).toHaveLength(2));
    unmount();
    m.reads = [];
    wrap(<PlansPage />, "/super/plans?tab=check");
    const check = screen.getByRole("tabpanel", { name: "Revenue check" });
    expect(within(check).getByRole("heading", { name: "Check the revenue event" })).toBeTruthy();
    // The saved plans reach it from the page's one read of config/plans.
    expect(within(check).getAllByRole("option").map((o) => o.textContent)).toEqual(["Super monthly", "Seat", "EGP", "USD"]);
    expect(screen.queryByRole("heading", { name: "Costs and margin" })).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(m.reads).toEqual([]);
  });

  it("says Super is off above the tabs, whichever tab is open", () => {
    m.superOn = false;
    wrap(<PlansPage />, "/super/plans");
    const list = screen.getByRole("tablist", { name: "Sections of this page" });
    const above = () => { const [el, ...more] = offAbove(); expect(more).toHaveLength(0); return el; };
    // Before the list of tabs in the page, not under one of them.
    expect(above().compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(tab("Switches"));
    expect(above()).toBeTruthy();
    // The switch says it too, as its own status, beside the button that turns Super on.
    const switches = screen.getByRole("tabpanel", { name: "Switches" });
    expect(within(switches).getByRole("status").textContent).toMatch(/^Off: Super is hidden everywhere/);
    expect(within(switches).getByRole("button", { name: "Turn Super on" })).toBeTruthy();
    fireEvent.click(tab("Revenue check"));
    expect(above()).toBeTruthy();
    fireEvent.click(tab("Plans"));
    expect(above()).toBeTruthy();
  });

  it("says nothing above the tabs while Super is on", () => {
    wrap(<PlansPage />, "/super/plans?tab=switches");
    expect(offAbove()).toHaveLength(0);
    expect(within(screen.getByRole("tabpanel", { name: "Switches" })).getByRole("status").textContent).toMatch(/^On: people see Super/);
  });

  it("keeps a plan's edits through a visit to another tab, and marks Plans until they are saved", async () => {
    wrap(<PlansPage />, "/super/plans");
    const name = () => within(screen.getByRole("region", { name: "super_monthly" })).getByLabelText("Name (English)") as HTMLInputElement;
    expect(tab(/^Plans/).textContent).toBe("Plans");
    fireEvent.change(name(), { target: { value: "Super monthly plus" } });
    fireEvent.click(screen.getByRole("button", { name: "Add a plan" }));
    expect(tab(/^Plans/).textContent).toBe("Plans (unsaved changes)");
    fireEvent.click(tab("Revenue check"));
    // Still marked from the other tab, where the check offers the saved plans, not the edited ones.
    expect(tab(/^Plans/).textContent).toBe("Plans (unsaved changes)");
    expect(within(screen.getByRole("tabpanel", { name: "Revenue check" })).getAllByRole("option")[0].textContent).toBe("Super monthly");
    fireEvent.click(tab("Switches"));
    fireEvent.click(tab(/^Plans/));
    expect(name().value).toBe("Super monthly plus");
    expect(screen.getByRole("region", { name: "New plan" })).toBeTruthy();
    // Undone by hand, it is no longer marked; edited again and saved, neither.
    fireEvent.click(within(screen.getByRole("region", { name: "New plan" })).getByRole("button", { name: "Remove" }));
    fireEvent.change(name(), { target: { value: "Super monthly" } });
    expect(tab(/^Plans/).textContent).toBe("Plans");
    fireEvent.change(name(), { target: { value: "Super monthly plus" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and publish" }));
    await screen.findByText("Saved and published.");
    expect(m.api.savePlans).toHaveBeenCalledWith({ plans: [{ ...m.plansCfg.plans[0], name: { en: "Super monthly plus", ar: "سوبر شهري" } }, m.plansCfg.plans[1]], economics: m.plansCfg.economics });
    expect(tab(/^Plans/).textContent).toBe("Plans");
  });
});

describe("the plans' number fields (ad-forms-safety)", () => {
  const cost = () => screen.getByLabelText("Provider cost of one credit (USD)") as HTMLInputElement;
  const save = () => screen.getByRole("button", { name: "Save and publish" }) as HTMLButtonElement;
  const plan = (id: string) => within(screen.getByRole("region", { name: id }));

  it("keeps what is typed on the way to 0.0035, and sends it as a number", async () => {
    wrap(<PlansPage />, "/super/plans");
    expect(cost().value).toBe("0.002");
    // Key by key: bound to a number, "0", "0." and "0.00" all read as 0 and the field emptied itself.
    for (const typed of ["", "0", "0.", "0.0", "0.00", "0.003", "0.0035"]) {
      fireEvent.change(cost(), { target: { value: typed } });
      expect(cost().value).toBe(typed);
    }
    expect(cost().getAttribute("aria-invalid")).toBeNull();
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    await screen.findByText("Saved and published.");
    expect(m.api.savePlans).toHaveBeenCalledWith({ plans: m.plansCfg.plans, economics: { usdPerCredit: 0.0035, egpPerUsd: 50 } });
  });

  it("an empty or impossible cost says what it takes and makes Save wait", () => {
    wrap(<PlansPage />, "/super/plans");
    for (const typed of ["", "0", "0.", "abc", "-1", "1,5", "11"]) {
      fireEvent.change(cost(), { target: { value: typed } });
      expect(save().disabled, typed).toBe(true);
      expect(cost().getAttribute("aria-invalid"), typed).toBe("true");
      expect(screen.getByText("The cost of one credit (USD) must be above 0 and at most 10.")).toBeTruthy();
    }
    expect(m.api.savePlans).not.toHaveBeenCalled();
    fireEvent.change(cost(), { target: { value: "0.004" } });
    expect(save().disabled).toBe(false);
    expect(screen.queryByText(/must be above 0/)).toBeNull();
  });

  it("on a platform with no costs saved, marks neither cost until it is edited or Save is pressed, and still sends nothing", async () => {
    const was = m.plansCfg;
    m.plansCfg = { ...was, economics: undefined as unknown as typeof was.economics };
    try {
      wrap(<PlansPage />, "/super/plans");
      const rate = () => screen.getByLabelText("EGP for 1 USD") as HTMLInputElement;
      const COST = "The cost of one credit (USD) must be above 0 and at most 10.", RATE = "The EGP rate must be from 1 to 1,000 EGP for 1 USD.";
      // Untouched: both empty, neither marked, and Save can be pressed.
      expect(cost().value).toBe(""); expect(rate().value).toBe("");
      expect(cost().getAttribute("aria-invalid")).toBeNull();
      expect(rate().getAttribute("aria-invalid")).toBeNull();
      expect(screen.queryByText(COST)).toBeNull(); expect(screen.queryByText(RATE)).toBeNull();
      expect(save().disabled).toBe(false);
      // Editing one marks that one only (once what was typed can't be saved): Save waits for it.
      fireEvent.change(cost(), { target: { value: "0" } });
      expect(cost().getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByText(COST)).toBeTruthy();
      expect(rate().getAttribute("aria-invalid")).toBeNull();
      expect(save().disabled).toBe(true);
      fireEvent.change(cost(), { target: { value: "0.002" } });
      expect(cost().getAttribute("aria-invalid")).toBeNull();
      expect(save().disabled).toBe(false);
      // Save with the other still empty: refused here, nothing sent, and now that field says what it takes.
      fireEvent.click(save());
      expect(await screen.findByText("This can't be saved yet: fix the fields marked below first.")).toBeTruthy();
      expect(m.api.savePlans).not.toHaveBeenCalled();
      expect(rate().getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByText(RATE)).toBeTruthy();
      expect(save().disabled).toBe(true);
      fireEvent.change(rate(), { target: { value: "50" } });
      expect(rate().getAttribute("aria-invalid")).toBeNull();
      fireEvent.click(save());
      await screen.findByText("Saved and published.");
      expect(m.api.savePlans).toHaveBeenCalledWith({ plans: was.plans, economics: { usdPerCredit: 0.002, egpPerUsd: 50 } });
    } finally { m.plansCfg = was; }
  });

  it("an empty price is no price, a price that is not a number is asked for again, and credits are a whole number", async () => {
    wrap(<PlansPage />, "/super/plans");
    const egp = () => plan("super_monthly").getByLabelText("Price in EGP") as HTMLInputElement;
    fireEvent.change(egp(), { target: { value: "12x" } });
    expect(save().disabled).toBe(true);
    expect(plan("super_monthly").getByText("Enter a price above 0 and at most 1,000,000, or leave it empty.")).toBeTruthy();
    fireEvent.change(egp(), { target: { value: "" } });
    expect(save().disabled).toBe(false); // the server says a plan needs one price; an empty field is not a typing mistake
    fireEvent.change(plan("super_monthly").getByLabelText("Tutor credits each period"), { target: { value: "2.5" } });
    expect(save().disabled).toBe(true);
    expect(plan("super_monthly").getByText("Enter a whole number from 0 to 100,000.")).toBeTruthy();
    fireEvent.change(plan("super_monthly").getByLabelText("Tutor credits each period"), { target: { value: "250" } });
    fireEvent.change(plan("super_monthly").getByLabelText("Price in USD"), { target: { value: "4.5" } });
    fireEvent.click(save());
    await screen.findByText("Saved and published.");
    expect(m.api.savePlans).toHaveBeenCalledWith({ plans: [{ ...m.plansCfg.plans[0], prices: { USD: 4.5 }, credits: 250 }, m.plansCfg.plans[1]], economics: m.plansCfg.economics });
  });

  it("reads the digits an Arabic keyboard types, and their decimal mark", async () => {
    wrap(<PlansPage />, "/super/plans", "ar");
    const field = (label: string) => screen.getAllByLabelText(label)[0] as HTMLInputElement;
    fireEvent.change(field("تكلفة رصيد واحد لدى المزوّد (دولار)"), { target: { value: "٠٫٠٠٣٥" } });
    fireEvent.change(field("السعر بالجنيه"), { target: { value: "١٤٩٫٥" } });
    const save = screen.getByRole("button", { name: "احفظ وانشر" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(m.api.savePlans).toHaveBeenCalledWith({ plans: [{ ...m.plansCfg.plans[0], prices: { EGP: 149.5 } }, m.plansCfg.plans[1]], economics: { usdPerCredit: 0.0035, egpPerUsd: 50 } }));
  });

  it("says in words when a price is under the 60% minimum, not by colour alone", () => {
    wrap(<PlansPage />, "/super/plans");
    // 300 credits at $0.002 cost $0.60; EGP 149 is $2.98, which keeps 80%.
    expect(plan("super_monthly").getByText("EGP: 80% margin").className).toBe("notice ok");
    fireEvent.change(plan("super_monthly").getByLabelText("Price in EGP"), { target: { value: "40" } }); // $0.80: 25%
    const low = plan("super_monthly").getByText("EGP: 25% margin. That is below the 60% minimum, so this price can't be saved.");
    expect(low.className).toBe("notice err");
  });

  // A save reads the stored copy back (usePlansConfig's reload: a new object each time). The fields aren't locked
  // while that is on its way, and the re-read replaced the whole form: a price typed in between was gone, and the
  // form read as saved.
  it("what is typed while a save is read back stays, and stays unsaved; with nothing typed, the form is the stored copy (staff-ui-p2)", async () => {
    const was = m.plansCfg;
    let done!: (v: { rev: number }) => void;
    m.api.savePlans.mockImplementationOnce(() => new Promise<{ rev: number }>((r) => { done = r; }));
    const tree = () => <I18nProvider lang="en"><MemoryRouter initialEntries={["/super/plans"]}><PlansPage /></MemoryRouter></I18nProvider>;
    const egp = (id: string) => plan(id).getByLabelText("Price in EGP") as HTMLInputElement;
    const plansTab = () => screen.getByRole("tab", { name: /^Plans/ }).textContent;
    try {
      const view = render(tree());
      fireEvent.change(egp("super_monthly"), { target: { value: "199" } });
      fireEvent.click(save());
      await waitFor(() => expect(m.api.savePlans).toHaveBeenCalledTimes(1));
      // While the save is on its way: another plan's price.
      fireEvent.change(egp("super_seat"), { target: { value: "750" } });
      done({ rev: 3 });
      await screen.findByText("Saved and published.");
      // The re-read lands: the stored copy is what was sent.
      const stored = { ...was, plans: [{ ...was.plans[0], prices: { EGP: 199 } }, was.plans[1]] };
      m.plansCfg = stored;
      view.rerender(tree());
      expect(egp("super_seat").value).toBe("750");
      expect(egp("super_monthly").value).toBe("199");
      expect(plansTab()).toBe("Plans (unsaved changes)");

      // Saved in turn, with nothing typed since: the read-back is shown as stored (here the server tidied a name).
      fireEvent.click(save());
      await waitFor(() => expect(m.api.savePlans).toHaveBeenCalledTimes(2));
      expect(m.api.savePlans).toHaveBeenLastCalledWith({ plans: [stored.plans[0], { ...was.plans[1], prices: { EGP: 750 } }], economics: was.economics });
      await waitFor(() => expect(plansTab()).toBe("Plans"));
      m.plansCfg = { ...stored, plans: [stored.plans[0], { ...was.plans[1], prices: { EGP: 750 }, name: { en: "Seat (a year)", ar: "مقعد" } }] };
      view.rerender(tree());
      expect((plan("super_seat").getByLabelText("Name (English)") as HTMLInputElement).value).toBe("Seat (a year)");
      expect(egp("super_seat").value).toBe("750");
      expect(plansTab()).toBe("Plans");
    } finally { m.plansCfg = was; }
  });
});

describe("Darsi Super's switch asks before turning it off (ad-forms-safety)", () => {
  const panel = () => within(screen.getByRole("tabpanel", { name: "Switches" }));
  it("turning Super off asks first, on the page; Cancel changes nothing", async () => {
    wrap(<PlansPage />, "/super/plans?tab=switches");
    const off = panel().getByRole("button", { name: "Turn Super off" });
    off.focus(); // as a keyboard or a tap leaves it
    fireEvent.click(off);
    expect(m.api.setSuperOn).not.toHaveBeenCalled();
    const ask = panel().getByRole("alertdialog", { name: "Turn Darsi Super off for everyone?" });
    expect(ask.textContent).toContain("Subscriptions and credits are kept.");
    // The safe answer has the focus; the button stays, and pressing it again only asks again.
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Cancel" }));
    fireEvent.click(off);
    expect(panel().getAllByRole("alertdialog")).toHaveLength(1);
    expect(m.api.setSuperOn).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(panel().queryByRole("alertdialog")).toBeNull();
    // Cancel gives the keyboard focus back to the button that asked, instead of dropping it to the page.
    expect(document.activeElement).toBe(off);
    expect(m.api.setSuperOn).not.toHaveBeenCalled();
    fireEvent.click(panel().getByRole("button", { name: "Turn Super off" }));
    fireEvent.click(panel().getByRole("button", { name: "Yes, turn it off" }));
    await waitFor(() => expect(m.api.setSuperOn).toHaveBeenCalledWith({ on: false }));
    await panel().findByText("Darsi Super is off for everyone.");
    expect(m.applied).toEqual([false]);
    expect(panel().queryByRole("alertdialog")).toBeNull();
  });
  it("turning it on again doesn't ask", async () => {
    m.superOn = false;
    wrap(<PlansPage />, "/super/plans?tab=switches");
    fireEvent.click(panel().getByRole("button", { name: "Turn Super on" }));
    expect(panel().queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(m.api.setSuperOn).toHaveBeenCalledWith({ on: true }));
    expect(m.applied).toEqual([true]);
  });
  it("says a switch that failed in the admin's language and stops asking", async () => {
    m.api.setSuperOn.mockRejectedValueOnce(Object.assign(new Error("internal"), { code: "functions/unavailable" }));
    wrap(<PlansPage />, "/super/plans?tab=switches");
    fireEvent.click(panel().getByRole("button", { name: "Turn Super off" }));
    fireEvent.click(panel().getByRole("button", { name: "Yes, turn it off" }));
    await panel().findByText(/^The service can't be reached right now/);
    expect(m.applied).toEqual([]);
    expect(panel().getByRole("button", { name: "Turn Super off" })).toBeTruthy();
  });
});

describe("a person's credits (ad-forms-safety)", () => {
  const person = { uid: "u2", name: "Mona", role: "learner" } as Profile;
  it("a credits read that failed is not a balance of 0: it says why, with Retry", () => {
    m.credits = { data: undefined, error: Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }), loading: false, reload: vi.fn() };
    wrap(<SuperGrantPanel person={person} />, "/super/people/u2");
    const panel = within(screen.getByRole("region", { name: "Darsi Super" }));
    expect(panel.queryByText(/Tutor credits:/)).toBeNull();
    expect(panel.getByRole("alert").textContent).toMatch(/^Your account isn't allowed to do this/);
    fireEvent.click(panel.getByRole("button", { name: "Retry" }));
    expect(m.credits.reload).toHaveBeenCalled();
  });
  it("says it is loading until the balance is read, and 0 only for someone with no credits at all", () => {
    m.credits = { data: undefined, error: undefined, loading: true, reload: vi.fn() };
    const { unmount } = wrap(<SuperGrantPanel person={person} />, "/super/people/u2");
    expect(screen.queryByText(/Tutor credits:/)).toBeNull();
    unmount();
    m.credits = { data: undefined, error: undefined, loading: false, reload: vi.fn() }; // read: no credits/{uid} document
    wrap(<SuperGrantPanel person={person} />, "/super/people/u2");
    expect(screen.getByText("Tutor credits: 0 left this period, 0 in packs.")).toBeTruthy();
  });
  it("reads Days typed with Arabic digits", async () => {
    wrap(<SuperGrantPanel person={person} />, "/super/people/u2");
    fireEvent.change(screen.getByLabelText("Days"), { target: { value: "٤٥" } });
    fireEvent.click(screen.getByRole("button", { name: "Give Super" }));
    await waitFor(() => expect(m.api.grantSuper).toHaveBeenCalledWith({ uid: "u2", days: 45 }));
  });
  it("says a grant that failed in the admin's language", async () => {
    m.api.grantCredits.mockRejectedValueOnce(Object.assign(new Error("Credits must be 1-100000."), { code: "functions/invalid-argument", details: { reason: "bad-credits" } }));
    wrap(<SuperGrantPanel person={person} />, "/super/people/u2");
    fireEvent.click(screen.getByRole("button", { name: "Give credits" }));
    expect(await screen.findByText("Credits must be a whole number from 1 to 100,000.")).toBeTruthy();
  });
});

describe("giving and taking seats (ad-forms-safety)", () => {
  const org = { id: "o1", name: "School", type: "school", status: "active", createdBy: "u1", licence: { plan: "super_seat", seats: 3, until: Date.now() + 9 * DAY } } as Org;
  const member = (uid: string, name: string, o: Partial<Profile> = {}) => ({ uid, name, email: `${uid}@users.darsiai.org`, role: "student", orgId: "o1", ...o } as Profile);
  const members = [member("s1", "Amina"), member("s2", "Bilal", { superSeat: true }), member("s3", "Chidi"), member("s4", "Dalia")];
  const row = (name: string) => within(screen.getByText(name).closest("li")!);

  it("one seat changes its own row and the count, without reading the members again", async () => {
    m.auth.role = "orgAdmin";
    m.api.setSeat.mockResolvedValue({ ok: true });
    const onChanged = vi.fn();
    wrap(<SeatsPanel org={org} members={members} onChanged={onChanged} />, "/admin?tab=seats");
    expect(screen.getByText(/^Seats given: 1 of 3/)).toBeTruthy();
    fireEvent.click(row("Amina").getByRole("button", { name: "Give a seat" }));
    await screen.findByText(/Amina.* has a seat\./);
    expect(m.api.setSeat).toHaveBeenCalledWith({ orgId: "o1", uid: "s1", on: true });
    expect(row("Amina").getByRole("button", { name: "Take the seat back" })).toBeTruthy();
    expect(screen.getByText(/^Seats given: 2 of 3/)).toBeTruthy();
    // Taking one back uses what the screen now knows, not the member list it was given.
    fireEvent.click(row("Amina").getByRole("button", { name: "Take the seat back" }));
    await waitFor(() => expect(m.api.setSeat).toHaveBeenLastCalledWith({ orgId: "o1", uid: "s1", on: false }));
    await waitFor(() => expect(row("Amina").getByRole("button", { name: "Give a seat" })).toBeTruthy());
    expect(onChanged).not.toHaveBeenCalled();
    // Each change is also put into the members the staff screens share: a dashboard opened again within the list's
    // ten minutes would otherwise show the seat as it was before.
    expect(m.patched).toEqual([["o1", "s1", { superSeat: true }], ["o1", "s1", { superSeat: false }]]);
  });

  it("the last free seat taken here makes the other Give buttons wait", async () => {
    m.api.setSeat.mockResolvedValue({ ok: true });
    wrap(<SeatsPanel org={{ ...org, licence: { ...org.licence!, seats: 2 } }} members={members} />, "/admin?tab=seats");
    fireEvent.click(row("Amina").getByRole("button", { name: "Give a seat" }));
    await screen.findByText(/^Seats given: 2 of 2/);
    expect((row("Chidi").getByRole("button", { name: "Give a seat" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Give the free seats" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a seat the server refused leaves the row as it was, and says why", async () => {
    m.api.setSeat.mockRejectedValue(Object.assign(new Error("Every seat is taken."), { code: "functions/resource-exhausted", details: { reason: "seats-full" } }));
    wrap(<SeatsPanel org={org} members={members} />, "/admin?tab=seats");
    fireEvent.click(row("Chidi").getByRole("button", { name: "Give a seat" }));
    expect(await screen.findByText("Every seat is taken. Free a seat, or add seats to the licence.")).toBeTruthy();
    expect(row("Chidi").getByRole("button", { name: "Give a seat" })).toBeTruthy();
    expect(screen.getByText(/^Seats given: 1 of 3/)).toBeTruthy();
    expect(m.patched).toEqual([]);
  });

  it("a new read of the members replaces what the screen remembered", async () => {
    m.api.setSeat.mockResolvedValue({ ok: true });
    const ui = (list: Profile[]) => <I18nProvider lang="en"><MemoryRouter initialEntries={["/admin?tab=seats"]}><SeatsPanel org={org} members={list} /></MemoryRouter></I18nProvider>;
    const page = render(ui(members));
    fireEvent.click(row("Amina").getByRole("button", { name: "Give a seat" }));
    await screen.findByText(/^Seats given: 2 of 3/);
    // Someone else took Amina's seat back meanwhile, and the page read the members again.
    page.rerender(ui(members.map((x) => ({ ...x }))));
    await screen.findByText(/^Seats given: 1 of 3/);
    expect(row("Amina").getByRole("button", { name: "Give a seat" })).toBeTruthy();
  });

  it("'Give the free seats' calls again while the server says there is more, says how far it got, then reads the members once", async () => {
    let more!: (r: { given: number; more: boolean }) => void;
    m.api.fillSeats.mockResolvedValueOnce({ given: 450, more: true }).mockImplementationOnce(() => new Promise((res) => { more = res; }));
    const onChanged = vi.fn();
    wrap(<SeatsPanel org={{ ...org, licence: { ...org.licence!, seats: 900 } }} members={members} onChanged={onChanged} />, "/admin?tab=seats");
    fireEvent.click(screen.getByRole("button", { name: "Give the free seats" }));
    await screen.findByText("Seats given so far: 450. Still going…");
    expect(m.api.fillSeats).toHaveBeenCalledTimes(2);
    expect(onChanged).not.toHaveBeenCalled();
    // While it runs, no single seat is given or taken beside it.
    expect((row("Amina").getByRole("button", { name: "Give a seat" }) as HTMLButtonElement).disabled).toBe(true);
    more({ given: 120, more: false });
    await screen.findByText("Seats given: 570 (teachers first, then students).");
    expect(m.api.fillSeats).toHaveBeenCalledTimes(2);
    expect(m.api.fillSeats).toHaveBeenLastCalledWith({ orgId: "o1" });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("stops when a call fails, keeping what the earlier calls gave, and when the server gives nothing more", async () => {
    m.api.fillSeats.mockResolvedValueOnce({ given: 450, more: true }).mockRejectedValueOnce(Object.assign(new Error("deadline-exceeded"), { code: "functions/deadline-exceeded" }));
    const onChanged = vi.fn();
    const { unmount } = wrap(<SeatsPanel org={org} members={members} onChanged={onChanged} />, "/admin?tab=seats");
    fireEvent.click(screen.getByRole("button", { name: "Give the free seats" }));
    expect(await screen.findByText(/^Seats given before it stopped: 450\. This took too long and was stopped/)).toBeTruthy();
    expect(onChanged).toHaveBeenCalledTimes(1);
    unmount();
    // `more` with nothing given would go round for ever: one call, and it says nobody got a seat.
    m.api.fillSeats.mockReset().mockResolvedValue({ given: 0, more: true });
    onChanged.mockClear();
    wrap(<SeatsPanel org={org} members={members} onChanged={onChanged} />, "/admin?tab=seats");
    fireEvent.click(screen.getByRole("button", { name: "Give the free seats" }));
    expect(await screen.findByText("No seat was given: every seat is taken, or nobody is waiting for one.")).toBeTruthy();
    expect(m.api.fillSeats).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("the seats list (feat-org-seats-list)", () => {
  const org = { id: "o1", name: "School", type: "school", status: "active", createdBy: "u1", licence: { plan: "super_seat", seats: 300, until: Date.now() + 9 * DAY } } as Org;
  const member = (i: number, o: Partial<Profile> = {}) => ({ uid: `s${i}`, name: `Pupil ${String(i).padStart(3, "0")}`, email: `p${i}@users.darsiai.org`, role: "student", orgId: "o1", group: i % 2 ? "5A" : "5B", ...o } as Profile);
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
