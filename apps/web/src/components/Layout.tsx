import { Suspense, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BottomNav, BrandMark, ConnectionStatus, Icon, InstallPrompt, Mark, UpdateToast, useBrand, type IconName } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import type { Role } from "../auth/types";
import { useI18n, type MessageKey } from "../i18n";
import { useStore } from "../state/store";
import { audienceFor } from "../content/mine";
import { useInstall, useOnline, usePwaUpdate } from "../pwa";
import { openReport } from "../bugs/log";

interface NavItem { path: string; icon: IconName; key: MessageKey }
const TABS: NavItem[] = [
  { path: "/learn", icon: "learn", key: "nav.learn" },
  { path: "/downloads", icon: "offline", key: "nav.downloads" },
  { path: "/labs", icon: "ai", key: "nav.lab" },
  { path: "/kit", icon: "award", key: "nav.kit" },
  { path: "/me", icon: "profile", key: "nav.me" },
];

/**
 * Where a signed-in person can go besides learning, by role. The nav rail (wide screens) lists them; on phones they
 * live in Me's account section, so the bottom nav keeps five learner tabs that fit a small screen.
 */
export function accountLinks(role: Role, signedIn: boolean): NavItem[] {
  if (!signedIn) return [];
  const links: NavItem[] = [];
  // Courses: which courses the organization's teachers, students and classes see (admin/OrgCourses.tsx).
  if (role === "orgAdmin") links.push({ path: "/admin", icon: "settings", key: "nav.admin" }, { path: "/admin/analytics", icon: "chart", key: "nav.analytics" }, { path: "/admin/courses", icon: "book", key: "nav.courses" });
  if (role === "teacher" || role === "orgAdmin") links.push({ path: "/teach", icon: "chat", key: "nav.teach" });
  if (role === "superadmin") links.push({ path: "/super", icon: "language", key: "nav.super" }, { path: "/super/analytics", icon: "chart", key: "nav.analytics" }, { path: "/super/orgs", icon: "home", key: "nav.orgs" }, { path: "/super/people", icon: "profile", key: "nav.people" }, { path: "/super/projects", icon: "file", key: "nav.projects" }, { path: "/super/certificates", icon: "check", key: "nav.certificates" }, { path: "/super/bugs", icon: "bug", key: "nav.bugs" }, { path: "/super/domains", icon: "globe", key: "nav.domains" }, { path: "/super/plans", icon: "award", key: "nav.plans" });
  else links.push({ path: "/org", icon: "home", key: "nav.org" });
  // The course editor: platform admins publish for everyone, org admins for their own members.
  if (role === "superadmin" || role === "orgAdmin") links.push({ path: role === "superadmin" ? "/super/content" : "/admin/content", icon: "edit", key: "nav.content" });
  return links;
}

