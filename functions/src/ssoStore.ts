/**
 * School sign-in (TECHNICAL.md "School sign-in"): the Firestore and Auth side that the HTTP functions, manageSso and
 * ssoJob (sso.ts) share with the rest of the server. Everything here reads or writes documents no client can touch
 * (firestore.rules: ssoIdentities, ssoUsed, ssoSlugs, ssoTests, ssoSecrets, orgs/{id}/private/sso and ssoHealth).
 *
 * The hooks other files call (each one small, and none of them able to fail the change it follows):
 *  - ssoClaimsMoved (billing.writeClaims): an account left an organization; its identities there stop working.
 *  - ssoSetBlocked (suspension by the organization or a platform admin, and its lifting).
 *  - ssoAccountWiped (account.wipeAccount), ssoOrgDeleted (platform.deleteOrg).
 *  - ssoKeepWayIn (the lock-out guard on admins' role changes), ssoOnlyAccount (resetMemberPassword's `sso-login`).
 *  - ssoSiteEntry (sites.writeSitesFile), ssoOrgRebranded (sites.onOrgSite), writeSsoFile (content/sso.json).
 *
 * Nothing here imports billing.ts (which imports this file): the steps that change claims live in sso.ts.
 */
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError } from "firebase-functions/v2/https";
import { auth, db } from "./admin.js";
import { isManaged } from "./orgMembersCore.js";
import { USERNAME_DOMAIN } from "./passwords.js";
import { managedAccount } from "./roles.js";
import { brandLogoPath, LOGO_TYPES } from "./sitesCore.js";
import { bucket, savePublicJson } from "./storage.js";
import type { AccountFacts, AuthMethod, IdentityState, Linked, MappingFacts, TeacherRule } from "./ssoCore.js";
import type { Endpoints, Preset } from "./ssoProviders.js";

export const IDENTITIES = "ssoIdentities";
export const USED = "ssoUsed";
export const SLUGS = "ssoSlugs";
export const TESTS = "ssoTests";
export const SECRETS = "ssoSecrets";
export const SSO_FILE = "content/sso.json";
export const configPath = (orgId: string) => `orgs/${orgId}/private/sso`;
export const healthPath = (orgId: string) => `orgs/${orgId}/private/ssoHealth`;

const DAY_MS = 86_400_000;
/** Firestore's "already exists" (create() on a document that is there), as the Admin SDK and the test fakes throw it. */
export const alreadyExists = (e: unknown) => (e as { code?: unknown } | null)?.code === 6 || /ALREADY_EXISTS|already exists/i.test(String(e));

/* ---------- The configuration (orgs/{orgId}/private/sso) ---------- */

/** What signs people in: the tested connection at the top level, and an edit of it under `next` while it is on. */
export interface Conn {
  preset: Preset;
  tenant: string | null; domain: string | null; oktaServer: string | null; realm: string | null;
  issuer: string;
  subjectKind: "sub" | "tid-oid";
  clientId: string;
  authMethod: AuthMethod;
  scopes: string[];
  allowedDomains: string[];
  openToAll: boolean;
  emailsVerifiedBySchool: boolean;
  teacherRule: TeacherRule | null;
  classClaim: string | null;
  maxSessionDays: number;
  personalDevices: boolean;
  secretExpiresOn: string | null;
  endpoints: Endpoints;
  /** The discovery document said `authorization_response_iss_parameter_supported` (RFC 9207): the callback needs `iss`. */
  issParam: boolean;
  pkce: "s256" | "unadvertised";
  /** Part of every identity's id: a new one ("a different provider") starts everyone afresh (see migrate in sso.ts). */
  connectionId: string;
  configRev: number;
  hasSecret: boolean;
}
export type SsoStatus = "draft" | "tested" | "on" | "off";
export type ListingState = "none" | "requested" | "approved" | "refused";
export interface Listing { state: ListingState; name: string | null; logo: string | null; host: string | null; at: number | null; by: string | null; reason?: string | null }
export interface LastTest {
  at: number; ok: boolean; by: string | null; asStudent: boolean; decision: string; rev: number;
  claimsSeen: string[]; ruleValues: string[]; email: string | null; name: string | null; emailVerified: boolean; teacher: boolean | null; cls: string | null;
  error?: string | null;
}
export interface SsoConfig extends Conn {
  status: SsoStatus;
  testedRev: number | null;
  testedEndpoints: Endpoints | null;
  /** The configRev a student's test (a test link) passed on; turnOn needs it for Google and Microsoft (or a tick). */
  studentTestRev: number | null;
  slug: string | null;
  listing: Listing;
  next: Conn | null;
  lastTest: LastTest | null;
}

