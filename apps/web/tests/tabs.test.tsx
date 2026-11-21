// The staff screens' tabs (admin/Tabs.tsx): the WAI-ARIA wiring, the keyboard in both reading directions, the open tab
// in the address (?tab=), and panels that are not rendered (so read nothing) until their tab is opened.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useEffect, useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BrowserRouter, MemoryRouter, useLocation, useNavigate, type Location, type NavigateFunction } from "react-router-dom";

const { I18nProvider } = await import("../src/i18n");
const { Tabs, TabPanel, useTab, useTabActive } = await import("../src/admin/Tabs");
type TabDef = import("../src/admin/Tabs").TabDef;

const h = { loc: null as unknown as Location, nav: null as unknown as NavigateFunction, reads: [] as string[], renders: [] as string[] };
function Where() { h.loc = useLocation(); h.nav = useNavigate(); return null; }
/** A panel's content with a one-shot read of its own, as the staff screens' data hooks are. */
function Reads({ name, children }: { name: string; children?: ReactNode }) {
  useEffect(() => { h.reads.push(name); }, [name]);
  h.renders.push(name);
  return <section><h3>{`${name} content`}</h3>{children}</section>;
}
const TABS: TabDef[] = [{ id: "overview", label: "Overview" }, { id: "people", label: "People" }, { id: "invite", label: "Invite" }];
const Page = ({ tabs = TABS, defaultTab, keepPeople = true }: { tabs?: TabDef[]; defaultTab?: string; keepPeople?: boolean }) => (
  <Tabs label="Sections of this page" tabs={tabs} defaultTab={defaultTab}>
    <TabPanel id="overview"><Reads name="overview"><button type="button">Open the report</button></Reads></TabPanel>
    <TabPanel id="people" keep={keepPeople}><Reads name="people"><input aria-label="Search people" /></Reads></TabPanel>
    <TabPanel id="invite"><Reads name="invite" /></TabPanel>
  </Tabs>
);
const ui = (node: ReactNode, at: string | Partial<Location> = "/admin", lang = "en") =>
  render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[at]}><Where />{node}</MemoryRouter></I18nProvider>);
const tab = (name: string | RegExp) => screen.getByRole("tab", { name });
const selected = () => screen.getAllByRole("tab").filter((x) => x.getAttribute("aria-selected") === "true").map((x) => x.textContent);
const key = (k: string, more: object = {}) => fireEvent.keyDown(document.activeElement!, { key: k, ...more });
const back = () => act(() => { void h.nav(-1); });

beforeEach(() => { h.reads = []; h.renders = []; });

