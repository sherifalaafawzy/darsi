/**
 * Organization sites (TECHNICAL.md "Organization sites (custom web addresses)"): an organization's own web address,
 * such as cis.darsiai.org, which platform admins set (setOrgSite). Every address is served by the same Hosting site and
 * the same build, so the app works out at start which organization a host belongs to, from content/sites.json.
 * Shared with the functions (functions/scripts/copy-shared.mjs), so setOrgSite checks a host with the same rules the
 * app looks it up with. Pure: no imports, so it costs the startup bundle a few hundred bytes.
 */

/** One host in content/sites.json: the organization, its name and logo as published, and whether Darsi's identity shows. */
export interface SiteEntry { orgId: string; name: string; logo: string | null; darsi: boolean }
/** content/sites.json: `v` is when it was published (ms); `sites` is keyed by host. */
export interface SitesFile { v: number; sites: Record<string, SiteEntry> }
/** What the organization document holds (orgs/{id}.site), written only by setOrgSite. */
export interface OrgSite { host: string; darsi: boolean }
/** Why a host was refused: not a lowercase hostname, one of Darsi's own, or another organization's. */
export type SiteProblem = "site-host" | "site-reserved" | "site-taken";

/** Darsi's own addresses, which are never an organization's. */
export const DARSI_HOSTS: readonly string[] = ["darsiai.org", "www.darsiai.org"];
/** Firebase Hosting's own addresses (darsi-f0685.web.app and the like): Darsi's, and anyone's on the same suffixes. */
const HOSTING_SUFFIXES = [".web.app", ".firebaseapp.com"];
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
/** A lowercase hostname with at least two labels, the last with a letter in it (so no IP address). */
export const SITE_HOST = new RegExp(`^(?:${LABEL}\\.)+(?=[a-z0-9-]*[a-z])${LABEL}$`);

/** Darsi's own address, Hosting's, or a local one: the app never looks these up. */
export function isDarsiHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return DARSI_HOSTS.includes(h) || HOSTING_SUFFIXES.some((s) => h.endsWith(s))
    || h === "localhost" || h.endsWith(".localhost") || h === "[::1]" || h === "::1" || /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
}

/**
 * A host as setOrgSite stores it: trimmed, and a lowercase hostname of at most 253 characters that is not Darsi's or
 * Hosting's. An empty host means "no site" (the organization's address is removed).
 */
export function checkSiteHost(raw: unknown): { host: string } | { problem: SiteProblem } {
  if (raw === undefined || raw === null) return { host: "" };
  if (typeof raw !== "string") return { problem: "site-host" };
  const host = raw.trim();
  if (!host) return { host: "" };
  if (host.length > 253 || !SITE_HOST.test(host)) return { problem: "site-host" };
  if (isDarsiHost(host)) return { problem: "site-reserved" };
  return { host };
}

/** A logo address the app may show: Storage over https, or the Storage emulator on this machine. */
const logoOk = (v: unknown): v is string => typeof v === "string" && v.length <= 2048
  && (v.startsWith("https://") || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(v));

/** This host's entry in content/sites.json, checked; null when it isn't listed or the file is damaged. */
export function siteFor(file: unknown, host: string): SiteEntry | null {
  const sites = (file as { sites?: unknown } | null)?.sites;
  if (!sites || typeof sites !== "object" || !Object.prototype.hasOwnProperty.call(sites, host)) return null;
  const e = (sites as Record<string, unknown>)[host] as Partial<SiteEntry> | null;
  if (!e || typeof e !== "object" || typeof e.orgId !== "string" || !e.orgId || typeof e.name !== "string" || !e.name.trim()) return null;
  return { orgId: e.orgId, name: e.name.trim().slice(0, 120), logo: logoOk(e.logo) ? e.logo : null, darsi: e.darsi !== false };
}