const str = (v: unknown, max = 500): string | null => (typeof v === "string" && v ? v.slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strings = (v: unknown, max = 100): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []);
function endpointsOf(v: unknown): Endpoints | null {
  const e = v as Partial<Endpoints> | null | undefined;
  if (!e || typeof e.authorization !== "string" || typeof e.token !== "string" || typeof e.jwks !== "string") return null;
  return { authorization: e.authorization, token: e.token, jwks: e.jwks, ...(typeof e.endSession === "string" ? { endSession: e.endSession } : {}) };
}

/** A stored connection, or null when it isn't one (a draft saved before discovery, or junk). */
export function readConn(v: unknown): Conn | null {
  const d = (v ?? {}) as Record<string, unknown>;
  const endpoints = endpointsOf(d.endpoints);
  const issuer = str(d.issuer, 300), clientId = str(d.clientId, 256), connectionId = str(d.connectionId, 40);
  if (!endpoints || !issuer || !clientId || !connectionId || typeof d.preset !== "string") return null;
  return {
    preset: d.preset as Preset, tenant: str(d.tenant), domain: str(d.domain), oktaServer: str(d.oktaServer), realm: str(d.realm),
    issuer, subjectKind: d.subjectKind === "tid-oid" ? "tid-oid" : "sub", clientId,
    authMethod: d.authMethod === "post" ? "post" : "basic", scopes: strings(d.scopes, 10), allowedDomains: strings(d.allowedDomains, 50),
    openToAll: d.openToAll === true, emailsVerifiedBySchool: d.emailsVerifiedBySchool === true,
    teacherRule: (d.teacherRule ?? null) as TeacherRule | null, classClaim: str(d.classClaim, 64),
    maxSessionDays: num(d.maxSessionDays) ?? 30, personalDevices: d.personalDevices === true, secretExpiresOn: str(d.secretExpiresOn, 10),
    endpoints, issParam: d.issParam === true, pkce: d.pkce === "s256" ? "s256" : "unadvertised",
    connectionId, configRev: num(d.configRev) ?? 0, hasSecret: d.hasSecret === true,
  };
}

const NO_LISTING: Listing = { state: "none", name: null, logo: null, host: null, at: null, by: null };
/** orgs/{orgId}/private/sso as stored, or null when the organization has no connection yet (or only a work-in-progress draft). */
export function readConfig(v: unknown): SsoConfig | null {
  const d = (v ?? {}) as Record<string, unknown>;
  const conn = readConn(d);
  if (!conn) return null;
  const l = (d.listing ?? {}) as Record<string, unknown>;
  const state = ["requested", "approved", "refused"].includes(l.state as string) ? (l.state as ListingState) : "none";
  return {
    ...conn,
    status: (["draft", "tested", "on", "off"] as const).includes(d.status as SsoStatus) ? (d.status as SsoStatus) : "draft",
    testedRev: num(d.testedRev), testedEndpoints: endpointsOf(d.testedEndpoints), studentTestRev: num(d.studentTestRev),
    slug: str(d.slug, 60),
    listing: state === "none" ? NO_LISTING : { state, name: str(l.name, 120), logo: str(l.logo, 200_000), host: str(l.host, 300), at: num(l.at), by: str(l.by, 128), reason: str(l.reason, 300) },
    next: readConn(d.next),
    lastTest: (d.lastTest ?? null) as LastTest | null,
  };
}

/**
 * The connection a flow started against: the live one for sign-in and link (it must be on, at the same rev), and for a
 * test the edit under `next` or the top-level one, whichever rev the state carries. null: it changed meanwhile.
 */
export function connForRev(cfg: SsoConfig | null, rev: number, mode: "signin" | "link" | "test"): { conn: Conn; slot: "live" | "next" } | null {
  if (!cfg) return null;
  if (mode !== "test") return cfg.status === "on" && rev === cfg.configRev ? { conn: cfg, slot: "live" } : null;
  if (cfg.next && rev === cfg.next.configRev) return { conn: cfg.next, slot: "next" };
  return rev === cfg.configRev ? { conn: cfg, slot: "live" } : null;
}

