// Organization sites (TECHNICAL.md "Organization sites (custom web addresses)"): which host is looked up (state/site.ts
// siteHost), the lookup itself (content/sites.json, kept per host with its logo as data), the brand it gives
// (identityOf), Darsi's name in the UI strings on a site without Darsi's identity (i18n rebrand), the organization's
// landing page, and the platform admin's "Web address" panel.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BrandProvider } from "@darsi/design-system";
import type { Org } from "../src/auth/types";
import type { SiteEntry } from "../src/content/sites";

const h = vi.hoisted(() => ({ save: vi.fn(), stored: null as unknown }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => h.stored, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: { setOrgSite: (r: unknown) => h.save(r) } }));
vi.mock("../src/content/load", async (orig) => ({ ...(await orig<typeof import("../src/content/load")>()), loadSettings: async () => null, loadSitesFile: async () => null }));

const { createSiteStore, identityOf, siteHost } = await import("../src/state/site");
const { I18nProvider, isolate, rebrand, useI18n } = await import("../src/i18n");
const { StoreProvider } = await import("../src/state/store");
const { Landing } = await import("../src/landing/Landing");
const { OrgSitePanel, typedHost } = await import("../src/admin/OrgSite");

const LOGO = "https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/content%2Fsites%2Fo1%2Fabc.webp?alt=media";
const DATA = "data:image/webp;base64,UklGRg==";
const cis = (patch: Partial<SiteEntry> = {}): SiteEntry => ({ orgId: "o1", name: "CIS Training Platform", logo: LOGO, darsi: false, ...patch });
const file = (entry: SiteEntry | null, host = "cis.darsiai.org") => ({ v: 1, sites: entry ? { [host]: entry } : {} });
const later = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); h.save.mockReset();
  // The logo, downloaded once to keep as data.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("RIFF", { status: 200, headers: { "Content-Type": "image/webp" } })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("which host is looked up", () => {
  it("an organization's host, never Darsi's own, Hosting's or a local one", () => {
    expect(siteHost({ hostname: "cis.darsiai.org", search: "" })).toBe("cis.darsiai.org");
    expect(siteHost({ hostname: "Learn.CIS.edu.eg", search: "" })).toBe("learn.cis.edu.eg");
    for (const host of ["darsiai.org", "www.darsiai.org", "darsi-f0685.web.app", "darsi-f0685.firebaseapp.com", "localhost", "127.0.0.1", "192.168.1.20"]) {
      expect(siteHost({ hostname: host, search: "" }), host).toBeNull();
    }
    // A ?site= on a real address is ignored: nobody can dress darsiai.org up as an organization with a link.
    expect(siteHost({ hostname: "darsiai.org", search: "?site=cis.darsiai.org" })).toBeNull();
  });
  it("on this machine, ?site=<host> stands in for that host until the tab closes, and ?site= stops it", () => {
    expect(siteHost({ hostname: "localhost", search: "?site=CIS.darsiai.org" })).toBe("cis.darsiai.org");
    expect(siteHost({ hostname: "127.0.0.1", search: "" })).toBe("cis.darsiai.org");
    expect(siteHost({ hostname: "localhost", search: "?site=" })).toBeNull();
    expect(siteHost({ hostname: "localhost", search: "" })).toBeNull();
    expect(siteHost({ hostname: "localhost", search: "?site=darsiai.org" })).toBeNull();
  });
});

