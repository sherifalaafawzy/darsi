import { Suspense } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BottomNav, ConnectionStatus, Icon, InstallPrompt, Mark, UpdateToast, type IconName } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import type { Role } from "../auth/types";
import { useI18n, type MessageKey } from "../i18n";
import { useStore } from "../state/store";
import { useInstall, useOnline, usePwaUpdate } from "../pwa";

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
  if (role === "orgAdmin") links.push({ path: "/admin", icon: "settings", key: "nav.admin" });
  if (role === "teacher" || role === "orgAdmin") links.push({ path: "/teach", icon: "chat", key: "nav.teach" });
  if (role === "superadmin") links.push({ path: "/super", icon: "language", key: "nav.super" });
  else links.push({ path: "/org", icon: "home", key: "nav.org" });
  // The course editor: platform admins publish for everyone, org admins for their own members.
  if (role === "superadmin" || role === "orgAdmin") links.push({ path: role === "superadmin" ? "/super/content" : "/admin/content", icon: "edit", key: "nav.content" });
  return links;
}

const Loading = () => <div className="loading" aria-busy="true" />;

export function Layout() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { user, role, signOut } = useAuth();
  const { state, dispatch } = useStore();
  const online = useOnline();
  const update = usePwaUpdate();
  const install = useInstall();
  const completed = Object.keys(state.progress).length > 0;
  const snoozed = state.installDismissedAt && Date.now() - state.installDismissedAt < 14 * 864e5;
  const showInstall = completed && !snoozed && install.canInstall;
  const extra = accountLinks(role, Boolean(user));
  // The longest matching link wins, so /admin/content lights up the editor, not Admin as well.
  const hits = [...TABS, ...extra].map((i) => i.path).filter((p) => pathname === p || pathname.startsWith(`${p}/`));
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
        <Link to="/learn" className="rail-brand" aria-label="Darsi"><Mark size={36} /><span>{lang === "ar" ? "درسي" : "Darsi"}</span></Link>
        {TABS.map(railItem)}
        {extra.length > 0 && <><hr className="rail-sep" />{extra.map(railItem)}</>}
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
        <BottomNav floating label={t("nav.main")} items={TABS.map((tab) => ({
          icon: tab.icon, label: t(tab.key), href: tab.path,
          active: active(tab.path) || (tab.path === "/me" && extra.some((x) => active(x.path))),
          onClick: (e?: unknown) => { (e as Event | undefined)?.preventDefault?.(); nav(tab.path); },
        }))} />
      </div>
    </div>
  );
}
