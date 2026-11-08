import { useEffect, useState } from "react";
import { firebaseConfig, firebaseReady, useEmulators } from "../firebase-config";
import { captionsFor, kitUrl, lightLang, videoSrc, type Catalog, type CatalogEntry, type Placement, type Settings, type Unit } from "./types";
import { figureOf } from "./figure";
import { RUNTIMES, runtimeScript, runtimesOf } from "./runtimes";

const memo = new Map<string, Promise<unknown>>();
/** Fetches content JSON; the service worker serves it from cache when offline. */
export function loadJSON<T>(path: string): Promise<T> {
  if (!memo.has(path)) memo.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); }).catch((e) => { memo.delete(path); throw e; }));
  return memo.get(path) as Promise<T>;
}
export const loadPlacement = () => loadJSON<Placement>("/content/placement.json");

/* ---------- Courses (published with the course editor) ----------
 * The app ships no courses. Every unit is published from the editor as a versioned JSON file in Cloud Storage
 * (functions/src/catalog.ts): public ones under content/, read with a plain fetch, so guests never load the Firebase
 * SDK; org ones under orgs/{orgId}/, read through the SDK by that org's signed-in members. This module keeps them in
 * Cache Storage itself: catalogs network-first with the last copy as the offline fallback, unit files cache-first
 * (a version's path never changes). The starting courses are published by `npm run seed` (scripts/seed-content.mjs). */

const CONTENT_CACHE = "darsi-content";
let scope: { orgId: string | null } = { orgId: null };
let catalog: Promise<Catalog> | null = null;

/** The REST URL of a Storage object: what guests fetch, and the Cache Storage key for every authored file. */
export const storageUrl = (path: string) =>
  `${useEmulators ? `http://${typeof location !== "undefined" ? location.hostname : "localhost"}:9199` : "https://firebasestorage.googleapis.com"}/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(path)}?alt=media`;
const ORG_FILES = "/o/orgs%2F";

/**
 * Who is reading: App calls this on every render with the signed-in member's orgId (null for guests and people without
 * an org, and while claims are still loading). A change re-reads the catalog. Signing out forgets every cached org
 * file (shared phones); a member whose orgId is only briefly unknown keeps their downloads.
 */
export function configureContent(next: { orgId: string | null; signedIn: boolean }) {
  if (!next.signedIn && orgFlag.get()) { orgFlag.set(false); void forgetOrgFiles(); }
  const orgId = next.signedIn ? next.orgId : null;
  if (orgId === scope.orgId) return;
  scope = { orgId }; catalog = null;
}
/** Set once org files were cached on this device, so signing out knows there is something to forget. */
const orgFlag = {
  get: () => { try { return localStorage.getItem("darsi:orgFiles") === "1"; } catch { return false; } },
  set: (on: boolean) => { try { if (on) localStorage.setItem("darsi:orgFiles", "1"); else localStorage.removeItem("darsi:orgFiles"); } catch { /* private mode */ } },
};
/** Also called by signing out (auth/AuthProvider), which waits for it before the page reloads. */
export async function forgetOrgFiles() {
  if (typeof caches === "undefined") return;
  for (const name of [CONTENT_CACHE, "darsi-media"]) {
    const c = await caches.open(name);
    await Promise.all((await c.keys()).filter((r) => r.url.includes(ORG_FILES)).map((r) => c.delete(r)));
  }
}

/** How long a catalog may take before the last copy answers instead (a connection that hangs rather than fails). */
export const SLOW_MS = 2500;
const SLOW = Symbol("slow");
/**
 * JSON through Cache Storage. `fresh`: network first, but the cached copy answers when the network fails or takes longer
 * than SLOW_MS (the network's copy is still stored when it arrives, for next time); otherwise cache first. A phone that
 * is "online" with no usable data would otherwise wait on Home, Downloads and even downloaded lessons until it gave up.
 */
