// Edits that used to vanish when a nav link was tapped (ad-forms-safety): a changed plan price, a changed organization
// name or logo, and a half-written announcement each hold the tap and ask on the page (Stay, Leave anyway, and Save and
// leave where there is a save). The page's own tabs are never held: the edits stay while another tab shows, and a
// question that comes up while its form is under a hidden tab is shown where the person can see it.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BrowserRouter, Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import type { Org } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";
import ar from "../src/admin/forms-strings/ar.json";

const m = vi.hoisted(() => ({
  auth: { user: { uid: "u1" }, role: "superadmin", orgId: "o1", profile: null },
  api: { savePlans: vi.fn(async () => ({ rev: 2 })), sendBroadcast: vi.fn(), reviewOrg: vi.fn(), setSuperOn: vi.fn() },
  plansCfg: { plans: [
    { id: "super_monthly", kind: "individual", period: "month", name: { en: "Super monthly", ar: "سوبر شهري" }, prices: { EGP: 149 }, credits: 300, active: true },
  ], economics: { usdPerCredit: 0.002, egpPerUsd: 50 } },
  orgs: { pending: [] as Org[], active: [] as Org[] },
  /** Both organization lists as one read that failed or is still on its way, when a test sets it. */
  orgsRead: null as null | { data?: Org[]; error?: Error; loading: boolean },
  person: null as unknown,
  /** orgs/{id}/private/request as the hook returns it. */
  request: undefined as Record<string, unknown> | undefined,
  updates: [] as Array<{ path: string; data: Record<string, unknown> }>,
  failUpdate: null as Error | null,
  reload: vi.fn(),
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, functions: {}, firebaseReady: true, call: () => vi.fn(), storage: async () => ({}), storageDataUrl: async () => "data:image/png;base64,AA" }));
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<typeof import("firebase/firestore")>()),
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  updateDoc: async (path: string, data: Record<string, unknown>) => { if (m.failUpdate) throw m.failUpdate; m.updates.push({ path, data }); },
}));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/state/store", () => ({ useStore: () => ({ state: {}, dispatch: vi.fn() }) }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/content/settings", async (orig) => ({ ...(await orig<typeof import("../src/content/settings")>()), useSuperOn: () => ({ on: true, apply: () => {} }) }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  usePlansConfig: () => ({ data: m.plansCfg, reload: m.reload }),
  useOrgsByStatus: (status: "pending" | "active") => (m.orgsRead ? { ...m.orgsRead, reload: m.reload } : { data: m.orgs[status], loading: false, reload: m.reload }),
  usePerson: () => ({ data: m.person, reload: m.reload }),
  useBroadcasts: () => ({ data: [], reload: m.reload }),
  useOrgRequest: () => ({ data: m.request, reload: m.reload }),
}));

const { PlansPage } = await import("../src/admin/Plans");
const { OrgBranding } = await import("../src/admin/OrgBranding");
const { SuperAdmin } = await import("../src/admin/SuperAdmin");
const { Tabs, TabPanel } = await import("../src/admin/Tabs");
const { typedNumber, typedWhole } = await import("../src/admin/typedNumber");

/** The page beside a nav link, as in the app's rail: /learn is somewhere else. */
const page = (ui: ReactNode, url: string, lang = "en") => render(
  <I18nProvider lang={lang}><MemoryRouter initialEntries={[url]}>
    <nav><Link to="/learn">Go to Learn</Link></nav>
    <Routes><Route path="/learn" element={<p>The Learn page</p>} /><Route path="*" element={ui} /></Routes>
  </MemoryRouter></I18nProvider>,
);
const link = () => fireEvent.click(screen.getByRole("link", { name: "Go to Learn" }));
const question = () => screen.queryByRole("alertdialog");
const answer = (name: string) => fireEvent.click(within(question()!).getByRole("button", { name }));
const left = () => screen.queryByText("The Learn page") !== null;
const unload = () => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
const tab = (name: string | RegExp) => screen.getByRole("tab", { name });

