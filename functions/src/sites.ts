/**
 * Organization sites (TECHNICAL.md "Organization sites (custom web addresses)"). An organization can have its own web
 * address (cis.darsiai.org), served by the same Hosting site and build as darsiai.org. Its admins ask for one, typing
 * nothing but the address; a platform admin approves it (or adds one directly) on /super/domains, and the approval
 * connects it with no further hands: Hosting's custom domain and certificate, the sign-in domain and Storage's CORS
 * (domains.ts). sitesJob checks every 15 minutes until the certificate is out, so an address turns live by itself.
 * - sites/{host} (SiteDoc in shared/sites.ts): one document per address, keyed by it, so an address belongs to one
 *   organization. Written only here (Firestore rules); platform admins read them all, an org admin its own.
 * - content/sites.json { v, sites: { <host>: { orgId, name, logo, darsi } } }: every approved address (connecting, live
 *   or problem), public, re-checked by phones at most once a minute. The logo is copied to
 *   content/sites/<orgId>/<hash>.<ext> (public, immutable), since org files are members-only.
 * - config/sites (setOrgSite's list before 2026-11-09) is moved into sites/{host} by sitesJob, then deleted.
 */
import { createHash } from "node:crypto";
import { HttpsError, onCall, type FunctionsErrorCode } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { audit, db, freshCaller, str } from "./admin.js";
import { bucket, publicFileUrl, savePublicJson } from "./storage.js";
import { connectHost, disconnectHost, type HostCheck } from "./domains.js";
import { brandLogoPath, isApproved, LOGO_TYPES, newSite, readLinks, readSiteDoc, SITE_LOGOS, siteLogoPath, sitesNeedPublish, statusOf } from "./sitesCore.js";
import { checkSiteHost, type SiteDoc, type SiteEntry, type SitesFile } from "./shared/sites.js";

export const SITES = "sites";
export const LEGACY_DOC = "config/sites";
export const SITES_FILE = "content/sites.json";
/** Addresses an organization may hold at once, asked for or connected (refused ones don't count). */
export const MAX_SITES = 3;
/** A "Check now" sooner than this after the last check answers with that check (Hosting itself re-checks every few minutes). */
const CHECK_GAP_MS = 15_000;
/** A live address is checked again (and mended) once a day; the others at every run of sitesJob. */
const LIVE_RECHECK_MS = 24 * 3600_000;

type Reason = "site-host" | "site-reserved" | "site-taken" | "site-limit" | "site-state" | "no-site" | "not-super" | "not-org-admin" | "not-yours"
  | "no-org" | "org-inactive" | "site-action";
/** The English fallback for each refusal; the admin screens show their own words for the code (admin/refusals.ts). */
const WORDS: Record<Reason, string> = {
  "site-host": "Type a web address such as school.darsiai.org: lowercase letters, digits, dots and dashes.",
  "site-reserved": "That is one of Darsi's own addresses.",
  "site-taken": "Another organization already uses or asked for that address.",
  "site-limit": `An organization can have at most ${MAX_SITES} web addresses, asked for or connected.`,
  "site-state": "That address has changed since this page read it. Read the page again.",
  "no-site": "No such web address.",
  "not-super": "Platform admins only.",
  "not-org-admin": "Organization admins only.",
  "not-yours": "That address belongs to another organization.",
  "no-org": "No such organization.",
  "org-inactive": "The organization isn't active yet.",
  "site-action": "Unknown action.",
};
const refuse = (code: FunctionsErrorCode, reason: Reason) => new HttpsError(code, WORDS[reason], { reason });
const siteRef = (host: string) => db.doc(`${SITES}/${host}`);

