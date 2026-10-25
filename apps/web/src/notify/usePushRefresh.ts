import { useEffect } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useStore } from "../state/store";
import { prefsFrom, pushOn, refreshPush, type ServerNotify } from "./push";

/** Accounts already refreshed in this app start (the router remounts on sign-in, the app start doesn't repeat). */
const done = new Set<string>();

/**
 * App.tsx `Routed`: once per app start, for a signed-in person who turned notifications on on this phone, re-register
 * the token (FCM rotates it) with today's time zone and weekly goal. It waits for the profile so the person's own
 * choices (users/{uid}.notify) are sent back, never the defaults. Guests and everyone else never touch messaging.
 */
export function usePushRefresh() {
  const { user, profile } = useAuth();
  const { state, ready } = useStore();
  const uid = user?.uid;
  const loaded = Boolean(profile);
  useEffect(() => {
    if (!uid || !ready || !loaded || done.has(uid) || !pushOn(uid)) return;
    done.add(uid);
    const prefs = prefsFrom((profile as { notify?: ServerNotify } | null)?.notify, state.weeklyLessons);
    refreshPush({ ...prefs, lang: state.lang === "ar" ? "ar" : "en" }).catch(() => { done.delete(uid); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, ready, loaded]);
}
