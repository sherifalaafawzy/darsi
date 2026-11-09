/**
 * Organization sites (TECHNICAL.md "Organization sites (custom web addresses)"): an organization's own web address,
 * such as learn.school.edu.eg, which its admins ask for and a platform admin approves (manageSite). Every address is
 * served by the same Hosting site and the same build, so the app works out at start which organization a host belongs
 * to, from content/sites.json. Shared with the functions (functions/scripts/copy-shared.mjs), so manageSite checks a
 * host with the same rules the app looks it up with. Pure: no imports; startup uses only isDarsiHost and siteFor.
 */

/** One host in content/sites.json: the organization, its name and logo as published, and whether Darsi's identity shows. */
export interface SiteEntry { orgId: string; name: string; logo: string | null; darsi: boolean }
/** content/sites.json: `v` is when it was published (ms); `sites` is keyed by host. */
export interface SitesFile { v: number; sites: Record<string, SiteEntry> }
/** What the organization document holds (orgs/{id}.site), written only by setOrgSite. */
export interface OrgSite { host: string; darsi: boolean }
/** Why a host was refused: not a lowercase hostname, one of Darsi's own, or another organization's. */
export type SiteProblem = "site-host" | "site-reserved" | "site-taken";

/**
 * Where a web address stands (sites/{host}; manageSite and sitesJob): an organization admin asked for it, a platform
 * admin refused it, or approved it and it is being connected, is live, or is stuck on a step a platform admin must
 * look at. Only an approved address (connecting, live, problem) is in content/sites.json.
 */
export type SiteStatus = "requested" | "refused" | "connecting" | "live" | "problem";
export const APPROVED: readonly SiteStatus[] = ["connecting", "live", "problem"];
/** One step of connecting an address: done, waiting on something outside Darsi (DNS, the certificate), not started, or failed. */
export type StepState = "ok" | "wait" | "todo" | "error";
/**
 * The steps, in order: owner (the organization proved it runs the address's DNS: its own TXT record, `proofRecord`;
 * always done for an address under darsiai.org), dns (the address points at Darsi with a CNAME record, as Darsi's own
 * lookup and Hosting both see it), hosting (the address is a custom domain of Darsi's Hosting site, added only once
 * owner is done), cert (its HTTPS certificate), auth (signing in works there: Firebase Auth's authorized domains) and
 * cors (the app there may read Darsi's files: the Storage bucket's CORS list). auth and cors are given only while
 * owner and dns are done, and taken back as soon as either isn't.
 */
export interface SiteSteps { owner: StepState; dns: StepState; hosting: StepState; cert: StepState; auth: StepState; cors: StepState }
export const STEPS: readonly (keyof SiteSteps)[] = ["owner", "dns", "hosting", "cert", "auth", "cors"];
/** A DNS record the address's owner must add (or remove): Darsi's ownership record and CNAME, or what Hosting asks for. */
export interface DnsRecord { name: string; type: string; value: string; action: "add" | "remove" }
/** sites/{host}, keyed by the host: written only by the functions. Times are ms since 1970. */
export interface SiteDoc {
  host: string; orgId: string; orgName: string; darsi: boolean; status: SiteStatus;
  requestedBy: string | null; requestedAt: number | null;
  approvedBy: string | null; approvedAt: number | null;
  refusedReason: string | null;
  steps: SiteSteps | null; records: DnsRecord[] | null; issues: string[] | null; error: string | null;
  checkedAt: number | null; liveAt: number | null;
  /** The token of the organization's ownership record (`proofRecord`); null for an address under darsiai.org. */
  proof: string | null;
}
/** The DNS zone Darsi manages: its subdomains point at Hosting through one wildcard record, so nobody adds anything. */
export const DARSI_ZONE = "darsiai.org";
export const inDarsiZone = (host: string) => host.endsWith(`.${DARSI_ZONE}`);
/** Where every organization address points (a CNAME), Darsi's Hosting site. */
export const HOSTING_TARGET = "darsi-f0685.web.app";

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

/**
 * The ownership record an organization adds for an address outside darsiai.org before anything connects: a TXT record
 * `_darsi.<address>` holding `darsi-site=<token>`, the token made for that organization's request. It shows the
 * organization runs the address's DNS, so an address can't be connected for anyone else, even one still pointing at
 * Darsi after its organization left.
 */
export const proofRecord = (host: string, token: string): DnsRecord => ({ name: `_darsi.${host}`, type: "TXT", value: `darsi-site=${token}`, action: "add" });
/** The CNAME record every organization address points at Darsi with. */
export const cnameRecord = (host: string): DnsRecord => ({ name: host, type: "CNAME", value: HOSTING_TARGET, action: "add" });

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
