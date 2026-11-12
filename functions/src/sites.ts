/**
 * Organization sites (TECHNICAL.md "Organization sites (custom web addresses)"). An organization can have its own web
 * address (learn.school.edu.eg), served by the same Hosting site and build as darsiai.org. Its admins ask for one,
 * typing nothing but the address, and add the two DNS records the screen shows (an ownership record and a CNAME); a
 * platform admin approves it (or adds one directly) on /super/domains, and the approval connects it with no further
 * hands: Hosting's custom domain and certificate once the ownership record is there, then the sign-in domain and
 * Storage's CORS while it points at Darsi (domains.ts). sitesJob checks every 15 minutes (live addresses hourly), so
 * an address turns live by itself, and loses sign-in as soon as its DNS no longer shows it is Darsi's.
 * - sites/{host} (SiteDoc in shared/sites.ts): one document per address, keyed by it, so an address belongs to one
 *   organization. Written only here (Firestore rules); platform admins read them all, an org admin its own.
 * - content/sites.json { v, sites: { <host>: { orgId, name, logo, darsi } } }: every approved address (connecting, live
 *   or problem), public, re-checked by phones at most once a minute. The logo is copied to
 *   content/sites/<orgId>/<hash>.<ext> (public, immutable), since org files are members-only.
 * - config/siteAccess { hosts, lockUntil }: the addresses Darsi put in the authorized domains and the CORS list, and
 *   the lock that lets one syncSiteAccess run at a time.
 * - config/sites (setOrgSite's list before 2026-11-09) is moved into sites/{host} by sitesJob, then deleted.
 * - Addresses under darsiai.org are a platform admin's to add (Darsi runs that DNS, so they need no ownership record).
 * - An organization's address is a sign-in domain that the organization's DNS controls, so every change to one is in
 *   the audit log: the admins' actions (requestSite, approveSite, siteIdentity, refuseSite, cancelSite, removeSite), an
 *   address that stops being live or is live (again) whoever's check found it (siteLost, siteLive, by "sitesJob"), and
 *   an organization with an approved address that is renamed or re-branded (orgRebrand), since its public address and
 *   sign-in page follow within a minute with nobody told.
 * - stats/jobs.sitesJob { at, ok, checked, live }: the job's last run, for whoever watches that it still runs.
 */
import { createHash, randomBytes } from "node:crypto";
import { HttpsError, onCall, type FunctionsErrorCode } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentWrittenWithAuthContext } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { audit, db, freshCaller, str } from "./admin.js";
import { isOwner } from "./catalog.js";
import { refuseClosedOrg } from "./closedOrg.js";
import { CATALOGS_DOC, writeCatalog } from "./content.js";
import { bucket, publicFileUrl, saveRetrying } from "./storage.js";
import { connectHost, disconnectHost, syncAccess, type Access, type HostCheck } from "./domains.js";
import { brandLogoPath, hasAccess, isApproved, isReservedName, LOGO_TYPES, newSite, readLinks, readSiteDoc, SITE_LOGOS, siteLogoPath, sitesNeedPublish, statusOf } from "./sitesCore.js";
import { checkSiteHost, inDarsiZone, type SiteDoc, type SiteEntry, type SitesFile, type SiteStatus, type SiteSteps, type StepState } from "./shared/sites.js";
import { ssoOrgRebranded, ssoSiteEntry } from "./ssoStore.js";

export const SITES = "sites";
export const LEGACY_DOC = "config/sites";
export const SITES_FILE = "content/sites.json";
export const ACCESS_DOC = "config/siteAccess";
/** Addresses an organization may hold at once, asked for or connected (refused ones don't count). */
export const MAX_SITES = 3;
/** A "Check now" sooner than this after the last check answers with that check (Hosting itself re-checks every few minutes). */
const CHECK_GAP_MS = 15_000;
/** A live address is checked again (and mended, or cut off if its DNS changed) every hour; the others at every run of sitesJob. */
const LIVE_RECHECK_MS = 3600_000;
/** How long one syncSiteAccess may hold the lock before another may take it (one that crashed). */
const LOCK_MS = 90_000;
/**
 * sitesJob has 300 s. Its checks of single addresses stop after this long (the rest come first at the next run), so
 * there is always time left to set sign-in and file access from what was found: that step is what takes sign-in away
 * from an address whose DNS no longer shows it is Darsi's.
 */
