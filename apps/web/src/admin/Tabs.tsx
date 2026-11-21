import { createContext, memo, useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useHref, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useI18n } from "../i18n";
import { RETURN } from "../auth/sso";
import "./strings";
import "../styles/tabs.css";

/**
 * Tabs for the staff screens (org admins, platform admins, the course editor's pages): a long page becomes a few
 * panels, and only the open one is on the page. Staff only: learners' phones never download it (vite.config.ts
 * staffOnly()).
 *
 *   const TABS = [{ id: "overview", label: t("tabs.overview") }, { id: "people", label: t("tabs.people"), badge: 3 }];
 *   <Tabs label={t("tabs.sections")} tabs={TABS}>
 *     <TabPanel id="overview"><Overview /></TabPanel>
 *     <TabPanel id="people"><People /></TabPanel>
 *   </Tabs>
 *
 * - The open tab is in the address: `?tab=people`; the default tab has no parameter. Choosing a tab changes only that
 *   key (other keys, the hash and `location.state` stay) and adds a history entry, so Back returns to the tab before.
 *   An id the list doesn't have (unknown, or `hidden`) opens the default tab.
 * - A return from a school's provider (`#sso=<ticket>…`: an admin's test of school sign-in comes back to a tab) is
 *   never the hash that stays: auth/sso.ts takes it out of the address before the router starts, and should a router
 *   still show one, no tab's link and no tab change carries it (`kept`).
 * - A panel is not rendered until its tab is first opened, so a data hook called inside a panel's own component reads
 *   nothing before that. Call such hooks in the panel's component, not in the page (or ask `useTab().is(id)` there).
 * - Once opened, a panel stays on the page, hidden and not re-rendered, while another tab shows: what was typed in it
 *   stays, and coming back reads nothing again. `keep={false}` takes it off the page instead (see TabPanel).
 * - Keyboard (the WAI-ARIA tabs pattern, manual activation): one Tab stop; the arrow keys move along the list in the
 *   reading direction, Home and End go to its ends; Enter or Space opens the tab in focus, as a click on it (so a guard
 *   that holds link clicks holds it too). Arrowing past a tab opens nothing, so it starts no reads.
 * - Focus is never lost: when the open tab changes without a click on it (`show()` from a tile, Back, a tab the page
 *   stops listing) and focus was on nothing or inside the panel that just closed, it goes to the open tab.
 * - `action`: one control for the whole page, whatever the tab (Refresh), at the inline end of the tab row instead of
 *   on a line of its own above it. It is not a tab: it sits outside the tablist, after it in the Tab order, and the
 *   arrow keys never reach it. On a phone only its icon shows (tabs.css); its words stay as its name, so give it both
 *   (`<Button size="sm" variant="ghost" icon="sync">Refresh</Button>`).
 * - Tests: `screen.getByRole("tab", { name: "People" })` and `fireEvent.click`, or start at `?tab=people`. A count is
 *   part of the name ("Requests 3"): match those with `{ name: /^Requests/ }`.
 */
export interface TabDef {
  /** The `?tab=` value. */
  id: string;
  /** Its name, already in the page's language. */
  label: string;
  /** A count beside the name, read with it ("Requests 3"). Nothing is shown for 0 or none. */
  badge?: number;
  /** Left out of the list: a tab only some roles or organizations have. Its `?tab=` opens the default tab. */
  hidden?: boolean;
  /** Its panel holds changes not saved yet: a dot on the tab, "(unsaved changes)" for screen readers. */
  dirty?: boolean;
}

/** The hash a tab's link and a tab change keep: the page's own (#certificates), never a school sign-in's ticket. */
const kept = (hash: string) => (RETURN.test(hash) ? "" : hash);

export interface TabState {
  /** The open tab's id ("" when the list is empty). */
  tab: string;
  is: (id: string) => boolean;
  /** Opens a tab: a new history entry, unless the address already says so. */
  show: (id: string) => void;
  /** This page's query string with that tab chosen ("" or "?…"), for a `<Link to={{ search }}>`. */
  search: (id: string) => string;
}

/**
 * Which tab the address asks for, and the way to open another. `<Tabs>` uses it; a page calls it with the same
 * arguments when it has to know the open tab itself (a hook that must wait for its tab) or open one (a tile that leads
 * to People).
 */