describe("the lookup (content/sites.json)", () => {
  it("reads nothing on Darsi's own address", () => {
    const load = vi.fn(async () => file(cis()));
    expect(createSiteStore(null, load).get()).toEqual({ ready: true, site: null });
    expect(load).not.toHaveBeenCalled();
  });

  it("a first visit waits for the file, shows the site, and keeps it with the logo as data for the next start", async () => {
    const answer = later<unknown>();
    const store = createSiteStore("cis.darsiai.org", () => answer.promise);
    expect(store.get()).toEqual({ ready: false, site: null });
    answer.resolve(file(cis()));
    await flush();
    expect(store.get()).toEqual({ ready: true, site: { ...cis(), logo: DATA } });
    expect(fetch).toHaveBeenCalledWith(LOGO);
    expect(JSON.parse(localStorage.getItem("darsi:site:cis.darsiai.org")!)).toEqual({ site: cis(), data: DATA });
    // The next start shows it at once, offline too (no answer), and keeps it.
    const again = createSiteStore("cis.darsiai.org", async () => null);
    expect(again.get()).toEqual({ ready: true, site: { ...cis(), logo: DATA } });
    await flush();
    expect(again.get().site?.logo).toBe(DATA);
  });

  it("follows a change behind the kept copy: Darsi's identity turned on, a new logo, the site removed", async () => {
    localStorage.setItem("darsi:site:cis.darsiai.org", JSON.stringify({ site: cis(), data: DATA }));
    const store = createSiteStore("cis.darsiai.org", async () => file(cis({ darsi: true })));
    const seen: unknown[] = [];
    store.subscribe(() => seen.push(store.get()));
    expect(store.get().site?.darsi).toBe(false);
    await flush();
    expect(store.get()).toEqual({ ready: true, site: { ...cis({ darsi: true }), logo: DATA } });
    expect(fetch).not.toHaveBeenCalled(); // same logo: the kept data stays
    const logo2 = LOGO.replace("abc", "def");
    const moved = createSiteStore("cis.darsiai.org", async () => file(cis({ darsi: true, logo: logo2 })));
    await flush();
    expect(fetch).toHaveBeenCalledWith(logo2);
    expect(moved.get().site?.logo).toBe(DATA);
    const gone = createSiteStore("cis.darsiai.org", async () => file(null));
    await flush();
    expect(gone.get()).toEqual({ ready: true, site: null });
    expect(JSON.parse(localStorage.getItem("darsi:site:cis.darsiai.org")!)).toEqual({ site: null });
    expect(seen.length).toBeGreaterThan(0);
  });

  it("a host that isn't listed, or no answer on a first visit, shows Darsi's look", async () => {
    const other = createSiteStore("other.darsiai.org", async () => file(cis()));
    await flush();
    expect(other.get()).toEqual({ ready: true, site: null });
    const offline = createSiteStore("cis.darsiai.org", async () => null);
    await flush();
    expect(offline.get()).toEqual({ ready: true, site: null });
    expect(localStorage.getItem("darsi:site:cis.darsiai.org")).toBeNull(); // nothing learnt, nothing kept
  });

  it("a first visit on a connection that hangs stops waiting", async () => {
    vi.useFakeTimers();
    const store = createSiteStore("cis.darsiai.org", () => new Promise(() => {}), 8000);
    expect(store.get().ready).toBe(false);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(store.get()).toEqual({ ready: true, site: null });
  });

  it("keeps a logo it can show offline only when it is a small picture", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<svg/>", { status: 200, headers: { "Content-Type": "image/svg+xml" } })));
    const store = createSiteStore("cis.darsiai.org", async () => file(cis()));
    await flush();
    expect(store.get().site?.logo).toBe(LOGO);
    expect(JSON.parse(localStorage.getItem("darsi:site:cis.darsiai.org")!)).toEqual({ site: cis() });
  });
});

describe("the brand shown", () => {
  const member = { id: "o1", name: "CIS (members)", logo: DATA, v: 2 };
  it("Darsi's at Darsi's own address, a member's organization as before", () => {
    expect(identityOf(undefined, null)).toEqual({ name: null, logo: null, darsi: true });
    expect(identityOf(member, null)).toEqual({ name: "CIS (members)", logo: DATA, darsi: true });
  });
  it("the site's for anyone on it, and its members' own copy first on their organization's site", () => {
    expect(identityOf(undefined, cis())).toEqual({ name: "CIS Training Platform", logo: LOGO, darsi: false });
    expect(identityOf(member, cis())).toEqual({ name: "CIS (members)", logo: DATA, darsi: false });
    expect(identityOf({ id: "o1", name: "CIS", v: 0 }, cis())).toEqual({ name: "CIS", logo: LOGO, darsi: false });
    // A member of another organization keeps their own; the site still decides whether Darsi's identity shows.
    expect(identityOf({ id: "o2", name: "Delta", v: 0 }, cis())).toEqual({ name: "Delta", logo: null, darsi: false });
    expect(identityOf({ id: "o2", name: "Delta", v: 0 }, cis({ darsi: true }))).toEqual({ name: "Delta", logo: null, darsi: true });
  });
});

describe("Darsi's name in the UI strings (a site without Darsi's identity)", () => {
  let t: ReturnType<typeof useI18n>["t"];
  const Grab = () => { t = useI18n().t; return null; };
  const at = (lang: string, brand: string | null) => render(<I18nProvider lang={lang} brand={brand}><Grab /></I18nProvider>);

  it("becomes the organization's name, isolated, in English and Arabic", () => {
    at("en", "CIS Training Platform");
    expect(t("app.name")).toBe(isolate("CIS Training Platform"));
    expect(t("pwa.update")).toBe(`A new version of ${isolate("CIS Training Platform")} is ready`);
    expect(t("me.super")).not.toMatch(/Darsi/);
    at("ar", "منصة سيس");
    expect(t("app.name")).toBe(isolate("منصة سيس"));
    expect(t("pwa.installTitle")).not.toMatch(/درسي/);
  });
  it("keeps the model's name (Darsi Tiny, as in the labs and courses), the frameworks and the branding panel's hints", () => {
    at("en", "CIS");
    expect(t("dl.modelSave", { size: 3 })).toBe("Save Darsi Tiny (3 MB)");
    expect(t("p.fw.darsi")).toBe("Darsi skills");
    at("ar", "CIS");
    expect(t("dl.modelSave", { size: 3 })).toMatch(/«درسي الصغير»/);
  });
  it("never changes a name a person typed, and nothing without a brand", () => {
    at("en", "CIS");
    expect(t("site.current" as never, { host: "darsi.example" })).toBe("Now: darsi.example");
    at("en", null);
    expect(t("app.name")).toBe("Darsi");
    expect(rebrand("Darsi Super and Darsi Tiny", "X")).toBe(`${isolate("X")} Super and Darsi Tiny`);
  });
});