describe("what a screen reader is told", () => {
  it("a labelled list of tabs, one selected, which controls a panel named after it", () => {
    ui(<Page />);
    const list = screen.getByRole("tablist", { name: "Sections of this page" });
    expect(within(list).getAllByRole("tab").map((x) => x.textContent)).toEqual(["Overview", "People", "Invite"]);
    expect(selected()).toEqual(["Overview"]);
    const panel = screen.getByRole("tabpanel", { name: "Overview" });
    expect(tab("Overview").getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tab("Overview").id);
    // A tab whose panel isn't on the page points at nothing.
    expect(tab("People").hasAttribute("aria-controls")).toBe(false);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("the list is one Tab stop: only the open tab is in the tab order", () => {
    ui(<Page />, "/admin?tab=people");
    expect(screen.getAllByRole("tab").map((x) => x.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
  });

  it("a count is part of the tab's name, in the page's numerals, and nothing is shown for none", () => {
    const tabs: TabDef[] = [{ id: "overview", label: "Requests", badge: 3 }, { id: "people", label: "People", badge: 0 }, { id: "invite", label: "Invite" }];
    const { unmount } = ui(<Page tabs={tabs} />);
    expect(tab("Requests 3")).toBeTruthy();
    expect(tab("People").textContent).toBe("People");
    unmount();
    ui(<Page tabs={tabs} />, "/admin", "ar");
    expect(tab("Requests ٣")).toBeTruthy();
  });

  it("a tab whose panel has unsaved changes says so", () => {
    ui(<Page tabs={[TABS[0], { ...TABS[1], dirty: true }, TABS[2]]} />);
    expect(tab("People (unsaved changes)")).toBeTruthy();
    expect(tab("Overview").textContent).toBe("Overview");
  });

  it("a panel with nothing to focus in it is a Tab stop itself; one with a button or a field isn't", async () => {
    ui(<Page />);
    expect(screen.getByRole("tabpanel").hasAttribute("tabindex")).toBe(false); // it has a button
    fireEvent.click(tab("Invite"));
    expect(screen.getByRole("tabpanel", { name: "Invite" }).getAttribute("tabindex")).toBe("0");
  });

  it("content that arrives later (a list that was loading) takes the panel out of the tab order", async () => {
    function Late() { const [ready, setReady] = useState(false); return <>{ready ? <a href="/x">A person</a> : <p>Loading…</p>}<span data-testid="go" onClick={() => setReady(true)} /></>; }
    ui(<Tabs label="Sections" tabs={[TABS[0]]}><TabPanel id="overview"><Late /></TabPanel></Tabs>);
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("tabindex")).toBe("0");
    fireEvent.click(screen.getByTestId("go"));
    await waitFor(() => expect(panel.hasAttribute("tabindex")).toBe(false));
  });
});

describe("the keyboard", () => {
  it("left to right: Right is the next tab and Left the one before (wrapping), Home and End the ends", () => {
    ui(<Page />);
    tab("Overview").focus();
    key("ArrowRight"); expect(document.activeElement).toBe(tab("People"));
    key("ArrowRight"); expect(document.activeElement).toBe(tab("Invite"));
    key("ArrowRight"); expect(document.activeElement).toBe(tab("Overview"));
    key("ArrowLeft"); expect(document.activeElement).toBe(tab("Invite"));
    key("Home"); expect(document.activeElement).toBe(tab("Overview"));
    key("End"); expect(document.activeElement).toBe(tab("Invite"));
  });

  it("right to left (Arabic): Left is the next tab and Right the one before", () => {
    ui(<Page />, "/admin", "ar");
    tab("Overview").focus();
    key("ArrowLeft"); expect(document.activeElement).toBe(tab("People"));
    key("ArrowLeft"); expect(document.activeElement).toBe(tab("Invite"));
    key("ArrowRight"); expect(document.activeElement).toBe(tab("People"));
    key("ArrowRight"); key("ArrowRight"); expect(document.activeElement).toBe(tab("Invite")); // wraps
    key("Home"); expect(document.activeElement).toBe(tab("Overview"));
  });

  it("arrowing past a tab opens nothing (its reads don't start); Enter or Space opens the tab in focus, and focus stays on it", () => {
    ui(<Page />);
    tab("Overview").focus();
    key("ArrowRight"); key("ArrowRight");
    expect(selected()).toEqual(["Overview"]);
    expect(h.reads).toEqual(["overview"]);
    expect(h.loc.search).toBe("");
    key("Enter");
    expect(selected()).toEqual(["Invite"]);
    expect(document.activeElement).toBe(tab("Invite"));
    expect(h.reads).toEqual(["overview", "invite"]); // People was passed, never opened
    key("ArrowLeft"); key(" ");
    expect(selected()).toEqual(["People"]);
    expect(document.activeElement).toBe(tab("People"));
  });

  it("Enter and Space are a click on the tab: a guard that holds link clicks in the capture phase holds them too", () => {
    ui(<Page />);
    const held: HTMLElement[] = [];
    const seen: string[] = [];
    // OrgCourses' leave guard: it listens on the document, before React, and keeps the click from going any further.
    const guard = (e: MouseEvent) => { const a = (e.target as Element).closest<HTMLElement>("a[href]"); if (a) { e.preventDefault(); e.stopPropagation(); held.push(a); } };
    const onTab = (e: MouseEvent) => seen.push((e.target as HTMLElement).textContent ?? "");
    document.addEventListener("click", guard, true);
    tab("Overview").focus();
    key("ArrowRight"); key("Enter");
    key("ArrowRight"); key(" ");
    document.removeEventListener("click", guard, true);
    expect(held).toEqual([tab("People"), tab("Invite")]);
    expect(selected()).toEqual(["Overview"]);
    expect(h.reads).toEqual(["overview"]);
    // Let through, the same key opens it, and a page's own click handler on the list hears it as a click.
    screen.getByRole("tablist").addEventListener("click", onTab);
    key("Enter");
    expect(selected()).toEqual(["Invite"]);
    expect(seen).toEqual(["Invite"]);
    expect(document.activeElement).toBe(tab("Invite"));
  });

  it("leaves the browser's own shortcuts alone (Alt+Left is Back)", () => {
    ui(<Page />);
    tab("Overview").focus();
    key("ArrowRight", { altKey: true });
    expect(document.activeElement).toBe(tab("Overview"));
  });
});

describe("the open tab in the address", () => {
  it("the default tab has no parameter; another one is ?tab=<id>, and each tab is a link to its own address", () => {
    ui(<Page />);
    expect(h.loc.search).toBe("");
    expect(tab("People").getAttribute("href")).toBe("/admin?tab=people");
    expect(tab("Overview").getAttribute("href")).toBe("/admin");
    fireEvent.click(tab("People"));
    expect(h.loc.search).toBe("?tab=people");
    expect(selected()).toEqual(["People"]);
    fireEvent.click(tab("Overview"));
    expect(h.loc.search).toBe("");
  });

  it("a deep link opens its tab, and only that panel", () => {
    ui(<Page />, "/admin?tab=invite");
    expect(selected()).toEqual(["Invite"]);
    expect(h.reads).toEqual(["invite"]);
    expect(screen.queryByText("overview content")).toBeNull();
  });

  it("an id the list doesn't have opens the default tab, and the address is left as it came", () => {
    ui(<Page />, "/admin?tab=nonsense");
    expect(selected()).toEqual(["Overview"]);
    expect(h.loc.search).toBe("?tab=nonsense");
  });

  it("a tab a page hides isn't listed, and its address opens the default tab", () => {
    ui(<Page tabs={[TABS[0], { ...TABS[1], hidden: true }, TABS[2]]} />, "/admin?tab=people");
    expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual(["Overview", "Invite"]);
    expect(selected()).toEqual(["Overview"]);
    expect(h.reads).toEqual(["overview"]);
  });

  it("a page picks its own default tab", () => {
    ui(<Page defaultTab="people" />, "/super/domains?org=o1");
    expect(selected()).toEqual(["People"]);
    expect(tab("People").getAttribute("href")).toBe("/super/domains?org=o1");
    fireEvent.click(tab("Overview"));
    expect(h.loc.search).toBe("?org=o1&tab=overview");
  });

  it("changes only its own key: other parameters, the hash and location.state stay", () => {
    ui(<Page />, { pathname: "/super/orgs/o1", search: "?org=o1&x=a+b", hash: "#top", state: { back: "/super/analytics" } });
    fireEvent.click(tab("People"));
    expect(h.loc.pathname).toBe("/super/orgs/o1");
    expect(new URLSearchParams(h.loc.search).get("org")).toBe("o1");
    expect(new URLSearchParams(h.loc.search).get("x")).toBe("a b");
    expect(new URLSearchParams(h.loc.search).get("tab")).toBe("people");
    expect(h.loc.hash).toBe("#top");
    expect(h.loc.state).toEqual({ back: "/super/analytics" });
    fireEvent.click(tab("Overview"));
    expect(new URLSearchParams(h.loc.search).has("tab")).toBe(false);
    expect(new URLSearchParams(h.loc.search).get("org")).toBe("o1");
    expect(h.loc.state).toEqual({ back: "/super/analytics" });
  });

  // An admin's test of school sign-in comes back to a tab (/admin?tab=signin#sso=<ticket>&f=<flow>): the ticket must
  // never reach a link someone can copy, open in a new browser tab or send, nor ride along when the tab changes.
  it("a school sign-in's return left in the address at startup is gone before any tab renders: no ticket in the address or in any link", async () => {
    history.replaceState(null, "", "/admin?tab=people&x=1#sso=SECRET-TICKET&f=abcd1234");
    // As the app starts: auth/sso.ts runs this as it loads (App imports it before the router), here on a fresh copy.
    vi.resetModules();
    const sso = await import("../src/auth/sso");
    expect(location.pathname + location.search + location.hash).toBe("/admin?tab=people&x=1");
    expect(sso.returnedTo("/admin")).toBe(true); // kept in memory for the screen that finishes it
    render(<I18nProvider lang="en"><BrowserRouter><Where /><Page /></BrowserRouter></I18nProvider>);
    expect(selected()).toEqual(["People"]);
    const links = () => Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(links()).toEqual(["/admin?x=1", "/admin?tab=people&x=1", "/admin?tab=invite&x=1"]);
    fireEvent.click(tab("Invite"));
    fireEvent.click(tab("Overview"));
    for (const text of [location.href, h.loc.hash, h.loc.search, ...links(), document.body.innerHTML]) {
      expect(text).not.toContain("SECRET-TICKET");
      expect(text).not.toMatch(/sso=|sso_error=/);
    }
    // Back through every entry this page made: the ticket is in none of them.
    for (let i = 0; i < 2; i++) { await act(async () => { history.back(); await new Promise((r) => setTimeout(r, 20)); }); expect(location.href).not.toContain("SECRET-TICKET"); }
    sso.takeStash("/admin");
    history.replaceState(null, "", "/");
  });

  it("a return a router still shows is in no tab's link, and a tab change drops it; the page's own hash stays", () => {
    ui(<Page />, "/admin?tab=people#sso=SECRET-TICKET&f=abcd1234");
    const hrefs = screen.getAllByRole("tab").map((x) => x.getAttribute("href"));
    expect(hrefs).toEqual(["/admin", "/admin?tab=people", "/admin?tab=invite"]);
    fireEvent.click(tab("Invite"));
    expect(h.loc.search).toBe("?tab=invite");
    expect(h.loc.hash).toBe("");
    cleanup();
    ui(<Page />, "/admin#sso_error=sso-provider&f=abcd1234&d=access_denied");
    expect(screen.getAllByRole("tab").map((x) => x.getAttribute("href"))).toEqual(["/admin", "/admin?tab=people", "/admin?tab=invite"]);
    cleanup();
    // Not a return: "#sso" alone, or a page's own anchor, is kept as before.
    ui(<Page />, "/admin#certificates");
    expect(tab("People").getAttribute("href")).toBe("/admin?tab=people#certificates");
    fireEvent.click(tab("People"));
    expect(h.loc.hash).toBe("#certificates");
  });

  it("each choice is a history entry: Back returns to the tab before, then leaves the page", () => {
    render(<I18nProvider lang="en"><MemoryRouter initialEntries={["/learn", "/admin"]} initialIndex={1}><Where /><Page /></MemoryRouter></I18nProvider>);
    fireEvent.click(tab("People"));
    fireEvent.click(tab("Invite"));
    expect(selected()).toEqual(["Invite"]);
    back();
    expect(selected()).toEqual(["People"]);
    expect(h.loc.search).toBe("?tab=people");
    back();
    expect(selected()).toEqual(["Overview"]);
    back();
    expect(h.loc.pathname).toBe("/learn");
  });

  it("choosing the tab that is already open adds no history entry", () => {
    render(<I18nProvider lang="en"><MemoryRouter initialEntries={["/learn", "/admin?tab=people"]} initialIndex={1}><Where /><Page /></MemoryRouter></I18nProvider>);
    fireEvent.click(tab("People"));
    fireEvent.click(tab("People"));
    back();
    expect(h.loc.pathname).toBe("/learn");
  });

  it("a click with Ctrl or Cmd is the browser's (a new browser tab): nothing changes here", () => {
    ui(<Page />);
    // The test's DOM would try to follow the link: stop it after the tab's own handler has had its turn.
    const seen: boolean[] = [];
    const stop = (e: Event) => { seen.push(e.defaultPrevented); e.preventDefault(); };
    document.addEventListener("click", stop);
    fireEvent.click(tab("People"), { ctrlKey: true });
    fireEvent.click(tab("People"), { metaKey: true });
    document.removeEventListener("click", stop);
    expect(seen).toEqual([false, false]); // left to the browser
    expect(selected()).toEqual(["Overview"]);
    expect(h.loc.search).toBe("");
  });

  it("a panel that holds link clicks while it has unsaved changes (OrgCourses' leave guard) holds a tab too, then lets it through", () => {
    ui(<Page />);
    let held: HTMLElement | null = null;
    const guard = (e: MouseEvent) => { const a = (e.target as Element).closest<HTMLElement>("a[href]"); if (a) { e.preventDefault(); e.stopPropagation(); held = a; } };
    document.addEventListener("click", guard, true);
    fireEvent.click(tab("People"));
    expect(held).toBe(tab("People"));
    expect(selected()).toEqual(["Overview"]);
    document.removeEventListener("click", guard, true);
    fireEvent.click(held!); // "Leave anyway" clicks the same link again
    expect(selected()).toEqual(["People"]);
  });

  it("another parameter name keeps two lists apart", () => {
    ui(<Tabs label="Lists" tabs={TABS} param="list"><TabPanel id="overview">one</TabPanel><TabPanel id="people">two</TabPanel></Tabs>, "/x?tab=invite");
    expect(selected()).toEqual(["Overview"]);
    fireEvent.click(tab("People"));
    expect(h.loc.search).toBe("?tab=invite&list=people");
  });
});

describe("panels", () => {
  it("a panel reads nothing until its tab is opened, and once after going away and coming back", () => {
    ui(<Page />);
    expect(h.reads).toEqual(["overview"]);
    fireEvent.click(tab("People"));
    expect(h.reads).toEqual(["overview", "people"]);
    fireEvent.click(tab("Overview"));
    fireEvent.click(tab("People"));
    fireEvent.click(tab("Overview"));
    expect(h.reads).toEqual(["overview", "people"]);
  });

  it("a panel opened before stays on the page, hidden, with what was typed in it", () => {
    ui(<Page />, "/admin?tab=people");
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "Mona" } });
    fireEvent.click(tab("Overview"));
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1); // the hidden one is out of the accessibility tree
    const hidden = screen.getByText("people content").closest('[role="tabpanel"]')!;
    expect(hidden.hasAttribute("hidden")).toBe(true);
    fireEvent.click(tab("People"));
    expect(hidden.hasAttribute("hidden")).toBe(false);
    expect((screen.getByLabelText("Search people") as HTMLInputElement).value).toBe("Mona");
  });

  it("a hidden panel does no work when the page re-renders, and catches up when it is opened again", () => {
    function Host() { const [n, setN] = useState(0); return <><button type="button" onClick={() => setN(n + 1)}>{`Refresh ${n}`}</button>
      <Tabs label="Sections" tabs={TABS}><TabPanel id="overview">top</TabPanel><TabPanel id="people"><Reads name="people"><p>{`members ${n}`}</p></Reads></TabPanel></Tabs></>; }
    ui(<Host />, "/admin?tab=people");
    fireEvent.click(tab("Overview"));
    const before = h.renders.length;
    fireEvent.click(screen.getByRole("button", { name: "Refresh 0" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh 1" }));
    expect(h.renders.length).toBe(before);
    expect(screen.getByText("members 0")).toBeTruthy(); // still there, as it last was
    fireEvent.click(tab("People"));
    expect(screen.getByText("members 2")).toBeTruthy();
    expect(h.reads).toEqual(["people"]);
  });

  it("keep={false} takes a panel off the page when its tab closes: it starts again when reopened", () => {
    ui(<Page keepPeople={false} />, "/admin?tab=people");
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "Mona" } });
    fireEvent.click(tab("Overview"));
    expect(screen.queryByText("people content")).toBeNull();
    fireEvent.click(tab("People"));
    expect((screen.getByLabelText("Search people") as HTMLInputElement).value).toBe("");
    expect(h.reads).toEqual(["people", "overview", "people"]);
  });

  it("content can ask whether its tab is the open one", () => {
    function Shown() { return <p>{useTabActive() ? "people shown" : "people hidden"}</p>; }
    ui(<Tabs label="Sections" tabs={TABS}><TabPanel id="overview">top</TabPanel><TabPanel id="people"><Shown /></TabPanel></Tabs>, "/admin?tab=people");
    expect(screen.getByText("people shown")).toBeTruthy();
    fireEvent.click(tab("Overview"));
    expect(screen.getByText("people hidden")).toBeTruthy();
  });

  it("one list under filter-like tabs: a single panel whose id is the open tab is renamed, not remounted", () => {
    function List() {
      const st = useTab(TABS);
      return <Tabs label="Show" tabs={TABS}><TabPanel id={st.tab}><Reads name="list"><p>{`showing ${st.tab}`}</p></Reads></TabPanel></Tabs>;
    }
    ui(<List />);
    const panel = screen.getByRole("tabpanel", { name: "Overview" });
    fireEvent.click(tab("People"));
    expect(screen.getByRole("tabpanel", { name: "People" })).toBe(panel);
    expect(tab("People").getAttribute("aria-controls")).toBe(panel.id);
    expect(screen.getByText("showing people")).toBeTruthy();
    expect(h.reads).toEqual(["list"]); // mounted once
  });

  it("a panel outside Tabs is a mistake said at once", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => ui(<TabPanel id="x">x</TabPanel>)).toThrow("TabPanel outside Tabs");
    quiet.mockRestore();
  });
});

