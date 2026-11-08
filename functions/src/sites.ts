/**
 * Organization sites (TECHNICAL.md "Organization sites (custom web addresses)"). An organization can have its own web
 * address (cis.darsiai.org), served by the same Hosting site and build as darsiai.org. Platform admins set it, and
 * whether Darsi's identity shows there, with setOrgSite; phones read content/sites.json at start with a plain fetch and
 * show that organization's name and logo.
 * - config/sites { list: [{ host, orgId }], rev }: one organization per host, checked in a transaction.
 * - orgs/{id}.site { host, darsi }: what the org page shows; only this file writes it (Firestore rules).
 * - content/sites.json { v, sites: { <host>: { orgId, name, logo, darsi } } }: public, re-checked at most once a minute.
 *   The logo is copied to content/sites/<orgId>/<hash>.<ext> (public, immutable), since org files are members-only.
 * Connecting a new host (DNS, the Hosting domain, Auth's authorized domains) is scripts/connect-site.mjs.
 */
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { audit, db, freshCaller, str } from "./admin.js";
import { bucket, publicFileUrl, savePublicJson } from "./storage.js";
import { brandLogoPath, LOGO_TYPES, readLinks, readOrgSite, SITE_LOGOS, siteLogoPath, sitesNeedPublish, withLink } from "./sitesCore.js";
import { checkSiteHost, type SiteEntry, type SiteProblem, type SitesFile } from "./shared/sites.js";

export const SITES_DOC = "config/sites";
export const SITES_FILE = "content/sites.json";

/** The English fallback for each refusal; the admin screens show their own words for the code (admin/refusals.ts). */
const WORDS: Record<SiteProblem, string> = {
  "site-host": "Type a web address such as school.darsiai.org: lowercase letters, digits, dots and dashes.",
  "site-reserved": "That is one of Darsi's own addresses.",
  "site-taken": "Another organization already uses that address.",
};

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

/** Storage refuses a second change to one object within about a second (429): two organizations saving at once. */
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
 * Publishes content/sites.json from config/sites and each listed organization as it is now (its name, its logo's
 * public copy, and `darsi`). Organizations that no longer exist are left out. Logo copies nothing lists any more go.
 */
export async function writeSitesFile(): Promise<SitesFile> {
  const links = readLinks((await db.doc(SITES_DOC).get()).get("list"));
  const sites: Record<string, SiteEntry> = {};
  const used = new Set<string>();
  for (const { host, orgId } of links) {
    const org = await db.doc(`orgs/${orgId}`).get();
    const site = readOrgSite(org.get("site"));
    if (!org.exists || site?.host !== host) continue;
    const logo = await publicLogo(orgId, org.get("brand.logo"));
    if (logo) used.add(logo.path);
    sites[host] = { orgId, name: str(org.get("name"), 120) || orgId, logo: logo?.url ?? null, darsi: site.darsi };
  }
  const file: SitesFile = { v: Date.now(), sites };
  await saveRetrying(SITES_FILE, file);
  const [old] = await bucket().getFiles({ prefix: SITE_LOGOS }).catch(() => [[] as { name: string; delete: () => Promise<unknown> }[]]);
  await Promise.all(old.filter((f) => !used.has(f.name)).map((f) => f.delete().catch(() => {})));
  return file;
}

/**
 * { orgId, host, darsi }: the organization's web address (an empty host removes it) and whether Darsi's identity shows
 * there (on unless `darsi` is false). Platform admins only. Refusals carry `details.reason`: not-super, no-org,
 * site-host, site-reserved or site-taken.
 */
export const setOrgSite = onCall(async (req) => {
  const c = await freshCaller(req);
  if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only.", { reason: "not-super" });
  const orgId = str(req.data?.orgId, 128);
  if (!orgId) throw new HttpsError("invalid-argument", "orgId is required.", { reason: "no-org" });
  const checked = checkSiteHost(req.data?.host);
  if ("problem" in checked) throw new HttpsError("invalid-argument", WORDS[checked.problem], { reason: checked.problem });
  const host = checked.host, darsi = req.data?.darsi !== false;
  const orgRef = db.doc(`orgs/${orgId}`), sitesRef = db.doc(SITES_DOC);
  const before = await db.runTransaction(async (tx) => {
    const [org, sites] = [await tx.get(orgRef), await tx.get(sitesRef)];
    if (!org.exists) throw new HttpsError("not-found", "No such organization.", { reason: "no-org" });
    const links = readLinks(sites.get("list"));
    const holder = host ? links.find((l) => l.host === host && l.orgId !== orgId) : undefined;
    // A host stays another organization's while that organization exists (a deleted one's entry is taken over).
    if (holder && (await tx.get(db.doc(`orgs/${holder.orgId}`))).exists) {
      throw new HttpsError("already-exists", WORDS["site-taken"], { reason: "site-taken" });
    }
    tx.set(sitesRef, { list: withLink(links, orgId, host), rev: (Number(sites.get("rev")) || 0) + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid });
    tx.update(orgRef, { site: host ? { host, darsi } : FieldValue.delete() });
    return readOrgSite(org.get("site"));
  });
  await writeSitesFile();
  await audit("setOrgSite", c.uid, { orgId, host: host || null, darsi: host ? darsi : null, before: before?.host ?? null });
  return { site: host ? { host, darsi } : null };
});

/**
 * An organization with a site that is renamed, gets a new logo (OrgBranding writes the document directly) or is
 * deleted: content/sites.json again, so its address shows the change within a minute. A deleted organization's host
 * leaves config/sites too, so another organization can have it.
 */
export const onOrgSite = onDocumentWritten({ document: "orgs/{orgId}", maxInstances: 5 }, async (event) => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (!sitesNeedPublish(before, after)) return;
  const orgId = event.params.orgId;
  if (!after) {
    const ref = db.doc(SITES_DOC);
    await db.runTransaction(async (tx) => {
      const links = readLinks((await tx.get(ref)).get("list"));
      if (links.some((l) => l.orgId === orgId)) tx.set(ref, { list: withLink(links, orgId, ""), rev: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
  }
  await writeSitesFile();
  logger.info("sites.json republished", { orgId, deleted: !after });
});