/** A sign-in reads the config at most once a minute per instance (design §4 callback); every write here forgets it. */
const CONFIG_TTL_MS = 60_000;
const configs = new Map<string, { at: number; cfg: SsoConfig | null; raw: Record<string, unknown> | null }>();
export function forgetConfig(orgId?: string) { if (orgId) configs.delete(orgId); else configs.clear(); }
export async function loadConfig(orgId: string, fresh = false): Promise<{ cfg: SsoConfig | null; raw: Record<string, unknown> | null }> {
  const hit = configs.get(orgId);
  if (!fresh && hit && Date.now() - hit.at < CONFIG_TTL_MS) return hit;
  const snap = await db.doc(configPath(orgId)).get();
  const raw = snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
  const entry = { at: Date.now(), cfg: readConfig(raw), raw };
  configs.set(orgId, entry);
  if (configs.size > 2000) configs.delete(configs.keys().next().value as string);
  return entry;
}
/** The host people continue at (shown on the school button and in the finder). */
export const providerHost = (c: Pick<Conn, "endpoints"> | null | undefined) => { try { return c ? new URL(c.endpoints.authorization).host : null; } catch { return null; } };

/** The platform switch (config/settings.ssoOn, default on). */
export async function ssoSwitchOn(): Promise<boolean> {
  return (await db.doc("config/settings").get()).get("ssoOn") !== false;
}

/* ---------- Health (orgs/{orgId}/private/ssoHealth) ---------- */

const noted = new Map<string, number>();
/**
 * A problem the status card shows (`reason` → {n, firstAt, lastAt, hint}), written at most once per reason per minute
 * per instance, so a broken provider costs one write a minute, not one per person. Never throws.
 */
export async function noteProblem(orgId: string, reason: string, hint: string | null = null, now = Date.now()) {
  const key = `${orgId}|${reason}`;
  if ((noted.get(key) ?? 0) > now - 60_000) return;
  noted.set(key, now);
  if (noted.size > 5000) noted.delete(noted.keys().next().value as string);
  try {
    const ref = db.doc(healthPath(orgId));
    const had = (await ref.get()).get(`problems.${reason}.firstAt`);
    await ref.set({ problems: { [reason]: { n: FieldValue.increment(1), lastAt: now, hint: hint ?? null, ...(typeof had === "number" ? {} : { firstAt: now }) } } }, { merge: true });
  } catch (e) {
    logger.warn("sso: problem not recorded", { orgId, reason, error: String(e).slice(0, 200) });
  }
}
/** Forgets the instance's "already noted" marks (tests). */
export const resetNoted = () => noted.clear();

/**
 * Design §7: a session the school's sign-in opened (token claim `sso`) on a personal account (one no organization
 * manages) may not spend money or change a subscription: whoever runs the school's provider could open it. The person
 * signs in with their own login for that (`sso-own-login`). account.ts has the same rule for deleting and exporting.
 */
export async function refuseSsoSession(token: Record<string, unknown> | { [k: string]: unknown } | undefined, uid: string) {
  if (!token?.sso) return;
  const managedBy = (await db.doc(`users/${uid}`).get()).get("managedBy");
  // The profile says so: Auth isn't asked, so a managed account's checkout doesn't hang on a second service.
  if (managedAccount({ managedBy }, USERNAME_DOMAIN).managed) return;
  // Profiles from before `managedBy`: a username login is the organization's too (roles.managedAccount, account.ts).
  // Auth's own email only, never the profile's copy; an Auth record that can't be read refuses (authRecord throws).
  if (managedAccount({ managedBy, email: (await authRecord(uid))?.email ?? null }, USERNAME_DOMAIN).managed) return;
  throw new HttpsError("failed-precondition", "Sign in with your own Darsi login to do this.", { reason: "sso-own-login" });
}

/* ---------- Accounts and identities ---------- */