const CHECKS_MS = 200_000;
/** The job's first minute at most goes to catalogs a publish couldn't write (content.ts CATALOGS_DOC). */
const MEND_MS = 60_000;
/** The job's last run: { sitesJob: { at, ok, checked, live } }. */
export const JOBS_DOC = "stats/jobs";

type Reason = "site-host" | "site-reserved" | "site-taken" | "site-limit" | "site-state" | "site-zone" | "site-apex" | "no-site" | "not-super"
  | "not-org-admin" | "no-org" | "org-inactive" | "site-action";
/** The English fallback for each refusal; the admin screens show their own words for the code (admin/refusals.ts). */
const WORDS: Record<Reason, string> = {
  "site-host": "Type a web address such as learn.yourschool.edu: lowercase letters, digits, dots and dashes.",
  "site-reserved": "That is one of Darsi's own addresses.",
  "site-zone": "Addresses under darsiai.org are set up by Darsi. Ask for an address under your own domain, such as learn.yourschool.edu.",
  "site-apex": "Use an address under your domain, such as learn.yourschool.edu, not the domain itself.",
  "site-taken": "Another organization already uses or asked for that address.",
  "site-limit": `An organization can have at most ${MAX_SITES} web addresses, asked for or connected.`,
  "site-state": "That address has changed since this page read it. Read the page again.",
  "no-site": "No such web address.",
  "not-super": "Platform admins only.",
  "not-org-admin": "Organization admins only.",
  "no-org": "No such organization.",
  "org-inactive": "The organization isn't active yet.",
  "site-action": "Unknown action.",
};
const refuse = (code: FunctionsErrorCode, reason: Reason) => new HttpsError(code, WORDS[reason], { reason });
const siteRef = (host: string) => db.doc(`${SITES}/${host}`);
/** An ownership token: 32 random hex characters, for `_darsi.<address>` TXT `darsi-site=<token>`. */
const makeProof = () => randomBytes(16).toString("hex");
/** The token an address's checks look for: none under darsiai.org; made now for one approved before tokens existed. */
async function proofFor(s: SiteDoc): Promise<string | null> {
  if (inDarsiZone(s.host)) return null;
  if (s.proof) return s.proof;
  const proof = makeProof();
  await siteRef(s.host).update({ proof });
  return proof;
}
/**
 * An address outside darsiai.org must be under the organization's domain (learn.school.edu.eg), not the domain itself
 * (school.edu.eg, by the public suffix list): every Darsi page sends HSTS with includeSubDomains, which on a domain
 * itself would force HTTPS on all of the school's other subdomains for two years.
 */
async function isDomainItself(host: string): Promise<boolean> {
  const { getDomain } = await import("tldts");
  const domain = getDomain(host);
  return !domain || domain === host;
}

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

/**
 * Publishes content/sites.json from every approved address and its organization as it is now (its name, its logo's
 * public copy). Addresses of organizations that no longer exist are left out. Logo copies nothing lists any more go.
 */
