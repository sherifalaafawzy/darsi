// Organizations' web addresses on the admin screens (admin/Domains.tsx; TECHNICAL.md "Organization sites"): an org
// admin asks for one and sees where it stands, with the DNS change an address of its own needs; a platform admin
// approves, refuses, adds, checks, changes Darsi's identity and removes, all through manageSite.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SiteDoc } from "../src/content/sites";

const h = vi.hoisted(() => ({ sites: [] as SiteDoc[], call: vi.fn(), reload: vi.fn() }));
vi.mock("../src/admin/data", () => ({
  useSites: (orgId?: string | null) => ({ data: h.sites.filter((s) => !orgId || s.orgId === orgId), loading: false, reload: h.reload }),
  useAllOrgs: () => ({ data: [
    { id: "o1", name: "CIS Training Platform", type: "university", status: "active", createdBy: "x" },
    { id: "o2", name: "Delta School", type: "school", status: "active", createdBy: "x" },
    { id: "o3", name: "Pending Place", type: "school", status: "pending", createdBy: "x" },
  ], loading: false, reload: vi.fn() }),
}));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: { manageSite: (a: unknown) => h.call(a) } }));

const { I18nProvider } = await import("../src/i18n");
const { DomainsPage, DomainsWaiting, OrgSitePanel, OrgSiteSummary, typedHost } = await import("../src/admin/Domains");

const OK = { dns: "ok", hosting: "ok", cert: "ok", auth: "ok", cors: "ok" } as const;
const site = (host: string, patch: Partial<SiteDoc> = {}): SiteDoc => ({
  host, orgId: "o1", orgName: "CIS Training Platform", darsi: true, status: "requested", requestedBy: "adm", requestedAt: Date.UTC(2026, 10, 9, 10),
  approvedBy: null, approvedAt: null, refusedReason: null, steps: null, records: null, issues: null, error: null, checkedAt: null, liveAt: null, ...patch,
});
const ui = (node: React.ReactNode, lang = "en", path = "/") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[path]}>{node}</MemoryRouter></I18nProvider>);

beforeEach(() => { h.sites = []; h.call.mockReset(); h.reload.mockReset(); });

it("reads what an admin pastes as a host", () => {
  expect(typedHost(" https://CIS.darsiai.org/learn?x=1 ")).toBe("cis.darsiai.org");
  expect(typedHost("cis.darsiai.org.")).toBe("cis.darsiai.org");
  expect(typedHost("")).toBe("");
});