/** The logo everyone may read: a copy of the organization's (members-only) logo, named by its bytes. */
async function publicLogo(orgId: string, logo: unknown): Promise<{ url: string; path: string } | null> {
  const from = brandLogoPath(orgId, logo);
  if (!from) return null;
  try {
    const [bytes] = await bucket().file(from).download();
    const ext = from.slice(from.lastIndexOf(".") + 1);
    const path = siteLogoPath(orgId, createHash("sha256").update(bytes).digest("hex").slice(0, 20), ext);
    const file = bucket().file(path);
    const [there] = await file.exists();
    if (!there) await file.save(bytes, { resumable: false, contentType: LOGO_TYPES[ext], metadata: { cacheControl: "public, max-age=31536000, immutable" } });
    return { url: publicFileUrl(path), path };
  } catch (e) {
    // A logo that can't be read (deleted meanwhile): the site shows the name alone until the next change.
    logger.warn("site logo not copied", { orgId, error: String(e) });
    return null;
  }
}

/** Storage refuses a second change to one object within about a second (429): two admins saving at once. */
async function saveRetrying(path: string, data: unknown) {
  for (let i = 0; ; i++) {
    try { return await savePublicJson(path, data); } catch (e) {
      const code = Number((e as { code?: unknown }).code);
      if (i >= 4 || !(code === 429 || code === 503 || /rate limit/i.test(String(e)))) throw e;
      await new Promise((ok) => setTimeout(ok, 1200 * 2 ** i));
    }
  }
}

/**
 * Publishes content/sites.json from every approved address and its organization as it is now (its name, its logo's
 * public copy). Addresses of organizations that no longer exist are left out. Logo copies nothing lists any more go.
 */
export async function writeSitesFile(): Promise<SitesFile> {
  const snap = await db.collection(SITES).get();
  const sites: Record<string, SiteEntry> = {};
  const used = new Set<string>();
  const orgs = new Map<string, { name: string; logo: string | null } | null>();
  for (const d of snap.docs) {
    const s = readSiteDoc(d.id, d.data());
    if (!s || !isApproved(s.status)) continue;
    if (!orgs.has(s.orgId)) {
      const org = await db.doc(`orgs/${s.orgId}`).get();
      const logo = org.exists ? await publicLogo(s.orgId, org.get("brand.logo")) : null;
      if (logo) used.add(logo.path);
      orgs.set(s.orgId, org.exists ? { name: str(org.get("name"), 120) || s.orgId, logo: logo?.url ?? null } : null);
    }
    const o = orgs.get(s.orgId);
    if (o) sites[s.host] = { orgId: s.orgId, name: o.name, logo: o.logo, darsi: s.darsi };
  }
  const file: SitesFile = { v: Date.now(), sites };
  await saveRetrying(SITES_FILE, file);
  const [old] = await bucket().getFiles({ prefix: SITE_LOGOS }).catch(() => [[] as { name: string; delete: () => Promise<unknown> }[]]);
  await Promise.all(old.filter((f) => !used.has(f.name)).map((f) => f.delete().catch(() => {})));
  return file;
}

/** Keeps a check's result, while the address is still approved (a removal may have come meanwhile). */
async function record(host: string, check: HostCheck, now = Date.now()): Promise<SiteDoc | null> {
  const status = check.errors.length ? "problem" : statusOf(check.steps);
  return db.runTransaction(async (tx) => {
    const ref = siteRef(host);
    const cur = readSiteDoc(host, (await tx.get(ref)).data());
    if (!cur || !isApproved(cur.status)) return cur;
    const patch = {
      status, steps: check.steps, records: check.records, issues: check.issues, error: check.errors.join("\n").slice(0, 1000) || null,
      checkedAt: now, liveAt: status === "live" ? (cur.liveAt ?? now) : cur.liveAt,
    };
    tx.update(ref, patch);
    return { ...cur, ...patch };
  });
}

type Caller = { uid: string; role: string; orgId?: string };