export async function writeSitesFile(): Promise<SitesFile> {
  const snap = await db.collection(SITES).get();
  // `sso`: the organization's school sign-in while it is on (its slug and the provider's host), so its own address
  // shows the school button before anyone signs in, without a finder listing (ssoStore.ssoSiteEntry). The app's
  // SiteEntry type gains the field with the sign-in screen.
  const sites: Record<string, SiteEntry & { sso?: { slug: string; host: string } }> = {};
  const used = new Set<string>();
  const orgs = new Map<string, { name: string; logo: string | null; sso: { slug: string; host: string } | null } | null>();
  for (const d of snap.docs) {
    const s = readSiteDoc(d.id, d.data());
    if (!s || !isApproved(s.status)) continue;
    if (!orgs.has(s.orgId)) {
      const org = await db.doc(`orgs/${s.orgId}`).get();
      const logo = org.exists ? await publicLogo(s.orgId, org.get("brand.logo")) : null;
      if (logo) used.add(logo.path);
      const sso = org.exists ? await ssoSiteEntry(s.orgId, org).catch((e: unknown) => { logger.warn("site: school sign-in not read", { orgId: s.orgId, error: String(e).slice(0, 200) }); return null; }) : null;
      orgs.set(s.orgId, org.exists ? { name: str(org.get("name"), 120) || s.orgId, logo: logo?.url ?? null, sso } : null);
    }
    const o = orgs.get(s.orgId);
    if (o) sites[s.host] = { orgId: s.orgId, name: o.name, logo: o.logo, darsi: s.darsi, ...(o.sso ? { sso: o.sso } : {}) };
  }
  const file: SitesFile = { v: Date.now(), sites };
  // Two admins saving at once: Storage's "too soon" (429) is waited out inside the save (storage.ts saveJson).
  await saveRetrying(SITES_FILE, file);
  const [old] = await bucket().getFiles({ prefix: SITE_LOGOS }).catch(() => [[] as { name: string; delete: () => Promise<unknown> }[]]);
  await Promise.all(old.filter((f) => !used.has(f.name)).map((f) => f.delete().catch(() => {})));
  return file;
}

/**
 * An address that was live and no longer is, or that is live (the first time, or again), goes in the audit log and the
 * logs, whoever's check found it (the job's, or an admin's "Check now"): `by` is "sitesJob", since no person did it.
 * Losing an address is logged as an error with `event: "site-lost"`, for an alert: its people can't sign in there, and
 * until its DNS is looked at nobody knows whether the school dropped the record or someone else now holds the name.
 * Called after the write, once per change (the status before and after differ), so a problem that stays writes nothing.
 */
async function noteStatus(s: Pick<SiteDoc, "host" | "orgId" | "status" | "error" | "issues">, was: SiteStatus) {
  if (was === s.status || (was !== "live" && s.status !== "live")) return;
  const { host, orgId } = s;
  const lost = was === "live";
  if (lost) logger.error("site lost", { event: "site-lost", host, orgId, status: s.status });
  else logger.info("site live", { event: "site-live", host, orgId });
  await audit(lost ? "siteLost" : "siteLive", "sitesJob", lost ? { host, orgId, status: s.status, error: s.error ?? null, issues: s.issues?.length ? s.issues : null } : { host, orgId })
    .catch((e: unknown) => logger.error("site change not audited", { event: "audit-failed", host, orgId, lost, error: String(e) }));
}

/**
 * Keeps a check's result, while the address is still approved (a removal may have come meanwhile). Its auth and cors
 * steps stay as syncSiteAccess left them; the caller runs that next.
 */
async function record(host: string, check: HostCheck, now = Date.now()): Promise<SiteDoc | null> {
  const { site, was } = await db.runTransaction(async (tx): Promise<{ site: SiteDoc | null; was: SiteStatus | null }> => {
    const ref = siteRef(host);
    const cur = readSiteDoc(host, (await tx.get(ref)).data());
    if (!cur || !isApproved(cur.status)) return { site: cur, was: null };
    const steps: SiteSteps = { ...check.steps, auth: cur.steps?.auth ?? "todo", cors: cur.steps?.cors ?? "todo" };
    const status = check.errors.length ? "problem" : statusOf(steps);
    const patch = {
      status, steps, records: check.records, issues: check.issues, error: check.errors.join("\n").slice(0, 1000) || null,
      checkedAt: now, liveAt: status === "live" ? (cur.liveAt ?? now) : cur.liveAt,
    };
    tx.update(ref, patch);
    return { site: { ...cur, ...patch }, was: cur.status };
  });
  if (site && was) await noteStatus(site, was);
  return site;
}

/** The lines of a site's error that syncSiteAccess writes (a check writes the others). */
const ACCESS_ERROR = /^(Authentication|Storage CORS|Busy):/;