describe("focus is never lost", () => {
  it("the first render takes no focus: the page's own is the page's", () => {
    ui(<Page />, "/admin?tab=people");
    expect(document.activeElement).toBe(document.body);
  });

  it("a tab opened from elsewhere (show() from a tile) takes focus that was on nothing", () => {
    function Tile() { const st = useTab(TABS); return <><span data-testid="tile" onClick={() => st.show("people")} /><Page /></>; }
    ui(<Tile />);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByTestId("tile"));
    expect(selected()).toEqual(["People"]);
    expect(document.activeElement).toBe(tab("People"));
  });

  it("focus inside the panel that closes goes to the open tab", () => {
    ui(<Page />);
    screen.getByRole("button", { name: "Open the report" }).focus();
    act(() => { void h.nav("/admin?tab=invite"); }); // Back, Forward or a link: no click on a tab
    expect(selected()).toEqual(["Invite"]);
    expect(document.activeElement).toBe(tab("Invite"));
  });

  it("focus somewhere that is still there stays put", () => {
    function Host() { const st = useTab(TABS); return <><input aria-label="Find" onChange={() => st.show("people")} /><Page /></>; }
    ui(<Host />);
    const find = screen.getByLabelText("Find");
    find.focus();
    fireEvent.change(find, { target: { value: "Mona" } });
    expect(selected()).toEqual(["People"]);
    expect(document.activeElement).toBe(find);
  });

  it("a tab that leaves the list while focused hands focus to the open tab", () => {
    const { rerender } = ui(<Page />);
    tab("Overview").focus();
    key("End");
    expect(document.activeElement).toBe(tab("Invite"));
    rerender(<I18nProvider lang="en"><MemoryRouter initialEntries={["/admin"]}><Where /><Page tabs={[TABS[0], TABS[1], { ...TABS[2], hidden: true }]} /></MemoryRouter></I18nProvider>);
    expect(screen.queryByRole("tab", { name: "Invite" })).toBeNull();
    expect(document.activeElement).toBe(tab("Overview"));
  });

  it("a tab that joins the list later (the page read more) takes focus from nobody", () => {
    // /admin learns of the licence after its first render and lists Super seats then: focus on nothing stays the
    // page's own (a tab focused by script would show the keyboard's ring to someone who touched nothing).
    const { rerender } = ui(<Page tabs={[TABS[0], TABS[1], { ...TABS[2], hidden: true }]} />);
    expect(document.activeElement).toBe(document.body);
    rerender(<I18nProvider lang="en"><MemoryRouter initialEntries={["/admin"]}><Where /><Page /></MemoryRouter></I18nProvider>);
    expect(screen.getByRole("tab", { name: "Invite" })).toBeTruthy();
    expect(selected()).toEqual(["Overview"]);
    expect(document.activeElement).toBe(document.body);
    // Nor when one leaves it while focus is elsewhere on the page or on nothing.
    rerender(<I18nProvider lang="en"><MemoryRouter initialEntries={["/admin"]}><Where /><Page tabs={[TABS[0], TABS[1], { ...TABS[2], hidden: true }]} /></MemoryRouter></I18nProvider>);
    expect(document.activeElement).toBe(document.body);
  });

  it("the open tab leaving the list opens the default one, with focus on it", () => {
    const { rerender } = ui(<Page />, "/admin?tab=invite");
    screen.getByRole("tab", { name: "Invite" }).focus();
    rerender(<I18nProvider lang="en"><MemoryRouter initialEntries={["/admin?tab=invite"]}><Where /><Page tabs={[TABS[0], TABS[1], { ...TABS[2], hidden: true }]} /></MemoryRouter></I18nProvider>);
    expect(selected()).toEqual(["Overview"]);
    expect(document.activeElement).toBe(tab("Overview"));
  });
});