/** Pages outside the nav that still have a name of their own (the window title, App.tsx PageTitle). */
const OTHER_PAGES: NavItem[] = [
  { path: "/tracks", icon: "learn", key: "tracks.title" },
  { path: "/results", icon: "chart", key: "results.title" },
  { path: "/licences", icon: "file", key: "me.licences" },
  { path: "/super/access", icon: "chart", key: "access.title" },
];
/** The name of the page at `pathname`: its tab, staff link or own name (the longest match wins), or null (a lesson). */
export function pageKey(pathname: string, role: Role, signedIn: boolean): MessageKey | null {
  const hit = [...TABS, ...accountLinks(role, signedIn), ...OTHER_PAGES]
    .filter((i) => pathname === i.path || pathname.startsWith(`${i.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return hit?.key ?? null;
}

/**
 * Puts keyboard and screen-reader focus on a heading the page just showed, so the person carries on from there: the
 * button or tab they pressed has gone, or belongs to the page they left (focus would drop to the start of the page).
 */
export function focusHeading(el: HTMLElement | null | undefined) {
  if (!el) return;
  if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
  el.focus({ preventScroll: true });
}

const Loading = () => <div className="loading" aria-busy="true" />;

export function Layout() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { pathname, key: navKey } = useLocation();
  const { user, role, signOut } = useAuth();
  const { state, dispatch } = useStore();
  // The organization's (its members', or anyone's on its own web address: App's BrandProvider), else Darsi's.
  const brand = useBrand();
  const online = useOnline();
  const update = usePwaUpdate();
  const install = useInstall();
  const completed = Object.keys(state.progress).length > 0;
  const snoozed = state.installDismissedAt && Date.now() - state.installDismissedAt < 14 * 864e5;
  const showInstall = completed && !snoozed && install.canInstall;
  const extra = accountLinks(role, Boolean(user));
  // The rail has its own "Report a problem" from 900 px, so the floating one hides there (styles/bug-fab.css).
  useEffect(() => { document.documentElement.dataset.rail = ""; return () => { delete document.documentElement.dataset.rail; }; }, []);
  // Moving to another page in the app (not a page that has just loaded: React Router's first location is "default"),
  // focus goes to the new page's title, as a page load would start there; the tab pressed would otherwise keep it, and
  // nothing would say the page changed. A page still loading (a lazy staff screen), or one that put focus somewhere
  // itself (a field to type in), keeps it.
  useEffect(() => {
    if (navKey === "default") return;
    const id = requestAnimationFrame(() => {
      const h = document.querySelector<HTMLElement>(".app-main h1");
      const at = document.activeElement;
      if (h && !(at && at !== document.body && at.closest(".app-main"))) focusHeading(h);
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  // Students have no classroom kit to teach with.
  const tabs = audienceFor(role, state.audience) === "students" ? TABS.filter((x) => x.path !== "/kit") : TABS;
  // The longest matching link wins, so /admin/content lights up the editor, not Admin as well.
  const hits = [...tabs, ...extra].map((i) => i.path).filter((p) => pathname === p || pathname.startsWith(`${p}/`));
  const best = hits.sort((a, b) => b.length - a.length)[0];
  const active = (path: string) => path === best;
  const railItem = (item: NavItem) => (
    <Link key={item.path} to={item.path} className={active(item.path) ? "rail-item is-active" : "rail-item"} aria-current={active(item.path) ? "page" : undefined}>
      <Icon name={item.icon} size={24} /><span>{t(item.key)}</span>
    </Link>
  );
  return (
    <div className="app-shell">
      <nav className="nav-rail" aria-label={t("nav.main")}>
        {/* An organization's logo and name, with a small credit for Darsi under them (none on its own site without
            Darsi's identity). */}
        {brand.name
          ? <Link to="/learn" className="rail-brand is-org"><BrandMark size={36} /><span><bdi>{brand.name}</bdi>{brand.darsi !== false && <small className="rail-credit"><Mark size={14} />{t("org.withDarsi")}</small>}</span></Link>
          : <Link to="/learn" className="rail-brand" aria-label={t("app.name")}><Mark size={36} /><span>{t("app.name")}</span></Link>}
        {tabs.map(railItem)}
        {extra.length > 0 && <><hr className="rail-sep" />{extra.map(railItem)}</>}
        <button type="button" className="rail-item rail-report" aria-haspopup="dialog" onClick={openReport}><Icon name="bug" size={24} /><span>{t("bug.button")}</span></button>
        {/* On phones Sign out is at the top of Me; on wide screens it is always here. */}
        {user && <button type="button" className="rail-item rail-signout" onClick={() => { void signOut(); }}><Icon name="close" size={24} /><span>{t("me.signOut")}</span></button>}
      </nav>
      <div className="app-main">
        {!online && <ConnectionStatus state="offline" floating>{t("pwa.offline")}</ConnectionStatus>}
        <Suspense fallback={<Loading />}><Outlet /></Suspense>
      </div>
      <div className="app-float">
        {update && <UpdateToast actionLabel={t("pwa.reload")} onAction={update}>{t("pwa.update")}</UpdateToast>}
        {showInstall && <InstallPrompt title={t("pwa.installTitle")} body={t("pwa.installBody")} installLabel={t("pwa.install")} dismissLabel={t("pwa.notNow")}
          onInstall={install.install} onDismiss={() => dispatch({ type: "set", patch: { installDismissedAt: Date.now() } })} />}
      </div>
      <div className="nav-bottom">
        <BottomNav floating label={t("nav.main")} items={tabs.map((tab) => ({
          icon: tab.icon, label: t(tab.key), href: tab.path,
          active: active(tab.path) || (tab.path === "/me" && extra.some((x) => active(x.path))),
          onClick: (e?: unknown) => { (e as Event | undefined)?.preventDefault?.(); nav(tab.path); },
        }))} />
      </div>
    </div>
  );
}
