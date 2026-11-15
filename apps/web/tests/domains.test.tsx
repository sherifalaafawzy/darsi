// Organizations' web addresses on the admin screens (admin/Domains.tsx; TECHNICAL.md "Organization sites"): an org
// admin asks for one under its own domain and sees where it stands, with the ownership record and CNAME it adds; a
// platform admin approves, refuses, adds (under darsiai.org too), checks, changes Darsi's identity and removes, all
// through manageSite. The platform admin's page is in tabs (admin/Tabs.tsx): Requests, Addresses, Add an address and
// Not approved, opening on what waits for an answer.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, type Location } from "react-router-dom";
import type { SiteDoc } from "../src/content/sites";
import stEn from "../src/staff/strings/en.json";
import stAr from "../src/staff/strings/ar.json";
import adminAr from "../src/admin/strings/ar.json";

// ready: false is the list still being read. orgReads counts the calls of useAllOrgs (a read of every organization);
// orgError is that read failing.
// siteError is the read of the addresses failing (with nothing read when ready is false).
const h = vi.hoisted(() => ({ sites: [] as SiteDoc[], call: vi.fn(), reload: vi.fn(), ready: true, orgReads: 0, orgError: undefined as Error | undefined, siteError: undefined as Error | undefined, loc: null as unknown as Location }));
vi.mock("../src/admin/data", () => ({
  useSites: (orgId?: string | null) => ({ data: h.ready ? h.sites.filter((s) => !orgId || s.orgId === orgId) : undefined, loading: !h.ready && !h.siteError, error: h.siteError, reload: h.reload }),
  useAllOrgs: () => { h.orgReads++; return h.orgError ? { error: h.orgError, loading: false, reload: vi.fn() } : { data: [
    { id: "o1", name: "CIS Training Platform", type: "university", status: "active", createdBy: "x" },
    { id: "o2", name: "Delta School", type: "school", status: "active", createdBy: "x" },
    { id: "o3", name: "Pending Place", type: "school", status: "pending", createdBy: "x" },
  ], loading: false, reload: vi.fn() }; },
}));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: { manageSite: (a: unknown) => h.call(a) } }));

const { I18nProvider } = await import("../src/i18n");
const { DomainsPage, DomainsWaiting, OrgSitePanel, OrgSiteSummary, typedHost } = await import("../src/admin/Domains");

const OK = { owner: "ok", dns: "ok", hosting: "ok", cert: "ok", auth: "ok", cors: "ok" } as const;
const TOKEN = "0123456789abcdef0123456789abcdef";
const RECORDS = (host: string) => [
  { name: `_darsi.${host}`, type: "TXT", value: `darsi-site=${TOKEN}`, action: "add" as const },
  { name: host, type: "CNAME", value: "darsi-f0685.web.app", action: "add" as const },
];
const site = (host: string, patch: Partial<SiteDoc> = {}): SiteDoc => ({
  host, orgId: "o1", orgName: "CIS Training Platform", darsi: true, status: "requested", requestedBy: "adm", requestedAt: Date.UTC(2026, 10, 9, 10),
  approvedBy: null, approvedAt: null, refusedReason: null, steps: null, records: null, issues: null, error: null, checkedAt: null, liveAt: null, proof: null, ...patch,
});
function Where() { h.loc = useLocation(); return null; }
const ui = (node: React.ReactNode, lang = "en", path = "/") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[path]}><Where />{node}</MemoryRouter></I18nProvider>);
/** A tab by its name; a count is part of it ("Requests 1"). */
const tab = (name: string | RegExp) => screen.getByRole("tab", { name });
const tabNames = () => screen.getAllByRole("tab").map((x) => x.textContent);
const openTab = () => screen.getAllByRole("tab").filter((x) => x.getAttribute("aria-selected") === "true").map((x) => x.textContent);

beforeEach(() => { h.sites = []; h.call.mockReset(); h.reload.mockReset(); h.ready = true; h.orgReads = 0; h.orgError = undefined; h.siteError = undefined; });

it("reads what an admin pastes as a host", () => {
  expect(typedHost(" https://CIS.darsiai.org/learn?x=1 ")).toBe("cis.darsiai.org");
  expect(typedHost("cis.darsiai.org.")).toBe("cis.darsiai.org");
  expect(typedHost("")).toBe("");
});

