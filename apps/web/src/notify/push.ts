/**
 * Web push on this phone (FCM). Never imports Firebase statically: the SDK comes through loadFirebase() and
 * firebase/messaging is fetched only when a signed-in person turns notifications on (or had them on), so guests and
 * everyone who never opts in download none of it. public/push-sw.js shows the messages; the server picks what and when.
 */
import { api, type NotifyCats, type NotifyPrefs, type PushLang } from "../auth/api";
import { loadFirebase } from "../fb";
import { vapidKey } from "../firebase-config";
import { isNative } from "../platform";

export type PushSupport = "ok" | "unconfigured" | "unsupported" | "ios-install";
export type PushPrefs = NotifyPrefs & { lang: PushLang };
/** users/{uid}.notify as the profile carries it (only Cloud Functions write it). */
export interface ServerNotify { on?: boolean; hourLocal?: number; cats?: Partial<NotifyCats>; weeklyGoal?: number }

/** Reminder times offered in Me (local hours); 18:00 suits most teachers after school. */
export const HOURS = [7, 12, 16, 18, 20];
export const DEFAULT_HOUR = 18;
export const DEFAULT_CATS: NotifyCats = { reminders: true, reviews: true, staff: true, news: true };
const KEY = "darsi:push";

/** What to send: the server's choices where it has them, defaults otherwise, and the weekly goal from the local store. */
export function prefsFrom(n: ServerNotify | null | undefined, weeklyGoal: number): NotifyPrefs {
  const h = n?.hourLocal;
  return {
    hourLocal: typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= 23 ? h : DEFAULT_HOUR,
    cats: { ...DEFAULT_CATS, ...n?.cats },
    weeklyGoal: Math.min(14, Math.max(1, Math.round(weeklyGoal) || 4)),
  };
}

// darsi:push = { token, on: true, uid }: the uid keeps a shared phone from refreshing one account's token into another's.
interface Saved { token: string; on: true; uid: string }
const saved = (): Saved | null => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
    return s?.on === true && typeof s.token === "string" && typeof s.uid === "string" ? (s as Saved) : null;
  } catch { return null; }
};
const save = (s: Saved | null) => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* storage blocked: the switch just won't remember */ } };
/** Did this person turn notifications on on this phone? Reads localStorage only, never the SDK. */
export const pushOn = (uid?: string | null) => Boolean(uid && saved()?.uid === uid);

const ua = () => navigator.userAgent;
const isIOS = () => /iphone|ipad|ipod/i.test(ua()) || (/Macintosh/.test(ua()) && navigator.maxTouchPoints > 1);
const iosVersion = () => { const m = /OS (\d+)_(\d+)/.exec(ua()); return m ? Number(m[1]) * 100 + Number(m[2]) : Infinity; };
const standalone = () => window.matchMedia?.("(display-mode: standalone)")?.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Can this browser get Darsi's notifications, and if not, what should the person do? */
export function pushSupport(): PushSupport {
  if (!vapidKey) return "unconfigured";
  if (typeof window === "undefined" || isNative()) return "unsupported"; // the native shells will need FCM's native plugin
  // Safari offers push only to Home Screen apps (iOS 16.4+), so a Safari tab has no PushManager: ask for the install first.
  if (isIOS() && !standalone()) return iosVersion() < 1604 ? "unsupported" : "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "ok";
}

export const permission = (): NotificationPermission => (typeof Notification === "undefined" ? "default" : Notification.permission);
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

/** Settles with `p`, or with `fallback()` after `ms` (a weak connection or a missing worker must not hang a tap). */
const within = <T,>(p: Promise<T>, ms: number, fallback: () => T | Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<T>((done) => { timer = setTimeout(() => done(fallback()), ms); })]).finally(() => clearTimeout(timer));
};
/** The app's service worker (it also shows the messages). It isn't running in dev, so don't wait for it forever. */
const worker = () => within(navigator.serviceWorker.ready, 15e3, () => Promise.reject(new Error("The app's service worker is not running yet. Reload the page and try again.")));

async function token(): Promise<string> {
  const [fb, m, reg] = await Promise.all([loadFirebase(), import("firebase/messaging"), worker()]);
  return m.getToken(m.getMessaging(fb.app), { vapidKey, serviceWorkerRegistration: reg });
}

/** Revokes this phone's token at FCM, so nothing more arrives here even if the server call was missed. */
async function dropToken() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  try {
    const [fb, m] = await Promise.all([loadFirebase(), import("firebase/messaging")]);
    const msg = m.getMessaging(fb.app);
    // deleteToken needs the SDK pointed at our worker (otherwise it registers its own); getToken does that, from its cache.
    await m.getToken(msg, { vapidKey, serviceWorkerRegistration: reg });
    await m.deleteToken(msg);
  } catch { await (await reg.pushManager.getSubscription())?.unsubscribe(); }
}

/**
 * The master switch, on: asks for permission (call it straight from the tap), registers this phone with its language,
 * time zone and choices, and remembers the token. Returns the permission given; nothing is registered unless "granted".
 */
export async function enablePush(prefs: PushPrefs): Promise<NotificationPermission> {
  const p = await Notification.requestPermission();
  if (p !== "granted") return p;
  const [fb, t] = await Promise.all([loadFirebase(), token()]);
  const uid = fb.auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in to turn on notifications.");
  await api.registerDevice({ token: t, tz: tz(), ...prefs });
  save({ token: t, on: true, uid });
  return p;
}

/** The master switch, off: the server forgets this phone first (dropping its topics while the token still works). Throws if offline. */
export async function disablePush(): Promise<void> {
  const s = saved();
  if (s) await api.unregisterDevice({ token: s.token });
  await dropToken().catch(() => {});
  save(null);
}

/**
 * Once per app start while on (usePushRefresh): FCM rotates tokens, and the time zone or weekly goal may have changed.
 * If notifications were blocked in the browser's settings since, the server stops sending to this phone.
 */
export async function refreshPush(prefs: PushPrefs): Promise<void> {
  const s = saved();
  if (!s || pushSupport() !== "ok") return;
  const fb = await loadFirebase();
  if (fb.auth.currentUser?.uid !== s.uid) return;
  if (permission() !== "granted") { save(null); await api.unregisterDevice({ token: s.token }).catch(() => {}); return; }
  const t = await token();
  await api.registerDevice({ token: t, tz: tz(), ...prefs });
  if (t !== s.token) { save({ ...s, token: t }); await api.unregisterDevice({ token: s.token }).catch(() => {}); }
}

/** A category or the reminder time changed (only while on). */
export const savePrefs = (prefs: NotifyPrefs) => api.updateNotifyPrefs({ tz: tz(), hourLocal: prefs.hourLocal, cats: prefs.cats, weeklyGoal: prefs.weeklyGoal });

/**
 * Before signing out: this phone stops getting that account's notifications (a shared phone must not show one
 * teacher's alerts to the next person). Best effort and capped, so signing out never hangs on a weak connection.
 */
export async function pushSignOut(uid: string): Promise<void> {
  const s = saved();
  if (!s || s.uid !== uid) return;
  save(null);
  await within(api.unregisterDevice({ token: s.token }).catch(() => {}).then(dropToken).catch(() => {}), 8e3, () => {});
}
