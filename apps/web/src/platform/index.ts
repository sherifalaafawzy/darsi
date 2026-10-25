/**
 * Platform layer — the only place that knows whether we run in a browser or inside a native
 * Capacitor shell (Android/iOS). Screens call these functions and never touch platform APIs directly,
 * which is what keeps the web app and the future native apps one codebase.
 */
import { Capacitor } from "@capacitor/core";
import { get, set, del } from "idb-keyval";

export const isNative = () => Capacitor.isNativePlatform();
export const platformName = () => Capacitor.getPlatform(); // "web" | "android" | "ios"

/** Persistent key-value storage (IndexedDB on web and inside the native WebView). */
export const storage = {
  get: <T,>(key: string) => get<T>(key),
  set: <T,>(key: string, value: T) => set(key, value),
  remove: (key: string) => del(key),
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * Save a file for the teacher (PDF/PPTX). Web: browser download. Native: write to the app's
 * documents folder and open the system share sheet (Save to Files, Drive, WhatsApp, print…).
 */
export async function saveFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  if (isNative()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const written = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Documents, recursive: true });
    await Share.share({ title: filename, url: written.uri });
    return;
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Share text or a link (certificate, lesson). Falls back to copying to the clipboard. */
export async function share(data: { title: string; text?: string; url?: string }): Promise<"shared" | "copied" | "failed"> {
  try {
    if (isNative()) { const { Share } = await import("@capacitor/share"); await Share.share(data); return "shared"; }
    if (navigator.share) { await navigator.share(data); return "shared"; }
    await navigator.clipboard.writeText([data.title, data.text, data.url].filter(Boolean).join("\n"));
    return "copied";
  } catch { return "failed"; }
}

/** Store a list of URLs for offline use. Works in browsers and in the native WebView (Cache Storage). */
/** Cache names must match the service worker's runtime caches (vite.config.ts) so offline requests are served. */
export const cacheNameFor = (url: string) => (url.startsWith("/kits/") ? "darsi-kits" : url.startsWith("/content/") ? "darsi-content" : "darsi-media");

export async function cacheUrls(urls: string[], onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<void> {
  let done = 0;
  for (const u of urls) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const res = await fetch(u, { signal });
    if (!res.ok) throw new Error(`Failed ${u}`);
    await (await caches.open(cacheNameFor(u))).put(u, res);
    onProgress?.(++done, urls.length);
  }
}
export async function removeCached(urls: string[]) {
  await Promise.all(urls.filter((u) => !u.startsWith("/content/")).map(async (u) => (await caches.open(cacheNameFor(u))).delete(u)));
}

/** Rough connection type for the Data saver rule. */
export function onMeteredConnection(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  return !!c && (c.saveData === true || c.type === "cellular");
}