export function useTab(tabs: readonly TabDef[], defaultTab?: string, param = "tab"): TabState {
  const loc = useLocation();
  const navigate = useNavigate();
  const ids = tabs.filter((x) => !x.hidden).map((x) => x.id);
  const def = defaultTab && ids.includes(defaultTab) ? defaultTab : ids[0] ?? "";
  const asked = new URLSearchParams(loc.search).get(param);
  const tab = asked && ids.includes(asked) ? asked : def;
  const search = (id: string) => {
    const p = new URLSearchParams(loc.search);
    if (id === def) p.delete(param); else p.set(param, id);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const show = (id: string) => {
    if (!ids.includes(id) || (id === def ? asked === null : asked === id)) return;
    // The state goes along: pages read where Back leads (OrgAnalytics) and what the last page did ("X was removed") from it.
    navigate({ pathname: loc.pathname, search: search(id), hash: kept(loc.hash) }, { state: loc.state });
  };
  return { tab, is: (id) => id === tab, show, search };
}

const Ctx = createContext<{ base: string; tab: string } | null>(null);
const Active = createContext(true);
/** Inside a panel: whether its tab is the open one (a kept panel stays mounted while hidden). True outside any Tabs. */
export const useTabActive = () => useContext(Active);

const tabId = (base: string, id: string) => `${base}-tab-${id}`;
const panelId = (base: string, id: string) => `${base}-panel-${id}`;

export function Tabs({ label, tabs, defaultTab, param = "tab", action, children }: {
  /** What the list is, for screen readers (the tablist's aria-label). */
  label: string; tabs: readonly TabDef[]; defaultTab?: string; param?: string;
  /** One control at the inline end of the tab row, for the page whatever the tab (a Refresh button with an icon). */
  action?: ReactNode;
  /** The `<TabPanel>`s (anything else here shows under the list whatever the tab). */
  children: ReactNode;
}) {
  const { t, num, dir } = useI18n();
  const loc = useLocation();
  const st = useTab(tabs, defaultTab, param);
  const base = `tb${useId().replace(/[^\w-]/g, "")}`;
  const root = useHref({ pathname: loc.pathname });
  const how = useNavigationType();
  const rootRef = useRef<HTMLDivElement>(null), listRef = useRef<HTMLDivElement>(null);
  const shown = tabs.filter((x) => !x.hidden);
  const ctx = useMemo(() => ({ base, tab: st.tab }), [base, st.tab]);

  // The open tab stays in view in a list that scrolls sideways. By hand, not scrollIntoView: that would also move the
  // page when the list is off screen. A larger scrollLeft shows what is further right in both directions of writing.
  const reveal = () => {
    const list = listRef.current, sel = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !sel) return;
    const l = list.getBoundingClientRect(), s = sel.getBoundingClientRect();
    if (s.left < l.left) list.scrollLeft -= l.left - s.left; else if (s.right > l.right) list.scrollLeft += s.right - l.right;
  };
  const listed = shown.map((x) => x.id).join(" ");
  // Again when the list itself changes (a tab the page learns of later, such as Super seats, moves the others), and
  // once the web font is in: labels are wider then, and a deep link to a late tab on a phone would stay half cut off.
  useEffect(() => {
    reveal();
    let live = true;
    document.fonts?.ready.then(() => { if (live) reveal(); }, () => {});
    return () => { live = false; };
  }, [st.tab, listed]); // eslint-disable-line react-hooks/exhaustive-deps

  const before = useRef(st.tab);
  useEffect(() => {
    if (before.current === st.tab) return;
    before.current = st.tab;
    // Chosen far down a long panel (the list is sticky): the new panel starts at its top. Back and Forward keep the
    // place the browser remembers.
    const el = rootRef.current;
    if (how !== "POP" && el && el.getBoundingClientRect().top < 0) el.scrollIntoView?.();
  }, [st.tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // After the open tab changes, or a tab leaves the list, focus that was on it or in the panel that closed is gone: a
  // removed element leaves it on <body>, and a hidden panel (display: none) leaves it on something nobody can see. A
  // keyboard user would start again from the top of the page, so it goes to the open tab. Not on the first render (the
  // page's own focus is the page's), and never when focus is somewhere else that is still there (a search field the
  // page opened the tab from). A list that only changes (a tab joins it once the page has read more) takes focus from
  // nobody: focus on nothing then is the page's own state, and a tab focused by script shows the keyboard's ring.
  const onTab = !!listRef.current && listRef.current.contains(document.activeElement); // before this render reaches the page
  const seen = useRef({ tab: st.tab, listed });
  useEffect(() => {
    if (seen.current.tab === st.tab && seen.current.listed === listed) return;
    const opened = seen.current.tab !== st.tab;
    seen.current = { tab: st.tab, listed };
    const at = document.activeElement;
    const lost = !at || at === document.body ? opened || onTab : rootRef.current?.contains(at) && !!at.closest("[role=tabpanel][hidden]");
    if (lost) listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  }, [st.tab, listed]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return; // the browser's own shortcuts (Alt+Left is Back)
    const els = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    const at = els.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    // "Next" is the arrow that points the way the language reads.
    const next = dir === "rtl" ? "ArrowLeft" : "ArrowRight", prev = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    const to = e.key === next ? (at + 1) % els.length : e.key === prev ? (at - 1 + els.length) % els.length : e.key === "Home" ? 0 : e.key === "End" ? els.length - 1 : -1;
    if (to >= 0) { e.preventDefault(); els[to].focus(); return; } // focus only: opening waits for Enter or Space
    // A link answers Enter by itself, but not Space, and not at all in a test's DOM: both are done here, as a click on
    // the tab, so whatever holds link clicks (OrgCourses' leave guard, in the capture phase) sees the keyboard too.
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); els[at].click(); }
  };
  const onClick = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    // With a modifier or another button the browser opens the link itself (a new tab or window).
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true }); // Safari doesn't focus a link that is clicked
    st.show(id);
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="tb" ref={rootRef}>
        <div className="tb-bar no-print">
          <div className="tb-list" role="tablist" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
            {shown.map((x) => {
              const on = x.id === st.tab;
              return (
                // Links, not buttons: the address they lead to is real (a new browser tab opens the same view), and a
                // panel that guards unsaved changes by holding link clicks (OrgCourses' useLeaveGuard) holds these too.
                <a key={x.id} role="tab" id={tabId(base, x.id)} href={`${root}${st.search(x.id)}${kept(loc.hash)}`} data-tab={x.id} className="tb-tab"
                  aria-selected={on} aria-controls={on ? panelId(base, x.id) : undefined} tabIndex={on ? 0 : -1} onClick={(e) => onClick(e, x.id)}>
                  <span className="tb-label">{x.label}</span>
                  {x.badge ? <>{" "}<span className="tb-badge">{num(x.badge)}</span></> : null}
                  {x.dirty ? <>{" "}<span className="tb-dot" aria-hidden /><span className="tb-sr">{t("tabs.unsaved")}</span></> : null}
                </a>
              );
            })}
          </div>
          {action ? <div className="tb-action">{action}</div> : null}
        </div>
        {children}
      </div>
    </Ctx.Provider>
  );
}