/** An address's auth and cors steps after syncAccess, and the status and error that follow. */
async function setAccess(s: SiteDoc, r: Access, now: number) {
  const want = hasAccess(s);
  const state = (there: Set<string> | null): StepState => (!want ? "wait" : there?.has(s.host) ? "ok" : "error");
  const auth = state(r.authorized), cors = state(r.origins);
  const change = await db.runTransaction(async (tx) => {
    const ref = siteRef(s.host);
    const cur = readSiteDoc(s.host, (await tx.get(ref)).data());
    if (!cur || !isApproved(cur.status) || !cur.steps) return null;
    const steps: SiteSteps = { ...cur.steps, auth, cors };
    const lines = (cur.error ?? "").split("\n").filter((l) => l && !ACCESS_ERROR.test(l));
    if (auth === "error" || cors === "error") lines.push(...r.errors);
    const error = lines.join("\n").slice(0, 1000) || null;
    const status = error ? "problem" : statusOf(steps);
    if (status === cur.status && error === cur.error && auth === cur.steps.auth && cors === cur.steps.cors) return null;
    tx.update(ref, { steps, status, error, liveAt: status === "live" ? (cur.liveAt ?? now) : cur.liveAt });
    return { site: { ...cur, status, error }, was: cur.status };
  });
  // This is where an address turns live (sign-in is the last step), and where one that lost sign-in stops being live.
  if (change) await noteStatus(change.site, change.was);
}

/**
 * Gives sign-in and file access (Auth's authorized domains, the bucket's CORS list) to exactly the addresses that
 * should have them now (hasAccess), takes it from every other address Darsi gave it to, and writes each address's auth
 * and cors steps. One run at a time across instances (the lock in config/siteAccess, which also lists what Darsi put in
 * those lists). Every change to an address runs it after its own write, so the last run sees the last state, and
 * sitesJob runs it every 15 minutes, which mends a run that failed or couldn't take the lock. Returns what failed.
 */
export async function syncSiteAccess(now = Date.now()): Promise<string[]> {
  const ref = db.doc(ACCESS_DOC);
  const me = randomBytes(6).toString("hex");
  let managed: string[] | null = null;
  for (let i = 0; i < 30 && !managed; i++) {
    managed = await db.runTransaction(async (tx) => {
      const d = ((await tx.get(ref)).data() ?? {}) as { lockUntil?: unknown; hosts?: unknown };
      if (typeof d.lockUntil === "number" && d.lockUntil > Date.now()) return null;
      tx.set(ref, { lockUntil: Date.now() + LOCK_MS, lockedBy: me }, { merge: true });
      return Array.isArray(d.hosts) ? d.hosts.filter((h): h is string => typeof h === "string") : [];
    });
    if (!managed) await new Promise((ok) => setTimeout(ok, 1000));
  }
  if (!managed) {
    logger.warn("site access busy");
    return ["Busy: another change to web addresses is being applied. This one follows within 15 minutes."];
  }
  let hosts = managed;
  try {
    const all = (await db.collection(SITES).get()).docs.map((d) => readSiteDoc(d.id, d.data())).filter((x): x is SiteDoc => Boolean(x));
    const want = all.filter(hasAccess).map((x) => x.host);
    // Listed before Google's lists change, so an address put there is never forgotten if this run stops halfway.
    hosts = [...new Set([...managed, ...want])];
    await ref.set({ hosts }, { merge: true });
    // Every organization address is Darsi's to give or take, whoever put it there (cis.darsiai.org was added by hand).
    const r = await syncAccess(want, [...new Set([...managed, ...all.map((x) => x.host)])]);
    if (!r.errors.length) hosts = want;
    for (const x of all) if (isApproved(x.status)) await setAccess(x, r, now);
    return r.errors;
  } finally {
    await ref.set({ hosts, lockUntil: 0, lockedBy: null }, { merge: true });
  }
}

type Caller = { uid: string; role: string; orgId?: string };

