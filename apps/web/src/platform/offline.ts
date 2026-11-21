/**
 * What downloaded courses and "Save all labs" need beyond the precache, kept in "darsi-saved" (TECHNICAL.md "Offline and
 * caching"). Nothing ages it out: the service worker's chunk routes answer from it (vite.config.ts savedCopies), and a
 * new version fetches its own copies of these files before it takes over (public/offline-sw.js).
 *
 * Groups: "code" (the code steps and their sandbox), "lab:<id>", "pack:<id>" (a light lesson's technology pack) and
 * "labs" (every lab). offline-manifest.json, made at build time and precached, lists each group's files; the pinned
 * groups are in /__darsi/pins.json inside the cache, where the worker reads them too.
 *
 * Startup code: no Firebase, and nothing here imports the app (callers pass in what loads their chunks).
 */
export const SAVED = "darsi-saved";
const PINS = "/__darsi/pins.json";
type Groups = Record<string, string[]>;
export interface PinOptions {
  /** Loads the groups' chunks the usual way: development and the Chrome 61 build have no manifest to read. */
  warm?: () => Promise<unknown>;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

const hasCaches = () => typeof caches !== "undefined";
let manifest: Promise<Groups | null> | null = null;
/** This build's groups. Null without a build manifest (development) and on the Chrome 61 build, which keeps what it uses. */
function groupFiles(): Promise<Groups | null> {
  if (import.meta.env.LEGACY === true) return Promise.resolve(null);
  return (manifest ??= fetch("/offline-manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ groups?: Groups }>) : null))
    .then((m) => (m && typeof m.groups === "object" ? m.groups : null))
    .catch(() => null)
    .then((g) => { if (!g) manifest = null; return g; }));
}
const expand = (groups: string[], all: Groups) =>
  [...new Set(groups.includes("labs") ? [...groups, ...Object.keys(all).filter((g) => g.startsWith("lab:"))] : groups)];
const filesFor = (groups: string[], all: Groups) => [...new Set(expand(groups, all).flatMap((g) => (all[g] ?? []).map((f) => `/${f}`)))];
const pathOf = (url: string) => new URL(url, location.origin).pathname;

/** The groups pinned on this phone. */
export async function readPins(): Promise<string[]> {
  if (!hasCaches()) return [];
  try {
    if (!(await caches.has(SAVED))) return [];
    const res = await (await caches.open(SAVED)).match(PINS);
    const p = res ? ((await res.json()) as { groups?: unknown }) : null;
    return Array.isArray(p?.groups) ? p.groups.filter((g): g is string => typeof g === "string") : [];
  } catch { return []; }
}
const writePins = (cache: Cache, groups: string[]) =>
  cache.put(PINS, new Response(JSON.stringify({ v: 1, groups: [...new Set(groups)].sort() }), { headers: { "Content-Type": "application/json" } }));

/**
 * A chunk for darsi-saved. The worker answers from its runtime cache when it has a copy and doesn't store this request
 * again (cache: "no-store"); the runtime copy is dropped once the saved one is in place.
 */
async function saveChunk(cache: Cache, url: string, signal?: AbortSignal) {
  if (await cache.match(url)) return;
  const res = await fetch(url, { cache: "no-store", signal });
  // A web page instead of the file (a Wi-Fi sign-in page answers every request) would be kept for good: never store it.
  if (!res.ok || (res.headers.get("Content-Type") ?? "").includes("text/html")) throw new Error(`Failed ${url}`);
  await cache.put(url, res);
  for (const name of ["darsi-labs", "darsi-chunks"]) if (await caches.has(name)) await (await caches.open(name)).delete(url).catch(() => false);
}
/** The Chrome 61 build: every legacy file the phone has used moves into darsi-saved, where nothing ages it out. */
async function keepLegacy(saved: Cache) {
  for (const name of ["darsi-chunks", "darsi-labs"]) {
    if (!(await caches.has(name))) continue;
    const c = await caches.open(name);
    for (const r of await c.keys()) {
      if (!/^\/assets\/[^/]*-legacy[-.]/.test(pathOf(r.url))) continue;
      const res = await c.match(r);
      if (res) { await saved.put(r.url, res); await c.delete(r); }
    }
  }
}

/** Pins more groups: their files are fetched into darsi-saved (or moved there from the runtime caches). */
export async function pinGroups(groups: string[], opts: PinOptions = {}): Promise<void> {
  if (!hasCaches()) { await opts.warm?.(); return; }
  const all = await groupFiles();
  if (!all) await opts.warm?.();
  const cache = await caches.open(SAVED);
  if (all) {
    const files = filesFor(groups, all);
    let done = 0;
    for (const f of files) {
      if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
      await saveChunk(cache, f, opts.signal);
      opts.onProgress?.(++done, files.length);
    }
  } else if (import.meta.env.LEGACY === true) await keepLegacy(cache);
  await writePins(cache, [...(await readPins()), ...groups]);
}

/**
 * Pins exactly these groups (Remove, and the check after an update): missing files are fetched, and files only other
 * groups needed leave darsi-saved. `offline`: nothing to fetch now, so only the removals and the list change.
 */
export async function setPins(groups: string[], opts: { offline?: boolean } = {}): Promise<void> {
  if (!hasCaches()) return;
  if (!(await caches.has(SAVED)) && !groups.length) return;
  const all = await groupFiles();
  const cache = await caches.open(SAVED);
  if (all) {
    const files = filesFor(groups, all), keep = new Set(files);
    if (!opts.offline) for (const f of files) await saveChunk(cache, f);
    for (const r of await cache.keys()) { const p = pathOf(r.url); if (p.startsWith("/assets/") && !keep.has(p)) await cache.delete(r); }
  }
  await writePins(cache, groups);
}

/** Whether every file of these groups is in darsi-saved (Downloads' check). True when there is nothing to check. */
export async function groupsSaved(groups: string[]): Promise<boolean> {
  if (!hasCaches() || !groups.length) return true;
  const all = await groupFiles();
  if (!all) return true;
  if (!(await caches.has(SAVED))) return filesFor(groups, all).length === 0;
  const cache = await caches.open(SAVED);
  for (const f of filesFor(groups, all)) if (!(await cache.match(f))) return false;
  return true;
}