/** An org admin asks for an address for their organization; a platform admin approves it (approve). */
async function requestSite(c: Caller, host: string): Promise<SiteDoc> {
  const orgId = c.orgId!;
  const org = await db.doc(`orgs/${orgId}`).get();
  if (!org.exists) throw refuse("not-found", "no-org");
  if (org.get("status") && org.get("status") !== "active") throw refuse("failed-precondition", "org-inactive");
  const orgName = str(org.get("name"), 120) || orgId;
  const site = await db.runTransaction(async (tx) => {
    const cur = readSiteDoc(host, (await tx.get(siteRef(host))).data());
    const mine = await tx.get(db.collection(SITES).where("orgId", "==", orgId));
    if (cur && cur.status !== "refused" && cur.orgId !== orgId) throw refuse("already-exists", "site-taken");
    if (cur && cur.status !== "refused") return cur;
    const held = mine.docs.map((d) => readSiteDoc(d.id, d.data())).filter((s) => s && s.host !== host && s.status !== "refused").length;
    if (held >= MAX_SITES) throw refuse("resource-exhausted", "site-limit");
    const doc = newSite(host, orgId, orgName, c.uid, Date.now(), false);
    tx.set(siteRef(host), doc);
    return doc;
  });
  await audit("requestSite", c.uid, { orgId, host });
  return site;
}

/**
 * A platform admin approves a request, or adds an address for an organization directly (orgId), then connects it.
 * An address that is already approved only takes the new `darsi`.
 */
async function approveSite(c: Caller, host: string, orgId: string, darsi: boolean): Promise<SiteDoc> {
  const now = Date.now();
  const { site, fresh } = await db.runTransaction(async (tx) => {
    const cur = readSiteDoc(host, (await tx.get(siteRef(host))).data());
    const owner = orgId || cur?.orgId;
    if (!owner) throw refuse("not-found", "no-site");
    const org = await tx.get(db.doc(`orgs/${owner}`));
    const mine = await tx.get(db.collection(SITES).where("orgId", "==", owner));
    if (!org.exists) throw refuse("not-found", "no-org");
    if (cur && isApproved(cur.status)) {
      if (cur.orgId !== owner) throw refuse("already-exists", "site-taken");
      tx.update(siteRef(host), { darsi });
      return { site: { ...cur, darsi }, fresh: false };
    }
    const held = mine.docs.map((d) => readSiteDoc(d.id, d.data())).filter((s) => s && s.host !== host && s.status !== "refused").length;
    if (held >= MAX_SITES) throw refuse("resource-exhausted", "site-limit");
    const asked = cur?.orgId === owner;
    const doc: SiteDoc = {
      ...newSite(host, owner, str(org.get("name"), 120) || owner, asked ? cur!.requestedBy ?? c.uid : c.uid, asked ? cur!.requestedAt ?? now : now, true, darsi),
      approvedBy: c.uid, approvedAt: now,
    };
    tx.set(siteRef(host), doc);
    return { site: doc, fresh: true };
  });
  const after = fresh ? (await record(host, await connectHost(host))) ?? site : site;
  await writeSitesFile();
  await audit(fresh ? "approveSite" : "siteIdentity", c.uid, { orgId: site.orgId, host, darsi, status: after.status });
  return after;
}

/** Connects again what is missing and says where each step stands. */
async function checkSite(c: Caller, host: string): Promise<SiteDoc> {
  const cur = readSiteDoc(host, (await siteRef(host).get()).data());
  if (!cur) throw refuse("not-found", "no-site");
  if (c.role !== "superadmin" && cur.orgId !== c.orgId) throw refuse("permission-denied", "not-yours");
  if (!isApproved(cur.status)) throw refuse("failed-precondition", "site-state");
  if (cur.checkedAt && Date.now() - cur.checkedAt < CHECK_GAP_MS) return cur;
  return (await record(host, await connectHost(host))) ?? cur;
}

/** Disconnects and forgets an address. What couldn't be undone outside Darsi is returned, not a refusal. */
async function removeSite(c: Caller, host: string): Promise<string[]> {
  const cur = readSiteDoc(host, (await siteRef(host).get()).data());
  if (!cur) return [];
  const warnings = isApproved(cur.status) ? await disconnectHost(host) : [];
  await siteRef(host).delete();
  if (isApproved(cur.status)) await writeSitesFile();
  await audit("removeSite", c.uid, { orgId: cur.orgId, host, status: cur.status, warnings: warnings.length ? warnings : null });
  return warnings;
}

