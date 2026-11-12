import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import { storage } from "../platform";
import { useStore } from "../state/store";
import { notePage, OPEN_FEEDBACK, OPEN_REPORT, type FeedbackStart } from "./log";
import type { About, Shot } from "./Report";
import "../styles/bug-fab.css";

type Mod = typeof import("./Report");
const load = () => import("./Report");
type FbMod = typeof import("./Feedback");
const loadFb = () => import("./Feedback");

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
 * "Share feedback" and "Report a problem" on every screen (TECHNICAL.md "Feedback" and "Problem reports"). App renders
 * this once, inside the router. On the startup path it is only the round button and its two-item menu: choosing one
 * loads that sheet's lazy chunk. "Report a problem" first takes a picture of the screen (without the button or the
 * menu), then opens its sheet over it. What waited offline (reports, feedback) is sent at startup and when the
 * connection returns; only then is a chunk loaded without a tap, and only if something is waiting.
 * The nav rail (from 900 px) has the two as items of its own, and Home asks about a finished course; both open the
 * sheets through events (bugs/log.ts openReport, openFeedback).
 */
export function ReportBug() {
  const { t, dir } = useI18n();
  const { pathname } = useLocation();
  const { user, profile, offlineUid } = useAuth();
  const { state } = useStore();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ mod: Mod; shot: Shot | null } | null>(null);
  const [fb, setFb] = useState<{ mod: FbMod; start: FeedbackStart } | null>(null);
  const [note, setNote] = useState<"bug" | "fb" | null>(null);
  const [menu, setMenu] = useState<{ start: number; end: number } | null>(null);
  const opening = useRef(false);
  useEffect(() => notePage(pathname), [pathname]);
  useFabsAside(pathname);
  useEffect(() => setMenu(null), [pathname]);

  const uid = user?.uid ?? offlineUid ?? null;
  const getToken = useMemo(() => (user ? () => user.getIdToken() : null), [user]);
  const about = useMemo<About>(() => ({
    who: user ? (profile?.name || user.email || user.uid) : offlineUid ? offlineUid : null,
    // Only the uid: the server keeps who sent a report from the verified ID token alone (email, role, organization and
    // plan come from the account's own record there), so nothing a phone could make up is sent, or kept when it waits offline.
    account: user ? { uid: user.uid } : offlineUid ? { uid: offlineUid, offline: true } : null,
    learner: {
      lang: state.lang, onboarded: state.onboarded, guest: state.guest ?? false, audience: state.audience ?? null, stage: state.stage ?? null,
      teach: state.teach ?? null, tracks: state.tracks, track: state.track ?? null, levels: state.levels, weeklyLessons: state.weeklyLessons,
      lessonsDone: Object.keys(state.progress).length, notes: Object.keys(state.notes).length, labsDone: Object.keys(state.labsDone ?? {}).length,
      downloads: Object.keys(state.downloads), dataSaver: state.dataSaver, theme: state.theme, analytics: state.analytics !== false,
      org: state.org ? { id: state.org.id, name: state.org.name } : null,
    },
  }), [user, profile?.name, offlineUid, state]);

  // What opened a sheet (this button's menu, the nav rail, Home's question): the focus goes back to it on close.
  const opener = useRef<HTMLElement | null>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const restore = useRef(false);
  const noteOpener = () => {
    const a = document.activeElement;
    opener.current = a instanceof HTMLElement && a !== document.body && !a.closest(".fab-menu") ? a : null;
  };
  const start = useCallback(async () => {
    if (opening.current) return;
    opening.current = true; setBusy(true); setNote(null);
    try {
      const mod = await load();
      setOpen({ mod, shot: await mod.capture() });
    } catch { setNote("bug"); opening.current = false; } // the chunk isn't on this phone yet, and it's offline
    finally { setBusy(false); }
  }, []);
  const startFb = useCallback(async (begin: FeedbackStart) => {
    if (opening.current) return;
    opening.current = true; setBusy(true); setNote(null);
    try { setFb({ mod: await loadFb(), start: begin }); } catch { setNote("fb"); opening.current = false; } finally { setBusy(false); }
  }, []);
  const close = useCallback(() => { restore.current = true; setOpen(null); setFb(null); opening.current = false; }, []);
  useEffect(() => {
    if (open || fb || !restore.current) return;
    restore.current = false;
    const back = opener.current;
    (back?.isConnected && back.getClientRects().length ? back : fab.current)?.focus();
  }, [open, fb]);
  useEffect(() => {
    const report = () => { noteOpener(); void start(); };
    const feedback = (e: Event) => { noteOpener(); void startFb((e as CustomEvent<FeedbackStart>).detail ?? {}); };
    window.addEventListener(OPEN_REPORT, report);
    window.addEventListener(OPEN_FEEDBACK, feedback);
    return () => { window.removeEventListener(OPEN_REPORT, report); window.removeEventListener(OPEN_FEEDBACK, feedback); };
  }, [start, startFb]);
  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(id);
  }, [note]);

  // The menu sits just above the button, at its inline start edge (the button may be in the page's flow, as on the
  // landing page, so it is placed from where the button is now).
  const openMenu = () => {
    const r = fab.current?.getBoundingClientRect();
    if (!r) return;
    setMenu({ start: Math.max(8, dir === "rtl" ? window.innerWidth - r.right : r.left), end: window.innerHeight - r.top + 8 });
  };
  const shut = (focusFab: boolean) => { setMenu(null); if (focusFab) fab.current?.focus(); };
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    items.current[0]?.focus();
    const away = (e: PointerEvent) => {
      const at = e.target instanceof Node ? e.target : null;
      if (!at || (!fab.current?.contains(at) && !sheet.current?.contains(at))) setMenu(null);
    };
    const gone = () => setMenu(null);
    document.addEventListener("pointerdown", away);
    window.addEventListener("resize", gone);
    window.addEventListener("scroll", gone, { passive: true });
    return () => { document.removeEventListener("pointerdown", away); window.removeEventListener("resize", gone); window.removeEventListener("scroll", gone); };
  }, [menu]);
  const menuKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items.current.filter((b): b is HTMLButtonElement => !!b);
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => { e.preventDefault(); list[(i + list.length) % list.length]?.focus(); };
    if (e.key === "Escape") { e.preventDefault(); shut(true); }
    else if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Tab") setMenu(null);
  };
  const choose = (which: "fb" | "bug") => {
    opener.current = fab.current;
    setMenu(null);
    // The menu leaves the screen before the picture is taken.
    if (which === "bug") requestAnimationFrame(() => void start()); else void startFb({});
  };

  // What waited for a connection.
  useEffect(() => {
    const send = () => {
      if (!navigator.onLine) return;
      storage.get<unknown[]>("darsi:reports").then((q) => {
        if (Array.isArray(q) && q.length) void load().then((m) => m.flushReports(uid, getToken)).catch(() => {});
      }).catch(() => {});
      storage.get<unknown[]>("darsi:feedback").then((q) => {
        if (Array.isArray(q) && q.length) void loadFb().then((m) => m.flushFeedback(uid, getToken)).catch(() => {});
      }).catch(() => {});
    };
    send();
    window.addEventListener("online", send);
    return () => window.removeEventListener("online", send);
  }, [uid, getToken]);

  const sheetOpen = !!open || !!fb;
  return (
    <>
      {/* Kept while a sheet is open (hidden), so the focus can come back to it. */}
      <button ref={fab} type="button" className="bug-fab" aria-label={t("fb.button")} title={t("fb.button")} aria-haspopup="menu" aria-expanded={!!menu}
        aria-controls={menu ? "fab-menu" : undefined} aria-busy={busy} style={sheetOpen ? { display: "none" } : undefined}
        onClick={() => (menu ? shut(false) : openMenu())}><Icon name="chat" size={22} /></button>
      {menu && (
        <div ref={sheet} id="fab-menu" className="fab-menu" role="menu" aria-label={t("fb.button")} style={{ insetInlineStart: menu.start, insetBlockEnd: menu.end }} onKeyDown={menuKeys}>
          <button ref={(el) => { items.current[0] = el; }} type="button" role="menuitem" className="fab-menu-item" onClick={() => choose("fb")}><Icon name="chat" size={20} /><span>{t("fb.share")}</span></button>
          <button ref={(el) => { items.current[1] = el; }} type="button" role="menuitem" className="fab-menu-item" onClick={() => choose("bug")}><Icon name="bug" size={20} /><span>{t("bug.button")}</span></button>
        </div>
      )}
      {note && <p className="bug-note" role="status">{t(note === "fb" ? "fb.unavailable" : "bug.unavailable")}</p>}
      {open && <open.mod.ReportSheet shot={open.shot} about={about} uid={uid} getToken={getToken} onClose={close} />}
      {fb && <fb.mod.FeedbackSheet start={fb.start} uid={uid} getToken={getToken} onClose={close} />}
    </>
  );
}
