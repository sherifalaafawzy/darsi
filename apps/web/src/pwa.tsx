import { useCallback, useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { isNative } from "./platform";

/** Service worker with "prompt" updates: the teacher decides when to reload (never mid-lesson). Disabled inside native shells. */
export function usePwaUpdate() {
  const [update, setUpdate] = useState<null | (() => void)>(null);
  useEffect(() => {
    if (isNative() || import.meta.env.DEV) return;
    const updateSW = registerSW({ onNeedRefresh: () => setUpdate(() => () => updateSW(true)) });
  }, []);
  return update;
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