type UserRecordLike = { uid: string; email?: string; disabled?: boolean; customClaims?: Record<string, unknown>; providerData?: { providerId: string }[]; metadata?: { lastSignInTime?: string | null } };
/** Auth's record, or null only for "no such account": any other failure is thrown (never read as "nobody"). */
export const authRecord = (uid: string): Promise<UserRecordLike | null> =>
  auth.getUser(uid).then((u) => u as unknown as UserRecordLike, (e: { code?: string } | null) => { if (e?.code === "auth/user-not-found" || /user-not-found/.test(String(e))) return null; throw e; });

/** What decideSignIn and decideLink need about one account: its Auth record and its profile. */
export async function accountFacts(uid: string): Promise<AccountFacts & { record: UserRecordLike | null; profileData: Record<string, unknown> | null }> {
  const [record, profile] = await Promise.all([authRecord(uid), db.doc(`users/${uid}`).get()]);
  const p = profile.exists ? ((profile.data() ?? {}) as Record<string, unknown>) : null;
  const c = record?.customClaims ?? null;
  return {
    uid, authExists: Boolean(record), disabled: record?.disabled === true, authEmail: record?.email?.toLowerCase() ?? null,
    lastSignInTime: record?.metadata?.lastSignInTime || null,
    claims: c ? { role: (c.role as string | undefined) ?? null, orgId: (c.orgId as string | undefined) ?? null } : record ? { role: null, orgId: null } : null,
    profile: p ? { role: (p.role as string | null) ?? null, orgId: (p.orgId as string | null) ?? null, createdBy: (p.createdBy as string | null) ?? null, sso: p.sso === true, mustChangePassword: p.mustChangePassword === true } : null,
    record, profileData: p,
  };
}

/** Whether the account can sign in without the school: a password or a Google login on its Auth record. */
export const ownLogin = (r: UserRecordLike | null) => !!r && (r.providerData ?? []).some((p) => p.providerId === "password" || p.providerId === "google.com");

/**
 * An account that only the school's sign-in opens (made by it, with no password or Google login added since):
 * resetMemberPassword answers `sso-login` for it, unlink refuses it, and the lock-out guard doesn't count it.
 */
export async function ssoOnlyAccount(uid: string, profile?: { sso?: unknown } | null): Promise<boolean> {
  const p = profile !== undefined ? profile : (await db.doc(`users/${uid}`).get()).data();
  if (p?.sso !== true) return false;
  return !ownLogin(await authRecord(uid));
}

export interface IdentityDoc {
  uid: string; orgId: string; connectionId: string; issuer: string; subject: string; email: string | null; emailVerified: boolean;
  linked: Linked; state: IdentityState; pending?: boolean; createdAt: number; lastAt: number | null; expiresAt: number | null;
  revokedAt?: number | null; blockedBy?: "admin" | "suspension" | null;
  /**
   * A link of the person's own account (`self`, or `org-made` on an account the organization doesn't manage) whose
   * account left the organization (ssoClaimsMoved): see staleMovedLink.
   */
  moved?: boolean;
}
export function readIdentity(v: unknown): IdentityDoc | null {
  const d = (v ?? {}) as Record<string, unknown>;
  if (typeof d.uid !== "string" || typeof d.orgId !== "string") return null;
  return {
    uid: d.uid, orgId: d.orgId, connectionId: String(d.connectionId ?? ""), issuer: String(d.issuer ?? ""), subject: String(d.subject ?? ""),
    email: str(d.email, 254), emailVerified: d.emailVerified === true,
    linked: (["jit", "org-made", "self", "admin-map"] as const).includes(d.linked as Linked) ? (d.linked as Linked) : "self",
    state: (["active", "removed", "blocked"] as const).includes(d.state as IdentityState) ? (d.state as IdentityState) : "active",
    pending: d.pending === true, createdAt: num(d.createdAt) ?? 0, lastAt: num(d.lastAt), expiresAt: num(d.expiresAt),
    revokedAt: num(d.revokedAt), blockedBy: d.blockedBy === "admin" || d.blockedBy === "suspension" ? d.blockedBy : null,
    moved: d.moved === true,
  };
}

/** orgs/{orgId}/private/removed's uids: the people this organization removed (removeMember, bulk remove). */
export async function removedUids(orgId: string): Promise<Record<string, unknown>> {
  return ((await db.doc(`orgs/${orgId}/private/removed`).get()).get("uids") as Record<string, unknown> | undefined) ?? {};
}