async function cachedJSON<T>(key: string, fetcher: () => Promise<unknown>, fresh: boolean, onStored?: () => void): Promise<T> {
  const cache = typeof caches !== "undefined" ? await caches.open(CONTENT_CACHE).catch(() => null) : null;
  const fromCache = async () => { const hit = await cache?.match(key); return hit ? ((await hit.json()) as T) : null; };
  if (!fresh) { const hit = await fromCache().catch(() => null); if (hit) return hit; }
  const net = (async () => {
    const data = (await fetcher()) as T;
    const put = await cache?.put(key, new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })).then(() => true, () => false);
    if (put) onStored?.();
    return data;
  })();
  // Handled at once: when the cached copy answers first, a failure of this request later is nobody's error (it would
  // otherwise surface as an unhandled rejection in the problem reports' log).
  net.catch(() => {});
  try {
    const hit = fresh ? await fromCache().catch(() => null) : null;
    if (!hit) return await net;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<typeof SLOW>((resolve) => { timer = setTimeout(() => resolve(SLOW), SLOW_MS); });
    const first = await Promise.race([net, slow]).finally(() => clearTimeout(timer));
    // Too slow: the last copy answers, and the network's lands in the cache by itself for next time.
    return first !== SLOW ? first : hit;
  } catch (e) {
    const hit = fresh ? await fromCache().catch(() => null) : null;
    if (hit) return hit;
    throw e;
  }
}
const fetchPublic = (path: string) => async () => { const r = await fetch(storageUrl(path)); if (!r.ok) throw Object.assign(new Error(`${path}: ${r.status}`), { status: r.status }); return r.json(); };
/** Storage answered that the file isn't there (nothing published yet), as opposed to no answer at all (offline). */
const notFound = (e: unknown) => (e as { status?: number }).status === 404;
const EMPTY: Catalog = { version: 1, units: [] };
/**
 * The Vite dev server only (never a build, nor tests): unpublished courses from content/units, listed in
 * content/dev-catalog.json and served under /content/dev by vite.config.ts devUnits.
 */
const devServer = () => import.meta.env.DEV && import.meta.env.MODE !== "test";
const devCatalog = () => fetch("/content/dev-catalog.json").then((r) => (r.ok ? r.json() as Promise<Catalog> : null)).catch(() => null);
/**
 * Org files go through the SDK (only that org's members may read them). App hands over the reader (setOrgReader):
 * this module is shared with lazy staff chunks, and any SDK import here, even a dynamic one, makes the bundler split
 * the startup bundle into more files.
 */
let readOrgFile: ((path: string) => Promise<unknown>) | null = null;
export const setOrgReader = (read: (path: string) => Promise<unknown>) => { readOrgFile = read; };
const fetchOrg = (path: string) => async () => {
  if (!readOrgFile) throw new Error("No org file reader");
  const data = await readOrgFile(path);
  orgFlag.set(true);
  return data;
};
const isOrgPath = (path: string) => path.startsWith("orgs/");

const isEntry = (u: unknown): u is CatalogEntry => typeof u === "object" && u !== null && typeof (u as CatalogEntry).id === "string" && typeof (u as CatalogEntry).src === "string" && typeof (u as CatalogEntry).track === "string";
/** Public units first (in their order), then the org's; an org entry never replaces a public one with the same id. */
export function mergeCatalog(pub: Catalog | null, org: Catalog | null): Catalog {
  const byId = new Map<string, CatalogEntry>();
  for (const u of (pub?.units ?? []).filter(isEntry)) byId.set(u.id, u);
  for (const u of (org?.units ?? []).filter(isEntry)) if (!byId.has(u.id)) byId.set(u.id, u);
  return { version: pub?.version ?? 1, units: [...byId.values()] };
}

/**
 * Every unit this person can see: published for everyone, and (for org members) their org's. Nothing published yet is
 * an empty list; no answer and no copy from an earlier visit (a first visit offline) is an error, so Home can say so.
 */
export const loadCatalog = (): Promise<Catalog> => (catalog ??= (async () => {
  if (!firebaseReady || !firebaseConfig.storageBucket) return (devServer() ? await devCatalog() : null) ?? EMPTY;
  const orgId = scope.orgId;
  const [pub, org] = await Promise.all([
    cachedJSON<Catalog>(storageUrl("content/catalog.json"), fetchPublic("content/catalog.json"), true).catch((e) => (notFound(e) || devServer() ? EMPTY : Promise.reject(e))),
    orgId ? cachedJSON<Catalog>(storageUrl(`orgs/${orgId}/catalog.json`), fetchOrg(`orgs/${orgId}/catalog.json`), true).catch(() => null) : null,
  ]);
  const live = mergeCatalog(pub, org);
  if (!devServer()) return live;
  // Local courses under content/units: a local copy beats a published one with the same id (unpublished edits).
  const extra = await devCatalog();
  return extra ? mergeCatalog(extra, live) : live;
})().catch((e) => { catalog = null; throw e; }));

