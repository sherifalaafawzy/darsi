/**
 * The pure parts of organization sites (sites.ts, domains.ts; TECHNICAL.md "Organization sites (custom web
 * addresses)"): reading sites/{host}, what Firebase Hosting's answer means for each step, the status that follows, the
 * Storage CORS and authorized-domain lists with one address added or taken out, when an organization's change means
 * content/sites.json must be published again, and where a site's public logo copy lives.
 */
import { APPROVED, type DnsRecord, type SiteDoc, type SiteStatus, type SiteSteps, type StepState } from "./shared/sites.js";

const STATUSES: readonly SiteStatus[] = ["requested", "refused", "connecting", "live", "problem"];
const STATES: readonly StepState[] = ["ok", "wait", "todo", "error"];
export const isApproved = (s: SiteStatus) => APPROVED.includes(s);

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
const ms = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** sites/{host} as stored, checked; null when it isn't a site. */
export function readSiteDoc(host: string, v: unknown): SiteDoc | null {
  const d = (v ?? {}) as Record<string, unknown>;
  const status = STATUSES.includes(d.status as SiteStatus) ? (d.status as SiteStatus) : null;
  const orgId = text(d.orgId, 128);
  if (!status || !orgId) return null;
  const st = d.steps as Record<string, unknown> | null | undefined;
  const step = (k: string): StepState => (STATES.includes(st?.[k] as StepState) ? (st![k] as StepState) : "todo");
  return {
    host, orgId, orgName: text(d.orgName, 120) || orgId, darsi: d.darsi !== false, status,
    requestedBy: text(d.requestedBy, 128), requestedAt: ms(d.requestedAt),
    approvedBy: text(d.approvedBy, 128), approvedAt: ms(d.approvedAt),
    refusedReason: text(d.refusedReason, 300),
    steps: st && typeof st === "object" ? { dns: step("dns"), hosting: step("hosting"), cert: step("cert"), auth: step("auth"), cors: step("cors") } : null,
    records: Array.isArray(d.records) ? (d.records as DnsRecord[]).slice(0, 20) : null,
    issues: Array.isArray(d.issues) ? (d.issues as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 10) : null,
    error: text(d.error, 1000),
    checkedAt: ms(d.checkedAt), liveAt: ms(d.liveAt),
  };
}

/** A new request, or an address a platform admin adds: every field present, so the rules and the screens see one shape. */
export function newSite(host: string, orgId: string, orgName: string, by: string, now: number, approved: boolean, darsi = true): SiteDoc {
  return {
    host, orgId, orgName, darsi, status: approved ? "connecting" : "requested",
    requestedBy: by, requestedAt: now, approvedBy: approved ? by : null, approvedAt: approved ? now : null, refusedReason: null,
    steps: approved ? { dns: "todo", hosting: "todo", cert: "todo", auth: "todo", cors: "todo" } : null,
    records: null, issues: null, error: null, checkedAt: null, liveAt: null,
  };
}

type HostingRecord = { domainName?: unknown; type?: unknown; rdata?: unknown; requiredAction?: unknown };
type HostingDomain = {
  hostState?: unknown; ownershipState?: unknown; cert?: { state?: unknown } | null;
  requiredDnsUpdates?: { desired?: { records?: HostingRecord[] }[] } | null; issues?: { message?: unknown }[] | null;
};

/**
 * What Hosting's custom domain (v1beta1 `customDomains/{host}`) says about three steps, and the DNS records still to
 * add or remove. dns: the host points at Darsi's site (hostState HOST_ACTIVE) and is proved ours (ownershipState
 * OWNERSHIP_ACTIVE); another Firebase site holding it (…_CONFLICT) is an error. cert: CERT_ACTIVE or
 * CERT_EXPIRING_SOON (Hosting renews it); CERT_EXPIRED is an error; anything else is still being issued.
 */