describe("useTab, for a page that must know or change the tab itself", () => {
  function PageLevel() {
    const { tab: open, is, show, search } = useTab(TABS);
    // A page-level read that waits for its tab, and a tile that leads to another tab.
    useEffect(() => { if (is("invite")) h.reads.push("invites"); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
    return <><p>{`open: ${open}`}</p><button type="button" onClick={() => show("people")}>To review</button><span data-testid="s">{search("invite")}</span>
      <Tabs label="Sections" tabs={TABS}><TabPanel id="overview">one</TabPanel><TabPanel id="people">two</TabPanel><TabPanel id="invite">three</TabPanel></Tabs></>;
  }
  it("says which tab is open and opens another, in step with the list", () => {
    ui(<PageLevel />, "/admin?org=o1");
    expect(screen.getByText("open: overview")).toBeTruthy();
    expect(screen.getByTestId("s").textContent).toBe("?org=o1&tab=invite");
    expect(h.reads).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "To review" }));
    expect(screen.getByText("open: people")).toBeTruthy();
    expect(selected()).toEqual(["People"]);
    fireEvent.click(tab("Invite"));
    expect(h.reads).toEqual(["invites"]);
    // An id the list doesn't have is ignored.
    act(() => { void h.nav("/admin?tab=people"); });
    expect(screen.getByText("open: people")).toBeTruthy();
  });
});