/** An org admin asks for an address for their organization; a platform admin approves it (approve). */
async function requestSite(c: Caller, host: string): Promise<SiteDoc> {
  const orgId = c.orgId!;
  if (inDarsiZone(host)) throw refuse("invalid-argument", "site-zone");
  if (await isDomainItself(host)) throw refuse("invalid-argument", "site-apex");
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
    const doc = newSite(host, orgId, orgName, c.uid, Date.now(), false, true, makeProof());
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
  if (!inDarsiZone(host) && await isDomainItself(host)) throw refuse("invalid-argument", "site-apex");
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
    const asked = cur?.orgId === owner && cur.status === "requested";
    // The organization's own request keeps its token: its records may already be in its DNS.
    const proof = inDarsiZone(host) ? null : asked && cur!.proof ? cur!.proof : makeProof();
    const doc: SiteDoc = {
      ...newSite(host, owner, str(org.get("name"), 120) || owner, asked ? cur!.requestedBy ?? c.uid : c.uid, asked ? cur!.requestedAt ?? now : now, true, darsi, proof),
      approvedBy: c.uid, approvedAt: now,
    };
    tx.set(siteRef(host), doc);
    return { site: doc, fresh: true };
  });
  if (fresh) {
    await record(host, await connectHost(host, { proof: site.proof }));
    await syncSiteAccess();
  }
  await writeSitesFile();
  const after = readSiteDoc(host, (await siteRef(host).get()).data()) ?? site;
  await audit(fresh ? "approveSite" : "siteIdentity", c.uid, { orgId: site.orgId, host, darsi, status: after.status });
  return after;
}

/** Connects again what is missing and says where each step stands. */
async function checkSite(c: Caller, host: string): Promise<SiteDoc> {
  const cur = readSiteDoc(host, (await siteRef(host).get()).data());
  if (!cur) throw refuse("not-found", "no-site");
  // Another organization's address: "site-taken", the reason asking for it gives ("not-yours" is an account's refusal).
  if (c.role !== "superadmin" && cur.orgId !== c.orgId) throw refuse("permission-denied", "site-taken");
  if (!isApproved(cur.status)) throw refuse("failed-precondition", "site-state");
  if (cur.checkedAt && Date.now() - cur.checkedAt < CHECK_GAP_MS) return cur;
  await record(host, await connectHost(host, { proof: await proofFor(cur), prev: cur.steps }));
  await syncSiteAccess();
  return readSiteDoc(host, (await siteRef(host).get()).data()) ?? cur;
}