describe("the organization's own landing page", () => {
  const page = (site: SiteEntry, lang = "en") => render(
    <StoreProvider><I18nProvider lang={lang} brand={site.darsi ? null : site.name}><MemoryRouter>
      <BrandProvider logo={site.logo} name={site.name} darsi={site.darsi}><Landing site={site} /></BrandProvider>
    </MemoryRouter></I18nProvider></StoreProvider>);

  it("without Darsi's identity: its logo and name, the ways in, and no Darsi name or mark anywhere", () => {
    const { container } = page(cis({ logo: null }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("CIS Training Platform");
    expect(screen.getAllByRole("button", { name: "Sign in" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Create an account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue without an account" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/Darsi|درسي/);
    expect(container.querySelector(".dr-mark")).toBeNull();
    expect(container.querySelectorAll(".dr-brand-initial").length).toBe(2);
    // The licences page stays linked (it names Darsi's software, honestly).
    expect(screen.getByRole("link", { name: "Open-source licences" }).getAttribute("href")).toBe("/licences");
  });
  it("with Darsi's identity: its logo and name, and “with Darsi”", () => {
    const { container } = page(cis({ darsi: true }));
    expect(container.querySelectorAll("img.dr-brand-logo").length).toBe(2);
    expect(screen.getAllByText(/with Darsi/).length).toBeGreaterThan(0);
    expect(container.querySelector(".lp-site-credit .dr-mark")).toBeTruthy();
    // None of Darsi's own marketing sections.
    expect(container.querySelector("#faq")).toBeNull();
  });
  it("in Arabic", () => {
    const { container } = page(cis({ name: "منصة سيس للتدريب", logo: null }), "ar");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("منصة سيس للتدريب");
    expect(container.textContent).not.toMatch(/Darsi|درسي/);
  });
});

describe("the platform admin's Web address panel", () => {
  const org = (site?: Org["site"]): Org => ({ id: "o1", name: "CIS Training Platform", type: "university", status: "active", createdBy: "x", ...(site ? { site } : {}) });
  const panel = (o: Org, onSaved = vi.fn()) => render(<I18nProvider lang="en"><OrgSitePanel org={o} onSaved={onSaved} /></I18nProvider>);

  it("reads what an admin pastes as a host", () => {
    expect(typedHost(" https://CIS.darsiai.org/learn?x=1 ")).toBe("cis.darsiai.org");
    expect(typedHost("cis.darsiai.org.")).toBe("cis.darsiai.org");
    expect(typedHost("")).toBe("");
  });

  it("saves the host and Darsi's identity through setOrgSite, and refuses a bad host before sending it", async () => {
    h.save.mockResolvedValue({ site: { host: "cis.darsiai.org", darsi: false } });
    const onSaved = vi.fn();
    panel(org(), onSaved);
    expect(screen.getByText(/No web address yet/)).toBeTruthy();
    const field = screen.getByLabelText("Address");
    fireEvent.change(field, { target: { value: "darsiai.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the address" }));
    expect(await screen.findByText(/one of Darsi's own addresses/)).toBeTruthy();
    expect(h.save).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "https://CIS.darsiai.org/" } });
    fireEvent.click(screen.getByRole("switch", { name: /Show Darsi's identity/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save the address" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledWith({ orgId: "o1", host: "cis.darsiai.org", darsi: false }));
    expect(await screen.findByText(/Saved\. Phones on this address/)).toBeTruthy();
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open it" }).getAttribute("href")).toBe("https://cis.darsiai.org");
  });

  it("says why the server refused, in the admin's words, and removes an address after asking", async () => {
    h.save.mockRejectedValueOnce(Object.assign(new Error("Another organization already uses that address."), { details: { reason: "site-taken" } }));
    panel(org({ host: "cis.darsiai.org", darsi: true }));
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "delta.darsiai.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the address" }));
    expect(await screen.findByText("Another organization already uses that address.")).toBeTruthy();
    h.save.mockResolvedValueOnce({ site: null });
    fireEvent.click(screen.getByRole("button", { name: "Remove the address" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove it" }));
    await waitFor(() => expect(h.save).toHaveBeenLastCalledWith({ orgId: "o1", host: "", darsi: true }));
    expect(await screen.findByText(/The address was removed/)).toBeTruthy();
  });
});