describe("an org admin's Web address panel", () => {
  it("asks for an address under its own domain, refusing Darsi's and darsiai.org's before sending", async () => {
    h.call.mockResolvedValue({ site: site("learn.school.edu") });
    ui(<OrgSitePanel orgId="o1" />);
    expect(screen.getByText(/No web address yet/)).toBeTruthy();
    const field = screen.getByLabelText("Address");
    fireEvent.change(field, { target: { value: "www.darsiai.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask for this address" }));
    expect(await screen.findByText(/one of Darsi's own addresses/)).toBeTruthy();
    fireEvent.change(field, { target: { value: "school.darsiai.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask for this address" }));
    expect(await screen.findByText(/Addresses under darsiai\.org are set up by Darsi/)).toBeTruthy();
    expect(h.call).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "https://Learn.School.edu/" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask for this address" }));
    await waitFor(() => expect(h.call).toHaveBeenCalledWith({ action: "request", host: "learn.school.edu" }));
    expect(await screen.findByText(/Sent\. A Darsi platform admin will look at it/)).toBeTruthy();
    expect(h.reload).toHaveBeenCalled();
  });

  it("shows a request waiting with the two records to add meanwhile, and takes it back", async () => {
    h.sites = [site("learn.school.edu", { records: RECORDS("learn.school.edu"), proof: TOKEN })];
    h.call.mockResolvedValue({ site: null });
    ui(<OrgSitePanel orgId="o1" />);
    expect(screen.getByText("Waiting for approval")).toBeTruthy();
    expect(screen.getByText(/While it waits, ask whoever manages the DNS of .*school\.edu/)).toBeTruthy();
    expect(screen.getByText("_darsi.learn.school.edu")).toBeTruthy();
    expect(screen.getByText(`darsi-site=${TOKEN}`)).toBeTruthy();
    expect(screen.getByText("darsi-f0685.web.app")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Take back the request" }));
    await waitFor(() => expect(h.call).toHaveBeenCalledWith({ action: "cancel", host: "learn.school.edu" }));
  });
  it("tells an older request with no records that nothing else is needed", () => {
    h.sites = [site("school.darsiai.org")];
    ui(<OrgSitePanel orgId="o1" />);
    expect(screen.getByText(/Nothing else is needed from you/)).toBeTruthy();
  });

  it("shows the DNS changes an address of its own still needs, each step, and checks again", async () => {
    h.sites = [site("learn.cis.edu.eg", {
      status: "connecting", steps: { ...OK, owner: "wait", dns: "wait", hosting: "todo", cert: "todo", auth: "wait", cors: "wait" }, checkedAt: Date.UTC(2026, 10, 9, 11),
      records: RECORDS("learn.cis.edu.eg"), proof: TOKEN,
    })];
    h.call.mockResolvedValue({ site: h.sites[0] });
    ui(<OrgSitePanel orgId="o1" />);
    expect(screen.getByText(/ask whoever manages the DNS of .*cis\.edu\.eg.? to make these changes/)).toBeTruthy();
    expect(screen.getByText(`darsi-site=${TOKEN}`)).toBeTruthy();
    expect(screen.getByText("darsi-f0685.web.app")).toBeTruthy();
    const steps = screen.getByRole("list", { name: "Connecting it" });
    expect(within(steps).getByText("Ownership record (DNS)")).toBeTruthy();
    expect(within(steps).getAllByText("Waiting")).toHaveLength(4);
    expect(within(steps).getAllByText("Not started")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Check now" }));
    await waitFor(() => expect(h.call).toHaveBeenCalledWith({ action: "check", host: "learn.cis.edu.eg" }));
  });

  it("asks nothing of an address under darsiai.org, shows a live one, a refused one with its reason, and stops at three", () => {
    h.sites = [
      site("a.darsiai.org", { status: "connecting", steps: { ...OK, cert: "wait" }, records: [{ name: "a.darsiai.org", type: "CNAME", value: "darsi-f0685.web.app", action: "add" }] }),
      site("b.darsiai.org", { status: "live", steps: OK, liveAt: Date.UTC(2026, 10, 9, 12) }),
      site("c.darsiai.org", { status: "refused", refusedReason: "Use your institute's short name" }),
      site("d.darsiai.org"),
    ];
    ui(<OrgSitePanel orgId="o1" />);
    expect(screen.getByText(/Darsi is connecting it/)).toBeTruthy();
    expect(screen.queryByText(/ask whoever manages/)).toBeNull();
    expect(screen.getByRole("link", { name: "b.darsiai.org" }).getAttribute("href")).toBe("https://b.darsiai.org");
    expect(screen.getByText(/Live since/)).toBeTruthy();
    expect(screen.getByText(/Use your institute's short name/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove from the list" })).toBeTruthy();
    expect(screen.queryByLabelText("Address")).toBeNull();
    expect(screen.getByText(/as many addresses as it can have \(3\)/)).toBeTruthy();
  });

  it("says why the server refused a domain itself, in the admin's words", async () => {
    h.call.mockRejectedValue(Object.assign(new Error("Use an address under your domain"), { details: { reason: "site-apex" } }));
    ui(<OrgSitePanel orgId="o1" />);
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "school.edu" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask for this address" }));
    expect(await screen.findByText(/not the domain itself/)).toBeTruthy();
  });
  it("says why the server refused, in the admin's words", async () => {
    h.call.mockRejectedValue(Object.assign(new Error("RAW SERVER WORDS"), { details: { reason: "site-taken" } }));
    ui(<OrgSitePanel orgId="o1" />);
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "taken.school.edu" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask for this address" }));
    expect(await screen.findByText("That address belongs to another organization.")).toBeTruthy();
    expect(screen.queryByText(/RAW SERVER WORDS/)).toBeNull();
  });
  // A failure with no refusal code (the SDK's "internal", a read the rules refuse) is a sentence in the admin's
  // language (staff/errors.ts), never the SDK's or the server's own English.
  it("a call that fails with no refusal code is said in the admin's language, never as the SDK's word", async () => {
    h.call.mockRejectedValue(Object.assign(new Error("internal"), { code: "functions/internal" }));
    ui(<OrgSitePanel orgId="o1" />, "ar");
    fireEvent.change(screen.getByLabelText("العنوان"), { target: { value: "learn.school.edu" } });
    fireEvent.click(screen.getByRole("button", { name: "اطلب هذا العنوان" }));
    expect(await screen.findByText(stAr["st.err.internal"])).toBeTruthy();
    expect(screen.queryByText(/internal/)).toBeNull();
  });
  it("a refusal it knows keeps its own words", async () => {
    h.call.mockRejectedValue(Object.assign(new Error("RAW SERVER WORDS"), { code: "functions/failed-precondition", details: { reason: "site-limit" } }));
    ui(<OrgSitePanel orgId="o1" />);
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "learn.school.edu" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask for this address" }));
    expect(await screen.findByText("An organization can have at most 3 web addresses, asked for or connected.")).toBeTruthy();
    expect(screen.queryByText(/RAW SERVER WORDS/)).toBeNull();
  });
  it("a list that can't be read says why in words, on the panel and on the organization's page", () => {
    h.ready = false; h.siteError = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    ui(<><OrgSitePanel orgId="o1" /><OrgSiteSummary orgId="o1" /></>);
    expect(screen.getAllByText(stEn["st.err.permissionDenied"])).toHaveLength(2);
    expect(screen.queryByText(/Missing or insufficient permissions/)).toBeNull();
  });
  it("says the same of an address that is another organization's when an older server calls it 'not-yours'", async () => {
    // admin/refusals.ts words "not-yours" for accounts ("…the organization that manages the account"): never for an address.
    h.call.mockRejectedValue(Object.assign(new Error("RAW SERVER WORDS"), { code: "functions/permission-denied", details: { reason: "not-yours" } }));
    ui(<OrgSitePanel orgId="o1" />, "ar");
    fireEvent.change(screen.getByLabelText("العنوان"), { target: { value: "taken.school.edu" } });
    fireEvent.click(screen.getByRole("button", { name: "اطلب هذا العنوان" }));
    expect(await screen.findByText("هذا العنوان يخصّ مؤسسة أخرى.")).toBeTruthy();
    expect(screen.queryByText(/تدير الحساب|RAW SERVER WORDS/)).toBeNull();
  });

  it("in Arabic", () => {
    h.sites = [site("learn.school.edu", { records: RECORDS("learn.school.edu"), proof: TOKEN })];
    ui(<OrgSitePanel orgId="o1" />, "ar");
    expect(screen.getByRole("heading", { name: "عنوان الموقع" })).toBeTruthy();
    expect(screen.getByText("بانتظار الموافقة")).toBeTruthy();
    expect(screen.getByText(/إضافة هذين السجلّين/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "اسحب الطلب" })).toBeTruthy();
  });
});

describe("the platform admin's Web addresses page", () => {
  it("approves a request with or without Darsi's identity, which connects it", async () => {
    h.sites = [site("school.darsiai.org")];
    h.call.mockResolvedValue({ site: site("school.darsiai.org", { status: "live", steps: OK }) });
    ui(<DomainsPage />);
    expect(openTab()).toEqual(["Requests 1"]); // a request waits: the page opens on it
    expect(screen.getByRole("heading", { name: "Waiting for approval (1)" })).toBeTruthy();
    const card = within(screen.getAllByRole("article")[0]);
    fireEvent.click(card.getByRole("switch", { name: /Show Darsi's identity/ }));
    fireEvent.click(card.getByRole("button", { name: "Approve and connect" }));
    await waitFor(() => expect(h.call).toHaveBeenCalledWith({ action: "approve", host: "school.darsiai.org", darsi: false }));
    expect(await screen.findByText(/Approved: .*school\.darsiai\.org.*\. Live\./)).toBeTruthy();
  });

  it("refuses a request with a reason the organization sees", async () => {
    h.sites = [site("school.darsiai.org")];
    h.call.mockResolvedValue({ site: site("school.darsiai.org", { status: "refused" }) });
    ui(<DomainsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Refuse" }));
    fireEvent.change(screen.getByLabelText(/Why/), { target: { value: "Use your short name" } });
    fireEvent.click(screen.getByRole("button", { name: "Refuse the request" }));
    await waitFor(() => expect(h.call).toHaveBeenCalledWith({ action: "refuse", host: "school.darsiai.org", reason: "Use your short name" }));
    expect(await screen.findByText(/Refused\. The organization sees it/)).toBeTruthy();
  });

  it("adds an address for an active organization, preset from its page", async () => {
    h.call.mockResolvedValue({ site: site("delta.darsiai.org", { orgId: "o2", status: "connecting" }) });
    ui(<DomainsPage />, "en", "/super/domains?org=o2");
    expect(openTab()).toEqual(["Add an address"]); // the link on an organization's page opens the form, no tab to choose
    const pick = screen.getByLabelText("Organization") as HTMLSelectElement;
    expect(pick.value).toBe("o2");
    expect([...pick.options].map((o) => o.textContent)).toEqual(["Choose an organization", "CIS Training Platform", "Delta School"]);
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "Delta.darsiai.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Add and connect" }));
    await waitFor(() => expect(h.call).toHaveBeenCalledWith({ action: "approve", host: "delta.darsiai.org", orgId: "o2", darsi: true }));
    expect(await screen.findByText(/Approved: .*delta\.darsiai\.org.*\. Connecting\./)).toBeTruthy();
  });

  it("lists every address with its steps, problems first, and what went wrong", () => {
    h.sites = [
      site("b.darsiai.org", { status: "live", steps: OK }),
      site("a.cis.org", { status: "problem", steps: { ...OK, auth: "error" }, error: "Authentication: 403 The caller does not have permission" }),
      site("learn.cis.edu.eg", { status: "connecting", steps: { ...OK, dns: "wait" }, records: [{ name: "learn.cis.edu.eg", type: "CNAME", value: "darsi-f0685.web.app", action: "add" }] }),
      site("z.darsiai.org", { status: "connecting", steps: { ...OK, dns: "wait" }, records: [{ name: "z.darsiai.org", type: "CNAME", value: "darsi-f0685.web.app", action: "add" }] }),
    ];
    ui(<DomainsPage />);
    expect(openTab()).toEqual(["Addresses 4"]); // nothing waits: the page opens on the list
    expect(screen.getByRole("heading", { name: "Addresses (4)" })).toBeTruthy();
    const hosts = screen.getAllByRole("article").map((a) => a.querySelector(".site-head")?.textContent ?? "");
    expect(hosts.map((x) => x.split(/Live|Connecting|Needs attention/)[0])).toEqual(["a.cis.org", "learn.cis.edu.eg", "z.darsiai.org", "b.darsiai.org"]);
    expect(screen.getByText("Authentication: 403 The caller does not have permission")).toBeTruthy();
    expect(screen.getByText(/The organization sees these changes/)).toBeTruthy();
    expect(screen.getByText(/Add this record in Cloudflare/)).toBeTruthy();
    expect(screen.queryByText("No requests waiting.")).toBeNull(); // under Requests, which hasn't been opened
    fireEvent.click(tab("Requests"));
    expect(screen.getByText("No requests waiting.")).toBeTruthy();
  });

  it("changes Darsi's identity at once, checks, and removes after asking, showing what couldn't be undone", async () => {
    h.sites = [site("b.darsiai.org", { status: "live", steps: OK })];
    h.call.mockResolvedValue({ site: h.sites[0] });
    ui(<DomainsPage />);
    expect(openTab()).toEqual(["Addresses 1"]);
    fireEvent.click(within(screen.getAllByRole("article")[0]).getByRole("switch", { name: /Show Darsi's identity/ }));
    await waitFor(() => expect(h.call).toHaveBeenCalledWith({ action: "identity", host: "b.darsiai.org", darsi: false }));
    expect(await screen.findByText(/Saved\. Phones on this address/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check now" }));
    await waitFor(() => expect(h.call).toHaveBeenLastCalledWith({ action: "check", host: "b.darsiai.org" }));
    h.call.mockResolvedValue({ site: null, warnings: ["Hosting: 500 Internal error"] });
    fireEvent.click(screen.getByRole("button", { name: "Remove the address" }));
    expect(screen.getByText(/stops working until it is added again/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }));
    await waitFor(() => expect(h.call).toHaveBeenLastCalledWith({ action: "remove", host: "b.darsiai.org" }));
    expect(await screen.findByText("Hosting: 500 Internal error")).toBeTruthy();
    expect(screen.getByText(/Some parts couldn't be undone/)).toBeTruthy();
  });

  it("in Arabic", () => {
    h.sites = [site("school.darsiai.org"), site("b.darsiai.org", { status: "live", steps: OK })];
    ui(<DomainsPage />, "ar");
    expect(within(screen.getByRole("tablist", { name: "أقسام هذه الصفحة" })).getAllByRole("tab").map((x) => x.textContent)).toEqual(["الطلبات ١", "العناوين ١", "إضافة عنوان", "تسجيل الدخول عبر المدرسة"]);
    expect(openTab()).toEqual(["الطلبات ١"]);
    expect(screen.getByRole("heading", { name: "بانتظار الموافقة (١)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "وافق واربط" })).toBeTruthy();
    fireEvent.click(tab("العناوين ١")); // the steps of a connected address are under Addresses
    expect(screen.getAllByText("تم").length).toBeGreaterThan(0);
  });

  describe("in tabs", () => {
    it("shows no tabs while the list is being read, then opens on the requests when any wait, else on the addresses", () => {
      h.ready = false;
      const first = ui(<DomainsPage />, "en", "/super/domains");
      expect(screen.queryByRole("tablist")).toBeNull();
      expect(first.container.querySelector('.loading[aria-busy="true"]')).toBeTruthy();
      first.unmount();
      h.ready = true;
      h.sites = [site("a.darsiai.org"), site("b.darsiai.org", { status: "live", steps: OK })];
      const waiting = ui(<DomainsPage />, "en", "/super/domains");
      expect(within(screen.getByRole("tablist", { name: "Sections of this page" })).getAllByRole("tab").map((x) => x.textContent)).toEqual(["Requests 1", "Addresses 1", "Add an address", "School sign-in"]);
      expect(openTab()).toEqual(["Requests 1"]);
      expect(within(screen.getByRole("tabpanel", { name: "Requests 1" })).getByText("a.darsiai.org")).toBeTruthy();
      expect(screen.queryByText("b.darsiai.org")).toBeNull(); // under Addresses, not opened
      expect(h.loc.search).toBe("");
      waiting.unmount();
      h.sites = [site("b.darsiai.org", { status: "live", steps: OK })];
      const none = ui(<DomainsPage />, "en", "/super/domains");
      expect(openTab()).toEqual(["Addresses 1"]);
      expect(within(screen.getByRole("tabpanel", { name: "Addresses 1" })).getByText("b.darsiai.org")).toBeTruthy();
      none.unmount();
      h.sites = [];
      ui(<DomainsPage />, "en", "/super/domains");
      expect(tabNames()).toEqual(["Requests", "Addresses", "Add an address", "School sign-in"]); // no count for none
      expect(openTab()).toEqual(["Addresses"]);
      expect(screen.getByText("No organization has an address yet.")).toBeTruthy();
    });

    it("reads the organizations only when Add an address is opened, and keeps what was typed there", () => {
      h.sites = [site("a.darsiai.org"), site("b.darsiai.org", { status: "live", steps: OK })];
      ui(<DomainsPage />, "en", "/super/domains");
      fireEvent.click(tab("Addresses 1"));
      expect(h.loc.search).toBe("?tab=addresses");
      expect(h.orgReads).toBe(0);
      expect(screen.queryByLabelText("Organization")).toBeNull();
      fireEvent.click(tab("Add an address"));
      expect(h.loc.search).toBe("?tab=add");
      expect(h.orgReads).toBeGreaterThan(0);
      expect([...(screen.getByLabelText("Organization") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Choose an organization", "CIS Training Platform", "Delta School"]);
      fireEvent.change(screen.getByLabelText("Address"), { target: { value: "half.typed" } });
      fireEvent.click(tab("Requests 1"));
      expect(h.loc.search).toBe(""); // the default tab has no parameter
      fireEvent.click(tab("Add an address"));
      expect((screen.getByLabelText("Address") as HTMLInputElement).value).toBe("half.typed");
    });

    it("says so when the organizations can't be read, under Add an address only", () => {
      // In words (staff/errors.ts), not the SDK's own "Missing or insufficient permissions.".
      h.orgError = Object.assign(new Error("FirebaseError: Missing or insufficient permissions."), { code: "permission-denied" });
      ui(<DomainsPage />, "en", "/super/domains");
      expect(screen.queryByText(stEn["st.err.permissionDenied"])).toBeNull();
      fireEvent.click(tab("Add an address"));
      expect(within(screen.getByRole("tabpanel", { name: "Add an address" })).getByText(stEn["st.err.permissionDenied"])).toBeTruthy();
      expect(screen.queryByText(/Missing or insufficient permissions/)).toBeNull();
      expect([...(screen.getByLabelText("Organization") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Choose an organization"]);
    });

    it("?org= opens Add an address with that organization chosen even while requests wait, and stays in the address on the other tabs", () => {
      h.sites = [site("a.darsiai.org"), site("b.darsiai.org", { status: "live", steps: OK })];
      ui(<DomainsPage />, "en", "/super/domains?org=o1");
      expect(openTab()).toEqual(["Add an address"]);
      expect((screen.getByLabelText("Organization") as HTMLSelectElement).value).toBe("o1");
      expect(tab("Add an address").getAttribute("href")).toBe("/super/domains?org=o1");
      expect(tab("Requests 1").getAttribute("href")).toBe("/super/domains?org=o1&tab=requests");
      expect(tab("Addresses 1").getAttribute("href")).toBe("/super/domains?org=o1&tab=addresses");
      fireEvent.click(tab("Addresses 1"));
      expect(h.loc.search).toBe("?org=o1&tab=addresses");
      expect(openTab()).toEqual(["Addresses 1"]);
      fireEvent.click(tab("Add an address"));
      expect(h.loc.search).toBe("?org=o1");
      expect((screen.getByLabelText("Organization") as HTMLSelectElement).value).toBe("o1");
    });

    it("approving the last request keeps the admin on Requests, with what happened still shown on every tab", async () => {
      const connecting = site("school.darsiai.org", { status: "connecting", steps: { ...OK, cert: "wait" } });
      h.sites = [site("school.darsiai.org")];
      h.call.mockResolvedValue({ site: connecting });
      h.reload.mockImplementation(() => { h.sites = [connecting]; }); // the list read again: nothing waits any more
      ui(<DomainsPage />, "en", "/super/domains");
      fireEvent.click(screen.getByRole("button", { name: "Approve and connect" }));
      expect(await screen.findByText(/Approved: .*school\.darsiai\.org.*\. Connecting\./)).toBeTruthy();
      await waitFor(() => expect(tabNames()).toEqual(["Requests", "Addresses 1", "Add an address", "School sign-in"]));
      expect(openTab()).toEqual(["Requests"]);
      expect(h.loc.search).toBe("");
      expect(within(screen.getByRole("tabpanel", { name: "Requests" })).getByText("No requests waiting.")).toBeTruthy();
      fireEvent.click(tab("Addresses 1"));
      expect(within(screen.getByRole("tabpanel", { name: "Addresses 1" })).getByText("school.darsiai.org")).toBeTruthy();
      expect(screen.getByRole("status").textContent).toMatch(/Approved: .*school\.darsiai\.org/);
    });

    it("lists the refused requests under Not approved, which goes with the last of them", async () => {
      const live = site("b.darsiai.org", { status: "live", steps: OK });
      h.sites = [live, site("c.darsiai.org", { status: "refused", refusedReason: "Use your institute's short name" })];
      h.call.mockResolvedValue({ site: null });
      h.reload.mockImplementation(() => { h.sites = [live]; });
      ui(<DomainsPage />, "en", "/super/domains?tab=refused");
      expect(tabNames()).toEqual(["Requests", "Addresses 1", "Add an address", "Not approved 1", "School sign-in"]);
      expect(openTab()).toEqual(["Not approved 1"]);
      const panel = within(screen.getByRole("tabpanel", { name: "Not approved 1" }));
      expect(panel.getByRole("heading", { name: "Not approved (1)" })).toBeTruthy();
      expect(panel.getByText("c.darsiai.org")).toBeTruthy();
      expect(panel.getByText(/Use your institute's short name/)).toBeTruthy();
      expect(panel.getByRole("link", { name: "CIS Training Platform" }).getAttribute("href")).toBe("/super/orgs/o1");
      expect(screen.queryByText("b.darsiai.org")).toBeNull();
      fireEvent.click(panel.getByRole("button", { name: "Remove from the list" }));
      await waitFor(() => expect(h.call).toHaveBeenCalledWith({ action: "cancel", host: "c.darsiai.org" }));
      // None left: the tab is gone, the page shows its default tab and the address no longer names the tab.
      await waitFor(() => expect(tabNames()).toEqual(["Requests", "Addresses 1", "Add an address", "School sign-in"]));
      expect(openTab()).toEqual(["Addresses 1"]);
      expect(screen.getByText("b.darsiai.org")).toBeTruthy();
      await waitFor(() => expect(h.loc.search).toBe(""));
    });

    it("has no Not approved tab when nothing was refused, and its address opens the default tab", async () => {
      h.sites = [site("a.darsiai.org"), site("b.darsiai.org", { status: "live", steps: OK })];
      const plain = ui(<DomainsPage />, "en", "/super/domains?tab=refused");
      expect(screen.queryByRole("tab", { name: /Not approved/ })).toBeNull();
      expect(openTab()).toEqual(["Requests 1"]);
      await waitFor(() => expect(h.loc.search).toBe("")); // the address stops naming a tab that isn't there
      plain.unmount();
      ui(<DomainsPage />, "en", "/super/domains?org=o1&tab=refused");
      expect(openTab()).toEqual(["Add an address"]); // ?org= still decides the default
      await waitFor(() => expect(h.loc.search).toBe("?org=o1")); // only the tab is taken out
    });

    it("refusing a request after the last refusal was dismissed keeps the admin on Requests", async () => {
      const asked = site("a.darsiai.org"), old = site("c.darsiai.org", { status: "refused" });
      h.sites = [asked, old];
      h.call.mockResolvedValue({ site: null });
      h.reload.mockImplementationOnce(() => { h.sites = [asked]; }).mockImplementationOnce(() => { h.sites = [{ ...asked, status: "refused" }]; });
      ui(<DomainsPage />, "en", "/super/domains?tab=refused");
      fireEvent.click(screen.getByRole("button", { name: "Remove from the list" }));
      await waitFor(() => expect(openTab()).toEqual(["Requests 1"]));
      await waitFor(() => expect(h.loc.search).toBe(""));
      fireEvent.click(screen.getByRole("button", { name: "Refuse" }));
      fireEvent.click(screen.getByRole("button", { name: "Refuse the request" }));
      // "Not approved" is back in the list, but the admin isn't moved to it: the address stopped asking for it.
      await waitFor(() => expect(tabNames()).toEqual(["Requests", "Addresses", "Add an address", "Not approved 1", "School sign-in"]));
      expect(openTab()).toEqual(["Requests"]);
      expect(screen.getByRole("status").textContent).toMatch(/Refused\. The organization sees it/);
    });
  });
});

describe("what stands above the Web addresses tabs", () => {
  it("opens with two short sentences; how a connection works waits behind \"How it works\"", () => {
    h.sites = [site("a.darsiai.org")];
    const { container } = ui(<DomainsPage />, "en", "/super/domains");
    const intro = screen.getByText(/Organizations ask for a web address under their own domain/);
    // Two sentences, not the 90 words the page used to open with.
    expect(intro.textContent!.split(/\s+/).length).toBeLessThanOrEqual(30);
    expect(intro.textContent!.match(/[.!?](\s|$)/g)).toHaveLength(2);
    // The rest is in a native disclosure, closed until asked for: the browser's own keyboard and screen reader behaviour.
    const how = container.querySelector("details")!;
    expect(how.open).toBe(false);
    expect(how.querySelector("summary")!.textContent).toBe("How it works");
    const steps = within(how).getAllByRole("listitem", { hidden: true }).map((x) => x.textContent);
    expect(steps).toHaveLength(4);
    expect(steps[0]).toMatch(/an ownership record and a CNAME/);
    expect(steps[2]).toMatch(/checked every hour/);
    expect(steps[3]).toMatch(/Addresses under darsiai\.org are yours to add/);
    // Above the tabs, whatever the tab.
    expect(how.closest("[role=tabpanel]")).toBeNull();
    expect(how.compareDocumentPosition(screen.getByRole("tablist")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("in Arabic, with the Latin names kept left to right inside their sentences and no \"·\"", () => {
    h.sites = [site("a.darsiai.org")];
    const { container } = ui(<DomainsPage />, "ar", "/super/domains");
    const how = container.querySelector("details")!;
    expect(how.querySelector("summary")!.textContent).toBe("كيف يعمل ذلك");
    const text = how.textContent!;
    for (const word of ["CNAME", "Firebase", "darsiai.org"]) expect(text).toContain(`\u2066${word}\u2069`);
    expect(container.querySelector("main")!.textContent).not.toContain("·");
  });

  it("Read again is at the end of the tab row, not on a line of its own, and reads the addresses again", () => {
    h.sites = [site("a.darsiai.org")];
    ui(<DomainsPage />, "en", "/super/domains?tab=add");
    const again = screen.getByRole("button", { name: "Read again" });
    const list = screen.getByRole("tablist");
    expect(list.contains(again)).toBe(false);
    expect(again.closest(".tb-action")?.parentElement).toBe(list.parentElement);
    expect(again.closest("[role=tabpanel]")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Read again" })).toHaveLength(1);
    fireEvent.click(again);
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(tab("Add an address").getAttribute("aria-selected")).toBe("true"); // the tab stays
  });

  it("a read that failed with nothing to show keeps a way to try again, though there are no tabs to hold it", () => {
    h.ready = false; h.siteError = Object.assign(new Error("offline"), { code: "unavailable" });
    const { container } = ui(<DomainsPage />, "en", "/super/domains");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(container.querySelector(".notice.err")?.textContent).toBe(stEn["st.err.unavailable"]);
    expect(screen.queryByText("offline")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Read again" }));
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it("while the first read is out there is no button to press twice", () => {
    h.ready = false;
    ui(<DomainsPage />, "en", "/super/domains");
    expect(screen.queryByRole("button", { name: "Read again" })).toBeNull();
  });
});

describe("the other places an address shows", () => {
  it("the organization's page lists its addresses and links to the Web addresses page", () => {
    h.sites = [site("b.darsiai.org", { status: "live", steps: OK }), site("x.darsiai.org", { orgId: "o2" })];
    ui(<OrgSiteSummary orgId="o1" />);
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.queryByText("x.darsiai.org")).toBeNull();
    expect(screen.getByRole("link", { name: "Manage web addresses" }).getAttribute("href")).toBe("/super/domains?org=o1");
  });
  it("the platform admin's home says how many wait, and nothing when none do", () => {
    h.sites = [site("a.darsiai.org"), site("b.darsiai.org", { orgId: "o2" }), site("c.darsiai.org", { status: "live" })];
    const { unmount } = ui(<DomainsWaiting />);
    expect(screen.getByRole("link", { name: "Web addresses waiting for approval: 2" }).getAttribute("href")).toBe("/super/domains");
    unmount();
    h.sites = [];
    const { container } = ui(<DomainsWaiting />);
    expect(container.textContent).toBe("");
  });
});

// A full stop right after an isolated Latin run lands at that run's left edge in a right-to-left line, so an address
// the admin is asked to type reads ".learn.yourschool.edu" (and "https://" with a dot before it). The sentences are
// worded so that something else follows the isolate: a bracket, a colon, or more words.
it("no Arabic admin string puts a full stop straight after an isolated Latin run", () => {
  const touching = Object.entries(adminAr as Record<string, string>).filter(([, v]) => /⁩[.۔]/.test(v)).map(([key]) => key);
  expect(touching).toEqual([]);
  // The Web address strings still carry their examples, isolated.
  const words = adminAr as Record<string, string>;
  for (const key of ["site.askHint", "site.rf.host", "site.rf.zone"]) expect(words[key], key).toContain("⁦learn.yourschool.edu⁩");
  expect(words["site.rf.host"]).toContain("⁦https://⁩");
  expect(words["site.how1"]).toContain("⁦CNAME⁩");
});