/**
 * A personal account's link whose account left the organization of its own accord (moved, and not on the removed
 * list): it no longer opens anything and is as good as gone (the person may join afresh, or connect again after
 * coming back). The same link of someone the organization removed is a tombstone that keeps the school's sign-in from
 * making them a new account (`sso-removed`), until an admin lets them back in. Decided at sign-in, not when the
 * account moved, because a bulk removal writes the removed list after the organization change. `moved` is only ever
 * written on a personal account's link (ssoClaimsMoved): the person's own (`self`), or one matched to an account an
 * admin made with the person's own email (`org-made`, not managed).
 */
export const staleMovedLink = (d: IdentityDoc | null, removed: Record<string, unknown>) =>
  !!d && (d.linked === "self" || d.linked === "org-made") && d.moved === true && d.state === "removed" && !Object.hasOwn(removed, d.uid);
/** An identity with its account, as decideSignIn/decideLink read it. */
export async function mappingFacts(doc: IdentityDoc): Promise<MappingFacts> {
  return { uid: doc.uid, linked: doc.linked, state: doc.state, pending: doc.pending === true, createdAt: doc.createdAt, lastAt: doc.lastAt, account: await accountFacts(doc.uid) };
}
/** The account's identities in one organization (or in all of them). */
export async function identitiesOf(uid: string, orgId?: string) {
  let q = db.collection(IDENTITIES).where("uid", "==", uid);
  if (orgId) q = q.where("orgId", "==", orgId);
  return (await q.get()).docs;
}

/** A new account id for a school-made account: 28 letters and digits, the shape Firebase's own ids have (rules build paths with it). */
export function newUid(): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const b = randomBytes(56);
  let out = "";
  // Rejection sampling: 248 is the largest multiple of 62 under 256, so every character is equally likely.
  for (let i = 0; i < b.length && out.length < 28; i++) if (b[i] < 248) out += A[b[i] % 62];
  return out.length === 28 ? out : newUid();
}
/** A connection id: 12 characters, made at a connection's first save (and again for "a different provider"). */
export const newConnectionId = () => randomBytes(9).toString("base64url");

/* ---------- Hooks the rest of the server calls ---------- */

/**
 * writeClaims (billing.ts) saw the account's organization change (or couldn't read what it was): its identities in any
 * organization other than `newOrgId` stop working. One the school made, or matched to a login it manages (`jit`,
 * `admin-map`, `org-made` on a managed account), is marked `removed`, so the school's sign-in neither opens it nor
 * makes a new account for the person until an admin lets them back in. A personal account's link (`self`: the person
 * connected it; `org-made` on an account the organization doesn't manage: an admin typed the person's own email, and
 * the person can leave by themself) is disconnected too, as a `moved` tombstone rather than deleted: whether it still
 * means "removed" depends on the removed list, read at sign-in (staleMovedLink). Deleting it let someone the
 * organization removed straight back in as a new account through the school's sign-in; leaving it a plain tombstone
 * told someone who left by themself that their school removed them. A blocked identity stays blocked, and is marked
 * so that lifting the block (ssoSetBlocked: the organization's suspension ending with the removal, an admin's
 * unblock, a platform admin's restore) leaves it `removed`, never `active` for someone who is no longer a member.
 * Returns how many changed.
 */
export async function ssoClaimsMoved(uid: string, newOrgId: string | null, now = Date.now()): Promise<number> {
  const docs = await identitiesOf(uid);
  let n = 0;
  // Read once, and only for an `org-made` link: whether the organization that matched it manages the login. When that
  // can't be read the link stays a plain tombstone (the side that keeps people out), and the others are still marked.
  let login: { managedBy?: unknown; email?: unknown } | "unread" | null = null;
  const personal = async (orgId: unknown) => {
    login ??= await Promise.all([db.doc(`users/${uid}`).get(), authRecord(uid)])
      .then(([p, r]) => ({ managedBy: p.get("managedBy"), email: r?.email }), () => "unread" as const);
    return login !== "unread" && !isManaged(login, typeof orgId === "string" ? orgId : null, USERNAME_DOMAIN);
  };
  for (const d of docs) {
    const state = d.get("state");
    if (d.get("orgId") === newOrgId || (state !== "active" && state !== "blocked")) continue;
    if (state === "blocked" && d.get("stateBefore") === "removed") continue;
    const linked = d.get("linked");
    const moved = linked === "self" || (linked === "org-made" && (await personal(d.get("orgId"))));
    // A blocked one stays blocked: what changes is what lifting the block will leave (ssoSetBlocked).
    await d.ref.update({ ...(state === "blocked" ? { stateBefore: "removed" } : { state: "removed" }), removedAt: now, ...(moved ? { moved: true } : {}) });
    n++;
  }
  return n;
}