/**
 * Every web address action, as { action, host, … }; answers { site } (null once it is gone) and, for remove,
 * { warnings }. Org admins (their own organization's addresses): request, cancel (a request, or a refused one), check.
 * Platform admins: approve ({ darsi }, and { orgId } to add an address no one asked for), refuse ({ reason }), check,
 * identity ({ darsi }), remove, cancel. Refusals carry `details.reason` (Reason).
 */
export const manageSite = onCall({ timeoutSeconds: 120 }, async (req) => {
  const c = await freshCaller(req);
  const isSuper = c.role === "superadmin", orgAdmin = c.role === "orgAdmin" && Boolean(c.orgId);
  if (!isSuper && !orgAdmin) throw refuse("permission-denied", "not-org-admin");
  const action = str(req.data?.action, 20);
  const checked = checkSiteHost(req.data?.host);
  if ("problem" in checked) throw refuse("invalid-argument", checked.problem);
  if (!checked.host) throw refuse("invalid-argument", "site-host");
  const host = checked.host;
  const superOnly = () => { if (!isSuper) throw refuse("permission-denied", "not-super"); };

  switch (action) {
    case "request":
      if (!orgAdmin) throw refuse("permission-denied", "not-org-admin");
      return { site: await requestSite(c, host) };
    case "cancel": {
      const site = await db.runTransaction(async (tx) => {
        const cur = readSiteDoc(host, (await tx.get(siteRef(host))).data());
        if (!cur) return null;
        if (!isSuper && cur.orgId !== c.orgId) throw refuse("permission-denied", "not-yours");
        if (isApproved(cur.status)) throw refuse("failed-precondition", "site-state");
        tx.delete(siteRef(host));
        return cur;
      });
      if (site) await audit("cancelSite", c.uid, { orgId: site.orgId, host, status: site.status });
      return { site: null };
    }
    case "approve":
      superOnly();
      return { site: await approveSite(c, host, str(req.data?.orgId, 128), req.data?.darsi !== false) };
    case "identity": {
      superOnly();
      const cur = readSiteDoc(host, (await siteRef(host).get()).data());
      if (!cur || !isApproved(cur.status)) throw refuse("failed-precondition", "site-state");
      return { site: await approveSite(c, host, cur.orgId, req.data?.darsi !== false) };
    }
    case "refuse": {
      superOnly();
      const reason = str(req.data?.reason, 300) || null;
      const site = await db.runTransaction(async (tx) => {
        const cur = readSiteDoc(host, (await tx.get(siteRef(host))).data());
        if (!cur) throw refuse("not-found", "no-site");
        if (cur.status !== "requested") throw refuse("failed-precondition", "site-state");
        tx.update(siteRef(host), { status: "refused", refusedReason: reason });
        return { ...cur, status: "refused" as const, refusedReason: reason };
      });
      await audit("refuseSite", c.uid, { orgId: site.orgId, host, reason });
      return { site };
    }
    case "check":
      return { site: await checkSite(c, host) };
    case "remove":
      superOnly();
      return { site: null, warnings: await removeSite(c, host) };
    default:
      throw refuse("invalid-argument", "site-action");
  }
});

/**
 * { orgId, host, darsi }: the organization's address set directly (an empty host removes all of its addresses). Kept
 * for phones with the app from before /super/domains (2026-11-09); it does what approve and remove do.
 */