beforeEach(() => {
  vi.clearAllMocks();
  m.updates = []; m.failUpdate = null; m.orgs = { pending: [], active: [] }; m.orgsRead = null; m.person = null; m.request = undefined;
  m.api.savePlans.mockImplementation(async () => ({ rev: 2 }));
  vi.spyOn(console, "error").mockImplementation(() => {}); // the staff kit logs the raw error it words
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
});
afterEach(() => vi.restoreAllMocks());

describe("a changed plan price", () => {
  const price = () => within(screen.getByRole("region", { name: "super_monthly" })).getByLabelText("Price in EGP") as HTMLInputElement;

  it("lets a link through while nothing was changed", () => {
    page(<PlansPage />, "/super/plans");
    expect(unload()).toBe(false);
    link();
    expect(left()).toBe(true);
  });

  it("holds a link click, stays on Stay, and saves then leaves on 'Save and leave'", async () => {
    page(<PlansPage />, "/super/plans");
    fireEvent.change(price(), { target: { value: "199" } });
    expect(unload()).toBe(true);
    link();
    expect(left()).toBe(false);
    expect(question()!.textContent).toContain("Leave without saving?");
    expect(document.activeElement).toBe(within(question()!).getByRole("button", { name: "Stay" }));
    answer("Stay");
    expect(question()).toBeNull();
    expect(price().value).toBe("199");
    expect(m.api.savePlans).not.toHaveBeenCalled();
    link();
    answer("Save and leave");
    await waitFor(() => expect(left()).toBe(true));
    expect(m.api.savePlans).toHaveBeenCalledWith({ plans: [{ ...m.plansCfg.plans[0], prices: { EGP: 199 } }], economics: m.plansCfg.economics });
  });

  it("leaves without saving on 'Leave anyway'", () => {
    page(<PlansPage />, "/super/plans");
    fireEvent.change(price(), { target: { value: "199" } });
    link();
    answer("Leave anyway");
    expect(left()).toBe(true);
    expect(m.api.savePlans).not.toHaveBeenCalled();
  });

  it("doesn't hold the page's own tabs, and asks above them when the link is tapped from another tab", () => {
    page(<PlansPage />, "/super/plans");
    fireEvent.change(price(), { target: { value: "199" } });
    fireEvent.click(tab("Revenue check"));
    expect(question()).toBeNull();
    expect(tab("Revenue check").getAttribute("aria-selected")).toBe("true");
    link();
    expect(left()).toBe(false);
    // Not inside the Plans panel, which is hidden just now: above the list of tabs.
    expect(question()!.closest('[role="tabpanel"]')).toBeNull();
    expect(question()!.compareDocumentPosition(screen.getByRole("tablist")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    answer("Stay");
    fireEvent.click(tab(/^Plans/));
    expect(price().value).toBe("199");
  });

  it("stays, and says why beside the question, when 'Save and leave' can't save", async () => {
    m.api.savePlans.mockRejectedValueOnce(Object.assign(new Error("Plan margin."), { details: { reason: "plan-margin", id: "super_monthly", cur: "EGP", margin: 0.25, min: 0.6 } }));
    page(<PlansPage />, "/super/plans");
    fireEvent.change(price(), { target: { value: "40" } });
    fireEvent.click(tab("Revenue check"));
    link();
    answer("Save and leave");
    // The refusal is said above the tabs too: the Plans tab, which has it as well, is not the open one.
    const said = await screen.findByRole("alert");
    expect(said.textContent).toMatch(/^Plan .super_monthly.: the EGP price leaves a 25% margin/);
    expect(said.closest('[role="tabpanel"]')).toBeNull();
    expect(left()).toBe(false);
    expect(question()).toBeTruthy();
    // A field that can't be saved as typed: nothing is sent, the Plans tab opens, and the question stays.
    answer("Stay");
    fireEvent.click(tab(/^Plans/));
    fireEvent.change(price(), { target: { value: "12x" } });
    fireEvent.click(tab("Revenue check"));
    m.api.savePlans.mockClear();
    link();
    answer("Save and leave");
    expect((await screen.findAllByText("This can't be saved yet: fix the fields marked below first.")).length).toBeGreaterThan(0);
    expect(m.api.savePlans).not.toHaveBeenCalled();
    expect(tab(/^Plans/).getAttribute("aria-selected")).toBe("true");
    expect(left()).toBe(false);
  });

  it("typing 0.0035 into the cost of a credit works, and an empty value makes Save wait", () => {
    page(<PlansPage />, "/super/plans");
    const cost = screen.getByLabelText("Provider cost of one credit (USD)") as HTMLInputElement;
    const save = screen.getByRole("button", { name: "Save and publish" }) as HTMLButtonElement;
    for (const typed of ["0", "0.", "0.0", "0.00", "0.003", "0.0035"]) { fireEvent.change(cost, { target: { value: typed } }); expect(cost.value).toBe(typed); }
    expect(save.disabled).toBe(false);
    fireEvent.change(cost, { target: { value: "" } });
    expect(save.disabled).toBe(true);
    expect(cost.getAttribute("aria-invalid")).toBe("true");
  });

  it("reads typed numbers: Arabic and Persian digits, their decimal mark, and nothing that is not a plain number", () => {
    expect(typedNumber("0.0035")).toBe(0.0035);
    expect(typedNumber(" ٠٫٠٠٣٥ ")).toBe(0.0035);
    expect(typedNumber("۱۲۳")).toBe(123);
    expect(typedNumber("١٬٥٠٠")).toBe(1500);
    expect(typedNumber(".5")).toBe(0.5);
    expect(typedNumber("5.")).toBe(5);
    expect(typedNumber("")).toBeUndefined();
    expect(typedNumber("   ")).toBeUndefined();
    for (const bad of ["abc", "1e3", "-2", "+2", "1,5", "1.2.3", ".", "0x10", "Infinity"]) expect(typedNumber(bad), bad).toBeNull();
    expect(typedWhole("٣٠", 1, 3660)).toBe(30);
    for (const bad of ["", "0", "2.5", "3661", "x"]) expect(typedWhole(bad, 1, 3660), bad).toBeNull();
  });
});

describe("a changed organization name", () => {
  const org = { id: "o1", name: "Nile School", type: "school", status: "active", createdBy: "u1" } as Org;
  const name = () => screen.getByLabelText("Organization name") as HTMLInputElement;

  it("lets a link through while nothing was changed", () => {
    page(<OrgBranding org={org} />, "/admin?tab=look");
    expect(unload()).toBe(false);
    link();
    expect(left()).toBe(true);
  });

  it("asks, stays on Stay, and saves then leaves", async () => {
    page(<OrgBranding org={org} />, "/admin?tab=look");
    fireEvent.change(name(), { target: { value: "Nile Academy" } });
    expect(unload()).toBe(true);
    link();
    expect(left()).toBe(false);
    answer("Stay");
    expect(name().value).toBe("Nile Academy");
    expect(m.updates).toEqual([]);
    link();
    answer("Save and leave");
    await waitFor(() => expect(left()).toBe(true));
    expect(m.updates).toEqual([{ path: "orgs/o1", data: { name: "Nile Academy", brand: { logo: null, v: 1 } } }]);
  });

  it("leaves without saving on 'Leave anyway', and doesn't ask for spaces around the same name", () => {
    const view = page(<OrgBranding org={org} />, "/admin?tab=look");
    fireEvent.change(name(), { target: { value: "  Nile School " } });
    expect(unload()).toBe(false);
    fireEvent.change(name(), { target: { value: "Nile Academy" } });
    link();
    answer("Leave anyway");
    expect(left()).toBe(true);
    expect(m.updates).toEqual([]);
    view.unmount();
  });

  it("stays when the save fails, and says why in the admin's language", async () => {
    m.failUpdate = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    page(<OrgBranding org={org} />, "/admin?tab=look");
    fireEvent.change(name(), { target: { value: "Nile Academy" } });
    link();
    answer("Save and leave");
    expect(await screen.findByText(/^Your account isn't allowed to do this/)).toBeTruthy();
    expect(screen.queryByText(/Missing or insufficient/)).toBeNull();
    expect(left()).toBe(false);
    expect(question()).toBeTruthy();
  });

  it("under a tab that is hidden just then, opens its own tab so the question is seen", () => {
    const TABS = [{ id: "look", label: "Look" }, { id: "other", label: "Other" }];
    page(<Tabs label="Sections" tabs={TABS}><TabPanel id="look"><OrgBranding org={org} /></TabPanel><TabPanel id="other"><p>Other things</p></TabPanel></Tabs>, "/admin");
    fireEvent.change(name(), { target: { value: "Nile Academy" } });
    // Another tab of the same page is not leaving: the panel is kept, and nothing is asked.
    fireEvent.click(tab("Other"));
    expect(question()).toBeNull();
    expect(tab("Other").getAttribute("aria-selected")).toBe("true");
    link();
    expect(left()).toBe(false);
    expect(tab("Look").getAttribute("aria-selected")).toBe("true");
    const ask = question()!;
    expect(ask.closest('[role="tabpanel"]')!.hasAttribute("hidden")).toBe(false);
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Stay" }));
    expect(name().value).toBe("Nile Academy");
    answer("Leave anyway");
    expect(left()).toBe(true);
  });

  // The question shows under its own tab; the admin picks another tab instead of answering. Left asking in the hidden
  // panel, it would hold every later tap (nav links, the app bar's Back) with nothing on screen.
  it("a question left unanswered when another tab is picked counts as Stay: the next held tap asks where it is seen", () => {
    const TABS = [{ id: "look", label: "Look" }, { id: "other", label: "Other" }];
    page(<Tabs label="Sections" tabs={TABS}><TabPanel id="look"><OrgBranding org={org} /></TabPanel><TabPanel id="other"><p>Other things</p></TabPanel></Tabs>, "/admin");
    fireEvent.change(name(), { target: { value: "Nile Academy" } });
    fireEvent.click(tab("Other"));
    link();
    expect(tab("Look").getAttribute("aria-selected")).toBe("true");
    expect(question()).toBeTruthy();
    fireEvent.click(tab("Other")); // not answered
    expect(tab("Other").getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("alertdialog", { hidden: true })).toBeNull(); // not kept asking out of sight
    expect(name().value).toBe("Nile Academy");
    link();
    expect(left()).toBe(false);
    expect(tab("Look").getAttribute("aria-selected")).toBe("true");
    const ask = question()!;
    expect(ask.closest('[role="tabpanel"]')!.hasAttribute("hidden")).toBe(false);
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Stay" }));
    answer("Leave anyway");
    expect(left()).toBe(true);
  });

  // A tile or a notice's link that only opens another tab of the same page (Overview's "to review" tile, "Open
  // Status") is no more leaving than the tab itself: the panel with the edits is kept behind it.
  it("doesn't hold a link outside the tab list that only opens another tab of the page; another page still asks", () => {
    const TABS = [{ id: "look", label: "Look" }, { id: "other", label: "Other" }];
    history.replaceState(null, "", "/admin?x=1");
    try {
      render(
        <I18nProvider lang="en"><BrowserRouter>
          <nav><Link to="/learn">Go to Learn</Link><Link to={{ search: "?x=1&tab=other" }}>Open Other</Link><Link to={{ search: "?x=2&tab=other" }}>Another list</Link></nav>
          <Routes><Route path="/learn" element={<p>The Learn page</p>} />
            <Route path="*" element={<Tabs label="Sections" tabs={TABS}><TabPanel id="look"><OrgBranding org={org} /></TabPanel><TabPanel id="other"><p>Other things</p></TabPanel></Tabs>} /></Routes>
        </BrowserRouter></I18nProvider>,
      );
      fireEvent.change(name(), { target: { value: "Nile Academy" } });
      // The same path, but more than the tab changes (another list of the page): that is not only a tab. Asked.
      fireEvent.click(screen.getByRole("link", { name: "Another list" }));
      expect(question()).toBeTruthy();
      expect(location.search).toBe("?x=1");
      answer("Stay");
      // Only the tab changes: let through, nothing asked, and the edits are still there behind it.
      fireEvent.click(screen.getByRole("link", { name: "Open Other" }));
      expect(question()).toBeNull();
      expect(location.pathname + location.search).toBe("/admin?x=1&tab=other");
      expect(tab("Other").getAttribute("aria-selected")).toBe("true");
      expect(unload()).toBe(true);
      // Another page is still leaving.
      link();
      expect(left()).toBe(false);
      expect(tab("Look").getAttribute("aria-selected")).toBe("true");
      expect(name().value).toBe("Nile Academy");
      answer("Leave anyway");
      expect(left()).toBe(true);
    } finally { cleanup(); history.replaceState(null, "", "/"); }
  });

  it("asks in Arabic", () => {
    page(<OrgBranding org={org} />, "/admin?tab=look", "ar");
    fireEvent.change(screen.getByLabelText("اسم المؤسسة"), { target: { value: "مدرسة النيل" } });
    fireEvent.click(screen.getByRole("link", { name: "Go to Learn" }));
    expect(question()!.textContent).toContain(ar["fm.leave.title"]);
    expect(within(question()!).getAllByRole("button").map((b) => b.textContent)).toEqual([ar["fm.leave.go"], ar["fm.leave.save"], ar["fm.leave.stay"]]);
    expect(question()!.textContent).not.toMatch(/[A-Za-z·]/);
  });
});

describe("a typed announcement", () => {
  const ANNOUNCE = "/super?tab=announce";
  const title = () => screen.getByLabelText("Title (English)") as HTMLInputElement;

  it("lets a link through while nothing is written", () => {
    page(<SuperAdmin />, ANNOUNCE);
    link();
    expect(left()).toBe(true);
  });

  it("holds a link click, keeps the text on Stay, and leaves on 'Leave anyway' (there is nothing to save)", () => {
    page(<SuperAdmin />, ANNOUNCE);
    fireEvent.change(title(), { target: { value: "Exam week tips" } });
    expect(unload()).toBe(true);
    link();
    expect(left()).toBe(false);
    const ask = question()!;
    expect(ask.textContent).toContain("Leave without sending the announcement?");
    expect(within(ask).getAllByRole("button").map((b) => b.textContent)).toEqual(["Leave anyway", "Stay"]);
    answer("Stay");
    expect(title().value).toBe("Exam week tips");
    link();
    answer("Leave anyway");
    expect(left()).toBe(true);
    expect(m.api.sendBroadcast).not.toHaveBeenCalled();
  });

  it("asks above the tabs when the link is tapped from another tab, and Stay opens the announcement again", () => {
    page(<SuperAdmin />, ANNOUNCE);
    fireEvent.change(title(), { target: { value: "Exam week tips" } });
    fireEvent.click(tab("Organizations")); // not held: the composer is kept while hidden
    expect(question()).toBeNull();
    link();
    expect(left()).toBe(false);
    expect(question()!.closest('[role="tabpanel"]')).toBeNull();
    answer("Stay");
    expect(tab("Announcements").getAttribute("aria-selected")).toBe("true");
    expect(title().value).toBe("Exam week tips");
  });

  it("asks nothing once the fields are empty again, or the announcement was sent", async () => {
    m.api.sendBroadcast.mockResolvedValue({ id: "b1", results: { en: "m1", ar: "m2" } });
    page(<SuperAdmin />, ANNOUNCE);
    fireEvent.change(title(), { target: { value: "Exam week tips" } });
    fireEvent.change(title(), { target: { value: "  " } });
    expect(unload()).toBe(false);
    for (const [label, value] of [["Title (English)", "Exam week tips"], ["Message (English)", "Five short lessons."], ["Title (Arabic)", "نصائح"], ["Message (Arabic)", "خمسة دروس قصيرة."]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    expect(unload()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Send announcement" }));
    fireEvent.click(screen.getByRole("button", { name: "Send now" }));
    await screen.findByText("Announcement sent.");
    await waitFor(() => expect(unload()).toBe(false));
    link();
    expect(left()).toBe(true);
  });
});

describe("the platform admin's lists when a read fails", () => {
  it("shows a dash on the tiles and says why with Retry, never 0 or 'Nothing waiting'", () => {
    m.orgsRead = { data: undefined, error: Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }), loading: false };
    page(<SuperAdmin />, "/super");
    const panel = within(screen.getByRole("tabpanel", { name: "Requests" }));
    expect(panel.queryByText("Nothing waiting.")).toBeNull();
    for (const tile of ["Organization requests", "Active organizations", "Members"]) expect(panel.getAllByText(tile)[0].closest(".tile")!.querySelector("strong")!.textContent, tile).toBe("—");
    expect(screen.getAllByRole("alert").every((a) => /^Your account isn't allowed to do this/.test(a.textContent ?? ""))).toBe(true);
    expect(screen.queryByText(/Missing or insufficient/)).toBeNull();
    fireEvent.click(panel.getAllByRole("button", { name: "Retry" })[0]);
    expect(m.reload).toHaveBeenCalled();
    // The Organizations tab doesn't claim there are none either.
    fireEvent.click(tab("Organizations"));
    expect(screen.queryByText("No active organizations yet")).toBeNull();
  });

  it("says 'Nothing waiting' only for a list that was read and is empty, and '…' while it loads", () => {
    const view = page(<SuperAdmin />, "/super");
    expect(within(screen.getByRole("tabpanel", { name: "Requests" })).getByText("Nothing waiting.")).toBeTruthy();
    expect(within(screen.getByRole("tabpanel", { name: "Requests" })).getAllByText("Organization requests")[0].closest(".tile")!.querySelector("strong")!.textContent).toBe("0");
    view.unmount();
    m.orgsRead = { data: undefined, loading: true };
    page(<SuperAdmin />, "/super");
    const panel = within(screen.getByRole("tabpanel", { name: "Requests" }));
    expect(panel.queryByText("Nothing waiting.")).toBeNull();
    expect(panel.getAllByText("Organization requests")[0].closest(".tile")!.querySelector("strong")!.textContent).toBe("…");
  });
});

describe("an organization request's sender", () => {
  const request = { id: "o9", name: "Al-Noor School", type: "school", status: "pending", createdBy: "u9", createdAt: { seconds: 1792800000 } } as Org;
  const show = (priv: Record<string, unknown> | undefined) => {
    m.request = priv; m.person = { uid: "u9", name: "Amina Bello", email: "amina@school.org" }; m.orgs.pending = [request];
    const view = page(<SuperAdmin />, "/super");
    return () => view.unmount();
  };

  it("says whether their email was confirmed, when the request says so, and nothing when it doesn't", () => {
    let done = show({ contact: "+20 100", reason: "A pilot", emailVerified: true });
    expect(screen.getByText("(email confirmed)")).toBeTruthy();
    done();
    done = show({ contact: "+20 100", reason: "A pilot", emailVerified: false });
    expect(screen.getByText("(email not confirmed)").className).toBe("err-text");
    done();
    done = show({ contact: "+20 100", reason: "A pilot" }); // a request from before the field existed
    expect(screen.getByText("Amina Bello")).toBeTruthy();
    expect(screen.queryByText(/email (not )?confirmed/)).toBeNull();
    done();
  });
});
