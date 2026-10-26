import { useEffect, useState } from "react";
import { firebaseConfig, firebaseReady, useEmulators } from "../firebase-config";
import { kitUrl, videoSrc, type Catalog, type CatalogEntry, type Placement, type Settings, type Unit } from "./types";

const memo = new Map<string, Promise<unknown>>();
/** Fetches content JSON; the service worker serves it from cache when offline. */
export function loadJSON<T>(path: string): Promise<T> {
  if (!memo.has(path)) memo.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); }).catch((e) => { memo.delete(path); throw e; }));
  return memo.get(path) as Promise<T>;
}
export const loadPlacement = () => loadJSON<Placement>("/content/placement.json");

/* ---------- Authored units (course editor) ----------
 * Built-in units ship in /content and are precached. Units published from the editor are versioned JSON files in Cloud
 * Storage (functions/src/catalog.ts): public ones under content/, read with a plain fetch, so guests never load the
 * Firebase SDK; org ones under orgs/{orgId}/, read through the SDK by that org's signed-in members (content/remote.ts).
 * This module keeps them in Cache Storage itself: catalogs network-first with the last copy as the offline fallback,
 * unit files cache-first (a version's path never changes). A public unit may replace a built-in one with the same id. */

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
async function forgetOrgFiles() {
  if (typeof caches === "undefined") return;
  for (const name of [CONTENT_CACHE, "darsi-media"]) {
    const c = await caches.open(name);
    await Promise.all((await c.keys()).filter((r) => r.url.includes(ORG_FILES)).map((r) => c.delete(r)));
  }
}

/** JSON through Cache Storage. `fresh`: network first, cached copy if that fails; otherwise cache first. */
async function cachedJSON<T>(key: string, fetcher: () => Promise<unknown>, fresh: boolean): Promise<T> {
  const cache = typeof caches !== "undefined" ? await caches.open(CONTENT_CACHE).catch(() => null) : null;
  const fromCache = async () => { const hit = await cache?.match(key); return hit ? ((await hit.json()) as T) : null; };
  if (!fresh) { const hit = await fromCache(); if (hit) return hit; }
  try {
    const data = (await fetcher()) as T;
    await cache?.put(key, new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })).catch(() => {});
    return data;
  } catch (e) {
    const hit = fresh ? await fromCache() : null;
    if (hit) return hit;
    throw e;
  }
}
const fetchPublic = (path: string) => async () => { const r = await fetch(storageUrl(path)); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); };
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
/**
 * Built-in entries first (in their order), then authored ones. A public entry replaces a built-in one with its id
 * (that is how an edited ai-1 reaches learners); an org entry never replaces anything.
 */
export function mergeCatalog(builtIn: Catalog, pub: Catalog | null, org: Catalog | null): Catalog {
  const byId = new Map(builtIn.units.map((u) => [u.id, u] as const));
  for (const u of (pub?.units ?? []).filter(isEntry)) byId.set(u.id, u);
  for (const u of (org?.units ?? []).filter(isEntry)) if (!byId.has(u.id)) byId.set(u.id, u);
  return { version: builtIn.version, units: [...byId.values()] };
}

/** Every unit this person can see: built-in, published for everyone, and (for org members) their org's. */
export const loadCatalog = (): Promise<Catalog> => (catalog ??= (async () => {
  const builtIn = await loadJSON<Catalog>("/content/catalog.json");
  if (!firebaseReady || !firebaseConfig.storageBucket) return builtIn;
  const orgId = scope.orgId;
  const [pub, org] = await Promise.all([
    cachedJSON<Catalog>(storageUrl("content/catalog.json"), fetchPublic("content/catalog.json"), true).catch(() => null),
    orgId ? cachedJSON<Catalog>(storageUrl(`orgs/${orgId}/catalog.json`), fetchOrg(`orgs/${orgId}/catalog.json`), true).catch(() => null) : null,
  ]);
  return mergeCatalog(builtIn, pub, org);
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

export async function loadUnit(id: string): Promise<Unit> {
  const entry = (await loadCatalog().catch(() => null))?.units.find((u) => u.id === id);
  if (!entry?.src) return loadJSON<Unit>(`/content/units/${id}.json`);
  const src = entry.src;
  return cachedJSON<Unit>(storageUrl(src), isOrgPath(src) ? fetchOrg(src) : fetchPublic(src), false);
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
 * All URLs needed to use a unit offline: its JSON, kit files in both formats for the current language, captions, videos.
 * An authored unit's JSON is left out: loadUnit has already cached it (org files can't be fetched without the SDK).
 */
export function unitAssetUrls(unit: Unit, lang: string, entry?: CatalogEntry): string[] {
  const urls = entry?.src ? [] : [`/content/units/${unit.id}.json`];
  for (const l of unit.lessons) {
    for (const k of l.kit) if (k.kind !== "video") for (const f of k.formats) { const u = kitUrl(k, lang, f); if (u) urls.push(u); }
    for (const s of l.steps) if (s.type === "video") { const v = videoSrc(s, lang); if (v) urls.push(v); const c = s.captions?.[lang]; if (c) urls.push(c); }
  }
  return [...new Set(urls)];
}
