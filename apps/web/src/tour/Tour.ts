/**
 * The tour of the app (TECHNICAL.md "The tour"): driver.js over the real screen, in a lazy chunk loaded only when a tour
 * starts. The steps are built from what is on screen when it starts, so the same tour fits the nav rail (from 900 px),
 * the bottom nav (phones and tablets), learners and staff, and a step whose thing isn't there is left out.
 */
import { driver, type DriveStep, type Side } from "driver.js";
import "driver.js/dist/driver.css";
import "../styles/tour.css";
import "./strings";
import type { MessageKey } from "../i18n";

export interface TourOptions {
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  dir: "ltr" | "rtl";
  /** Has staff pages (Teach, Admin, Platform): on phones they are in Me, and its stop says so. */
  staff: boolean;
}

/** The first matching element that is actually shown (the rail and the bottom nav are both in the page). */
export function shown(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

/** Waits (briefly) for something the page is still loading, such as Home's first course. */
export function waitFor(selector: string, ms: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const end = Date.now() + ms;
    const look = () => {
      const el = shown(selector);
      if (el || Date.now() > end) resolve(el);
      else setTimeout(look, 150);
    };
    look();
  });
}

type Where = "start" | "end" | "top" | "bottom";
interface Stop { el?: string; title: MessageKey; body: MessageKey; side?: Where }

/** A tab in the rail or in the bottom nav, whichever this screen has (not the rail's logo, which also goes to /learn). */
const tab = (path: string) => `.nav-rail .rail-item[href="${path}"], .nav-bottom a[href="${path}"]`;
const railTab = (path: string) => `.nav-rail .rail-item[href="${path}"]`;
const TABS: [string, MessageKey, MessageKey][] = [
  ["/learn", "nav.learn", "tour.learnD"],
  ["/downloads", "nav.downloads", "tour.downloadsD"],
  ["/labs", "nav.lab", "tour.labsD"],
  ["/kit", "nav.kit", "tour.kitD"],
];
// Staff pages (and Organization) are in the rail from 900 px; on phones they are in Me, which says so.
const STAFF: [string, MessageKey, MessageKey][] = [
  ["/org", "nav.org", "tour.orgD"],
  ["/teach", "nav.teach", "tour.teachD"],
  ["/admin", "nav.admin", "tour.adminD"],
  ["/super", "nav.super", "tour.superD"],
  ["/admin/content", "nav.content", "tour.contentD"],
  ["/super/content", "nav.content", "tour.contentD"],
];

/** The stops for what is on screen now. */
export function stops(staff = false): Stop[] {
  const out: Stop[] = [{ title: "tour.welcomeT", body: "tour.welcomeD" }];
  if (shown(".track-switch")) out.push({ el: ".track-switch", title: "tour.trackT", body: "tour.trackD", side: "bottom" });
  if (shown(".week-card")) out.push({ el: ".week-card", title: "tour.weekT", body: "tour.weekD", side: "bottom" });
  if (shown(".unit .dr-card")) out.push({ el: ".unit .dr-card", title: "tour.lessonT", body: "tour.lessonD" });
  const rail = Boolean(shown(".nav-rail"));
  const nav: Where = rail ? "end" : "top";
  for (const [path, title, body] of TABS) if (shown(tab(path))) out.push({ el: tab(path), title, body, side: nav });
  const pages = STAFF.filter(([path]) => shown(railTab(path)));
  if (shown(tab("/me"))) out.push({ el: tab("/me"), title: "nav.me", body: !rail && staff ? "tour.meStaffD" : "tour.meD", side: nav });
  for (const [path, title, body] of pages) out.push({ el: railTab(path), title, body, side: "end" });
  const report = shown(".rail-report") ? ".rail-report" : shown(".bug-fab") ? ".bug-fab" : null;
  if (report) out.push({ el: report, title: "bug.button", body: "tour.reportD", side: report === ".bug-fab" ? "top" : "end" });
  out.push({ title: "tour.doneT", body: "tour.doneD" });
  return out;
}

/** driver.js places popovers by physical side; Darsi's steps say start/end so they turn with the page. */
const physical = (w: Where | undefined, dir: "ltr" | "rtl"): Side | undefined =>
  w === "start" ? (dir === "rtl" ? "right" : "left") : w === "end" ? (dir === "rtl" ? "left" : "right") : w;

/** Runs the tour; resolves when it ends (finished, skipped or closed). */
export function runTour({ t, dir, staff }: TourOptions): Promise<void> {
  const list = stops(staff);
  const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return new Promise((resolve) => {
    const steps: DriveStep[] = list.map((s, i) => ({
      element: s.el ? () => shown(s.el!) ?? document.body : undefined,
      // No Back on the first stop.
      popover: { title: t(s.title), description: t(s.body), side: physical(s.side, dir), align: "center", ...(i === 0 ? { showButtons: ["next", "close"] as const } : {}) },
    }));
    const d = driver({
      steps,
      animate: !calm,
      smoothScroll: !calm,
      showProgress: true,
      // Tapping a highlighted tab would leave the page mid-tour.
      disableActiveInteraction: true,
      // driver.js's arrow keys are left-to-right; right to left, ← is "next" (below).
      allowKeyboardControl: dir === "ltr",
      stagePadding: 4,
      stageRadius: 12,
      popoverClass: "dt-pop",
      popoverOffset: 12,
      nextBtnText: t("tour.next"),
      prevBtnText: t("tour.back"),
      doneBtnText: t("tour.done"),
      closeBtnLabel: t("tour.close"),
      onPopoverRender: (p, { state }) => {
        const i = state.activeIndex ?? 0;
        // In the page's own numerals ("٣ من ١١" in Arabic).
        p.progress.textContent = t("tour.progress", { current: i + 1, total: list.length });
        p.wrapper.setAttribute("dir", dir);
        p.wrapper.setAttribute("role", "dialog");
        p.wrapper.setAttribute("aria-modal", "false");
        p.title.id = "dt-title";
        p.description.id = "dt-body";
        p.wrapper.setAttribute("aria-labelledby", "dt-title");
        p.wrapper.setAttribute("aria-describedby", "dt-body");
        p.closeButton.title = t("tour.close");
        // Keyboard and screen-reader users land on the next button, not somewhere behind the overlay.
        requestAnimationFrame(() => p.nextButton.focus({ preventScroll: true }));
      },
      onDestroyed: () => { if (keys) window.removeEventListener("keyup", keys); resolve(); },
    });
    const keys = dir === "rtl" ? (e: KeyboardEvent) => {
      if (e.key === "Escape") d.destroy();
      else if (e.key === "ArrowLeft") { if (d.hasNextStep()) d.moveNext(); else d.destroy(); }
      else if (e.key === "ArrowRight" && d.hasPreviousStep()) d.movePrevious();
    } : null;
    if (keys) window.addEventListener("keyup", keys);
    d.drive();
  });
}