describe("one action at the end of the tab row (Refresh)", () => {
  const h2 = { pressed: 0 };
  const WithAction = ({ action = true }: { action?: boolean }) => (
    <Tabs label="Sections of this page" tabs={TABS} action={action ? <button type="button" onClick={() => { h2.pressed++; }}>Refresh</button> : undefined}>
      <TabPanel id="overview"><Reads name="overview"><button type="button">Open the report</button></Reads></TabPanel>
      <TabPanel id="people"><Reads name="people" /></TabPanel>
      <TabPanel id="invite"><Reads name="invite" /></TabPanel>
    </Tabs>
  );
  beforeEach(() => { h2.pressed = 0; });

  it("sits in the tabs' bar after the list: not a tab, not in the tablist, not in a panel", () => {
    ui(<WithAction />);
    const list = screen.getByRole("tablist"), refresh = screen.getByRole("button", { name: "Refresh" });
    expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual(["Overview", "People", "Invite"]);
    expect(list.contains(refresh)).toBe(false);
    expect(refresh.closest("[role=tabpanel]")).toBeNull();
    // One bar holds both (it is what sticks to the top), the list first: the keyboard reaches the action after the tabs
    // and before the panel.
    const bar = list.parentElement!;
    expect(bar.className).toContain("tb-bar");
    expect(refresh.closest(".tb-action")!.parentElement).toBe(bar);
    expect(list.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(refresh.compareDocumentPosition(screen.getByRole("tabpanel")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The bar is left off a printed page, the action with it.
    expect(bar.className).toContain("no-print");
  });

  it("the arrow keys, Home and End stay among the tabs", () => {
    ui(<WithAction />);
    tab("Overview").focus();
    key("End"); expect(document.activeElement).toBe(tab("Invite"));
    key("ArrowRight"); expect(document.activeElement).toBe(tab("Overview")); // wraps past the last tab, never onto the action
    key("ArrowLeft"); expect(document.activeElement).toBe(tab("Invite"));
    // And a key pressed on the action is the action's own: it moves nothing in the list and opens no tab.
    const refresh = screen.getByRole("button", { name: "Refresh" });
    refresh.focus();
    key("ArrowLeft"); key("Home"); key("Enter");
    expect(document.activeElement).toBe(refresh);
    expect(selected()).toEqual(["Overview"]);
  });

  it("works whatever the tab, keeps the tab open and takes focus from nobody", () => {
    ui(<WithAction />, "/admin?tab=people");
    const refresh = screen.getByRole("button", { name: "Refresh" });
    refresh.focus();
    fireEvent.click(refresh);
    expect(h2.pressed).toBe(1);
    expect(selected()).toEqual(["People"]);
    expect(h.loc.search).toBe("?tab=people");
    expect(document.activeElement).toBe(refresh);
    // It stays one control while tabs open and close around it.
    fireEvent.click(tab("Invite"));
    expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);
  });

  it("a page without one has no empty slot", () => {
    ui(<WithAction action={false} />);
    expect(document.querySelector(".tb-action")).toBeNull();
    expect(screen.getByRole("tablist").parentElement!.className).toContain("tb-bar");
  });

  it("on a phone the action is its icon: tabs.css hides the button's words from the eye only, below 600px", () => {
    const css = readFileSync(join(__dirname, "../src/styles/tabs.css"), "utf8");
    const phone = css.slice(css.indexOf("@media (max-width: 599px)"));
    const rule = (sheet: string, selector: string) => { const at = sheet.indexOf(selector + " {"); return at < 0 ? "" : sheet.slice(at, sheet.indexOf("}", at)); };
    expect(rule(phone, ".tb-action .dr-btn-label")).toContain("clip: rect(0 0 0 0)");
    expect(phone).not.toContain("display: none"); // hidden that way, the button would have no name
    expect(rule(phone, ".tb-action .dr-btn")).toContain("min-inline-size: var(--tap-min)");
    // At every width the button is as tall as a tab (48px) and no taller, so the bar is the same height with it as
    // without it, in any language.
    const any = rule(css.slice(0, css.indexOf("@media")), ".tb-action .dr-btn");
    expect(any).toContain("min-block-size: var(--tap-min)");
    expect(any).toContain("padding-block: 0");
    expect(any).toContain("box-sizing: border-box");
    // The bar, not the list, is what sticks now; the list scrolls in the room the action leaves.
    expect(rule(css, ".tb-bar")).toContain("position: sticky");
    expect(rule(css, ".tb-list")).toContain("flex: 1 1 auto");
    expect(rule(css, ".tb-list")).toContain("overflow-x: auto");
  });
});

it("the tab strings exist in English and Arabic", async () => {
  const en = (await import("../src/admin/strings/en.json")).default as Record<string, string>;
  const ar = (await import("../src/admin/strings/ar.json")).default as Record<string, string>;
  const keys = Object.keys(en).filter((k) => k.startsWith("tabs."));
  expect(keys).toContain("tabs.unsaved");
  expect(keys.filter((k) => !ar[k] || /[A-Za-z]{3}/.test(ar[k]))).toEqual([]);
});
