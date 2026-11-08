/**
 * The pure parts of organization sites (sites.ts; TECHNICAL.md "Organization sites (custom web addresses)"): the list
 * of hosts in config/sites, when an organization's change means content/sites.json must be published again, and where
 * a site's public logo copy lives.
 */
import type { OrgSite } from "./shared/sites.js";

/** config/sites `list`: one entry per host. Its source of truth for "one organization per host". */
export interface SiteLink { host: string; orgId: string }

/** The stored list, checked: bad entries are dropped, and a host appears once. */
export function readLinks(v: unknown): SiteLink[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: SiteLink[] = [];
  for (const e of v) {
    const host = typeof e?.host === "string" ? e.host : "", orgId = typeof e?.orgId === "string" ? e.orgId : "";
    if (!host || !orgId || seen.has(host)) continue;
    seen.add(host); out.push({ host, orgId });
  }
  return out;
}

/** The list with this organization's host set (or removed, for ""), sorted by host. */
export function withLink(list: SiteLink[], orgId: string, host: string): SiteLink[] {
  const next = list.filter((l) => l.orgId !== orgId && l.host !== host);
  if (host) next.push({ host, orgId });
  return next.sort((a, b) => (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
}

/** orgs/{id}.site as stored, or null. */
export function readOrgSite(v: unknown): OrgSite | null {
  const host = (v as { host?: unknown } | null)?.host;
  return typeof host === "string" && host ? { host, darsi: (v as { darsi?: unknown }).darsi !== false } : null;
}

type OrgData = { name?: unknown; brand?: { logo?: unknown; v?: unknown } | null; site?: unknown } | undefined;
/**
 * Whether an organization document's write changes content/sites.json, for the trigger (onOrgSite): an organization
 * with a site that was deleted, renamed, or given a new logo. A change of `site` alone is setOrgSite's, which publishes
 * itself (a second write of the same file within a second is refused by Storage, 429). Member counts, licences and the
 * rest change nothing here.
 */
export function sitesNeedPublish(before: OrgData, after: OrgData): boolean {
  const had = readOrgSite(before?.site), has = readOrgSite(after?.site);
  if (!had && !has) return false;
  if (!after) return Boolean(had);
  if (!before) return false;
  return before.name !== after.name || (before.brand?.logo ?? null) !== (after.brand?.logo ?? null) || (before.brand?.v ?? 0) !== (after.brand?.v ?? 0);
}

/**
 * The logo's Storage path when it is this organization's: a picture directly in orgs/{id}/brand/ (OrgBranding writes
 * logo-<random>.{png,webp,jpg}; a logo put there another way, by a platform admin's script, may be named otherwise).
 */
export function brandLogoPath(orgId: string, v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith(`orgs/${orgId}/brand/`)) return null;
  return /^[A-Za-z0-9_-]{1,100}\.(png|webp|jpg|jpeg)$/.test(v.slice(`orgs/${orgId}/brand/`.length)) ? v : null;
}

/** Where a site's logo is copied for everyone to read (content/ is public): named by its bytes, so it never changes. */
export const siteLogoPath = (orgId: string, hash: string, ext: string) => `content/sites/${orgId}/${hash}.${ext}`;
export const SITE_LOGOS = "content/sites/";
export const LOGO_TYPES: Record<string, string> = { png: "image/png", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg" };
