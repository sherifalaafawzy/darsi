import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";
import { accountLinks } from "../components/Layout";

/** Me's "Take the tour" asks for it with this event. */
export const OPEN_TOUR = "darsi:tour";
export const openTour = () => window.dispatchEvent(new Event(OPEN_TOUR));

/** Screens the tour never starts on by itself: a lesson takes the whole screen, and the account screens have no nav. */
const QUIET = /^\/(lesson|signin|signup|forgot|upgrade)(\/|$)/;

/**
 * The tour (TECHNICAL.md "The tour"). App renders this once, inside the router. On the startup path it is only this:
 * it starts the tour once per account on this device, the first time a signed-in person reaches the learning screens
 * after onboarding (admins, who skip onboarding, on their dashboard), and again whenever Me asks. The tour itself, driver.js
 * and its strings are a lazy chunk; offline before that chunk is cached, it simply tries again next time.
 */
export function AppTour({ home }: { home: string }) {
  const { t, dir } = useI18n();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { user, role } = useAuth();
  const { state, dispatch } = useStore();
  const running = useRef(false);
  const tour = useRef<{ mod: typeof import("./Tour"); at: string } | null>(null);
  const staff = accountLinks(role, Boolean(user)).some((l) => l.path !== "/org");
  const all = role === "superadmin";
  // Learners take the tour once onboarding is done (their tracks chosen); admins skip onboarding, so they don't wait.
  const settled = state.onboarded || role === "orgAdmin" || role === "superadmin";
  const latest = useRef({ settled, pathname });
  latest.current = { settled, pathname };

  const run = useCallback(async (auto: boolean) => {
    if (running.current) return;
    running.current = true;
    try {
      const from = latest.current.pathname;
      const mod = await import("./Tour");
      // Home's first course comes from the catalog: give it a moment so its stop isn't left out.
      if (!(await mod.waitFor(".app-shell", 4000))) return;
      if (location.pathname === "/learn") await mod.waitFor(".unit .dr-card, .dr-empty", 2500);
      // Check again just before it opens: the waits above take a moment, and the screen may have moved on (to an
      // onboarding step, another page, a sheet). By itself it starts only on the screen it was meant for, with the
      // navigation there to point at.
      if (!document.querySelector(".app-shell") || document.querySelector(".dr-onb")) return;
      if (auto && (!latest.current.settled || latest.current.pathname !== from || mod.stops(staff, all).length <= 2)) return;
      if (auto && document.querySelector(".dr-sheet, .track-menu, [role=dialog][aria-modal=true]")) return; // something else is open: next time
      dispatch({ type: "set", patch: { toured: Date.now() } });
      tour.current = { mod, at: location.pathname };
      await mod.runTour({ t, dir, staff, all });
    } catch { /* the chunk isn't on this device yet, and it's offline: next time */ } finally { running.current = false; tour.current = null; }
  }, [t, dir, staff, all, dispatch]);

  // Once per account on this device, when the learning screens first show (after onboarding).
  const auto = Boolean(user) && !state.toured && settled && !QUIET.test(pathname);
  useEffect(() => {
    if (!auto) return;
    // Not during onboarding or "choose a new password": those have no navigation, and the chunk waits until it's wanted.
    const id = setTimeout(() => { if (document.querySelector(".app-shell")) void run(true); }, 700);
    return () => clearTimeout(id);
  }, [auto, pathname, state.onboarded, run]);

  // An open tour closes if its screen goes (another page, or onboarding taking over): it never sits over the wrong one.
  useEffect(() => {
    const open = tour.current;
    if (open && (pathname !== open.at || !settled)) open.mod.stopTour();
  }, [pathname, settled]);

  // From Me: the tour goes where the learning is, so every stop can be shown (platform admins open it without onboarding).
  const learns = state.onboarded || all;
  useEffect(() => {
    const h = () => { nav(learns ? "/learn" : home); setTimeout(() => void run(false), 300); };
    window.addEventListener(OPEN_TOUR, h);
    return () => window.removeEventListener(OPEN_TOUR, h);
  }, [nav, home, learns, run]);

  return null;
}
