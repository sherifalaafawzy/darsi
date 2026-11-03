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
