import { useEffect, useRef, useState, type RefObject } from "react";

/** What the screen shows and does while someone with unsaved changes is on their way out. */
export interface LeaveGuard {
  /** A link or Back was tapped and is being held: ask "Leave without saving?" on the page. */
  asking: boolean;
  /** Where the person was heading (path, query and hash), or null for the app bar's Back. */
  target: string | null;
  stay: () => void;
  /** Goes where the person was heading (the same tap again, let through). The caller's changes are theirs to drop. */
  leave: () => void;
}

/**
 * With unsaved changes (`dirty`): closing or reloading the tab asks (the browser's own question), and a tap on an
 * in-app link or the app bar's Back is held while the screen asks on the page (`asking`). Taps inside `opts.panel`
 * (the form's own links and buttons) are never held. leave() taps the same thing again.
 * The general form of the hook the Courses panel had (admin/OrgCourses.tsx); its behaviour is kept:
 * - only plain left clicks: a new tab (Ctrl, Cmd, Shift, target=_blank), a download or another site is not leaving;
 * - a link to the page already open (same path and query) passes;
 * - the listener is on the document in the capture phase, so the router never sees a held tap.
 * A phone's own Back gesture changes the address without a click and is not held.
 */
export function useLeaveGuard(dirty: boolean, opts?: { panel?: RefObject<HTMLElement | null> }): LeaveGuard {
  const panel = opts?.panel;
  const [pending, setPending] = useState<{ el: HTMLElement; to: string | null } | null>(null);
  const pass = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const click = (e: MouseEvent) => {
      if (pass.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as Element | null)?.closest?.("a[href], .dr-appbar > button") as HTMLElement | null;
      if (!el || panel?.current?.contains(el)) return;
      let to: string | null = null;
      if (el instanceof HTMLAnchorElement) {
        if ((el.target && el.target !== "_self") || el.hasAttribute("download")) return;
        const url = new URL(el.href, location.href);
        if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
        to = url.pathname + url.search + url.hash;
      }
      e.preventDefault(); e.stopPropagation();
      setPending({ el, to });
    };
    addEventListener("beforeunload", warn);
    document.addEventListener("click", click, true);
    return () => { removeEventListener("beforeunload", warn); document.removeEventListener("click", click, true); };
  }, [dirty, panel]);
  // Saved (or discarded) while the question was up: there is nothing to ask about any more.
  useEffect(() => { if (!dirty) setPending(null); }, [dirty]);
  const leave = () => {
    const el = pending?.el;
    setPending(null);
    if (!el?.isConnected) return;
    pass.current = true;
    try { el.click(); } finally { pass.current = false; }
  };
  const held = dirty ? pending : null;
  return { asking: !!held, target: held?.to ?? null, stay: () => setPending(null), leave };
}