/** A hidden panel keeps the output of its last render while open: a page that re-renders does no work for it. */
const Frozen = memo(function Frozen({ children }: { active: boolean; children: ReactNode }) { return <>{children}</>; }, (_, next) => !next.active);

/** What the keyboard can reach by itself: with none of it inside, the panel takes focus so its text can be read. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])';

/**
 * One tab's content, inside `<Tabs>`. Not rendered before its tab is first opened.
 * `keep` (the default): once opened it stays mounted, hidden and frozen, while another tab shows, so its typed text,
 * search and paging stay and returning reads nothing again. `keep={false}` unmounts it when its tab closes: for a panel
 * that only shows the page's own data in a long list (returning is a render, not a read), and for one that guards
 * unsaved changes with a question of its own, which nobody would see in a hidden panel.
 */
export function TabPanel({ id, keep = true, className, children }: { id: string; keep?: boolean; className?: string; children: ReactNode }) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("TabPanel outside Tabs");
  const active = ctx.tab === id;
  const [opened, setOpened] = useState(active);
  if (active && !opened) setOpened(true);
  const ref = useRef<HTMLDivElement>(null);
  const shown = active || (keep && opened);
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    // The panel is a Tab stop only while nothing in it is (a list still loading, a plain notice); set on the element,
    // not through state, so content that arrives later costs no render.
    const sync = () => {
      const bare = !el.querySelector(FOCUSABLE);
      if (bare && el.getAttribute("tabindex") !== "0") el.setAttribute("tabindex", "0");
      else if (!bare && el.hasAttribute("tabindex")) el.removeAttribute("tabindex");
    };
    sync();
    if (typeof MutationObserver === "undefined") return;
    const seen = new MutationObserver(sync);
    seen.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "href", "tabindex", "contenteditable", "controls"] });
    return () => seen.disconnect();
  }, [active, shown]);
  if (!shown) return null;
  return (
    <div ref={ref} role="tabpanel" id={panelId(ctx.base, id)} aria-labelledby={tabId(ctx.base, id)} hidden={!active} className={className ? `tb-panel ${className}` : "tb-panel"}>
      <Active.Provider value={active}><Frozen active={active}>{children}</Frozen></Active.Provider>
    </div>
  );
}
