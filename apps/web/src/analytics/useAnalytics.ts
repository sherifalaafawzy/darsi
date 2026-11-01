import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { audienceFor } from "../content/mine";
import { useStore } from "../state/store";
import { configureAnalytics, track } from "./track";

/** The screen a path belongs to, as one short word: /lesson/ai-1-1/… → "lesson", / → "home". */
export const screenOf = (path: string) => (path.split("/")[1] || "home").toLowerCase().replace(/[^a-z_]/g, "_").slice(0, 24) || "home";

const installed = () => (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Keeps track.ts told who is using the app, and records the session and each screen. App calls it once. */
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

  const started = useRef(false);
  const last = useRef("");
  useEffect(() => {
    if (!ready) return;
    if (!started.current) { started.current = true; track("session_start"); }
    const s = screenOf(pathname);
    if (s !== last.current) { last.current = s; track("screen_view", { s }); }
  }, [ready, pathname]);
}
