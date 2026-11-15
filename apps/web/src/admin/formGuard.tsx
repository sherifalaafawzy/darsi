import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../i18n";
import { InlineConfirm } from "../staff/InlineConfirm";
import { useLeaveGuard, type LeaveGuard } from "../staff/useLeaveGuard";
import { useTabActive } from "./Tabs";
import { k } from "./formsStrings";

/**
 * What the leave guard counts as "inside the form": a page's own tabs (admin/Tabs). Choosing another tab of the page
 * is not leaving it: the edits live in the page or in a kept panel, which stays mounted while hidden. Only for forms
 * whose panel is kept (the default); a `keep={false}` panel loses its state with its tab and needs the plain guard.
 * useLeaveGuard takes an element to spare, asked only whether it contains the tapped link: this stands in for one.
 */
const OWN_TABS = { current: { contains: (el: Node | null) => !!(el as Element | null)?.closest?.('[role="tablist"]') || tabLink(el) } } as unknown as RefObject<HTMLElement | null>;

/**
 * A link to another tab of this page that is not in the tab list (a tile on Overview, a notice's "Open Status"): the
 * same path, and only `tab` differs in the query. No page gives its Tabs another `param`.
 */
function tabLink(el: Node | null): boolean {
  const a = (el as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement)) return false;
  const to = new URL(a.href, location.href);
  if (to.origin !== location.origin || to.pathname !== location.pathname) return false;
  const x = new URLSearchParams(to.search), y = new URLSearchParams(location.search);
  x.delete("tab"); y.delete("tab");
  x.sort(); y.sort();
  return x.toString() === y.toString();
}

/**
 * The staff leave guard (staff/useLeaveGuard: reload, tab close, a nav link, the app bar's Back) for a form on a page
 * with tabs: everything it holds, except a tap on one of the page's own tabs or on a link that only opens one.
 */
export const useFormGuard = (dirty: boolean): LeaveGuard => useLeaveGuard(dirty, { panel: OWN_TABS });

/**
 * The question a held tap asks, on the page (never a browser dialog): Stay, Leave anyway, and where the form can do
 * something about it first, that (`action`: "Save and leave", "Download first").
 * Render it always; it shows only while the guard is asking. Inside a tab's panel that is hidden just then (the person
 * went to another tab, then tapped a nav link), it opens its own tab first: a question nobody can see would leave the
 * link dead.
 */
export function LeaveQuestion({ guard, title, body, action, onStay }: {
  guard: LeaveGuard;
  /** "Leave without saving?" when left out. */
  title?: string; body?: ReactNode;
  /** What to do first. `run` answers whether it worked; `thenLeave` goes on to where the person was heading if it did. */
  action?: { label: string; run: () => Promise<boolean>; thenLeave?: boolean };
  /** After Stay (to show the form, when it is under another tab). */
  onStay?: () => void;
}) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const active = useTabActive();
  const [busy, setBusy] = useState(false);
  const asking = guard.asking;
  useLayoutEffect(() => {
    if (!asking) return;
    const panel = box.current?.closest<HTMLElement>('[role="tabpanel"][hidden]');
    const tab = panel ? document.getElementById(panel.getAttribute("aria-labelledby") ?? "") : null;
    tab?.click(); // spared by useFormGuard, so it opens the tab
  }, [asking]);
  // The question's tab was left with the question still up (the person picked another tab instead of answering): that
  // is Stay. Left asking in a hidden panel, it would hold every later tap with nothing on screen, since the effect
  // above runs only when the asking starts. (Asked from a hidden panel, `active` goes from false to true: not this.)
  const was = useRef(active);
  useEffect(() => {
    if (asking && was.current && !active) guard.stay();
    was.current = active;
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  // Once in view (at once, or after its tab opened): the safe choice has the focus, and the question is on screen.
  useEffect(() => {
    if (!asking || !active) return;
    box.current?.querySelector<HTMLElement>("[data-safe]")?.focus();
    box.current?.scrollIntoView?.({ block: "nearest" });
  }, [asking, active]);
  if (!asking) return null;
  const stay = () => { guard.stay(); onStay?.(); };
  const first = async () => {
    if (!action) return;
    // The guard's own leave() as it is now: a save that works clears the question, and with it what a later one knows.
    const leave = guard.leave;
    setBusy(true);
    let ok = false;
    try { ok = await action.run(); } finally { setBusy(false); }
    if (ok && action.thenLeave) leave();
  };
  return (
    <div ref={box}>
      {action ? (
        <InlineConfirm title={title ?? t(k("fm.leave.title"))} body={body ?? t(k("fm.leave.body"))} confirmLabel={action.label} cancelLabel={t(k("fm.leave.stay"))} busy={busy}
          onConfirm={() => { void first(); }} onCancel={stay}>
          <div><Button size="sm" variant="secondary" disabled={busy} onClick={guard.leave}>{t(k("fm.leave.go"))}</Button></div>
        </InlineConfirm>
      ) : (
        <InlineConfirm title={title ?? t(k("fm.leave.title"))} body={body ?? t(k("fm.leave.body"))} confirmLabel={t(k("fm.leave.go"))} cancelLabel={t(k("fm.leave.stay"))}
          onConfirm={guard.leave} onCancel={stay} />
      )}
    </div>
  );
}