describe("an org admin's Web address panel", () => {
  it("asks for an address, refusing a bad one before sending it", async () => {
    h.call.mockResolvedValue({ site: site("school.darsiai.org") });
    ui(<OrgSitePanel orgId="o1" />);
    expect(screen.getByText(/No web address yet/)).toBeTruthy();
    const field = screen.getByLabelText("Address");
    fireEvent.change(field, { target: { value: "www.darsiai.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask for this address" }));
    expect(await screen.findByText(/one of Darsi's own addresses/)).toBeTruthy();
    expect(h.call).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "https://School.darsiai.org/" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask for this address" }));
    await waitFor(() => expect(h.call).toHaveBeenCalledWith({ action: "request", host: "school.darsiai.org" }));
    expect(await screen.findByText(/Sent\. A Darsi platform admin will look at it/)).toBeTruthy();
    expect(h.reload).toHaveBeenCalled();
  });

  it("shows a request waiting, and takes it back", async () => {
    h.sites = [site("school.darsiai.org")];
    h.call.mockResolvedValue({ site: null });
    ui(<OrgSitePanel orgId="o1" />);
    expect(screen.getByText("Waiting for approval")).toBeTruthy();
    expect(screen.getByText(/Nothing else is needed from you/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Take back the request" }));
    await waitFor(() => expect(h.call).toHaveBeenCalledWith({ action: "cancel", host: "school.darsiai.org" }));
  });

  it("shows the one DNS change an address of its own needs, each step, and checks again", async () => {
    h.sites = [site("learn.cis.edu.eg", {
      status: "connecting", steps: { ...OK, dns: "wait", cert: "wait" }, checkedAt: Date.UTC(2026, 10, 9, 11),
      records: [{ name: "learn.cis.edu.eg", type: "CNAME", value: "darsi-f0685.web.app", action: "add" }],
    })];
    h.call.mockResolvedValue({ site: h.sites[0] });
    ui(<OrgSitePanel orgId="o1" />);
    expect(screen.getByText(/ask whoever manages the DNS of .*cis\.edu\.eg/)).toBeTruthy();
    expect(screen.getByText("darsi-f0685.web.app")).toBeTruthy();
    const steps = screen.getByRole("list", { name: "Connecting it" });
    expect(within(steps).getAllByText("Waiting")).toHaveLength(2);
    expect(within(steps).getAllByText("Done")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Check now" }));
    await waitFor(() => expect(h.call).toHaveBeenCalledWith({ action: "check", host: "learn.cis.edu.eg" }));
  });

  it("asks nothing of an address under darsiai.org, shows a live one, a refused one with its reason, and stops at three", () => {
    h.sites = [
      site("a.darsiai.org", { status: "connecting", steps: { ...OK, cert: "wait" } }),
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

  it("says why the server refused, in the admin's words", async () => {
    h.call.mockRejectedValue(Object.assign(new Error("Another organization already uses or asked for that address."), { details: { reason: "site-taken" } }));
    ui(<OrgSitePanel orgId="o1" />);
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "taken.darsiai.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask for this address" }));
    expect(await screen.findByText("Another organization already uses or asked for that address.")).toBeTruthy();
  });

  it("in Arabic", () => {
    h.sites = [site("school.darsiai.org")];
    ui(<OrgSitePanel orgId="o1" />, "ar");
    expect(screen.getByRole("heading", { name: "عنوان الموقع" })).toBeTruthy();
    expect(screen.getByText("بانتظار الموافقة")).toBeTruthy();
    expect(screen.getByRole("button", { name: "اسحب الطلب" })).toBeTruthy();
  });
});

describe("the platform admin's Web addresses page", () => {
  it("approves a request with or without Darsi's identity, which connects it", async () => {
    h.sites = [site("school.darsiai.org")];
    h.call.mockResolvedValue({ site: site("school.darsiai.org", { status: "live", steps: OK }) });
    ui(<DomainsPage />);
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
      site("z.darsiai.org", { status: "connecting", steps: { ...OK, dns: "wait" } }),
    ];
    ui(<DomainsPage />);
    expect(screen.getByRole("heading", { name: "Addresses (4)" })).toBeTruthy();
    const hosts = screen.getAllByRole("article").map((a) => a.querySelector(".site-head")?.textContent ?? "");
    expect(hosts.map((x) => x.split(/Live|Connecting|Needs attention/)[0])).toEqual(["a.cis.org", "learn.cis.edu.eg", "z.darsiai.org", "b.darsiai.org"]);
    expect(screen.getByText("Authentication: 403 The caller does not have permission")).toBeTruthy();
    expect(screen.getByText(/The organization sees these changes/)).toBeTruthy();
    expect(screen.getByText(/Cloudflare's wildcard record/)).toBeTruthy();
    expect(screen.getByText("No requests waiting.")).toBeTruthy();
  });

  it("changes Darsi's identity at once, checks, and removes after asking, showing what couldn't be undone", async () => {
    h.sites = [site("b.darsiai.org", { status: "live", steps: OK })];
    h.call.mockResolvedValue({ site: h.sites[0] });
    ui(<DomainsPage />);
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
    expect(screen.getByRole("heading", { name: "بانتظار الموافقة (١)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "وافق واربط" })).toBeTruthy();
    expect(screen.getAllByText("تم").length).toBeGreaterThan(0);
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