/**
 * A suspension (blocked: true) or its lifting (false): the account's identities in `orgId` (or everywhere, for a
 * platform admin's suspension). Lifting re-opens only what a suspension closed; an admin's own block stays.
 */
export async function ssoSetBlocked(uid: string, blocked: boolean, orgId?: string, by: "suspension" | "admin" = "suspension"): Promise<number> {
  let n = 0;
  for (const d of await identitiesOf(uid, orgId)) {
    const state = d.get("state") ?? "active";
    if (blocked && state !== "blocked") { await d.ref.update({ state: "blocked", blockedBy: by, stateBefore: state }); n++; }
    else if (!blocked && state === "blocked" && (d.get("blockedBy") ?? "suspension") === by) {
      await d.ref.update({ state: d.get("stateBefore") === "removed" ? "removed" : "active", blockedBy: FieldValue.delete(), stateBefore: FieldValue.delete() });
      n++;
    }
  }
  return n;
}

/**
 * The account is being erased (account.wipeAccount). Its identities go, except when someone else deleted it
 * (`keepRemoved`: an organization's or a platform admin's deletion): the school's own ones then stay as `removed`
 * tombstones, so its sign-in doesn't make the person a new account; "Let back in" (manageSso allowBack) clears them.
 */
export async function ssoAccountWiped(uid: string, keepRemoved: boolean, now = Date.now()): Promise<number> {
  let n = 0;
  for (const d of await identitiesOf(uid)) {
    const linked = d.get("linked");
    if (keepRemoved && linked !== "self") await d.ref.update({ state: d.get("state") === "blocked" ? "blocked" : "removed", accountDeleted: true, removedAt: now });
    else await d.ref.delete();
    n++;
  }
  return n;
}

/**
 * An organization is deleted (platform.deleteOrg, before the organization's documents go): its client secret, its
 * identities and its test links are deleted, its slug is kept as a tombstone (a freed slug is never another
 * school's), and the school finder is published again when it was listed.
 */
export async function ssoOrgDeleted(orgId: string): Promise<{ identities: number }> {
  const cfg = await db.doc(configPath(orgId)).get();
  const slug = cfg.get("slug") as string | undefined;
  if (slug) await db.doc(`${SLUGS}/${slug}`).set({ orgId, tombstone: true, at: Date.now() }, { merge: true });
  await db.doc(`${SECRETS}/${orgId}`).delete();
  let identities = 0;
  for (;;) {
    const page = await db.collection(IDENTITIES).where("orgId", "==", orgId).limit(400).get();
    if (page.empty) break;
    const batch = db.batch();
    for (const d of page.docs) batch.delete(d.ref);
    await batch.commit();
    identities += page.size;
    if (page.size < 400) break;
  }
  const tests = await db.collection(TESTS).where("orgId", "==", orgId).get();
  await Promise.all(tests.docs.map((d) => d.ref.delete()));
  await db.doc(healthPath(orgId)).delete();
  await db.doc(configPath(orgId)).delete();
  forgetConfig(orgId);
  if ((cfg.get("listing.state") as string | undefined) === "approved") await writeSsoFile().catch((e) => logger.error("sso: finder not published", { orgId, error: String(e) }));
  return { identities };
}

/**
 * The lock-out guard (design §7): with school sign-in on, an organization keeps at least one admin who can sign in
 * without it (a password or Google login), so a broken provider never locks its admins out. Called before an admin is
 * demoted, removed, moved or suspended (`leavingUid`), and by turnOn (null). Refuses with `sso-last-way-in`.
 */