let settings: Promise<Settings | null> | null = null;
/**
 * What platform admins set up for everyone (tracks today): content/settings.json, written by saveSettings. Network-first
 * with the last copy offline, like the catalogs; null until anything is saved, and the built-in tracks apply then.
 */
export const loadSettings = (): Promise<Settings | null> => (settings ??= (async () => {
  if (!firebaseReady || !firebaseConfig.storageBucket) return null;
  return cachedJSON<Settings>(storageUrl("content/settings.json"), fetchPublic("content/settings.json"), true).catch(() => null);
})());
/** After the Tracks page saves: read the new settings next time. */
export const forgetSettings = () => { settings = null; };

/**
 * content/sites.json (functions/src/sites.ts): which organization each site host belongs to. Read only on such a host
 * (state/site.ts), network-first with the last copy offline, like the settings; null when there is no answer or copy.
 */
export const loadSitesFile = (): Promise<unknown> => (!firebaseReady || !firebaseConfig.storageBucket ? Promise.resolve(null)
  : cachedJSON<unknown>(storageUrl("content/sites.json"), fetchPublic("content/sites.json"), true).catch(() => null));

/** A published language's UI strings, content/i18n/{code}/v{n}.json: cache-first, since a version's path never changes. */
export async function loadLanguagePack(code: string, version: number): Promise<Record<string, string>> {
  if (!firebaseReady || !firebaseConfig.storageBucket) throw new Error("No content storage");
  const path = `content/i18n/${code}/v${version}.json`;
  const pack = await cachedJSON<{ messages?: Record<string, string> }>(storageUrl(path), fetchPublic(path), false);
  return pack.messages ?? {};
}

export async function loadUnit(id: string): Promise<Unit> {
  const entry = (await loadCatalog()).units.find((u) => u.id === id);
  if (!entry?.src) throw new Error(`No published unit ${id}`);
  const src = entry.src;
  if (src.startsWith("/")) return cachedJSON<Unit>(src, async () => { const r = await fetch(src); if (!r.ok) throw new Error(`${src}: ${r.status}`); return r.json(); }, true);
  try {
    return await cachedJSON<Unit>(storageUrl(src), isOrgPath(src) ? fetchOrg(src) : fetchPublic(src), false, () => { void pruneVersions(id, src).catch(() => {}); });
  } catch (e) {
    // The course was republished and the phone has the new catalog but not the new version, with no connection: the
    // newest version saved here (a downloaded course's) keeps it working offline until it can be updated.
    const older = await newestCached(src).catch(() => null);
    if (older) return older;
    throw e;
  }
}
/** The versions of a unit kept in darsi-content (…/units/<id>/v<n>.json, as storageUrl keys them), by number. */
async function cachedVersions(src: string): Promise<{ v: number; key: Request }[]> {
  const folder = /^(.+\/units\/[^/]+\/)v\d+\.json$/.exec(src)?.[1];
  if (!folder || typeof caches === "undefined" || !(await caches.has(CONTENT_CACHE))) return [];
  const out: { v: number; key: Request }[] = [];
  for (const key of await (await caches.open(CONTENT_CACHE)).keys()) {
    const path = decodeURIComponent(/\/o\/([^?]+)/.exec(key.url)?.[1] ?? "");
    const v = path.startsWith(folder) ? Number(/^v(\d+)\.json$/.exec(path.slice(folder.length))?.[1]) : NaN;
    if (Number.isInteger(v)) out.push({ v, key });
  }
  return out.sort((a, b) => a.v - b.v);
}
/** The highest version of a unit kept in darsi-content. */
async function newestCached(src: string): Promise<Unit | null> {
  const best = (await cachedVersions(src)).pop();
  const hit = best ? await (await caches.open(CONTENT_CACHE)).match(best.key) : undefined;
  return hit ? ((await hit.json()) as Unit) : null;
}
/**
 * Which version of a unit the phone downloaded (Downloads registers it): that version's file stays in darsi-content
 * after a republish, so the downloaded course still opens offline (newestCached) until the learner updates it. Null: not
 * known (a download whose version wasn't recorded, or nothing registered yet), so every older version stays.
 */
