import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import { storage } from "../platform";
import { useStore } from "../state/store";
import { notePage, OPEN_REPORT } from "./log";
import type { About, Shot } from "./Report";
import "../styles/bug-fab.css";

type Mod = typeof import("./Report");
const load = () => import("./Report");

/** How far the page scrolls one way (px) before the floating buttons go or come back; a finger's jitter doesn't count. */
const STEP = 12;

/**
 * Whether the floating buttons stand aside after a scroll: `y` is the page's scroll, `max` the most it can scroll, and
 * `run` how far it has gone in one direction (down positive). At the top and at the end they always show (every page
 * leaves --fab-clear at its foot, so its last line is clear of them); down hides them, up brings them back.
 */
export function fabsAway(was: boolean, y: number, max: number, run: number): boolean {
  if (y <= STEP || y >= max - 2) return false;
  if (run > STEP) return true;
  if (run < -STEP) return false;
  return was;
}

/**
 * Below 900 px the floating buttons (this one and the tutor's) step aside so they never sit on what the person reads or
 * is about to tap (styles/bug-fab.css, tutor-fab.css). One attribute on <html> says how, data-fabs:
 * - "away" while the page scrolls down (until it scrolls up, or reaches its top or end; a new page starts with them
 *   shown), and while a video's checkpoint question shows on a lesson screen;
 * - "sheet" while the lesson's answer sheet shows (LessonScreen puts its height in --sheet-h on <html>): the Report
 *   button goes, and the tutor's sits in the sheet's head, beside "Correct!", so "why?" can still be asked.
 * They stay in the page for keyboards and screen readers, and show when focused. Cheap on old phones: a passive scroll
 * listener read once per frame, and observers that fire only when <html>'s style or, on a lesson screen, a class changes.
 */
export function useFabsAside(pathname: string) {
  const lesson = pathname.startsWith("/lesson/");
  useEffect(() => {
    const html = document.documentElement;
    let away = false, sheet = false, checkpoint = false, frame = 0, run = 0, lastY = window.scrollY;
    const apply = () => {
      const v = sheet ? "sheet" : away || checkpoint ? "away" : "";
      if ((html.dataset.fabs ?? "") === v) return;
      if (v) html.dataset.fabs = v; else delete html.dataset.fabs;
    };
    const read = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY), d = y - lastY;
      lastY = y;
      if (!d) return;
      run = (d > 0) === (run > 0) ? run + d : d; // the same way: add up; turned: start again
      const next = fabsAway(away, y, html.scrollHeight - window.innerHeight, run);
      if (next !== away) { away = next; apply(); }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    const onStyle = () => {
      const s = parseFloat(html.style.getPropertyValue("--sheet-h")) > 0;
      if (s !== sheet) { sheet = s; apply(); }
    };
    const onClass = () => {
      const c = document.querySelector(".dr-video.has-checkpoint") !== null;
      if (c !== checkpoint) { checkpoint = c; apply(); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const Observer = typeof MutationObserver === "function" ? MutationObserver : null;
    const styles = Observer ? new Observer(onStyle) : null;
    styles?.observe(html, { attributes: true, attributeFilter: ["style"] });
    const classes = Observer && lesson ? new Observer(onClass) : null;
    classes?.observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: true });
    onStyle(); if (lesson) onClass(); apply();
    return () => {
      window.removeEventListener("scroll", onScroll);
      styles?.disconnect(); classes?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      delete html.dataset.fabs;
    };
  }, [pathname, lesson]);
}

/**
 * "Report a problem" on every screen (TECHNICAL.md "Problem reports"). App renders this once, inside the router. On the
 * startup path it is only the button: the first tap loads the report's lazy chunk, which takes a picture of the screen
 * (without this button) before the sheet opens over it. Reports saved offline are sent at startup and when the
 * connection returns; only then is the chunk loaded without a tap, and only if one is waiting.
 */
export function ReportBug() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { user, profile, role, orgId, plan, offlineUid } = useAuth();
  const { state } = useStore();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ mod: Mod; shot: Shot | null } | null>(null);
  const [note, setNote] = useState(false);
  const opening = useRef(false);
  useEffect(() => notePage(pathname), [pathname]);
  useFabsAside(pathname);

  const uid = user?.uid ?? offlineUid ?? null;
  const getToken = useMemo(() => (user ? () => user.getIdToken() : null), [user]);
  const about = useMemo<About>(() => ({
    who: user ? (profile?.name || user.email || user.uid) : offlineUid ? offlineUid : null,
    account: user ? { uid: user.uid, email: user.email, role, orgId, plan: plan?.id ?? null, planUntil: plan ? new Date(plan.until).toISOString() : null }
      : offlineUid ? { uid: offlineUid, offline: true } : null,
    learner: {
      lang: state.lang, onboarded: state.onboarded, guest: state.guest ?? false, audience: state.audience ?? null, stage: state.stage ?? null,
      teach: state.teach ?? null, tracks: state.tracks, track: state.track ?? null, levels: state.levels, weeklyLessons: state.weeklyLessons,
      lessonsDone: Object.keys(state.progress).length, notes: Object.keys(state.notes).length, labsDone: Object.keys(state.labsDone ?? {}).length,
      downloads: Object.keys(state.downloads), dataSaver: state.dataSaver, theme: state.theme, analytics: state.analytics !== false,
      org: state.org ? { id: state.org.id, name: state.org.name } : null,
    },
  }), [user, profile?.name, offlineUid, role, orgId, plan, state]);

  // What opened the sheet (this button, or the nav rail's "Report a problem"): the focus goes back to it on close.
  const opener = useRef<HTMLElement | null>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const restore = useRef(false);
  const start = useCallback(async () => {
    if (opening.current) return;
    opening.current = true; setBusy(true); setNote(false);
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    try {
      const mod = await load();
      setOpen({ mod, shot: await mod.capture() });
    } catch { setNote(true); opening.current = false; } // the chunk isn't on this phone yet, and it's offline
    finally { setBusy(false); }
  }, []);
  const close = useCallback(() => { restore.current = true; setOpen(null); opening.current = false; }, []);
  useEffect(() => {
    if (open || !restore.current) return;
    restore.current = false;
    (opener.current?.isConnected && opener.current.getClientRects().length ? opener.current : fab.current)?.focus();
  }, [open]);
  useEffect(() => {
    const h = () => void start();
    window.addEventListener(OPEN_REPORT, h);
    return () => window.removeEventListener(OPEN_REPORT, h);
  }, [start]);
  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(false), 5000);
    return () => clearTimeout(id);
  }, [note]);

  // Reports that waited for a connection.
  useEffect(() => {
    const send = () => {
      if (!navigator.onLine) return;
      storage.get<unknown[]>("darsi:reports").then((q) => {
        if (Array.isArray(q) && q.length) void load().then((m) => m.flushReports(uid, getToken)).catch(() => {});
      }).catch(() => {});
    };
    send();
    window.addEventListener("online", send);
    return () => window.removeEventListener("online", send);
  }, [uid, getToken]);

  return (
    <>
      {/* Kept while the sheet is open (hidden), so the focus can come back to it. */}
      <button ref={fab} type="button" className="bug-fab" aria-label={t("bug.button")} title={t("bug.button")} aria-haspopup="dialog" aria-busy={busy}
        style={open ? { display: "none" } : undefined} onClick={() => void start()}><Icon name="bug" size={22} /></button>
      {note && <p className="bug-note" role="status">{t("bug.unavailable")}</p>}
      {open && <open.mod.ReportSheet shot={open.shot} about={about} uid={uid} getToken={getToken} onClose={close} />}
    </>
  );
}
