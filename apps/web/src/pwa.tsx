import { useCallback, useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { isNative } from "./platform";

/** Service worker with "prompt" updates: the teacher decides when to reload (never mid-lesson). Disabled inside native shells. */
export function usePwaUpdate() {
  const [update, setUpdate] = useState<null | (() => void)>(null);
  useEffect(() => {
    if (isNative() || import.meta.env.DEV) return;
    // immediate: don't wait for window "load" (fonts and images). The worker file itself is registered
    // from index.html at build time, before this chunk, so this only attaches the update prompt.
    registerSW({ immediate: true, onNeedRefresh: () => setUpdate(() => () => { void takeUpdate(); }) });
  }, []);
  return update;
}

/**
 * Switch to the waiting new version and reload. workbox-window reloads only when the new worker takes control of this
 * page, which never happens on a page the worker doesn't control (opened with a hard refresh while another tab or the
 * installed app ran the old version), and the button did nothing. So: reload when it activates or takes control,
 * after a few seconds whatever happens, and at once when nothing is waiting (another tab already switched).
 */
export async function takeUpdate(reg?: ServiceWorkerRegistration | null, wait = 4000) {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  let done = false;
  const go = () => { if (!done) { done = true; location.reload(); } };
  const waiting = (reg ?? (await sw?.getRegistration().catch(() => undefined)))?.waiting;
  if (!sw || !waiting) return go();
  sw.addEventListener("controllerchange", go, { once: true });
  waiting.addEventListener("statechange", () => { if (waiting.state === "activated" || waiting.state === "redundant") go(); });
  waiting.postMessage({ type: "SKIP_WAITING" });
  setTimeout(go, wait);
}

/**
 * After a deploy, a phone still running the previous version asks for that version's chunk (a lab, a staff screen, the
 * tutor), which the site no longer has. Online, that is the cause: take the waiting new version (or reload) instead of
 * blaming the connection. Always behind a button, never by itself: two failures in a row must not loop reloads.
 * The check for a newer version is skipped offline and given `wait` ms at most (it can hang on a connection that lets
 * nothing through), so the button always ends in a reload: the boundaries' Reload (app/AppBoundary.tsx) is the way out.
 * That check answers as soon as the new worker starts installing, before its files are saved; reloading then would
 * bring the old version back (the old worker still answers the page), and the same card again. So a worker that is
 * still installing is waited for, `install` ms at most: once it waits, takeUpdate switches to it; one that fails
 * ("redundant") or takes longer falls through to the plain reload.
 */
export async function reloadForUpdate(wait = 3000, install = 15000) {
  const reg = typeof navigator !== "undefined" ? await navigator.serviceWorker?.getRegistration().catch(() => undefined) : undefined;
  if (reg && navigator.onLine !== false) {
    await Promise.race([Promise.resolve(reg.update()).catch(() => {}), new Promise((done) => setTimeout(done, wait))]);
    // Whatever already waits: update() has just found something newer than it, and switching to the older one would
    // bring the same card back.
    const sw = reg.installing;
    if (sw) await new Promise<void>((done) => {
      const timer = setTimeout(done, install);
      sw.addEventListener("statechange", () => { if (sw.state !== "installing") { clearTimeout(timer); done(); } });
    });
  }
  await takeUpdate(reg);
}

/**
 * Whether Darsi's site really answers. A phone can say it is online while nothing gets through (no data left on the
 * bundle, a weak signal, a Wi-Fi sign-in page), and then the chunk simply isn't saved. One tiny request (HEAD of sw.js,
 * never cached), given up after `ms`.
 */
export async function siteAnswers(ms = 3000): Promise<boolean> {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timer = setTimeout(() => ctl?.abort(), ms);
  try {
    const r = await fetch("/sw.js", { method: "HEAD", cache: "no-store", signal: ctl?.signal });
    return r.ok && (r.headers.get("Content-Type") ?? "").includes("javascript");
  } catch { return false; } finally { clearTimeout(timer); }
}

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; listeners.forEach((l) => l()); });
  window.addEventListener("appinstalled", () => { deferred = null; listeners.forEach((l) => l()); });
}
export const isStandalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const isIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => { const l = () => tick((x) => x + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const install = useCallback(async () => { if (!deferred) return; await deferred.prompt(); await deferred.userChoice; deferred = null; tick((x) => x + 1); }, []);
  return { canInstall: !!deferred && !isNative() && !isStandalone(), iosHint: isIOS() && !isStandalone() && !isNative(), install };
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}
