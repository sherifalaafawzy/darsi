import { useEffect, useState, useCallback } from "react";

/** Registers the service worker and reports when a new version is waiting (show UpdateToast, then call `update()`). */
export function registerDarsiSW(url = "/sw.js", onUpdate?: (update: () => void) => void): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register(url).then((reg) => {
    const announce = (w: ServiceWorker) => onUpdate?.(() => { w.postMessage({ type: "SKIP_WAITING" }); });
    if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) announce(w); });
    });
  });
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; window.location.reload(); } });
}

/** true while the browser reports a connection. Pair with ConnectionStatus. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }>; }
/** Captures the browser install event for InstallPrompt. `canInstall` is false on iOS — show Share → Add to Home Screen steps there. */
export function useInstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  const install = useCallback(async () => { if (!evt) return "unavailable" as const; await evt.prompt(); const c = await evt.userChoice; setEvt(null); return c.outcome; }, [evt]);
  return { canInstall: !!evt, install };
}

/** Ask the service worker to cache a downloaded unit (lesson JSON, video, PDFs). */
export function cacheUnit(unit: string, urls: string[]) {
  navigator.serviceWorker?.controller?.postMessage({ type: "CACHE_UNIT", unit, urls });
}
