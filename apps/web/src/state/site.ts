/**
 * Which organization this web address belongs to (TECHNICAL.md "Organization sites (custom web addresses)"). Every host
 * is served by the same Hosting site and build, so on a host that isn't Darsi's own (content/sites.ts isDarsiHost) the
 * app reads content/sites.json at start (a plain fetch, network-first with the last copy offline: content/load.ts) and
 * shows that organization's name and logo, with or without Darsi's identity.
 * - The answer is kept per host in localStorage, the logo as a small data: URL, so the next start shows it at once (and
 *   offline) while the file is re-read behind it. Only a first visit waits for the file, at most FIRST_WAIT_MS.
 * - Darsi's own hosts read nothing. Guests never load Firebase here.
 */
import { useSyncExternalStore } from "react";
import { loadSitesFile } from "../content/load";
import { isDarsiHost, siteFor, type SiteEntry } from "../content/sites";
import type { OrgBrand } from "./store";

export interface SiteState { ready: boolean; site: SiteEntry | null }
/** What the app shows as its brand: an organization's name and logo (or none: Darsi's), and whether Darsi's identity shows. */
export interface Identity { name: string | null; logo: string | null; darsi: boolean }

/** On this machine (localhost), ?site=<host> stands in for that host until the tab closes (?site= stops it): for testing. */
const OVERRIDE = "darsi:siteHost";
const KEY = "darsi:site:";
/** How long a first visit waits for the file before showing Darsi's look (the organization's follows when it arrives). */
export const FIRST_WAIT_MS = 8000;

/** The host to look up: this page's, unless it is Darsi's own (null). */
export function siteHost(loc: { hostname: string; search: string } | undefined = typeof location !== "undefined" ? location : undefined): string | null {
  if (!loc) return null;
  const host = loc.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") {
    try {
      const asked = new URLSearchParams(loc.search).get("site");
      if (asked !== null) { if (asked) sessionStorage.setItem(OVERRIDE, asked.trim().toLowerCase()); else sessionStorage.removeItem(OVERRIDE); }
      const kept = sessionStorage.getItem(OVERRIDE);
      return kept && !isDarsiHost(kept) ? kept : null;
    } catch { return null; }
  }
  return isDarsiHost(host) ? null : host;
}

/** What this phone keeps for a host: the entry as published (null: not an organization's), and its logo as data. */
interface Kept { site: SiteEntry | null; data?: string }
const readKept = (host: string): Kept | null => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY + host) ?? "null") as Kept | null;
    return v && typeof v === "object" && "site" in v ? { site: v.site ? siteFor({ sites: { [host]: v.site } }, host) : null, ...(typeof v.data === "string" && v.data.startsWith("data:image/") ? { data: v.data } : {}) } : null;
  } catch { return null; }
};
const writeKept = (host: string, v: Kept) => { try { localStorage.setItem(KEY + host, JSON.stringify(v)); } catch { /* full, or private mode: read again next start */ } };
const shown = (k: Kept): SiteEntry | null => (k.site ? { ...k.site, logo: k.data ?? k.site.logo } : null);

/** The logo as a data: URL, so it shows offline (≤ 100 KB as the org page saves it; anything much bigger isn't kept). */
async function logoData(url: string): Promise<string | undefined> {
  const r = await fetch(url);
  const type = (r.headers.get("Content-Type") ?? "").split(";")[0].trim();
  if (!r.ok || !/^image\/(png|webp|jpeg)$/.test(type)) return undefined;
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > 160_000) return undefined;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(bin)}`;
}

/** A site store for a host (the app makes one at start; tests make their own). */
export function createSiteStore(host: string | null, load: () => Promise<unknown> = loadSitesFile, firstWait = FIRST_WAIT_MS) {
  const listeners = new Set<() => void>();
  let state: SiteState;
  const set = (next: SiteState) => { state = next; listeners.forEach((l) => l()); };
  if (!host) state = { ready: true, site: null };
  else {
    const kept = readKept(host);
    state = { ready: Boolean(kept), site: kept ? shown(kept) : null };
    // A first visit on a connection that hangs shows Darsi's look rather than waiting on.
    const timer = kept ? undefined : setTimeout(() => { if (!state.ready) set({ ready: true, site: null }); }, firstWait);
    void load().catch(() => null).then(async (file) => {
      clearTimeout(timer);
      // No answer and no copy: what this phone kept stays (or Darsi's look, on a first visit offline).
      if (file == null) { if (!state.ready) set({ ready: true, site: null }); return; }
      const site = siteFor(file, host);
      const sameLogo = Boolean(kept?.site && site && kept.site.logo === site.logo);
      if (kept && JSON.stringify(kept.site) === JSON.stringify(site) && (kept.data || !site?.logo)) return;
      const data = sameLogo ? kept?.data : undefined;
      // Shown at once (the logo over the network), then kept with the logo as data for the next start.
      set({ ready: true, site: site ? { ...site, logo: data ?? site.logo } : null });
      const fresh = site?.logo && !data ? await logoData(site.logo).catch(() => undefined) : data;
      writeKept(host, { site, ...(fresh ? { data: fresh } : {}) });
      if (site && fresh && !data) set({ ready: true, site: { ...site, logo: fresh } });
    });
  }
  return {
    get: () => state,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

const store = createSiteStore(siteHost());
/** This web address's organization (null on Darsi's own), and whether the lookup is done. */
export const useSite = (): SiteState => useSyncExternalStore(store.subscribe, store.get, store.get);

/**
 * The brand to show. A member of an organization sees their own as before; on their organization's site, its
 * published name and logo fill in what their phone doesn't have yet. Anyone else on a site sees the site's. Whether
 * Darsi's identity shows is the site's choice, and always on at Darsi's own addresses.
 */
export function identityOf(org: OrgBrand | undefined, site: SiteEntry | null): Identity {
  const darsi = site ? site.darsi : true;
  if (org?.name && (!site || org.id !== site.orgId)) return { name: org.name, logo: org.logo ?? null, darsi };
  if (site) return { name: org?.name || site.name, logo: org?.logo ?? site.logo, darsi };
  return { name: org?.name || null, logo: org?.logo ?? null, darsi: true };
}
