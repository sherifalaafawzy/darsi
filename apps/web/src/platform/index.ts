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
export const cacheNameFor = (url: string) => (url.startsWith("/kits/") ? "darsi-kits" : url.startsWith("/lib/") ? "darsi-lib" : url.startsWith("/content/") || isStorageJson(url) ? "darsi-content" : "darsi-media");
/** Authored unit JSON in Cloud Storage (content/load.ts keeps it in darsi-content); uploaded videos and kits go to darsi-media. */
const isStorageJson = (url: string) => /\/v0\/b\/[^/]+\/o\/[^?]+\.json(\?|$)/.test(url);

/**
 * Fetches and stores the files a download needs; files already stored are skipped, so a retry or an update only fetches
 * what is new. Resolves with the files it stored. A failure carries them as `stored`, so the caller can remove them.
 */
export async function cacheUrls(urls: string[], onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<string[]> {
  let done = 0;
  const stored: string[] = [];
  try {
    for (const u of urls) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const cache = await caches.open(cacheNameFor(u));
      if (!(await cache.match(u))) {
        const res = await fetch(u, { signal });
        if (!res.ok) throw new Error(`Failed ${u}`);
        await cache.put(u, res);
        stored.push(u);
      }
      onProgress?.(++done, urls.length);
    }
  } catch (e) {
    // The error itself (a QuotaExceededError keeps its name), with what was stored before it.
    throw Object.assign(typeof e === "object" && e !== null ? e : new Error(String(e)), { stored });
  }
  return stored;
}
/** Which of these files are not stored (Downloads checks a saved course with it). */
export async function missingUrls(urls: string[]): Promise<string[]> {
  if (typeof caches === "undefined") return [];
  const out: string[] = [];
  for (const u of urls) if (!(await (await caches.open(cacheNameFor(u))).match(u))) out.push(u);
  return out;
}
export async function removeCached(urls: string[], opts: { lib?: boolean } = {}) {
  // Lesson JSON stays (it is tiny and lists the unit), and so does the shared library other units use (unless `lib`:
  // half a model that didn't fit); kits and media go.
  await Promise.all(urls.filter((u) => cacheNameFor(u) !== "darsi-content" && (opts.lib || cacheNameFor(u) !== "darsi-lib")).map(async (u) => (await caches.open(cacheNameFor(u))).delete(u)));
}
/**
 * Every stored file under a unit's media folder in Cloud Storage ({content|orgs/<id>}/media/<unit>/…): all its versions
 * and languages, since nothing else ever removes them from darsi-media. `keep`: the files of the download that replaces
 * them (an update to a new version or another language), which stay.
 */
export async function removeUnitMedia(unitId: string, keep: string[] = []) {
  if (typeof caches === "undefined" || !(await caches.has("darsi-media"))) return;
  const cache = await caches.open("darsi-media");
  const folder = `%2Fmedia%2F${encodeURIComponent(unitId)}%2F`;
  const stays = new Set(keep.map((u) => new URL(u, location.origin).href));
  await Promise.all((await cache.keys()).filter((r) => r.url.includes(folder) && !stays.has(r.url)).map((r) => cache.delete(r)));
}

/**
 * Asks the browser to keep this site's storage when the phone runs low on space (downloads, and a guest's progress, which
 * lives only here). Called on a Download tap: Chrome decides silently, Firefox asks. Best effort.
 */
export async function persistStorage(): Promise<boolean> {
  try {
    const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
    if (!s?.persist) return false;
    return (await s.persisted?.()) || (await s.persist());
  } catch { return false; }
}
/** Room left for this site, in MB; null when the browser doesn't say. */
export async function freeSpaceMB(): Promise<number | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e?.quota != null ? (e.quota - (e.usage ?? 0)) / 1e6 : null;
  } catch { return null; }
}
/** The phone has no room for what was being stored (Cache Storage or IndexedDB). */
export const isQuotaError = (e: unknown) => {
  const n = (e as { name?: string } | null)?.name;
  return n === "QuotaExceededError" || n === "NS_ERROR_DOM_QUOTA_REACHED";
};

/**
 * Mobile data, for the Data saver rule: a cellular connection, or the browser's own Save-Data when the connection type is
 * unknown (desktop browsers report none). On Wi-Fi or Ethernet it is never metered, Save-Data or not.
 */
export function onMeteredConnection(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  if (!c) return false;
  // Chrome on Android says "unknown" when it can't tell: as with no type at all, Save-Data decides.
  return c.type === "cellular" || ((c.type === undefined || c.type === "unknown") && c.saveData === true);
}