export function hostingCheck(cd: HostingDomain): { hosting: StepState; dns: StepState; cert: StepState; records: DnsRecord[]; issues: string[] } {
  const host = String(cd.hostState ?? ""), owner = String(cd.ownershipState ?? ""), cert = String(cd.cert?.state ?? "");
  const conflict = host === "HOST_CONFLICT" || owner === "OWNERSHIP_CONFLICT";
  const records: DnsRecord[] = [];
  for (const set of cd.requiredDnsUpdates?.desired ?? []) {
    for (const r of set.records ?? []) {
      const action = r.requiredAction === "ADD" ? "add" : r.requiredAction === "REMOVE" ? "remove" : null;
      if (!action || typeof r.domainName !== "string" || typeof r.type !== "string") continue;
      records.push({ name: r.domainName.replace(/\.$/, ""), type: r.type, value: String(r.rdata ?? "").replace(/\.$/, ""), action });
    }
  }
  return {
    hosting: "ok",
    dns: conflict ? "error" : host === "HOST_ACTIVE" && owner === "OWNERSHIP_ACTIVE" ? "ok" : "wait",
    cert: cert === "CERT_ACTIVE" || cert === "CERT_EXPIRING_SOON" ? "ok" : cert === "CERT_EXPIRED" ? "error" : "wait",
    records: records.slice(0, 20),
    issues: (cd.issues ?? []).map((i) => String(i?.message ?? "")).filter(Boolean).map((m) => m.slice(0, 300)).slice(0, 10),
  };
}

/** live when every step is done, problem when one failed, else still connecting. */
export function statusOf(steps: SiteSteps): "live" | "connecting" | "problem" {
  const all = Object.values(steps);
  return all.includes("error") ? "problem" : all.every((s) => s === "ok") ? "live" : "connecting";
}

/** A list (authorized domains) with one item added or taken out; null when nothing changes. */
export function listWith(list: unknown, item: string, add: boolean): string[] | null {
  const now = Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  if (add) return now.includes(item) ? null : [...now, item];
  return now.includes(item) ? now.filter((x) => x !== item) : null;
}

type Cors = { origin?: string[]; method?: string[]; responseHeader?: string[]; maxAgeSeconds?: number }[];
/** What the app reads from the bucket (firebase/storage.cors.json): a bucket without CORS gets this entry. */
const CORS_ENTRY = {
  method: ["GET", "HEAD"], maxAgeSeconds: 3600,
  responseHeader: ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Authorization", "X-Firebase-Storage-Version", "X-Goog-Upload-Protocol"],
};
/**
 * The bucket's CORS list with an origin added (to the first entry that allows GET) or taken out (of every entry); null
 * when nothing changes. The rest of the list is kept as it is, including origins firebase/storage.cors.json lists.
 */
export function corsWith(cors: unknown, origin: string, add: boolean): Cors | null {
  const list: Cors = Array.isArray(cors) ? (JSON.parse(JSON.stringify(cors)) as Cors) : [];
  const has = list.some((e) => e.origin?.includes(origin));
  if (add) {
    if (has) return null;
    const entry = list.find((e) => e.method?.includes("GET"));
    if (entry) entry.origin = [...(entry.origin ?? []), origin];
    else list.push({ origin: [origin], ...CORS_ENTRY });
    return list;
  }
  if (!has) return null;
  for (const e of list) if (e.origin) e.origin = e.origin.filter((o) => o !== origin);
  return list;
}

/** config/sites `list` (before 2026-11-09, setOrgSite): one entry per host. sitesJob moves it into sites/{host}. */
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

type OrgData = { name?: unknown; brand?: { logo?: unknown; v?: unknown } | null } | undefined;
/**
 * Whether an organization document's write may change its sites, for the trigger (onOrgSite): it was deleted, renamed,
 * or given a new logo. The trigger then looks for the organization's addresses (most have none). Member counts,
 * licences and the rest change nothing here.
 */
export function sitesNeedPublish(before: OrgData, after: OrgData): boolean {
  if (!before) return false;
  if (!after) return true;
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