export const setOrgSite = onCall({ timeoutSeconds: 120 }, async (req) => {
  const c = await freshCaller(req);
  if (c.role !== "superadmin") throw refuse("permission-denied", "not-super");
  const orgId = str(req.data?.orgId, 128);
  if (!orgId) throw refuse("invalid-argument", "no-org");
  const checked = checkSiteHost(req.data?.host);
  if ("problem" in checked) throw refuse("invalid-argument", checked.problem);
  if (checked.host) {
    const site = await approveSite(c, checked.host, orgId, req.data?.darsi !== false);
    return { site: { host: site.host, darsi: site.darsi } };
  }
  for (const d of (await db.collection(SITES).where("orgId", "==", orgId).get()).docs) await removeSite(c, d.id);
  return { site: null };
});

/** setOrgSite's list from before sites/{host} (cis.darsiai.org): each address becomes an approved site, then the list goes. */
async function importLegacy(): Promise<number> {
  const legacy = await db.doc(LEGACY_DOC).get();
  if (!legacy.exists) return 0;
  let n = 0;
  for (const { host, orgId } of readLinks(legacy.get("list"))) {
    if ((await siteRef(host).get()).exists) continue;
    const org = await db.doc(`orgs/${orgId}`).get();
    const was = org.get("site") as { host?: unknown; darsi?: unknown } | undefined;
    if (!org.exists || was?.host !== host) continue;
    const by = str(legacy.get("updatedBy"), 128) || "setOrgSite";
    await siteRef(host).set(newSite(host, orgId, str(org.get("name"), 120) || orgId, by, Date.now(), true, was.darsi !== false));
    n++;
  }
  await db.doc(LEGACY_DOC).delete();
  return n;
}

/** sitesJob's work: moves the old list in, then checks (and mends) every approved address that isn't live, and live ones daily. */
export async function checkSites(now = Date.now()): Promise<{ imported: number; checked: number; live: number }> {
  const imported = await importLegacy();
  let checked = 0, live = 0;
  for (const d of (await db.collection(SITES).get()).docs) {
    const s = readSiteDoc(d.id, d.data());
    if (!s || !isApproved(s.status)) continue;
    if (s.status === "live" && s.checkedAt && now - s.checkedAt < LIVE_RECHECK_MS) { live++; continue; }
    const after = await record(s.host, await connectHost(s.host), now);
    checked++;
    if (after?.status === "live") live++;
  }
  if (imported) await writeSitesFile();
  return { imported, checked, live };
}

/** Every 15 minutes: an approved address turns live by itself once its DNS and certificate are there. */
export const sitesJob = onSchedule({ schedule: "*/15 * * * *", timeZone: "UTC", timeoutSeconds: 300, retryCount: 0 }, async () => {
  const r = await checkSites();
  if (r.imported || r.checked) logger.info("sites checked", r);
});

/**
 * An organization that is renamed, gets a new logo (OrgBranding writes the document directly) or is deleted: its
 * addresses follow. Renamed or re-branded, content/sites.json again, so its addresses show the change within a minute;
 * deleted, its addresses are disconnected and forgotten, so another organization can have them.
 */
export const onOrgSite = onDocumentWritten({ document: "orgs/{orgId}", maxInstances: 5, timeoutSeconds: 120 }, async (event) => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (!sitesNeedPublish(before, after)) return;
  const orgId = event.params.orgId;
  const mine = (await db.collection(SITES).where("orgId", "==", orgId).get()).docs
    .map((d) => readSiteDoc(d.id, d.data())).filter((s): s is SiteDoc => Boolean(s));
  if (!mine.length) return;
  if (!after) {
    for (const s of mine) {
      const warnings = isApproved(s.status) ? await disconnectHost(s.host) : [];
      if (warnings.length) logger.warn("site not fully disconnected", { host: s.host, warnings });
      await siteRef(s.host).delete();
    }
  } else if (before?.name !== after.name) {
    const orgName = str(after.name, 120) || orgId;
    await Promise.all(mine.map((s) => siteRef(s.host).update({ orgName })));
  }
  if (mine.some((s) => isApproved(s.status))) await writeSitesFile();
  logger.info("organization sites followed", { orgId, deleted: !after, sites: mine.length });
});
