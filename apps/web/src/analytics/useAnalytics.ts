import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { onError, type ErrorNote } from "../bugs/log";
import { audienceFor } from "../content/mine";
import { useStore } from "../state/store";
import { configureAnalytics, track } from "./track";

/** The screen a path belongs to, as one short word: /lesson/ai-1-1/… → "lesson", / → "home". */
export const screenOf = (path: string) => (path.split("/")[1] || "home").toLowerCase().replace(/[^a-z_]/g, "_").slice(0, 24) || "home";

const installed = () => (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/* ---------- The app's own errors (TECHNICAL.md "Analytics") ----------
 * Until now an error stayed in the phone's memory (bugs/log.ts) unless its owner filed a report. Each kind of error is
 * now counted once per session as an `app_error` event: the screen, what failed, and a fingerprint of the message.
 * The message itself never leaves the phone this way (it can hold what someone typed). It rides the usage queue: no
 * request of its own, nothing when "Share usage statistics" is off. */

/** At most this many error events in one session (a page load): a loop of errors must not fill the queue. */
const MAX_ERRORS = 5;
const seen = new Set<string>();
let reporting = false;
/**
 * A browser's notice, not a failure of the app: browsers raise "ResizeObserver loop completed with undelivered
 * notifications" (older Chrome: "… loop limit exceeded") as a window error whenever an observer's own callback changes a
 * size it watches, and deliver the rest in the next frame. The lesson's stage and the video player measure themselves
 * that way, so counting it would put one "error" into ordinary lesson sessions of every build. It stays in the log a
 * problem report carries (bugs/log.ts).
 */
const NOTICE = /^(?:Uncaught\s+)?ResizeObserver loop /;

/** Addresses lose their site (an organization's own address must count as the same error) and their query. */
const plain = (s: string) => s.replace(/\b(?:https?|capacitor|file):\/\/[^/\s)]*/g, "").replace(/\?[^\s:)]*/g, "");
/**
 * A 12-hex fingerprint of an error: its message and where it was thrown (the first stack line with a position). The
 * same error in the same build gives the same fingerprint on every phone; file names change with each build, which is
 * what the per-build count wants. Not a secure hash, and it need not be: two FNV-1a passes, 48 bits.
 */
export function errorHash(message: string, stack = ""): string {
  const frame = stack.split("\n").map((l) => l.trim()).find((l) => /:\d+(?::\d+)?\)?$/.test(l)) ?? "";
  const text = `${plain(message).replace(/^Uncaught\s+/, "").slice(0, 300)}\n${plain(frame).slice(0, 300)}`;
  let a = 0x811c9dc5, b = 0x1000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b) + (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + ((b >>> 0) & 0xffff).toString(16).padStart(4, "0");
}

function report(e: ErrorNote) {
  // Nothing here can go round: an error made while this one is queued is not reported.
  if (reporting || seen.size >= MAX_ERRORS || NOTICE.test(e.message)) return;
  reporting = true;
  try {
    const h = errorHash(e.message, e.stack);
    if (seen.has(h)) return;
    // Switched off (track answers false): nothing is kept, and the error doesn't use up the session's five.
    if (track("app_error", { s: screenOf(location.pathname), k: e.kind, h })) seen.add(h);
  } catch { /* counting an error must never be one */ } finally { reporting = false; }
}

/** Starts counting errors (useAnalytics does, once the store is read); returns how to stop. */
export const watchErrors = () => onError(report);
/** For tests: a new session. */
export function resetErrorTelemetry() { seen.clear(); reporting = false; }

/** Keeps track.ts told who is using the app, and records the session, each screen and the app's own errors. App calls it once. */
export function useAnalytics() {
  const { user, role, orgId, offlineUid } = useAuth();
  const { state, ready } = useStore();
  const { pathname } = useLocation();
  const signedIn = Boolean(user || offlineUid);
  const aud = audienceFor(role, state.audience);
  useEffect(() => {
    if (!ready) return;
    configureAnalytics({
      enabled: state.analytics !== false, dataSaver: state.dataSaver,
      context: { r: signedIn ? role : "guest", l: state.lang, i: installed() ? 1 : 0, ...(aud ? { a: aud } : {}), ...(signedIn && orgId ? { o: orgId } : {}) },
    });
  }, [ready, state.analytics, state.dataSaver, state.lang, signedIn, role, orgId, aud]);

  // After the effect above (the switch is known by now): errors from startup were held for this (bugs/log.ts onError).
  useEffect(() => (ready ? watchErrors() : undefined), [ready]);

  const started = useRef(false);
  const last = useRef("");
  useEffect(() => {
    if (!ready) return;
    if (!started.current) { started.current = true; track("session_start"); }
    const s = screenOf(pathname);
    if (s !== last.current) { last.current = s; track("screen_view", { s }); }
  }, [ready, pathname]);
}