export async function ssoKeepWayIn(orgId: string, leavingUid: string | null, force = false) {
  if (!orgId) return;
  const org = await db.doc(`orgs/${orgId}`).get();
  if (!force && org.get("sso.on") !== true) return;
  const admins = await db.collection("users").where("orgId", "==", orgId).where("role", "==", "orgAdmin").select("suspended").get();
  for (const a of admins.docs) {
    if (a.id === leavingUid || a.get("suspended")) continue;
    const r = await authRecord(a.id).catch(() => null);
    if (r && !r.disabled && ownLogin(r)) return;
  }
  throw new HttpsError("failed-precondition", "Keep at least one admin who signs in with a password or Google: school sign-in alone could lock this organization out.", { reason: "sso-last-way-in" });
}

/* ---------- The school finder and organization addresses ---------- */

/** What content/sites.json says about an organization's school sign-in: only while it is on. */
export async function ssoSiteEntry(orgId: string, org: { get(f: string): unknown }): Promise<{ slug: string; host: string } | null> {
  if (org.get("sso.on") !== true) return null;
  const { cfg } = await loadConfig(orgId);
  const host = providerHost(cfg);
  return cfg?.status === "on" && cfg.slug && host ? { slug: cfg.slug, host } : null;
}

/**
 * content/sso.json: the school finder on darsiai.org. Only listings a platform admin approved, of organizations that are
 * active with school sign-in on, each with the name, logo and provider host as approved (a snapshot: a later change
 * unlists it, ssoOrgRebranded). Public, re-read by phones at most once a minute.
 */
export async function writeSsoFile(): Promise<{ schools: { slug: string; name: string; logo: string | null; host: string }[] }> {
  const orgs = await db.collection("orgs").where("sso.listed", "==", true).get();
  const schools: { slug: string; name: string; logo: string | null; host: string }[] = [];
  for (const o of orgs.docs) {
    if (o.get("status") !== "active") continue;
    const { cfg } = await loadConfig(o.id, true);
    if (!cfg || cfg.status !== "on" || cfg.listing.state !== "approved" || !cfg.slug || !cfg.listing.name || !cfg.listing.host) continue;
    schools.push({ slug: cfg.slug, name: cfg.listing.name, logo: cfg.listing.logo, host: cfg.listing.host });
  }
  schools.sort((a, b) => a.name.localeCompare(b.name));
  const file = { v: Date.now(), schools };
  await savePublicJson(SSO_FILE, file);
  return file;
}

/** The logo as a data: URL for a listing's snapshot (≤ 100 KB), or null. Never throws. */
export async function logoSnapshot(orgId: string, logo: unknown): Promise<string | null> {
  const path = brandLogoPath(orgId, logo);
  if (!path) return null;
  try {
    const [bytes] = await bucket().file(path).download();
    if (bytes.length > 100_000) return null;
    const ext = path.slice(path.lastIndexOf(".") + 1);
    return `data:${LOGO_TYPES[ext] ?? "image/png"};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch { return null; }
}

/**
 * An organization renamed, re-branded or deleted (sites.onOrgSite): an approved listing shows a name and logo a
 * platform admin saw, so it goes back to "requested" with the new snapshot (unlisted until approved again), and the
 * finder is published again. Organizations without school sign-in cost one field check.
 */
export async function ssoOrgRebranded(orgId: string, before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined) {
  const had = before?.sso as { listed?: unknown } | undefined, has = after?.sso as { listed?: unknown } | undefined;
  if (!had && !has) return;
  if (!after) { if (had?.listed === true) await writeSsoFile(); return; }
  const logoOf = (o: Record<string, unknown> | undefined) => (o?.brand as { logo?: unknown } | null | undefined)?.logo ?? null;
  if (before?.name === after.name && logoOf(before) === logoOf(after)) return;
  const ref = db.doc(configPath(orgId));
  const state = (await ref.get()).get("listing.state");
  if (state !== "approved" && state !== "requested") return;
  await ref.set({ listing: { state: "requested", name: String(after.name ?? "").slice(0, 120), logo: await logoSnapshot(orgId, logoOf(after)), at: Date.now() } }, { merge: true });
  forgetConfig(orgId);
  if (state === "approved") {
    await db.doc(`orgs/${orgId}`).update({ "sso.listed": false });
    await writeSsoFile();
    logger.warn("sso: listing unlisted after a rename or a new logo", { event: "sso-unlisted", orgId });
  }
}

/** One day in ms (identities' expiresAt is lastAt + maxSessionDays days). */
export const sessionEnd = (lastAt: number, days: number) => lastAt + Math.max(1, Math.min(90, days || 30)) * DAY_MS;