/** Disconnects and forgets an address. What couldn't be undone outside Darsi is returned, not a refusal. */
async function removeSite(c: Caller, host: string): Promise<string[]> {
  const cur = readSiteDoc(host, (await siteRef(host).get()).data());
  if (!cur) return [];
  const warnings = isApproved(cur.status) ? await disconnectHost(host) : [];
  await siteRef(host).delete();
  if (isApproved(cur.status)) {
    warnings.push(...(await syncSiteAccess()));
    await writeSitesFile();
  }
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
  if (isReservedName(checked.host)) throw refuse("invalid-argument", "site-reserved");
  const host = checked.host;
  const superOnly = () => { if (!isSuper) throw refuse("permission-denied", "not-super"); };
  // An organization's own admin asks for, cancels and checks no address while it is suspended or being deleted
  // (requestSite alone refused, and only with "org-inactive").
  if (!isSuper) await refuseClosedOrg(c, c.orgId!);

  switch (action) {
    case "request":
      if (!orgAdmin) throw refuse("permission-denied", "not-org-admin");
      return { site: await requestSite(c, host) };
    case "cancel": {
      const site = await db.runTransaction(async (tx) => {
        const cur = readSiteDoc(host, (await tx.get(siteRef(host))).data());
        if (!cur) return null;
        if (!isSuper && cur.orgId !== c.orgId) throw refuse("permission-denied", "site-taken");
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
  if (isReservedName(checked.host)) throw refuse("invalid-argument", "site-reserved");
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

const words = (e: unknown) => String((e as { message?: unknown } | null)?.message ?? e).slice(0, 300);

/**
 * Writes again the catalogs a publish, unpublish or delete couldn't (content.ts catalogOrPending marked their owners
 * in CATALOGS_DOC after Storage refused every try), so the editor and what learners see agree again within 15 minutes
 * with nobody doing anything. An owner is cleared only when its catalog was written and no newer failure marked it
 * meanwhile; one that still fails stays for the next run and is reported.
 */
async function mendCatalogs(started: number, errors: string[]) {
  const ref = db.doc(CATALOGS_DOC);
  let dirty: Record<string, unknown>;
  try { dirty = ((await ref.get()).get("dirty") ?? {}) as Record<string, unknown>; } catch (e) { errors.push(`Catalogs: ${words(e)}`); return; }
  for (const [owner, at] of Object.entries(dirty)) {
    if (Date.now() - started > MEND_MS) break;
    try {
      if (isOwner(owner)) await writeCatalog(owner);
      await db.runTransaction(async (tx) => {
        const now = ((await tx.get(ref)).get("dirty") ?? {}) as Record<string, unknown>;
        if (now[owner] === at) tx.set(ref, { dirty: { [owner]: FieldValue.delete() } }, { merge: true });
      });
      logger.info("catalog mended", { event: "catalog-mended", owner, since: at });
    } catch (e) {
      logger.error("catalog still not written", { event: "catalog-pending", owner, since: at, error: words(e) });
      errors.push(`Catalog ${owner}: ${words(e)}`);
    }
  }
}

/**
 * sitesJob's work: writes the catalogs a publish couldn't (mendCatalogs), moves the old list in, checks (and mends)
 * every approved address that isn't live, and live ones hourly, then sets sign-in and file access from what it found
 * (and mends the lists, whatever changed them), and notes that it ran (JOBS_DOC).
 *
 * No step's failure stops the next: one address whose check throws, or the checks running out of time (CHECKS_MS; the
 * addresses checked longest ago go first, so none is starved), must not keep syncSiteAccess from running, which is
 * what takes sign-in away from an address that no longer points at Darsi. What failed is returned and logged.
 */
export async function checkSites(now = Date.now()): Promise<{ imported: number; checked: number; live: number; errors: string[] }> {
  const started = Date.now();
  const errors: string[] = [];
  // A step that threw used to end the run as a failed one; it is still logged as an error, and the run goes on.
  const fail = (what: string, e: unknown) => { errors.push(`${what}: ${words(e)}`); logger.error("sites job step failed", { event: "sites-job-failed", what, error: words(e) }); };
  await mendCatalogs(started, errors);
  let imported = 0, checked = 0, live = 0;
  try { imported = await importLegacy(); } catch (e) { fail("Import", e); }
  try {
    const due = (await db.collection(SITES).get()).docs.map((d) => readSiteDoc(d.id, d.data()))
      .filter((s): s is SiteDoc => Boolean(s) && isApproved(s!.status) && !(s!.status === "live" && Boolean(s!.checkedAt) && now - s!.checkedAt! < LIVE_RECHECK_MS))
      .sort((a, b) => (a.checkedAt ?? 0) - (b.checkedAt ?? 0));
    for (const [i, s] of due.entries()) {
      if (Date.now() - started > CHECKS_MS) {
        logger.warn("sites job ran out of time", { event: "sites-job-slow", checked, left: due.length - i });
        break;
      }
      try {
        await record(s.host, await connectHost(s.host, { proof: await proofFor(s), prev: s.steps }), now);
        checked++;
      } catch (e) { fail(s.host, e); }
    }
  } catch (e) { fail("Sites", e); }
  try { errors.push(...(await syncSiteAccess(now))); } catch (e) { fail("Access", e); }
  try {
    if (imported) await writeSitesFile();
    live = (await db.collection(SITES).get()).docs.filter((d) => d.get("status") === "live").length;
  } catch (e) { fail("Sites file", e); }
  await db.doc(JOBS_DOC).set({ sitesJob: { at: Date.now(), ok: errors.length === 0, checked, live } }, { merge: true })
    .catch((e: unknown) => logger.error("sites job heartbeat not written", { error: words(e) }));
  return { imported, checked, live, errors };
}

/** Every 15 minutes: an approved address turns live by itself once its DNS and certificate are there. */
export const sitesJob = onSchedule({ schedule: "*/15 * * * *", timeZone: "UTC", timeoutSeconds: 300, retryCount: 0 }, async () => {
  const r = await checkSites();
  if (r.errors.length) logger.warn("sites job: not everything worked", { event: "sites-job-errors", ...r });
  else if (r.imported || r.checked) logger.info("sites checked", r);
});

/**
 * An organization that is renamed, gets a new logo (OrgBranding writes the document directly) or is deleted: its
 * addresses follow. Renamed or re-branded, content/sites.json again, so its addresses show the change within a minute;
 * deleted, its addresses are disconnected and forgotten, so another organization can have them.
 *
 * With the auth context (who wrote the document: an org admin's uid from the app, or the functions' service account):
 * an organization that has an approved address and changes its name or logo changes what its public address and its
 * sign-in page say within a minute, with no platform admin told, so it is audited (orgRebrand, by the writer) and
 * logged as a warning with `event: "org-rebrand"`. So are the addresses a deleted organization takes with it.
 */
export const onOrgSite = onDocumentWrittenWithAuthContext({ document: "orgs/{orgId}", maxInstances: 5, timeoutSeconds: 120 }, async (event) => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (!sitesNeedPublish(before, after)) return;
  const orgId = event.params.orgId;
  const by = str(event.authId, 200) || "server";
  // School sign-in's finder: an approved listing shows the name and logo a platform admin saw, so a new one unlists it
  // until approved again (ssoStore.ssoOrgRebranded). Organizations without school sign-in cost a field check. Its own
  // failure never stops the addresses' work below.
  await ssoOrgRebranded(event.params.orgId, before, after).catch((e: unknown) => logger.error("school sign-in listing not followed", { orgId: event.params.orgId, error: String(e).slice(0, 300) }));
  // The entry records what already happened. One that can't be written is logged with all it would have said, and
  // never stops what follows: the next address's removal, taking sign-in away, content/sites.json.
  const note = (action: string, data: Record<string, unknown>) => audit(action, by, data)
    .catch((e: unknown) => logger.error("site change not audited", { event: "audit-failed", action, by, ...data, error: String(e).slice(0, 300) }));
  const mine = (await db.collection(SITES).where("orgId", "==", orgId).get()).docs
    .map((d) => readSiteDoc(d.id, d.data())).filter((s): s is SiteDoc => Boolean(s));
  if (!mine.length) return;
  const approved = mine.filter((s) => isApproved(s.status));
  if (!after) {
    for (const s of mine) {
      const warnings = isApproved(s.status) ? await disconnectHost(s.host) : [];
      if (warnings.length) logger.warn("site not fully disconnected", { host: s.host, warnings });
      await siteRef(s.host).delete();
      await note("removeSite", { orgId, host: s.host, status: s.status, reason: "org-deleted", warnings: warnings.length ? warnings : null });
    }
    if (approved.length) await syncSiteAccess();
  } else {
    const logoOf = (o: typeof after | undefined) => (o?.brand as { logo?: unknown } | null | undefined)?.logo ?? null;
    const renamed = before?.name !== after.name, logoChanged = logoOf(before) !== logoOf(after);
    if (approved.length && (renamed || logoChanged)) {
      const change = { orgId, nameBefore: str(before?.name, 120), nameAfter: str(after.name, 120), logoChanged, hosts: approved.map((s) => s.host) };
      logger.warn("organization with a web address renamed or re-branded", { event: "org-rebrand", by, ...change });
      await note("orgRebrand", change);
    }
    if (renamed) {
      const orgName = str(after.name, 120) || orgId;
      await Promise.all(mine.map((s) => siteRef(s.host).update({ orgName })));
    }
  }
  if (approved.length) await writeSitesFile();
  logger.info("organization sites followed", { orgId, deleted: !after, sites: mine.length });
});