let keptVersion: (unitId: string) => number | null | undefined = () => null;
export const setKeptVersions = (get: (unitId: string) => number | null | undefined) => { keptVersion = get; };
/** A new version of a unit is stored: the older ones go, except the downloaded one, so republishes don't pile up. */
async function pruneVersions(unitId: string, src: string) {
  const keep = keptVersion(unitId);
  if (keep === null) return;
  const all = await cachedVersions(src);
  const current = all.find((x) => storageUrl(src) === x.key.url)?.v ?? Math.max(...all.map((x) => x.v));
  const old = all.filter((x) => x.v < current && x.v !== keep);
  if (!old.length) return;
  const cache = await caches.open(CONTENT_CACHE);
  await Promise.all(old.map((x) => cache.delete(x.key)));
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data?: T; error?: Error; loading: boolean; retry: () => void } {
  const [s, setS] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true; setS({ loading: true });
    fn().then((data) => live && setS({ data, loading: false })).catch((error: Error) => live && setS({ error, loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...s, retry: () => setN((x) => x + 1) };
}

/**
 * All URLs needed to use a unit offline: kit files in both formats for the current language, captions, videos, pictures
 * in the text. The unit's JSON is not among them: loadUnit has already cached it (org files can't be fetched without the SDK).
 */
export function unitAssetUrls(unit: Unit, lang: string): string[] {
  const urls: string[] = [];
  for (const l of unit.lessons) {
    for (const k of l.kit) if (k.kind !== "video") for (const f of k.formats) { const u = kitUrl(k, lang, f); if (u) urls.push(u); }
    for (const s of l.steps) {
      // Pictures in the text (the capstones' screenshots), as published to Storage (content/figure.ts).
      for (const text of s.type === "read" ? [s.body] : s.type === "project" ? (s.setup ?? []).map((x) => x.body) : []) {
        for (const para of (text[lang] ?? text.en).split(/\n\s*\n/)) { const fig = figureOf(para); if (fig && !fig.src.startsWith("/")) urls.push(fig.src); }
      }
      if (s.type !== "video") continue;
      const pl = lightLang(s, lang);
      if (pl && s.light) {
        // The light lesson is what plays by default: its files and the narration the phone can play, not the MP4.
        const f = s.light.files;
        const opus = typeof document !== "undefined" && !!document.createElement("audio").canPlayType?.('audio/ogg; codecs="opus"');
        for (const p of ["manifest.json", "scenes.json", `timing/${pl}.json`, opus ? `audio/${pl}.opus` : `audio/${pl}.m4a`]) if (f[p]) urls.push(f[p]);
        urls.push(...LIBRARY_FILES);
        continue;
      }
      const v = videoSrc(s, lang); if (v) urls.push(v); const c = captionsFor(s, lang); if (c) urls.push(c.src);
    }
    // Code steps run on the phone: their language's runtime, kept (darsi-lib) when the unit is removed.
    for (const rt of runtimesOf(l.steps)) { const [script, wasm] = RUNTIMES[rt].files; urls.push(runtimeScript(script), wasm); }
  }
  return [...new Set(urls)];
}

/** The shared library the light lessons draw with (public/lib, from Lesson Studio): the cast, the extra icons, the mark. */
const CAST = ["amina", "okafor", "salma", "joseph", "farah"].flatMap((who) => ["smile", "talking", "curious", "happy"].map((m) => `/lib/v1/cast/${who}_${m}.svg`));
export const LIBRARY_FILES = ["/lib/v1/icons.json", "/lib/v1/brand/darsi-mark.svg", ...CAST];

/** A light lesson's JSON (scenes, timing): cache-first like unit files, since a published file's URL never changes. */
export const loadStoredJSON = <T,>(url: string): Promise<T> =>
  cachedJSON<T>(url, async () => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }, false);
