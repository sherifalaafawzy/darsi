/**
 * School sign-in (OpenID Connect; TECHNICAL.md "School sign-in", design v2): an organization signs its people in with
 * its own identity provider (Google Workspace, Microsoft Entra ID, Okta, Keycloak or any OpenID provider), and Darsi
 * turns the verified answer into a Firebase custom token with the claim {sso: orgId}.
 *
 *  - ssoEdge (Hosting rewrite /api/sso/** on darsiai.org and every organization address; no outbound calls):
 *      POST /api/sso/start   {orgId | slug, mode: signin|link|test, challenge, testToken?, signedOutHere?} → {url, flow}
 *      POST /api/sso/finish  {ticket, verifier, confirm?} → {token} | {confirm} | {linked, email} | {tested, …}
 *      GET  /api/sso/school?slug=  → {orgId, slug, name, logo, host, listed, endSession}
 *  - ssoCallback (login.darsiai.org, a Hosting site with no service worker): GET /callback/<orgId>?code&state[&iss][&error].
 *    The only function that calls a provider. It verifies and seals a ticket; it changes no account.
 *  - manageSso (callable): the wizard, the status card and the platform's approvals and switch (actions below).
 *  - ssoJob (daily): sessions that ran out, keys, endpoints that moved, client secrets about to expire, full schools.
 *
 * The rules that keep it safe, in one place (the pure decisions are ssoCore.ts, the crypto ssoCrypto.ts, the network
 * ssoFetch.ts):
 *  - The state is signed, not stored; the callback checks it names the organization in its path before any outbound
 *    call, then spends it once (ssoUsed/{id}, create()).
 *  - The callback hands the page a sealed ticket in the URL fragment of a constant path on the origin the flow
 *    started from, and nothing else: every effect (sign-in, link, test result) happens in finish, after the browser
 *    proved it started the flow (its PKCE verifier) from that origin.
 *  - finish re-checks the switch, the connection and the organization, and the account again just before minting.
 *  - Nothing logs a token, a code, a secret or a provider's answer: only codes from a closed list.
 */
import { randomBytes } from "node:crypto";
import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { defineInt, defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall, onRequest, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { audit, auth, db, freshCaller, str } from "./admin.js";
import { writeClaims } from "./billing.js";
import { clientIp, lastHop } from "./clientIp.js";
import type { Kind } from "./messages.js";
import { sendToUser } from "./notify.js";
import { isId, isManaged } from "./orgMembersCore.js";
import { USERNAME_DOMAINS } from "./passwords.js";
import { SETTINGS, writeSettingsFile } from "./settings.js";
import { checkSiteHost } from "./shared/sites.js";
import { writeSitesFile } from "./sites.js";
import { hasAccess, readSiteDoc } from "./sitesCore.js";
import {
  acceptedIssuers, buildAuthorizationUrl, callbackUrl, checkDiscovery, checkIdentity, decideLink, decideSignIn, defaultCeiling, endpointsMoved,
  flowOf, hdHint, identityId, jitCount, jitKey, jitStale, promptFor, providerKind, readClaims, returnUrl, slugify, testOutcome, tokenHost,
  validateConfig, type AccountFacts, type DiscoveryCheck, type Identity, type SignInDecision, type SignInInputs, type SsoFields, type SsoRefusal,
} from "./ssoCore.js";
import {
  openSecret, openState, openTicket, parseKeyRing, providerNonce, providerPkce, resealSecret, sealSecret, sealTicket, isChallenge, isVerifier,
  keyCanary, newState, verifierMatches, type KeyRing, type SecretBinding, type SecretSlot, type SsoMode, SSO_MODES, LINK_CONFIRM_TTL_MS, TICKET_TTL_MS,
} from "./ssoCrypto.js";
import { createBudget, fetchDiscovery, hintFor, IdTokenError, resetFetchState, resetJwksCache, SsoFetchError, tokenRequest, verifyIdToken } from "./ssoFetch.js";
import { constantEndpoints } from "./ssoProviders.js";
import {
  accountFacts, alreadyExists, authRecord, configPath, connForRev, forgetConfig, healthPath, IDENTITIES, identitiesOf, loadConfig, mappingFacts, newConnectionId,
  newUid, noteProblem, ownLogin, providerHost, readConfig, readIdentity, removedUids, resetNoted, SECRETS, sessionEnd, SLUGS, ssoKeepWayIn, ssoOnlyAccount, ssoSetBlocked, staleMovedLink,
  ssoSwitchOn, TESTS, USED, writeSsoFile, logoSnapshot, type Conn, type IdentityDoc, type LastTest, type SsoConfig,
} from "./ssoStore.js";

/* ---------- Settings ---------- */

/** {"current":"k1","keys":{"k1":"<32 bytes base64>"}}: every key exactly 32 bytes, or the feature stays closed (sso-key). */
export const SSO_KEYS = defineSecret("SSO_KEYS");
/** The redirect URI's base; each organization registers SSO_CALLBACK/<orgId>. Locally the functions emulator's address. */
const SSO_CALLBACK = defineString("SSO_CALLBACK", { default: "https://login.darsiai.org/callback" });
const SITE = defineString("SITE_URL", { default: "https://darsiai.org" });
/** The service account the four functions run as (docs/FIREBASE.md). Empty: the project's default one (local runs). */
const SSO_SA = defineString("SSO_SERVICE_ACCOUNT", { default: "" });
/** Warm callback instances, for a school day's first sign-ins (0 by default: nothing paid while nobody signs in). */
const SSO_MIN = defineInt("SSO_CALLBACK_MIN_INSTANCES", { default: 0 });
/** The option is left out when the param is empty (it is read from the environment when the CLI loads this file). */
const runAs = process.env.SSO_SERVICE_ACCOUNT ? { serviceAccount: SSO_SA } : {};

const emu = () => process.env.FUNCTIONS_EMULATOR === "true";
/** A string param's value is "" until the CLI has put its default in the environment: the default again here. */
const callbackBase = () => SSO_CALLBACK.value() || "https://login.darsiai.org/callback";
const siteOrigin = () => { try { return new URL(SITE.value()).origin; } catch { return "https://darsiai.org"; } };
/** Darsi's own origins: the configured site and darsiai.org itself (never *.web.app: a ticket goes only to the real address). */
const darsiOrigin = (o: string) => o === siteOrigin() || o === "https://darsiai.org" || o === "https://www.darsiai.org";

let ringCache: { raw: string; ring: KeyRing | null } | null = null;
/** The key ring from SSO_KEYS, or null when it doesn't parse (the feature is then closed: sso-key). */
export function keyRing(): KeyRing | null {
  let raw = "";
  try { raw = SSO_KEYS.value() ?? ""; } catch { raw = ""; }
  if (ringCache?.raw === raw) return ringCache.ring;
  const p = parseKeyRing(raw);
  ringCache = { raw, ring: p.ok ? p.ring : null };
  return ringCache.ring;
}

/* ---------- Refusals and HTTP ---------- */

/** A refusal from the closed list (ssoCore.SSO_REFUSALS), with optional details for the screens (never secrets). */
export class Refuse extends Error {
  constructor(readonly code: SsoRefusal, readonly extra: Record<string, unknown> = {}) { super(code); this.name = "Refuse"; }
}
const HTTP_STATUS: Partial<Record<SsoRefusal, number>> = {
  "sso-off": 503, "sso-key": 503, "sso-signer": 503, "sso-no-school": 404, "sso-state": 400, "sso-fields": 400, "sso-rate": 429, "sso-full": 429, "sso-recent": 401,
};

type Headers = Record<string, string | string[] | undefined>;
interface Req { method?: string; path?: string; headers: Headers; query?: Record<string, unknown>; rawBody?: Buffer; ip?: string }
interface Res { status(c: number): Res; set(k: string, v: string): Res; json(b: unknown): unknown; send(b: string): unknown; end(): unknown }
const header = (req: Req, k: string) => { const v = req.headers?.[k]; return String((Array.isArray(v) ? v[0] : v) ?? "").trim(); };

/** Every answer: never cached, never framed, no referrer (the callback's address carries the provider's code). */
function secure(res: Res) {
  res.set("Cache-Control", "no-store").set("X-Content-Type-Options", "nosniff").set("Referrer-Policy", "no-referrer").set("X-Frame-Options", "DENY")
    .set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
    .set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
}
const refuseHttp = (res: Res, r: Refuse) => { res.status(HTTP_STATUS[r.code] ?? 403).json({ error: r.code, ...r.extra }); };
/** An error's kind for the log: its code or name, never its message (a provider's or a token's words could be in it). */
const kindOf = (e: unknown) => String((e as { code?: unknown } | null)?.code ?? (e as { name?: unknown } | null)?.name ?? "error").slice(0, 60);
const isAuthCode = (e: unknown, code: string) => (e as { code?: unknown } | null)?.code === code || String(e).includes(code);

/** One fixed window per key; the map is pruned when it grows (made-up keys can't fill memory). */
function windowLimiter(max: number, windowMs: number) {
  type Hit = { start: number; n: number };
  const hits = new Map<string, Hit>();
  const at = (key: string, now: number): Hit => {
    let h = hits.get(key);
    if (!h || now - h.start >= windowMs) { h = { start: now, n: 0 }; hits.set(key, h); }
    if (hits.size > 50_000) { for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k); if (hits.size > 50_000) hits.clear(); }
    return h;
  };
  const over = (key: string, now = Date.now()) => ++at(key, now).n > max;
  return Object.assign(over, {
    reset: () => hits.clear(),
    /** A place in the key's window, or null when it is used up (nothing is counted then). `back` gives the place back. */
    take: (key: string, now = Date.now()): { back(): void } | null => {
      const h = at(key, now);
      if (h.n >= max) return null;
      h.n++;
      return { back: () => { if (h.n > 0) h.n--; } };
    },
  });
}
/** Design §4: sign-in starts per (address, organization) 300 per 10 minutes; link and test per account (or test link) 20. */
// finish has no limit of its own: it needs a sealed ticket from a verified callback and the browser's 256-bit verifier,
// and a school behind one address signs hundreds of people in at once at the start of a day.
// The school lookup (GET /api/sso/school: every open of /signin?school=<slug> makes one) is counted per address only,
// 3,000 per 10 minutes: a whole school behind one address opens that page in the same few minutes, a lookup is at
// most four reads, and it says only what the link already names.
export const SCHOOL_MAX = 3000;
const signinLimit = windowLimiter(300, 600_000), userLimit = windowLimiter(20, 600_000), schoolLimit = windowLimiter(SCHOOL_MAX, 600_000);
/**
 * The address above is `fastly-client-ip` when a request carries one, and on the function's own URL the caller writes
 * it (clientIp.ts): a new one with every request would make each a new address. So sign-in starts are also counted
 * per (hop, organization), 30,000 per 10 minutes: the hop is whoever connected to Google's front end (`lastHop`), the
 * caller themself on the function's URL and Hosting's CDN node through Hosting. Not per organization alone: a cap
 * everyone shares is one anyone could use up to keep a school out.
 *
 * Through Hosting the hop is a CDN node, which a school and everyone else who arrives through it share. So this is a
 * ceiling on one connection's flood (50 starts a second, per instance), sized above a large school's own morning, and
 * not a limit per person: at 1,500 a school's own starts through one node used it up, and so could one caller for it.
 * A start writes nothing, so the ceiling can be this high.
 */
export const SIGNIN_HOP_MAX = 30_000;
const hopLimit = windowLimiter(SIGNIN_HOP_MAX, 600_000);
/**
 * Callbacks that proved nothing, per minute: a state costs nothing to get (start writes nothing), and each one is good
 * for a write (ssoUsed) and a token request that carries the school's client secret to its provider. So a callback
 * takes a place before it spends its state, per (hop, organization) and per (address, organization), and gives it back
 * once the provider exchanged its code, or when Darsi's own brakes turned the request away (busy, breaker, budget:
 * nothing reached the provider). One that ends any other way (a code the provider refuses, a replayed state, the
 * provider's own error) keeps its place for the minute. With no place left a callback is answered `sso-provider`
 * (`busy`) before anything is written or sent, its state unspent: the person's own answer still works a minute later.
 *
 * The numbers are ceilings, not limits per person. Through Hosting the hop is a CDN node the whole school shares, and
 * a school behind one address shares that too: its own cancelled, unassigned and reloaded sign-ins keep their places.
 * 300 a minute per hop and 120 per address stay above that at a university's scale. One caller on the function's own
 * URL is still held to 300 junk callbacks a minute per instance, and using a school's places up through Hosting takes
 * five junk callbacks a second at each node.
 */
// ssoCallback's concurrency is 40: answers under way at once can never use either up by themselves.
export const UNPROVEN = { hop: 300, address: 120, windowMs: 60_000 };
const unprovenByHop = windowLimiter(UNPROVEN.hop, UNPROVEN.windowMs), unprovenByAddress = windowLimiter(UNPROVEN.address, UNPROVEN.windowMs);
function takeUnproven(req: Req, orgId: string, now: number): { back(): void } | null {
  const from = String(req.ip ?? "?");
  const hop = unprovenByHop.take(`${lastHop(req.headers ?? {}, from)}|${orgId}`, now);
  if (!hop) return null;
  const address = unprovenByAddress.take(`${clientIp(req.headers ?? {}, from)}|${orgId}`, now);
  if (!address) { hop.back(); return null; }
  let given = false;
  return { back: () => { if (!given) { given = true; hop.back(); address.back(); } } };
}
/** Darsi's own brakes (ssoFetch): the request never reached the provider, so it says nothing about the callback. */
const ownBrake = (e: unknown) => e instanceof SsoFetchError && (e.code === "busy" || e.code === "breaker" || e.code === "budget");

/** Tests: forget the instance's limits, caches and breakers. */
export function resetSsoState() {
  for (const l of [signinLimit, userLimit, schoolLimit, hopLimit, unprovenByHop, unprovenByAddress]) l.reset();
  forgetConfig(); resetNoted(); resetFetchState(); resetJwksCache(); ringCache = null;
}

/** The request's origin: the Origin header, or https:// and the host Hosting forwarded (the allow-list decides, not the header). */
function requestOrigin(req: Req): string | null {
  const o = header(req, "origin");
  if (o) return o === "null" ? null : o;
  const h = header(req, "x-forwarded-host");
  return h ? `https://${h}` : null;
}
/**
 * The origin a ticket may go back to (design §4 start): Darsi's own, this organization's own address while it has
 * sign-in (sites/{host}, hasAccess, the same organization), or in the emulator a loopback page. null otherwise.
 */
async function returnOriginFor(origin: string | null, orgId: string): Promise<string | null> {
  if (!origin) return null;
  let u: URL;
  try { u = new URL(origin); } catch { return null; }
  if (u.origin !== origin) return null;
  if (darsiOrigin(origin)) return origin;
  if (emu() && u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return origin;
  if (u.protocol !== "https:" || u.port) return null;
  const checked = checkSiteHost(u.hostname);
  if ("problem" in checked || !checked.host) return null;
  const site = readSiteDoc(checked.host, (await db.doc(`sites/${checked.host}`).get()).data());
  return site && hasAccess(site) && site.orgId === orgId ? origin : null;
}

function parseBody(req: Req): Record<string, unknown> {
  const raw = req.rawBody;
  if (!raw || raw.length > 16_384) throw new Refuse("sso-fields");
  try {
    const v = JSON.parse(raw.toString("utf8"));
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("shape");
    return v as Record<string, unknown>;
  } catch { throw new Refuse("sso-fields"); }
}

async function bearer(req: Req): Promise<{ uid: string; auth_time?: number; role?: unknown; orgId?: unknown } | null> {
  const h = header(req, "authorization");
  if (!h.startsWith("Bearer ") || h.length > 8192) return null;
  return auth.verifyIdToken(h.slice(7), true).then((d) => d as unknown as { uid: string; auth_time?: number }, () => null);
}

const RECENT_S = 600;
const recent = (authTime: unknown, now: number) => typeof authTime === "number" && now / 1000 - authTime <= RECENT_S;

/* ---------- ssoEdge: start, finish, school ---------- */

export const ssoEdge = onRequest({ concurrency: 80, maxInstances: 20, memory: "256MiB", timeoutSeconds: 60, secrets: [SSO_KEYS], ...runAs },
  (req, res) => edge(req as unknown as Req, res as unknown as Res));

export async function edge(req: Req, res: Res) {
  secure(res);
  // Through Hosting every call is same-origin; only the emulator is called from another origin (no CORS live).
  if (emu()) {
    const o = header(req, "origin");
    if (o) res.set("Access-Control-Allow-Origin", o).set("Vary", "Origin");
    if (req.method === "OPTIONS") { res.set("Access-Control-Allow-Methods", "GET, POST").set("Access-Control-Allow-Headers", "Content-Type, Authorization").status(204).end(); return; }
  }
  const path = String(req.path ?? "").replace(/^\/api\/sso(?=\/|$)/, "") || "/";
  try {
    if (path === "/school") {
      if (req.method !== "GET") { res.status(405).end(); return; }
      await school(req, res);
      return;
    }
    if (req.method !== "POST") { res.status(405).end(); return; }
    const ring = keyRing();
    if (!ring) throw new Refuse("sso-key");
    const body = parseBody(req);
    if (path === "/start") { await start(req, res, ring, body); return; }
    if (path === "/finish") { await finish(req, res, ring, body); return; }
    res.status(404).json({ error: "sso-no-school" });
  } catch (e) {
    if (e instanceof Refuse) { refuseHttp(res, e); return; }
    logger.error("sso: edge failed", { path, error: kindOf(e) });
    res.status(500).json({ error: "sso-state" });
  }
}

/** The organization a student's test link (manageSso testLink) is for while it is still good: made, not used, not expired. "" otherwise. */
async function testLinkOrg(token: unknown, now: number): Promise<string> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) return "";
  const t = await db.doc(`${TESTS}/${token}`).get();
  const exp = t.get("expireAt") as { toMillis?: () => number } | number | undefined;
  const expMs = typeof exp === "number" ? exp : exp?.toMillis?.() ?? 0;
  const orgId = t.get("orgId") as unknown;
  return t.exists && typeof orgId === "string" && expMs > now ? orgId : "";
}

/**
 * GET /api/sso/school?slug=[&try=]: what the sign-in screen shows for /signin?school=<slug>. Unknown and off answer alike.
 *
 * `try` is a student's test link (/signin?school=<slug>&try=<token>). The wizard's Test step comes before Turn on, so
 * the link has to name the school while its sign-in isn't on yet: a link that is still good, for this school, is
 * answered with the connection under test (never cached: the answer ends when the link is used). Any other `try` is
 * answered as start would answer it (sso-state), whatever the slug, so a link says nothing about a school it wasn't
 * made for, and a used link says so on the page instead of offering a button that can only fail.
 */
async function school(req: Req, res: Res) {
  const slug = String(req.query?.slug ?? ""), tok = req.query?.try;
  if (schoolLimit(clientIp(req.headers, String(req.ip ?? "?")))) throw new Refuse("sso-rate");
  const none = new Refuse("sso-no-school");
  const testOrg = tok === undefined || tok === "" ? "" : await testLinkOrg(tok, Date.now());
  if (tok !== undefined && tok !== "" && !testOrg) throw new Refuse("sso-state");
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) throw none;
  const s = await db.doc(`${SLUGS}/${slug}`).get();
  const orgId = s.get("orgId") as string | undefined;
  if (!s.exists || s.get("tombstone") === true || !orgId || !isId(orgId)) throw none;
  if (testOrg && testOrg !== orgId) throw none;
  const [org, on, { cfg }] = await Promise.all([db.doc(`orgs/${orgId}`).get(), ssoSwitchOn(), loadConfig(orgId, !!testOrg)]);
  if (!on || !org.exists || org.get("status") !== "active" || !cfg || cfg.slug !== slug || (cfg.status !== "on" && !testOrg)) throw none;
  const conn = testOrg ? testConn(cfg) : cfg;
  const listed = cfg.listing.state === "approved";
  res.set("Cache-Control", testOrg ? "no-store" : "private, max-age=60");
  res.json({
    orgId, slug, name: listed && cfg.listing.name ? cfg.listing.name : str(org.get("name"), 120), logo: listed ? cfg.listing.logo : null,
    host: providerHost(conn), listed, endSession: conn.endpoints.endSession ?? null,
  });
}

/** The connection a test runs against: the edit under `next` while the live one is on, else the top-level one. */
const testConn = (cfg: SsoConfig): Conn => (cfg.status === "on" && cfg.next ? cfg.next : cfg);

/** Who may run a test with their own sign-in (start, and finish again): this organization's admin, not frozen, or a platform admin. Auth's word, now. */
async function mayTest(uid: string, orgId: string): Promise<boolean> {
  const r = await authRecord(uid);
  const c = r?.customClaims ?? {};
  const own = c.role === "orgAdmin" && c.orgId === orgId && c.frozen !== true;
  return !!r && !r.disabled && (c.role === "superadmin" || own);
}

/** POST /api/sso/start (design §4). Writes nothing: the state is signed. */
async function start(req: Req, res: Res, ring: KeyRing, body: Record<string, unknown>) {
  const now = Date.now();
  const mode = body.mode as SsoMode;
  if (!SSO_MODES.includes(mode)) throw new Refuse("sso-fields");
  if (!isChallenge(body.challenge)) throw new Refuse("sso-state");
  let orgId = typeof body.orgId === "string" && isId(body.orgId) ? body.orgId : "";
  if (!orgId && typeof body.slug === "string" && /^[a-z0-9-]{1,60}$/.test(body.slug)) {
    const s = await db.doc(`${SLUGS}/${body.slug}`).get();
    if (s.exists && s.get("tombstone") !== true && typeof s.get("orgId") === "string") orgId = s.get("orgId") as string;
  }
  if (!orgId) throw new Refuse("sso-no-school");
  // A sign-in start's limits come before anything is read for it (the slug above is the one read that names the school).
  if (mode === "signin") {
    const from = String(req.ip ?? "?");
    const byAddress = signinLimit(`${clientIp(req.headers, from)}|${orgId}`, now), byHop = hopLimit(`${lastHop(req.headers, from)}|${orgId}`, now);
    if (byAddress || byHop) throw new Refuse("sso-rate");
  }
  if (!(await ssoSwitchOn())) throw new Refuse("sso-off");
  const [org, { cfg }] = await Promise.all([db.doc(`orgs/${orgId}`).get(), loadConfig(orgId)]);
  if (!org.exists || !cfg) throw new Refuse("sso-no-school");
  if (org.get("status") !== "active") throw new Refuse("sso-org-inactive");
  const returnOrigin = await returnOriginFor(requestOrigin(req), orgId);
  if (!returnOrigin) throw new Refuse("sso-origin");

  let uid: string | undefined, test: { token?: string; uid?: string } | undefined;
  let conn: Conn = cfg;
  if (mode === "signin") {
    if (cfg.status !== "on") throw new Refuse("sso-no-school");
  } else if (mode === "link") {
    if (cfg.status !== "on") throw new Refuse("sso-no-school");
    const who = await bearer(req);
    if (!who) throw new Refuse("sso-recent");
    if (userLimit(`u|${who.uid}`, now)) throw new Refuse("sso-rate");
    const a = await accountFacts(who.uid);
    if (a.claims?.role === "superadmin" || a.profile?.role === "superadmin") throw new Refuse("sso-staff");
    if (a.claims?.orgId !== orgId || a.profile?.orgId !== orgId) throw new Refuse("sso-other-org");
    if (!recent(who.auth_time, now)) throw new Refuse("sso-recent");
    uid = who.uid;
  } else {
    conn = testConn(cfg);
    if (!conn.hasSecret) throw new Refuse("sso-secret");
    if (typeof body.testToken === "string" && body.testToken) {
      // A student's test (design §8 step 4): the one-time link is the permission; no sign-in needed.
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(body.testToken)) throw new Refuse("sso-state");
      if (userLimit(`t|${body.testToken}`, now)) throw new Refuse("sso-rate");
      if ((await testLinkOrg(body.testToken, now)) !== orgId) throw new Refuse("sso-state");
      test = { token: body.testToken };
    } else {
      const who = await bearer(req);
      if (!who) throw new Refuse("sso-recent");
      if (userLimit(`u|${who.uid}`, now)) throw new Refuse("sso-rate");
      if (!(await mayTest(who.uid, orgId))) throw new Refuse("sso-other-org");
      test = { uid: who.uid };
    }
  }
  const rev = conn.configRev;
  const kind = providerKind(conn.issuer, emu());
  const prompt = promptFor({ mode, kind, personalDevices: conn.personalDevices, signedOutHere: body.signedOutHere === true });
  const { state, id, kid } = newState(ring, { orgId, mode, ...(uid ? { uid } : {}), challenge: body.challenge as string, returnOrigin, rev, ...(test ? { test } : {}) }, now);
  const url = buildAuthorizationUrl({
    authorization: conn.endpoints.authorization, clientId: conn.clientId, redirectUri: callbackUrl(callbackBase(), orgId), scopes: conn.scopes,
    state, nonce: providerNonce(ring, kid, id), challenge: providerPkce(ring, kid, id).challenge, kind, prompt: prompt.prompt, maxAge0: prompt.maxAge0,
    hd: kind === "google" ? hdHint(conn.allowedDomains) : null,
  });
  res.json({ url, flow: flowOf(id) });
}

/* ---------- ssoCallback ---------- */

export const ssoCallback = onRequest({ concurrency: 40, maxInstances: 30, timeoutSeconds: 30, memory: "512MiB", minInstances: SSO_MIN, secrets: [SSO_KEYS], ...runAs },
  (req, res) => callback(req as unknown as Req, res as unknown as Res));

/** A page for the few cases with nowhere safe to send the person (a state that isn't ours): bilingual, no script. */
function page(res: Res, status: number) {
  const site = siteOrigin();
  res.status(status).set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Darsi sign-in</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.6">
<p>This sign-in link has expired or isn't valid. Go back to Darsi and start again.</p>
<p lang="ar" dir="rtl">انتهت صلاحية رابط تسجيل الدخول هذا أو أنه غير صالح. ارجع إلى «درسي» وابدأ من جديد.</p>
<p><a href="${site}">${site}</a></p></body></html>`);
}

interface TicketIdentity extends Identity { connectionId: string; issuer: string }
interface Ticket { orgId: string; mode: SsoMode; uid?: string; challenge: string; returnOrigin: string; rev: number; test?: { token?: string; uid?: string }; identity: TicketIdentity }
interface StateLike { id: string; orgId: string; mode: SsoMode; uid?: string; challenge: string; returnOrigin: string; rev: number; exp: number; test?: { token?: string; uid?: string } }

/** A provider's error code as the fragment may carry it (letters and underscores, ≤ 40). */
const providerCode = (v: unknown) => (typeof v === "string" && /^[a-z_]{1,40}$/.test(v) ? v : "provider");

export async function callback(req: Req, res: Res) {
  secure(res);
  if (req.method !== "GET") { res.status(405).end(); return; }
  const m = /^\/callback\/([A-Za-z0-9_-]{1,128})\/?$/.exec(String(req.path ?? ""));
  if (!m) { page(res, 404); return; }
  const pathOrg = m[1];
  const ring = keyRing();
  if (!ring) { page(res, 503); return; }
  const q = req.query ?? {};
  const now = Date.now();
  const opened = openState(ring, q.state, now);
  if (!opened.ok && opened.code === "bad") { page(res, 400); return; }
  const s = opened.state as StateLike;

  /** Back to the page the flow started on, with an error or the ticket (design §4: a constant path per mode). */
  const back = async (out: { error: SsoRefusal; detail?: string } | { ticket: string }) => {
    let origin = s.returnOrigin;
    // An organization address may have lost its access (or changed hands) since the start: Darsi's own site instead.
    if (!darsiOrigin(origin) && (await returnOriginFor(origin, s.orgId)) !== origin) origin = siteOrigin();
    // A test goes back to whoever ran it: a student's (a test link, no sign-in) to /signin, an admin's own to the wizard.
    const studentTest = s.mode === "test" && !s.test?.uid && !!s.test?.token;
    const platformAdmin = s.mode === "test" && !!s.test?.uid && (await authRecord(s.test.uid).catch(() => null))?.customClaims?.role === "superadmin";
    const url = returnUrl({ returnOrigin: origin, mode: s.mode, orgId: s.orgId, platformAdmin, studentTest, flow: flowOfState(s), ...out });
    if (!url) { page(res, 400); return; }
    res.status(303).set("Location", url).end();
  };
  const fail = async (error: SsoRefusal, detail?: string) => {
    if (s.mode === "test" && opened.ok) await recordTestFailure(s, error, detail, now);
    await back({ error, ...(detail ? { detail } : {}) });
  };

  if (!opened.ok) { await back({ error: "sso-state" }); return; }
  // Organization A's state at /callback/B is refused before anything leaves Darsi (the per-organization redirect URI).
  if (s.orgId !== pathOrg) { await back({ error: "sso-state" }); return; }
  // A place among the callbacks that proved nothing yet (takeUnproven), before the state is spent or anything is sent.
  const place = takeUnproven(req, s.orgId, now);
  if (!place) { await back({ error: "sso-provider", detail: "busy" }); return; }
  try {
    await db.doc(`${USED}/${s.id}`).create({ expireAt: Timestamp.fromMillis(s.exp + 3600_000) });
  } catch (e) {
    if (alreadyExists(e)) { await back({ error: "sso-state" }); return; }
    throw e;
  }
  if (typeof q.error === "string") { await fail("sso-provider", providerCode(q.error)); return; }
  if (!(await ssoSwitchOn())) { await fail("sso-off"); return; }
  const org = await db.doc(`orgs/${s.orgId}`).get();
  if (org.get("status") !== "active") { await fail("sso-org-inactive"); return; }
  let { cfg } = await loadConfig(s.orgId);
  let found = connForRev(cfg, s.rev, s.mode);
  if (!found) { ({ cfg } = await loadConfig(s.orgId, true)); found = connForRev(cfg, s.rev, s.mode); }
  if (!found) { await fail("sso-state"); return; }
  const { conn, slot } = found;
  if (conn.issParam && (typeof q.iss !== "string" || !acceptedIssuers(conn.issuer, emu()).includes(q.iss))) { await fail("sso-issuer"); return; }
  const code = q.code;
  if (typeof code !== "string" || !code || code.length > 4096) { await fail("sso-provider", "no_code"); return; }

  // The client secret, only for the issuer, token host and client it was saved for (design §2).
  const binding: SecretBinding = { orgId: s.orgId, slot, issuer: conn.issuer, tokenHost: tokenHost(conn.endpoints), clientId: conn.clientId };
  const stored = (await db.doc(`${SECRETS}/${s.orgId}`).get()).get(slot);
  if (!stored) { await fail("sso-secret"); return; }
  const secret = openSecret(ring, stored, binding);
  if (!secret.ok) {
    if (secret.code === "key") { await noteProblem(s.orgId, "secret-key"); await fail("sso-key"); return; }
    // The connection above may be up to a minute old (loadConfig's cache), the secret is read now: after an edit was
    // promoted with another issuer, client or token host, an older flow finds the new secret under the old binding.
    // That is a flow that expired, not a mismatch: only a connection that still is this one, read afresh, goes back to
    // draft. Every save and every promotion changes the rev, so a callback behind the cache changes nothing.
    const again = connForRev((await loadConfig(s.orgId, true)).cfg, s.rev, s.mode);
    if (!again || again.slot !== slot || again.conn.issuer !== conn.issuer || again.conn.clientId !== conn.clientId || tokenHost(again.conn.endpoints) !== binding.tokenHost) {
      await fail("sso-state");
      return;
    }
    await secretMismatch(s.orgId, slot);
    await fail("sso-secret");
    return;
  }

  const budget = createBudget(), fetch = { orgId: s.orgId, budget };
  const pkce = providerPkce(ring, opened.kid, s.id);
  const redirectUri = callbackUrl(callbackBase(), s.orgId);
  const ask = (authMethod: "basic" | "post") => tokenRequest({ endpoint: conn.endpoints.token, clientId: conn.clientId, clientSecret: secret.secret, authMethod, code, redirectUri, codeVerifier: pkce.verifier }, fetch);
  let idToken: string;
  try {
    idToken = (await ask(conn.authMethod)).idToken;
  } catch (e) {
    const err = e instanceof SsoFetchError ? e : null;
    // Secrets with characters Basic would have to encode fail on providers that don't decode it: a test tries `post` once.
    if (s.mode === "test" && conn.authMethod === "basic" && err?.oauth?.error === "invalid_client") {
      try {
        idToken = (await ask("post")).idToken;
        await db.doc(configPath(s.orgId)).set(slot === "next" ? { next: { authMethod: "post" } } : { authMethod: "post" }, { merge: true });
        forgetConfig(s.orgId);
      } catch (e2) { if (ownBrake(e2)) place.back(); await tokenFailed(s.orgId, e2); await fail("sso-provider", providerCode((e2 as SsoFetchError).oauth?.error ?? (e2 as SsoFetchError).code)); return; }
    } else { if (ownBrake(e)) place.back(); await tokenFailed(s.orgId, e); await fail("sso-provider", providerCode(err?.oauth?.error ?? err?.code)); return; }
  }
  // The provider exchanged the code: this callback is someone's real answer, whatever the token then says.
  place.back();
  let payload: Record<string, unknown>;
  try {
    payload = (await verifyIdToken(idToken, { issuer: acceptedIssuers(conn.issuer, emu()), clientId: conn.clientId, jwksUrl: conn.endpoints.jwks, nonce: providerNonce(ring, opened.kid, s.id), fetch })).payload as Record<string, unknown>;
  } catch (e) {
    const why = e instanceof IdTokenError ? e.code : "malformed";
    await noteProblem(s.orgId, `id-token-${why}`);
    logger.warn("sso: ID token refused", { orgId: s.orgId, why });
    await fail(why === "jwks" ? "sso-provider" : why === "iss" ? "sso-issuer" : "sso-token", why);
    return;
  }
  const identity = readClaims(conn, payload, emu());
  const ok = checkIdentity(conn, identity, emu());
  if (!ok.ok) { await fail(ok.code); return; }
  const ticket = sealTicket<Ticket>(ring, {
    orgId: s.orgId, mode: s.mode, ...(s.uid ? { uid: s.uid } : {}), challenge: s.challenge, returnOrigin: s.returnOrigin, rev: s.rev, ...(s.test ? { test: s.test } : {}),
    identity: { ...identity, connectionId: conn.connectionId, issuer: conn.issuer },
  }, now);
  await back({ ticket });
}
const flowOfState = (s: StateLike) => flowOf(s.id);

async function tokenFailed(orgId: string, e: unknown) {
  const err = e instanceof SsoFetchError ? e : null;
  await noteProblem(orgId, `token-${err?.code ?? "error"}`, err ? (err.oauth?.error ?? hintFor(err.code)) : null);
  logger.warn("sso: token request failed", { orgId, code: err?.code ?? kindOf(e), oauth: err?.oauth?.error ?? null });
}

/** The stored secret no longer matches where it would be sent: nothing is sent, the connection needs its secret again (design §2). */
async function secretMismatch(orgId: string, slot: SecretSlot) {
  await noteProblem(orgId, "secret-mismatch");
  logger.error("sso: client secret binding mismatch; the connection was taken back to draft", { event: "sso-secret-mismatch", orgId, slot });
  if (slot === "next") {
    await db.doc(configPath(orgId)).set({ next: { hasSecret: false } }, { merge: true });
    await db.doc(`${SECRETS}/${orgId}`).set({ next: FieldValue.delete() }, { merge: true });
  } else {
    await db.doc(configPath(orgId)).set({ status: "draft", hasSecret: false }, { merge: true });
    await db.doc(`${SECRETS}/${orgId}`).set({ live: FieldValue.delete() }, { merge: true });
    await db.doc(`orgs/${orgId}`).set({ sso: { on: false } }, { merge: true });
  }
  forgetConfig(orgId);
}

/** A test that failed at the callback: the wizard (and the admin who sent a student a test link) sees why. */
async function recordTestFailure(s: StateLike, error: SsoRefusal, detail: string | undefined, now: number) {
  const lastTest: LastTest = {
    at: now, ok: false, by: s.test?.uid ?? null, asStudent: !!s.test?.token, decision: `refuse:${error}`, rev: s.rev, error: detail ?? error,
    claimsSeen: [], ruleValues: [], email: null, name: null, emailVerified: false, teacher: null, cls: null,
  };
  await db.doc(configPath(s.orgId)).set({ lastTest }, { merge: true }).catch((e) => logger.warn("sso: test result not recorded", { orgId: s.orgId, error: kindOf(e) }));
  forgetConfig(s.orgId);
}

/* ---------- finish ---------- */

/** POST /api/sso/finish (design §4): every effect of a flow happens here, after the browser proved itself. */
async function finish(req: Req, res: Res, ring: KeyRing, body: Record<string, unknown>) {
  const now = Date.now();
  // The verifier's shape first: an empty, "null" or missing one is refused before the ticket is even opened.
  if (!isVerifier(body.verifier)) throw new Refuse("sso-state");
  const opened = openTicket<Ticket>(ring, body.ticket, now, body.confirm === true ? LINK_CONFIRM_TTL_MS - TICKET_TTL_MS : 0);
  if (!opened.ok) throw new Refuse("sso-state");
  const t = opened.data;
  // Past its two minutes a ticket is good for one thing: the answer to a link's confirmation question (the page sends
  // the same ticket again with `confirm`, once the person has read it), up to ten minutes after the callback.
  if (now >= t.exp && t.mode !== "link") throw new Refuse("sso-state");
  if (!verifierMatches(body.verifier, t.challenge)) throw new Refuse("sso-state");
  if (requestOrigin(req) !== t.returnOrigin) throw new Refuse("sso-origin");
  if (!(await ssoSwitchOn())) throw new Refuse("sso-off");
  const org = await db.doc(`orgs/${t.orgId}`).get();
  if (org.get("status") !== "active") throw new Refuse("sso-org-inactive");
  const { cfg } = await loadConfig(t.orgId, true);
  const found = connForRev(cfg, t.rev, t.mode);
  if (!found || found.conn.connectionId !== t.identity.connectionId) throw new Refuse("sso-state");
  const { conn } = found;
  if (t.mode === "test") { res.json(await finishTest(req, t, cfg!, now)); return; }
  if (t.mode === "link") { res.json(await finishLink(req, t, conn, str(org.get("name"), 120), body.confirm === true, now)); return; }
  const uid = await signIn(t.orgId, conn, t.identity, now);
  res.json({ token: await mint(uid, t.orgId) });
}

/** Just before minting (design §4): the account exists, isn't disabled, is this organization's in claims and profile, isn't a platform admin. */
async function mint(uid: string, orgId: string): Promise<string> {
  const a = await accountFacts(uid);
  if (!a.authExists || a.disabled) throw new Refuse("sso-disabled");
  if (a.claims?.role === "superadmin" || a.profile?.role === "superadmin") throw new Refuse("sso-staff");
  if (a.claims?.orgId !== orgId || a.profile?.orgId !== orgId) throw new Refuse("sso-other-org");
  try {
    return await auth.createCustomToken(uid, { sso: orgId });
  } catch (e) {
    logger.error("sso: custom token not made (signer)", { event: "sso-signer", orgId, error: kindOf(e) });
    throw new Refuse("sso-signer");
  }
}

interface Gathered { ref: DocumentReference; doc: IdentityDoc | null; legacy: DocumentReference | null; stale: boolean; inputs: SignInInputs }

/** The organization's members ceiling: a platform admin's, or the licence's seats × 1.5, or 2,000. */
const ceilingOf = (org: { get(f: string): unknown }) => { const c = Number(org.get("ssoCeiling")); return Number.isInteger(c) && c > 0 ? c : defaultCeiling(Number(org.get("licence.seats")) || null); };

/** Everything decideSignIn reads (design §5), read-only. */
async function gather(orgId: string, conn: Conn, identity: TicketIdentity, now: number): Promise<Gathered> {
  const ref = db.doc(`${IDENTITIES}/${identityId(orgId, conn.connectionId, identity.subject)}`);
  const [snap, removedList] = await Promise.all([ref.get(), removedUids(orgId)]);
  let doc = readIdentity(snap.data());
  // A personal account's link that left of its own accord opens nothing: as if there were none (signIn deletes it).
  const stale = staleMovedLink(doc, removedList);
  if (stale) doc = null;
  let legacy: DocumentReference | null = null;
  let tombstone: SignInInputs["tombstone"] = null;
  if (!doc && identity.email && identity.emailVerified) {
    // The organization's identities that carry this verified address (one query, two equality filters: no index of its own).
    const same = (await db.collection(IDENTITIES).where("orgId", "==", orgId).where("email", "==", identity.email).limit(10).get()).docs
      .map((d) => ({ d, x: readIdentity(d.data()) }))
      .filter((o) => o.x && o.x.emailVerified && o.d.id !== ref.id);
    // A connection that became "a different provider" (save, migration "new"): the school-made account whose identity
    // under the old connection carries this verified address is the person's (exactly one, or none is taken). Which
    // accounts that may open is decided below (reattaches). A personal account's link that left of its own accord
    // (staleMovedLink) is as good as gone here too: it is no reason to tell the person their school removed them.
    const olds = same.filter((o) => o.x!.connectionId !== conn.connectionId && o.x!.linked !== "self" && !staleMovedLink(o.x, removedList));
    if (olds.length === 1) { doc = olds[0].x; legacy = olds[0].d.ref as DocumentReference; }
    // The same connection under another subject (a provider with pairwise subjects, after its client changed): someone
    // the organization removed or blocked isn't made a new account because the provider now names them differently.
    // A personal account's link that left of its own accord (staleMovedLink) is no tombstone.
    const kept = same.filter((o) => o.x!.connectionId === conn.connectionId && o.x!.state !== "active" && !staleMovedLink(o.x, removedList));
    if (kept.length) tombstone = kept.some((o) => o.x!.state === "blocked") ? "blocked" : "removed";
  }
  let mapping = doc ? await mappingFacts(doc) : null;
  // An address match under an older connection signs in only an account the school's sign-in made that is still a
  // student or teacher here. A member's account with a login of its own (one an admin made, one that became an admin)
  // is never opened because the new provider vouches for an address (design §5.3): that member signs in the way they
  // usually do and connects again from Me. An identity that is removed or blocked, or whose account is gone or left,
  // keeps saying so (decideSignIn).
  let ownLegacy = false;
  if (legacy && mapping && mapping.state === "active" && !mapping.pending && mapping.account.authExists
    && mapping.account.profile?.orgId === orgId && !reattaches(mapping.account)) {
    ownLegacy = true; doc = null; legacy = null; mapping = null;
  }
  let emailAccount: SignInInputs["emailAccount"] = null;
  if (identity.email) {
    const r = await auth.getUserByEmail(identity.email).catch((e) => { if (isAuthCode(e, "auth/user-not-found")) return null; throw e; });
    if (r) emailAccount = { ...(await accountFacts(r.uid)), hasIdentity: (await identitiesOf(r.uid, orgId)).some((d) => !staleMovedLink(readIdentity(d.data()), removedList)) };
  }
  const emailMember = ownLegacy || (identity.email
    ? (await db.collection("users").where("orgId", "==", orgId).where("ssoEmail", "==", identity.email).limit(3).get()).docs.some((d) => d.id !== doc?.uid)
    : false);
  const [health, org] = await Promise.all([db.doc(healthPath(orgId)).get(), db.doc(`orgs/${orgId}`).get()]);
  // Design §5.4: someone this organization removed isn't let back in by its school's sign-in, whether their account
  // is the identity's or the one whose address the issuer verified (a removed person who never connected).
  const removed = (!!doc && Object.hasOwn(removedList, doc.uid))
    || (!!emailAccount && identity.emailVerified && Object.hasOwn(removedList, emailAccount.uid));
  return {
    ref: ref as unknown as DocumentReference, doc, legacy, stale,
    inputs: {
      orgId, now, identity, mapping, emailAccount, emailMember, removed, tombstone,
      allowance: { hourCount: jitCount(health.get("jit"), now), memberCount: Number(org.get("memberCount")) || 0, ceiling: ceilingOf(org) },
    },
  };
}

/**
 * The accounts an address match under an older connection may open again ("a different provider"): made by the
 * school's sign-in (`sso`), and a student or teacher in both claims and profile, as §5.2 asks of an account it matches.
 */
const reattaches = (a: AccountFacts) => a.profile?.sso === true && (a.profile.role === "student" || a.profile.role === "teacher") && a.claims?.role === a.profile.role;

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** How long a sign-in waits for the same person's first sign-in, which is making the account, to finish. */
export const WAIT = { ms: 1000, tries: 6 };

/** Design §5: who the school sign-in becomes, and every write that needs. Returns the account to mint for. */
async function signIn(orgId: string, conn: Conn, identity: TicketIdentity, now: number): Promise<string> {
  for (let i = 0; i < WAIT.tries; i++) {
    const g = await gather(orgId, conn, identity, now);
    if (g.stale) { await dropMovedLink(g.ref, orgId); continue; }
    const d: SignInDecision = decideSignIn(g.inputs);
    if (d.kind === "refuse") {
      if (d.dropMapping) await dropStale(g);
      if (d.log) logger.warn("sso: claims and profile disagree", { event: "sso-claims-profile", orgId, uid: g.doc?.uid ?? null });
      if (d.code === "sso-full") await markFull(orgId, now);
      throw new Refuse(d.code);
    }
    if (d.kind === "wait") { await sleep(WAIT.ms); continue; }
    if (d.kind === "signin") {
      if (g.legacy) {
        if (await rekey(g, conn, identity, now)) await audit("sso.rekey", d.uid, { orgId, uid: d.uid, email: identity.email, from: g.doc?.connectionId ?? null, to: conn.connectionId });
      } else if (d.touch) await g.ref.update({ lastAt: now, expiresAt: sessionEnd(now, conn.maxSessionDays) });
      if (d.raise) await raise(d.uid, orgId);
      return d.uid;
    }
    if (d.kind === "link-org-made") {
      const linked = await db.runTransaction(async (tx) => {
        const cur = await tx.get(g.ref);
        if (cur.exists && !(d.dropMapping && cur.get("uid") === g.doc?.uid)) return false;
        tx.set(g.ref, identityData(orgId, conn, identity, d.uid, "org-made", now));
        return true;
      });
      if (!linked) continue;
      if (g.legacy) await g.legacy.delete();
      await db.doc(`users/${d.uid}`).set({ ssoLinkedAt: now }, { merge: true });
      await audit("sso.autoLink", d.uid, { orgId, uid: d.uid, email: identity.email });
      if (d.raise) await raise(d.uid, orgId);
      return d.uid;
    }
    const uid = await join(g, d, orgId, conn, identity, now);
    if (uid) return uid;
  }
  throw new Refuse("sso-rate");
}

function identityData(orgId: string, conn: Conn, id: TicketIdentity, uid: string, linked: IdentityDoc["linked"], now: number): IdentityDoc {
  return {
    uid, orgId, connectionId: conn.connectionId, issuer: conn.issuer, subject: id.subject, email: id.email, emailVerified: id.emailVerified,
    linked, state: "active", createdAt: now, lastAt: now, expiresAt: sessionEnd(now, conn.maxSessionDays),
  };
}

/** A mapping decideSignIn found stale (its account gone, or a personal account in another organization now). */
async function dropStale(g: Gathered) {
  const target = g.legacy ?? g.ref;
  const uid = g.doc?.uid;
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(target);
    if (cur.exists && cur.get("uid") === uid && cur.get("pending") !== true) tx.delete(target);
  });
}

/** A personal account's link that left of its own accord (staleMovedLink), deleted if it is still that. */
async function dropMovedLink(ref: DocumentReference, orgId: string) {
  const removed = await removedUids(orgId);
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (cur.exists && staleMovedLink(readIdentity(cur.data()), removed)) tx.delete(ref);
  });
}

/**
 * The identity under the old connection moves to the new one ("a different provider"), keeping its account and state.
 * False when another sign-in of the same person moved it first (nothing is written, or audited, twice).
 */
async function rekey(g: Gathered, conn: Conn, identity: TicketIdentity, now: number): Promise<boolean> {
  const old = g.doc!;
  return db.runTransaction(async (tx) => {
    const cur = await tx.get(g.legacy!);
    if (!cur.exists) return false;
    tx.set(g.ref, { ...identityData(old.orgId, conn, identity, old.uid, old.linked, now), createdAt: old.createdAt, rekeyedAt: now });
    tx.delete(g.legacy!);
    return true;
  });
}

/** The teacher rule raises a student to teacher (never lowers, never admin): profile first, then the claims, as setRole does for a promotion. */
async function raise(uid: string, orgId: string) {
  await db.doc(`users/${uid}`).set({ role: "teacher", claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await writeClaims(uid, "teacher", orgId);
  await audit("sso.teacher", uid, { orgId, uid });
}

/** Records that the school is full (the job alerts platform admins once a day). */
async function markFull(orgId: string, now: number) {
  await db.doc(healthPath(orgId)).set({ full: { at: now } }, { merge: true }).catch(() => {});
  await noteProblem(orgId, "full");
}

/**
 * Design §5.4: a new member, student or teacher by the rule. Reserve first: the identity is created with a new uid and
 * `pending` in a transaction, so a second first sign-in of the same person loses and waits for this one. Then the Auth
 * account (no email, no password), the claims, the profile, the member count, and `pending` cleared. A resumed
 * creation (a minute-old pending one) repeats the same steps with the same uid: an Auth account that already exists is
 * this one's.
 *
 * Both transactions read one document only, the person's own identity. The two every first sign-in of a school
 * shares, its hour's counter (ssoHealth) and its member count (the organization), are raised with increments that read
 * nothing: a transaction that read them would lock them, and a class signing in together for the first time would
 * abort each other's (five tries, then an error). The price: the allowance is the one gather() read a moment ago
 * (decideSignIn refused on it), so the hour's limit and the ceiling can be passed by as many first sign-ins as are
 * under way at once.
 */
async function join(g: Gathered, d: Extract<SignInDecision, { kind: "jit" }>, orgId: string, conn: Conn, identity: TicketIdentity, now: number): Promise<string | null> {
  let uid = d.uid;
  if (!d.resume || !uid) {
    uid = newUid();
    const made = uid;
    const reserved = await db.runTransaction(async (tx) => {
      const cur = await tx.get(g.ref);
      if (cur.exists && !(d.dropMapping && cur.get("uid") === g.doc?.uid && cur.get("pending") !== true)) return false;
      tx.set(g.ref, { ...identityData(orgId, conn, identity, made, "jit", now), pending: true });
      tx.set(db.doc(healthPath(orgId)), { jit: { [jitKey(now)]: FieldValue.increment(1) } }, { merge: true });
      return true;
    });
    if (!reserved) return null;
    if (g.legacy) await g.legacy.delete();
  }
  await auth.createUser({ uid, ...(identity.name ? { displayName: identity.name } : {}) })
    .catch((e) => { if (!isAuthCode(e, "auth/uid-already-exists")) throw e; });
  // Claims first: the first ID token already carries the organization, so a shared computer's guest work is never adopted.
  await writeClaims(uid, d.role, orgId);
  const profile = db.doc(`users/${uid}`);
  const had = await profile.get();
  // The address an admin finds the person by (createMembers, findAccount, connect-first): only one the issuer vouched
  // for, or Entra's tenant-managed UPN. An unverified `email` claim is whatever the person typed at some providers, and
  // stored here it would stand for someone else (their sign-in refused as connect-first, their name found as this one).
  const ssoEmail = identity.emailVerified ? identity.email : identity.upn ?? null;
  await profile.set({
    name: identity.name ?? identity.email?.split("@")[0] ?? "", role: d.role, orgId, managedBy: orgId, sso: true, createdBy: "sso",
    ssoEmail, group: d.group ?? null, active: true, claimsUpdatedAt: FieldValue.serverTimestamp(),
    ...(had.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });
  // Counted once, whoever finishes: the member count goes up in the transaction that clears `pending`, and only while
  // this identity still carries it. A resumed creation, or two that finish at once, find it cleared and count nothing;
  // one that stopped before here is counted by whoever resumes it (the profile existing or not says nothing of that).
  const settle = (count: boolean) => db.runTransaction(async (tx) => {
    const cur = await tx.get(g.ref);
    if (!cur.exists || cur.get("uid") !== uid || cur.get("pending") !== true) return false;
    if (count) tx.update(db.doc(`orgs/${orgId}`), { memberCount: FieldValue.increment(1) });
    tx.update(g.ref, { pending: FieldValue.delete(), lastAt: now, expiresAt: sessionEnd(now, conn.maxSessionDays) });
    return true;
  });
  // An organization deleted meanwhile has nothing to count in (the update finds no document): `pending` is still cleared.
  const counted = await settle(true).catch((e) => {
    if (!notFound(e)) throw e;
    logger.error("sso: member count not raised", { orgId, uid, error: "no-org" });
    return settle(false);
  });
  if (counted) await audit("sso.join", uid, { orgId, uid, role: d.role, ...(d.resume ? { resumed: true } : {}) });
  return uid;
}

/** Firestore's "not found" (update() of a document that isn't there), as the Admin SDK and the test fakes throw it. */
const notFound = (e: unknown) => (e as { code?: unknown } | null)?.code === 5 || /NOT_FOUND|No document to update/i.test(String(e));

/** An account with no learning yet: no lesson result, project or certificate (link may then move its identity and delete it, if it also teaches nobody and is no admin: decideLink). */
async function emptyAccount(uid: string): Promise<boolean> {
  const got = await Promise.all(["progress", "submissions", "certs"].map((c) => db.collection(`users/${uid}/${c}`).limit(1).get()));
  return got.every((g) => g.empty);
}
/** Nobody in the organization is this account's pupil (the two equality filters releasePupils uses: no index of its own). */
const teachesNobody = async (orgId: string, uid: string) => (await db.collection("users").where("orgId", "==", orgId).where("teacherId", "==", uid).limit(1).get()).empty;

/** Link mode (design §4 finish): the signed-in account the flow started for connects this school identity, after confirming. */
async function finishLink(req: Req, t: Ticket, conn: Conn, school: string, confirm: boolean, now: number) {
  const who = await bearer(req);
  if (!who) throw new Refuse("sso-recent");
  if (who.uid !== t.uid) throw new Refuse("sso-state");
  const orgId = t.orgId, identity = t.identity;
  const ref = db.doc(`${IDENTITIES}/${identityId(orgId, conn.connectionId, identity.subject)}`);
  const [snap, removedList] = await Promise.all([ref.get(), removedUids(orgId)]);
  let doc = readIdentity(snap.data());
  // A link left behind when this account (or another) once left the organization of its own accord: taken over below.
  const stale = staleMovedLink(doc, removedList) ? doc : null;
  if (stale) doc = null;
  const mapping = doc ? await mappingFacts(doc) : null;
  const caller = await accountFacts(who.uid);
  const mine = (await identitiesOf(who.uid, orgId)).filter((d) => d.id !== ref.id && !staleMovedLink(readIdentity(d.data()), removedList));
  // The caller's identity under an earlier connection (the school moved to "a different provider" since), while it is
  // active: this one takes its place. A blocked or removed one still counts, and still refuses.
  const earlier = mine.filter((d) => d.get("connectionId") !== conn.connectionId && (d.get("state") ?? "active") === "active" && d.get("pending") !== true);
  const others = mine.filter((d) => !earlier.includes(d));
  const heldByEmptyJit = !!mapping && mapping.uid !== who.uid && mapping.linked === "jit" && mapping.account.authExists && (await emptyAccount(mapping.uid)) && (await teachesNobody(orgId, mapping.uid));
  const d = decideLink({ orgId, caller, identity, mapping, callerHasIdentity: others.length > 0, heldByEmptyJit });
  if (d.kind === "refuse") throw new Refuse(d.code);
  if (d.kind === "already") return { linked: true, email: identity.email };
  if (!confirm) return { confirm: { name: identity.name, email: identity.email, school } };
  // How the account came to its school sign-in stays what it was: one the school's sign-in made (`jit`) is still the
  // school's after it connects again under a new connection, not a personal account's own link.
  const was = readIdentity(earlier[0]?.data())?.linked;
  const linked: IdentityDoc["linked"] = was && was !== "self" ? was : d.linked;
  const done = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const stillStale = !!stale && cur.get("uid") === stale.uid && staleMovedLink(readIdentity(cur.data()), removedList);
    if (cur.exists && !stillStale && cur.get("uid") !== (d.replace?.uid ?? null)) return false;
    tx.set(ref, identityData(orgId, conn, identity, who.uid, linked, now));
    return true;
  });
  if (!done) throw new Refuse("sso-linked");
  for (const e of earlier) await e.ref.delete();
  if (d.replace?.wipe) {
    // The empty account the school's sign-in made before the person connected their own: deleted like any managed account
    // (onAccountDeletion audits it with this `via`).
    await db.doc(`accountDeletions/${d.replace.uid}`).create({ orgId, by: who.uid, at: FieldValue.serverTimestamp(), via: "sso-link" })
      .catch((e) => { if (!alreadyExists(e)) throw e; });
  }
  await db.doc(`users/${who.uid}`).set({ ssoLinkedAt: now }, { merge: true });
  await audit("sso.link", who.uid, { orgId, uid: who.uid, email: identity.email, linked, ...(d.replace ? { replaced: d.replace.uid, wiped: d.replace.wipe } : {}), ...(earlier.length ? { earlierConnection: true } : {}) });
  return { linked: true, email: identity.email };
}

/**
 * Test mode (design §4 finish): the dry-run decision and which claims arrived go to lastTest; the tested rev is
 * recorded (and a passing test of an edit makes it the live connection, its secret with it). Never links anyone,
 * never makes an account, never mints a token. An admin's own test needs their sign-in; a student's needs the link.
 */
async function finishTest(req: Req, t: Ticket, cfg: SsoConfig, now: number) {
  if (t.test?.uid) {
    const who = await bearer(req);
    if (!who) throw new Refuse("sso-recent");
    if (who.uid !== t.test.uid) throw new Refuse("sso-state");
    // Still who start let through, read from Auth now: this organization's admin (not frozen) or a platform admin.
    // The ticket lives two minutes (TICKET_TTL_MS); a role taken away meanwhile must not record a test or promote an edit.
    if (!(await mayTest(who.uid, t.orgId))) throw new Refuse("sso-other-org");
  } else if (!t.test?.token) throw new Refuse("sso-state");
  const orgId = t.orgId, identity = t.identity;
  const conn = connForRev(cfg, t.rev, "test")!.conn;
  const decision = testOutcome(decideSignIn((await gather(orgId, conn, identity, now)).inputs));
  const lastTest: LastTest = {
    at: now, ok: true, by: t.test?.uid ?? null, asStudent: !!t.test?.token, decision, rev: t.rev, error: null,
    claimsSeen: identity.claimsSeen, ruleValues: identity.ruleValues, email: identity.email, name: identity.name, emailVerified: identity.emailVerified, teacher: identity.teacher, cls: identity.cls,
  };
  const ring = keyRing()!;
  let unlisted = false;
  const promoted = await db.runTransaction(async (tx) => {
    unlisted = false;
    const cref = db.doc(configPath(orgId)), sref = db.doc(`${SECRETS}/${orgId}`);
    // A student's link is spent here, once: start only checks it, so two flows started from it end with one result.
    const tref = t.test?.token ? db.doc(`${TESTS}/${t.test.token}`) : null;
    const [c, sec, tok] = await Promise.all([tx.get(cref), tx.get(sref), tref ? tx.get(tref) : null]);
    if (tref && (!tok?.exists || tok.get("orgId") !== orgId)) return "spent" as const;
    const now2 = readConfig(c.data());
    if (!now2) return false;
    const patch: Record<string, unknown> = { lastTest };
    if (tref) { patch.studentTestRev = t.rev; tx.delete(tref); }
    if (now2.next && t.rev === now2.next.configRev && now2.status === "on") {
      // The edit passed: it becomes the live connection, and its secret the live one (sealed again for its new slot).
      const next = now2.next;
      const opened = openSecret(ring, sec.get("next"), { orgId, slot: "next", issuer: next.issuer, tokenHost: tokenHost(next.endpoints), clientId: next.clientId });
      if (!opened.ok) return false;
      const live = sealSecret(ring, opened.secret, { orgId, slot: "live", issuer: next.issuer, tokenHost: tokenHost(next.endpoints), clientId: next.clientId });
      tx.set(sref, { live, next: FieldValue.delete(), ...(next.secretExpiresOn ? { expiresOn: next.secretExpiresOn } : {}) }, { merge: true });
      Object.assign(patch, { ...storedConn(next), next: FieldValue.delete(), testedRev: next.configRev, testedEndpoints: wholeEndpoints(next.endpoints), ...(t.test?.token ? { studentTestRev: next.configRev } : {}) });
      // A listing names the provider host a platform admin saw: at another host it waits for their approval again.
      const host = providerHost(next), l = now2.listing;
      if ((l.state === "approved" || l.state === "requested") && l.host !== host) {
        patch.listing = { state: "requested", host, at: now };
        if (l.state === "approved") { unlisted = true; tx.set(db.doc(`orgs/${orgId}`), { sso: { listed: false } }, { merge: true }); }
      }
      tx.set(cref, patch, { merge: true });
      return true;
    }
    if (t.rev === now2.configRev) Object.assign(patch, { testedRev: t.rev, testedEndpoints: wholeEndpoints(now2.endpoints), ...(now2.status === "draft" ? { status: "tested" } : {}) });
    tx.set(cref, patch, { merge: true });
    return false;
  });
  if (promoted === "spent") throw new Refuse("sso-state");
  forgetConfig(orgId);
  if (unlisted) await writeSsoFile().catch((e) => logger.error("sso: finder not published", { orgId, error: kindOf(e) }));
  await audit("sso.test", t.test?.uid ?? "test-link", { orgId, decision, asStudent: !!t.test?.token, rev: t.rev, ...(promoted ? { promoted: true } : {}) });
  return { tested: decision, ok: true, promoted, claimsSeen: identity.claimsSeen, ruleValues: identity.ruleValues, email: identity.email, name: identity.name, emailVerified: identity.emailVerified, teacher: identity.teacher, cls: identity.cls };
}

/* ---------- manageSso ---------- */

type Reason = SsoRefusal | "not-org-admin" | "not-super" | "no-org" | "no-account" | "bad-action" | "org-suspended" | "org-deleting";
const refuse = (code: ConstructorParameters<typeof HttpsError>[0], reason: Reason, message: string, extra: Record<string, unknown> = {}) => new HttpsError(code, message, { reason, ...extra });

type Admin = { uid: string; role: string; orgId?: string; platform: boolean };
/** This organization's admin (not while it is suspended or being deleted), or a platform admin, as Auth says now. */
async function orgAdmin(req: CallableRequest, orgId: string): Promise<Admin> {
  const c = await freshCaller(req);
  if (!isId(orgId)) throw refuse("invalid-argument", "no-org", "Choose an organization.");
  if (c.role === "superadmin") return { ...c, platform: true };
  if (c.role !== "orgAdmin" || c.orgId !== orgId) throw refuse("permission-denied", "not-org-admin", "Only this organization's admins can do that.");
  const status = (await db.doc(`orgs/${orgId}`).get()).get("status");
  if (status === "suspended") throw refuse("failed-precondition", "org-suspended", "This organization is suspended.");
  if (status === "deleting") throw refuse("failed-precondition", "org-deleting", "This organization is being deleted.");
  return { ...c, platform: false };
}
const platformOnly = (a: Admin) => { if (!a.platform) throw refuse("permission-denied", "not-super", "Platform admins only."); };

/** "Check connection" (design §8 step 2): discovery from the issuers the fields give, best first. Refuses with a hint. */
async function discover(fields: Pick<SsoFields, "preset" | "tenant" | "issuerCandidates">, orgId: string): Promise<{ issuer: string; check: Extract<DiscoveryCheck, { ok: true }> }> {
  let last: { reason: SsoRefusal; hint: string; got?: string; want?: string } = { reason: "sso-discovery", hint: "document" };
  for (const issuer of fields.issuerCandidates) {
    try {
      const doc = await fetchDiscovery(issuer, { orgId });
      const c = checkDiscovery(doc, { issuer, preset: fields.preset, tenant: fields.tenant }, emu());
      if (c.ok) return { issuer, check: c };
      last = { reason: c.code, hint: c.hint, ...(c.got !== undefined ? { got: c.got } : {}), ...(c.want !== undefined ? { want: c.want } : {}) };
    } catch (e) {
      last = { reason: "sso-discovery", hint: e instanceof SsoFetchError ? hintFor(e.code) : "bad-answer" };
    }
  }
  throw refuse("failed-precondition", last.reason, "Darsi could not check this provider. See the hint.", { hint: last.hint, ...(last.got !== undefined ? { got: last.got } : {}), ...(last.want !== undefined ? { want: last.want } : {}) });
}

/** A slug for the organization: its name slugified with 4 random characters, reserved with create() (never reused). */
async function reserveSlug(orgId: string, name: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const slug = slugify(name);
    try { await db.doc(`${SLUGS}/${slug}`).create({ orgId, at: Date.now() }); return slug; } catch (e) { if (!alreadyExists(e)) throw e; }
  }
  throw refuse("unavailable", "sso-slug", "Try again in a moment.");
}

const connKeys = ["preset", "tenant", "domain", "oktaServer", "realm", "issuer", "subjectKind", "clientId", "authMethod", "scopes", "allowedDomains", "openToAll",
  "emailsVerifiedBySchool", "teacherRule", "classClaim", "maxSessionDays", "personalDevices", "secretExpiresOn", "endpoints", "issParam", "pkce", "connectionId", "configRev", "hasSecret"] as const;
const pickConn = (c: Conn): Conn => Object.fromEntries(connKeys.map((k) => [k, c[k] ?? null])) as unknown as Conn;
/**
 * A connection as set(…, {merge: true}) must be given it. A merge joins maps key by key, so a key this connection lacks
 * is deleted by name: the end-session address of the provider before (which /api/sso/school would go on answering),
 * and the fields of an earlier kind of teacher rule (which made save's "unchanged" check never match). The writes keep
 * the merge: `listing`, `wip`, `slug` and `lastTest` rely on it.
 */
const wholeEndpoints = (e: Conn["endpoints"]) => ({ authorization: e.authorization, token: e.token, jwks: e.jwks, endSession: e.endSession ?? FieldValue.delete() });
const RULE_FIELDS = ["domains", "emails", "value", "claim"] as const;
const wholeRule = (r: Conn["teacherRule"]) => (r ? { ...Object.fromEntries(RULE_FIELDS.map((k) => [k, FieldValue.delete()])), ...r } : null);
const storedConn = (c: Conn) => ({ ...pickConn(c), endpoints: wholeEndpoints(c.endpoints), teacherRule: wholeRule(c.teacherRule) });
/** A value with every map's keys sorted (lists keep their order), so two equal connections read the same as JSON. */
const keysInOrder = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(keysInOrder)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, keysInOrder((v as Record<string, unknown>)[k])]))
      : v;

/** save (design §10): the draft, or `next` while the connection is on. Discovery runs here, never endpoints from the client. */
async function save(a: Admin, orgId: string, data: Record<string, unknown>) {
  const now = Date.now();
  const ref = db.doc(configPath(orgId));
  if (data.partial === true) {
    // The wizard's steps before the connection is complete: kept as typed (never a secret), for the wizard to come back to.
    const { secret: _s, ...rest } = (data.config ?? {}) as Record<string, unknown>;
    const json = JSON.stringify(rest ?? {});
    if (json.length > 16_000) throw refuse("invalid-argument", "sso-fields", "Too much to save.");
    await ref.set({ wip: { config: JSON.parse(json), at: now, by: a.uid } }, { merge: true });
    forgetConfig(orgId);
    return { saved: "partial" };
  }
  const v = validateConfig(data.config, now, emu());
  if (!v.ok) throw refuse("invalid-argument", v.code, "Check this field.", { field: v.field });
  const f = v.fields;
  const secret = typeof data.secret === "string" && data.secret ? data.secret : null;
  if (data.secret !== undefined && data.secret !== null && data.secret !== "" && (typeof data.secret !== "string" || data.secret.length > 512 || /[\u0000-\u001f]/.test(data.secret))) {
    throw refuse("invalid-argument", "sso-fields", "Check the client secret.", { field: "secret" });
  }
  const [org, { cfg: cur, raw: curRaw }] = await Promise.all([db.doc(`orgs/${orgId}`).get(), loadConfig(orgId, true)]);
  if (!org.exists) throw refuse("not-found", "no-org", "No such organization.");
  const live = cur?.status === "on";
  const base: Conn | null = live ? (cur!.next ?? cur) : cur;

  // Where the provider is: the stored discovery when nothing that names the provider changed, else discovery now.
  const same = (k: "preset" | "tenant" | "domain" | "oktaServer" | "realm") => (base?.[k] ?? null) === (f[k] ?? null);
  const providerSame = !!base && same("preset") && same("tenant") && same("domain") && same("oktaServer") && same("realm") && f.issuerCandidates.includes(base.issuer);
  let issuer: string, endpoints: Conn["endpoints"], issParam: boolean, pkce: Conn["pkce"], authMethods: ("basic" | "post")[];
  if (providerSame && base) {
    ({ issuer, endpoints, issParam, pkce } = base);
    authMethods = f.authMethod && f.authMethod !== base.authMethod ? [base.authMethod, f.authMethod] : [base.authMethod];
  } else {
    const d = await discover(f, orgId);
    issuer = d.issuer;
    ({ endpoints, issParam, pkce, authMethods } = d.check);
  }
  const authMethod = f.authMethod ?? (providerSame && base ? base.authMethod : authMethods[0]);
  if (!authMethods.includes(authMethod)) throw refuse("invalid-argument", "sso-fields", "This provider doesn't accept that way of sending the secret.", { field: "authMethod" });

  // Changing the provider or the client, with people connected: the admin says whether they are the same people.
  const connected = base ? await connectedCount(orgId, base.connectionId) : 0;
  let connectionId = base?.connectionId ?? newConnectionId();
  if (base && connected > 0 && (base.issuer !== issuer || base.clientId !== f.clientId)) {
    const m = data.migration;
    if (m !== "same" && m !== "new") throw refuse("failed-precondition", "sso-migrate", "People are connected to this sign-in. Say whether they are the same people.", { connected, issuerChanged: base.issuer !== issuer });
    // The same people at another issuer can't be told by their subject: only "a different provider" (matched again by verified email).
    if (m === "same" && base.issuer !== issuer) throw refuse("failed-precondition", "sso-migrate", "A new provider address starts a new connection: choose \"a different provider\".", { connected, issuerChanged: true });
    if (m === "new") connectionId = newConnectionId();
  } else if (base && base.issuer !== issuer) {
    // Nobody is connected, so there is nothing to ask, but a new provider address is a new connection all the same.
    // Someone the organization removed under the old one is then found by their verified address (gather), where a
    // subject from the new provider would match nothing and the school's sign-in would make them a new account.
    connectionId = newConnectionId();
  }

  const { issuerCandidates: _ic, authMethod: _am, ...plain } = f;
  const configRev = Math.max(cur?.configRev ?? 0, cur?.next?.configRev ?? 0) + 1;
  const draft: Conn = { ...plain, issuer, authMethod, endpoints, issParam, pkce, connectionId, configRev, hasSecret: false };
  const slot: SecretSlot = live ? "next" : "live";
  const binding: SecretBinding = { orgId, slot, issuer, tokenHost: tokenHost(endpoints), clientId: f.clientId };
  const bindingSame = !!base && base.issuer === issuer && base.clientId === f.clientId && tokenHost(base.endpoints) === binding.tokenHost;
  // Saving what is already there (the wizard's Save pressed twice) changes nothing, and keeps the test that passed.
  // Compared with its maps' keys in order: a stored map comes back in the store's key order, not the validator's.
  const plainOf = (c: Conn) => JSON.stringify(keysInOrder({ ...pickConn(c), configRev: 0, hasSecret: false }));
  if (!secret && base && bindingSame && plainOf(base) === plainOf(draft) && (!live || cur!.next)) {
    // Nothing to write, but the wizard's kept steps are done with all the same: left behind, they would open the
    // wizard on step 3 again next time.
    if (curRaw?.wip) { await ref.set({ wip: FieldValue.delete() }, { merge: true }); forgetConfig(orgId); }
    return { saved: "unchanged", configRev: base.configRev, hasSecret: base.hasSecret, issuer, host: providerHost(base) };
  }

  // The secret, sealed for exactly where it may be sent (design §2); a changed issuer, client or token host forgets it.
  const sref = db.doc(`${SECRETS}/${orgId}`);
  const ring = keyRing();
  let hasSecret = false;
  if (secret) {
    if (!ring) throw refuse("failed-precondition", "sso-key", "School sign-in is closed for now (keys).");
    await sref.set({ [slot]: sealSecret(ring, secret, binding), ...(f.secretExpiresOn ? { expiresOn: f.secretExpiresOn } : {}) }, { merge: true });
    hasSecret = true;
  } else if (bindingSame && base?.hasSecret) {
    const stored = (await sref.get()).data() ?? {};
    if (slot === "live" || stored.next) hasSecret = true; // the same slot keeps its secret
    else if (ring) {
      // Editing a live connection without typing the secret again: the live one, sealed again for `next` (same binding).
      const o = openSecret(ring, stored.live, { ...binding, slot: "live" });
      if (o.ok) { await sref.set({ next: sealSecret(ring, o.secret, binding) }, { merge: true }); hasSecret = true; }
    }
  } else {
    await sref.set({ [slot]: FieldValue.delete() }, { merge: true });
  }
  const conn: Conn = { ...draft, hasSecret };
  const slug = cur?.slug ?? (await reserveSlug(orgId, str(org.get("name"), 120) || orgId));
  if (live) await ref.set({ next: storedConn(conn), updatedAt: now, updatedBy: a.uid, wip: FieldValue.delete() }, { merge: true });
  else await ref.set({ ...storedConn(conn), status: "draft", slug, updatedAt: now, updatedBy: a.uid, wip: FieldValue.delete(), ...(cur ? {} : { listing: { state: "none" }, createdAt: now }) }, { merge: true });
  if (!org.get("sso")) await db.doc(`orgs/${orgId}`).set({ sso: { on: false, slug, listed: false } }, { merge: true });
  forgetConfig(orgId);
  await audit("sso.save", a.uid, { orgId, preset: f.preset, issuer, rev: configRev, slot, secret: !!secret, ...(base && connectionId !== base.connectionId ? { migration: "new" } : {}) });
  return { saved: slot === "next" ? "next" : "draft", configRev, hasSecret, issuer, host: providerHost(conn) };
}

/**
 * The people connected to one connection now. Not the tombstones: someone the organization removed or suspended
 * (`removed`, `blocked`: kept so its sign-in doesn't quietly make them a new account), nor an identity left under an
 * earlier connection (it is matched again by its verified address at the person's next sign-in). Equality filters
 * only, so the count needs no composite index.
 */
const connectedCount = (orgId: string, connectionId: string): Promise<number> =>
  db.collection(IDENTITIES).where("orgId", "==", orgId).where("connectionId", "==", connectionId).where("state", "==", "active").count().get().then((c) => c.data().count);

/** What the wizard and the status card read (no secret, ever). */
async function get(a: Admin, orgId: string) {
  const { cfg, raw } = await loadConfig(orgId, true);
  const [health, org, settings] = await Promise.all([db.doc(healthPath(orgId)).get(), db.doc(`orgs/${orgId}`).get(), db.doc(SETTINGS).get()]);
  const ids = db.collection(IDENTITIES).where("orgId", "==", orgId);
  const [connected, last, matchable, ssoOnly] = await Promise.all([
    cfg ? connectedCount(orgId, cfg.connectionId) : 0,
    ids.orderBy("lastAt", "desc").limit(1).get().then((s) => (s.docs[0]?.get("lastAt") as number | undefined) ?? null),
    db.collection("users").where("orgId", "==", orgId).where("mustChangePassword", "==", true).count().get().then((c) => c.data().count),
    db.collection("users").where("orgId", "==", orgId).where("sso", "==", true).count().get().then((c) => c.data().count),
  ]);
  const ring = keyRing();
  let signerOk: boolean | null = null;
  if (a.platform) signerOk = await auth.createCustomToken("sso-canary").then(() => true, () => false);
  const slug = cfg?.slug ?? (raw?.slug as string | undefined) ?? null;
  return {
    config: cfg ? { ...cfg, studentTestOk: cfg.studentTestRev === cfg.configRev, host: providerHost(cfg) } : null,
    wip: (raw?.wip as Record<string, unknown> | undefined) ?? null,
    health: health.exists ? health.data() : null,
    connected, lastSignIn: last, orgMadeToMatch: matchable, ssoOnly,
    callbackUrl: callbackUrl(callbackBase(), orgId),
    signinUrl: slug ? `${siteOrigin()}/signin?school=${slug}` : null,
    switchOn: settings.get("ssoOn") !== false,
    ceiling: { value: Number(org.get("ssoCeiling")) || null, default: defaultCeiling(Number(org.get("licence.seats")) || null) },
    keyOk: Boolean(ring),
    ...(a.platform ? { keyCanary: ring ? keyCanary(ring) : false, signerOk } : {}),
  };
}

const membersOf = async (uid: string, orgId: string) => (await identitiesOf(uid, orgId));

export const manageSso = onCall({ timeoutSeconds: 120, secrets: [SSO_KEYS], ...runAs }, async (req) => {
  const action = str(req.data?.action, 30);
  const data = (req.data ?? {}) as Record<string, unknown>;
  if (action === "setSwitch") {
    const c = await freshCaller(req);
    if (c.role !== "superadmin") throw refuse("permission-denied", "not-super", "Platform admins only.");
    if (typeof data.on !== "boolean") throw refuse("invalid-argument", "sso-fields", "on must be true or false.");
    await db.doc(SETTINGS).set({ ssoOn: data.on }, { merge: true });
    await writeSettingsFile();
    await audit("sso.switch", c.uid, { on: data.on });
    return { on: data.on };
  }
  const orgId = str(data.orgId, 128);
  // Me's "Disconnect": a member unlinks their own personal account (never the only way into it).
  if (action === "unlink" && req.auth && data.uid === req.auth.uid) {
    const c = await freshCaller(req);
    if (!isId(orgId)) throw refuse("invalid-argument", "no-org", "Choose an organization.");
    return unlink({ uid: c.uid, role: c.role, orgId: c.orgId, platform: false }, orgId, c.uid);
  }
  const a = await orgAdmin(req, orgId);
  const uid = str(data.uid, 128);
  switch (action) {
    case "get": return get(a, orgId);
    case "discover": {
      // The provider fields alone, checked as save checks them (stand-ins for the rest, which "Check connection" doesn't need).
      const v = validateConfig({
        preset: data.preset, tenant: data.tenant, domain: data.domain, oktaServer: data.oktaServer, realm: data.realm, issuer: data.issuer,
        clientId: data.preset === "microsoft" ? "00000000-0000-0000-0000-000000000000" : data.preset === "google" ? "check.apps.googleusercontent.com" : "check",
        allowedDomains: ["example.org"],
      }, Date.now(), emu());
      if (!v.ok) throw refuse("invalid-argument", v.code, "Check this field.", { field: v.field });
      const d = await discover(v.fields, orgId);
      return { ok: true, issuer: d.issuer, host: new URL(d.check.endpoints.authorization).host, pkce: d.check.pkce, issParam: d.check.issParam, authMethods: d.check.authMethods, endSession: Boolean(d.check.endpoints.endSession) };
    }
    case "save": return save(a, orgId, data);
    case "testLink": {
      const { cfg } = await loadConfig(orgId, true);
      if (!cfg?.slug || !testConn(cfg).hasSecret) throw refuse("failed-precondition", "sso-secret", "Save the connection with its secret first.");
      const token = randomBytes(24).toString("base64url");
      const expireAt = Date.now() + 24 * 3600_000;
      await db.doc(`${TESTS}/${token}`).set({ orgId, by: a.uid, expireAt: Timestamp.fromMillis(expireAt) });
      await audit("sso.testLink", a.uid, { orgId });
      return { token, url: `${siteOrigin()}/signin?school=${cfg.slug}&try=${token}`, expiresAt: expireAt };
    }
    case "turnOn": return turnOn(a, orgId, data.studentChecked === true);
    case "turnOff": {
      const { cfg } = await loadConfig(orgId, true);
      if (!cfg) throw refuse("failed-precondition", "sso-untested", "Nothing to turn off.");
      await db.doc(configPath(orgId)).set({ status: "off", next: FieldValue.delete(), updatedAt: Date.now(), updatedBy: a.uid }, { merge: true });
      await db.doc(`${SECRETS}/${orgId}`).set({ next: FieldValue.delete() }, { merge: true });
      await db.doc(`orgs/${orgId}`).set({ sso: { on: false, listed: false } }, { merge: true });
      forgetConfig(orgId);
      await publishAfter(orgId, cfg.listing.state === "approved");
      const ssoOnly = (await db.collection("users").where("orgId", "==", orgId).where("sso", "==", true).count().get()).data().count;
      await audit("sso.turnOff", a.uid, { orgId, ssoOnly });
      return { status: "off", ssoOnly };
    }
    case "requestListing": {
      const { cfg } = await loadConfig(orgId, true);
      if (cfg?.status !== "on") throw refuse("failed-precondition", "sso-untested", "Turn school sign-in on first.");
      const org = await db.doc(`orgs/${orgId}`).get();
      const listing = { state: "requested", name: str(org.get("name"), 120), logo: await logoSnapshot(orgId, org.get("brand.logo")), host: providerHost(cfg), at: Date.now(), by: a.uid, reason: null };
      await db.doc(configPath(orgId)).set({ listing }, { merge: true });
      forgetConfig(orgId);
      await audit("sso.requestListing", a.uid, { orgId, name: listing.name, host: listing.host });
      return { listing: { ...listing, logo: Boolean(listing.logo) } };
    }
    case "listing": {
      platformOnly(a);
      const { cfg } = await loadConfig(orgId, true);
      if (!cfg || cfg.listing.state !== "requested") throw refuse("failed-precondition", "sso-untested", "There is no listing request to review.");
      const approve = data.approve === true;
      const reason = approve ? null : str(data.reason, 300);
      await db.doc(configPath(orgId)).set({ listing: { state: approve ? "approved" : "refused", reason, reviewedAt: Date.now(), reviewedBy: a.uid } }, { merge: true });
      await db.doc(`orgs/${orgId}`).set({ sso: { listed: approve && cfg.status === "on" } }, { merge: true });
      forgetConfig(orgId);
      await writeSsoFile();
      await audit(approve ? "sso.listingApproved" : "sso.listingRefused", a.uid, { orgId, name: cfg.listing.name, host: cfg.listing.host, reason });
      return { state: approve ? "approved" : "refused" };
    }
    case "person": return personState(a, orgId, uid);
    case "allowBack": return allowBack(a, orgId, uid);
    case "block": case "unblock": {
      if (!isId(uid)) throw refuse("invalid-argument", "no-account", "Choose a person.");
      if ((await membersOf(uid, orgId)).length === 0) throw refuse("not-found", "no-account", "This person has no school sign-in here.");
      const n = await ssoSetBlocked(uid, action === "block", orgId, "admin");
      // Someone only the school's sign-in lets in is signed out everywhere: a block that waited for their session to end would be none.
      if (action === "block" && await ssoOnlyAccount(uid)) await auth.revokeRefreshTokens(uid).catch(() => {});
      await audit(action === "block" ? "sso.block" : "sso.unblock", a.uid, { orgId, uid, identities: n });
      return { changed: n };
    }
    case "unlink": return unlink(a, orgId, uid);
    case "setCeiling": {
      platformOnly(a);
      const v = data.ceiling;
      if (v !== null && !(typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 10_000_000)) throw refuse("invalid-argument", "sso-fields", "A whole number from 1, or none.", { field: "ceiling" });
      await db.doc(`orgs/${orgId}`).set({ ssoCeiling: v ?? FieldValue.delete() }, { merge: true });
      await audit("sso.setCeiling", a.uid, { orgId, ceiling: v });
      return { ceiling: v };
    }
    default: throw refuse("invalid-argument", "bad-action", "Unknown action.");
  }
});

/** After turning on or off: the organization's addresses (content/sites.json) and, when it was listed, the finder. */
async function publishAfter(orgId: string, listed: boolean) {
  const sites = await db.collection("sites").where("orgId", "==", orgId).limit(1).get();
  if (!sites.empty) await writeSitesFile().catch((e) => logger.error("sso: sites file not published", { orgId, error: kindOf(e) }));
  if (listed) await writeSsoFile().catch((e) => logger.error("sso: finder not published", { orgId, error: kindOf(e) }));
}

/** turnOn (design §10): tested at this rev, with a secret; a student's test for Google and Microsoft; an admin with their own login; keys and signer working. */
async function turnOn(a: Admin, orgId: string, studentChecked: boolean) {
  const [{ cfg }, org] = await Promise.all([loadConfig(orgId, true), db.doc(`orgs/${orgId}`).get()]);
  if (!cfg) throw refuse("failed-precondition", "sso-untested", "Set the connection up and test it first.");
  if (org.get("status") !== "active") throw refuse("failed-precondition", "sso-org-inactive", "This organization isn't active.");
  if (cfg.status === "on") return { status: "on" };
  if (cfg.testedRev !== cfg.configRev) throw refuse("failed-precondition", "sso-untested", "Test the connection as it is now first.");
  if (!cfg.hasSecret) throw refuse("failed-precondition", "sso-secret", "The client secret is missing.");
  const kind = providerKind(cfg.issuer, emu());
  if ((kind === "google" || kind === "microsoft") && cfg.studentTestRev !== cfg.configRev && !studentChecked) {
    throw refuse("failed-precondition", "sso-student-test", "Test with a student's account first (or confirm you did).");
  }
  await ssoKeepWayIn(orgId, null, true);
  const ring = keyRing();
  if (!ring || !keyCanary(ring)) throw refuse("failed-precondition", "sso-key", "School sign-in's keys aren't working. Ask Darsi's team.");
  try { await auth.createCustomToken("sso-canary"); } catch { throw refuse("failed-precondition", "sso-signer", "Darsi can't sign people in this way yet. Ask Darsi's team."); }
  // An approved listing names the provider host a platform admin saw: a connection saved since at another host is
  // listed only once they approve it again (the finder would otherwise send people somewhere it doesn't name).
  const host = providerHost(cfg);
  const listed = cfg.listing.state === "approved" && cfg.listing.host === host;
  const relist = cfg.listing.state !== "none" && cfg.listing.state !== "refused" && cfg.listing.host !== host ? { listing: { state: "requested", host, at: Date.now() } } : {};
  await db.doc(configPath(orgId)).set({ status: "on", ...relist, ...(studentChecked ? { studentChecked: { by: a.uid, at: Date.now(), rev: cfg.configRev } } : {}), turnedOnAt: Date.now(), updatedBy: a.uid }, { merge: true });
  await db.doc(`orgs/${orgId}`).set({ sso: { on: true, slug: cfg.slug, listed } }, { merge: true });
  forgetConfig(orgId);
  await publishAfter(orgId, listed);
  await audit("sso.turnOn", a.uid, { orgId, preset: cfg.preset, issuer: cfg.issuer, rev: cfg.configRev, ...(studentChecked ? { studentChecked: true } : {}) });
  return { status: "on" };
}

/**
 * "Let back in" (design §7): a person the school removed signs in again. Only an account that is the organization's
 * goes back into it (as a student): one its school sign-in made, or a login it manages (`managedBy`, a username
 * login). Anyone else's account is their own, whoever made it (an admin who typed a teacher's own email made the
 * account, and `createdBy` alone gives the organization nothing: roles.ts): its tombstone goes and the person comes
 * off the removed list, and they join again with a code. `allowed: false`: the person has no removed school sign-in
 * here, and nothing was changed.
 */
async function allowBack(a: Admin, orgId: string, uid: string) {
  if (!isId(uid)) throw refuse("invalid-argument", "no-account", "Choose a person.");
  const all = (await membersOf(uid, orgId)).filter((d) => d.get("state") === "removed");
  // Nothing of the school's sign-in to let back (the removed list's own "Let back in" asks for everyone on it): said, not refused.
  if (!all.length) return { allowed: false, rejoined: false };
  const ref = db.doc(`orgs/${orgId}/private/removed`);
  const unlist = () => db.runTransaction(async (tx) => {
    const uids = { ...((await tx.get(ref)).get("uids") as Record<string, unknown> | undefined) };
    if (!Object.hasOwn(uids, uid)) return;
    delete uids[uid];
    tx.set(ref, { uids });
  });
  // A personal account's own link: the tombstone goes, but the account is the person's, never put back into the
  // organization by an admin. They join again with a code (or the school's sign-in makes them a new account).
  const own = all.filter((d) => d.get("linked") === "self"), docs = all.filter((d) => d.get("linked") !== "self");
  for (const d of own) await d.ref.delete();
  if (!docs.length) {
    await unlist();
    await audit("sso.allowBack", a.uid, { orgId, uid, ownLink: true });
    return { allowed: true, rejoined: false };
  }
  const f = await accountFacts(uid);
  if (!f.authExists) {
    // Their account was deleted: the next school sign-in makes them a new one. Off the removed list too, as in the
    // other cases (the list's "Let back in" counts on it: its own readmitMember afterwards is only a clean-up).
    for (const d of docs) await d.ref.delete();
    await unlist();
    await audit("sso.allowBack", a.uid, { orgId, uid, accountDeleted: true });
    return { allowed: true, rejoined: false };
  }
  // Whose account it is: the school's sign-in made it (its identity here says so), or the organization manages its login.
  const schools = docs.some((d) => d.get("linked") === "jit")
    || isManaged({ managedBy: f.profileData?.managedBy, email: f.authEmail ?? f.profileData?.email }, orgId, USERNAME_DOMAINS);
  if (!schools && f.profile?.orgId !== orgId) {
    // The person's own account, matched or mapped to the school's sign-in while they were a member: an admin never
    // puts it back into the organization, or under the school's provider again, without them. As for a `self` link.
    for (const d of docs) await d.ref.delete();
    await unlist();
    await audit("sso.allowBack", a.uid, { orgId, uid, ownLink: true });
    return { allowed: true, rejoined: false };
  }
  if (f.profile?.orgId && f.profile.orgId !== orgId) throw refuse("failed-precondition", "sso-other-org", "This person belongs to another organization now.");
  if (f.claims?.role === "superadmin" || f.profile?.role === "superadmin") throw refuse("failed-precondition", "sso-staff", "That is a platform admin.");
  const rejoin = f.profile?.orgId !== orgId;
  if (rejoin) {
    if ((await db.doc(`orgs/${orgId}`).get()).get("status") !== "active") throw refuse("failed-precondition", "sso-org-inactive", "This organization isn't active.");
    await db.doc(`users/${uid}`).set({ role: "student", orgId, ...(f.profileData?.createdBy === "sso" ? { managedBy: orgId } : {}), claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeClaims(uid, "student", orgId);
    await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(1) }).catch(() => {});
  }
  // After the claims: writeClaims's own hook must not see them as still removed.
  for (const d of docs) await d.ref.update({ state: "active", removedAt: FieldValue.delete(), accountDeleted: FieldValue.delete() });
  await unlist();
  await audit("sso.allowBack", a.uid, { orgId, uid, rejoined: rejoin });
  return { allowed: true, rejoined: rejoin };
}

/**
 * One person's school sign-in in this organization, for their page (which then offers only what applies) and for
 * anyone the organization removed. The identities are this organization's own (as block, unblock and allowBack find
 * them), so its admin is answered for a person it removed too. Several identities (an earlier connection's beside the
 * current one) are said as one: blocked before active before removed, the order the actions matter in.
 *  - state: "active" (it opens the account), "blocked" (`blockedBy`: an admin here, or a suspension of the account),
 *    "removed" (the organization removed the person: only "Let back in" changes it), "none".
 *  - linked: how that identity came to be ("jit": the school's sign-in made the account; "org-made": an account the
 *    organization made, matched on its first school sign-in; "self": the person connected their own; "admin-map").
 *  - ownLogin: the account has a password or Google login on its Auth record, so the school isn't its only way in.
 *    null when the account is gone, or isn't this organization's to ask about (not its member, not managed by it and
 *    without an identity here): an admin learns nothing of a stranger's account.
 * A read: nothing is written or audited.
 */
async function personState(a: Admin, orgId: string, uid: string) {
  if (!isId(uid)) throw refuse("invalid-argument", "no-account", "Choose a person.");
  const [docs, f] = await Promise.all([membersOf(uid, orgId), accountFacts(uid)]);
  let ids = docs.map((d) => readIdentity(d.data())).filter((x): x is IdentityDoc => !!x);
  // A personal account's link that left of its own accord opens nothing and keeps nobody out: as if there were none.
  if (ids.some((x) => x.moved === true && x.state === "removed")) {
    const removed = await removedUids(orgId);
    ids = ids.filter((x) => !staleMovedLink(x, removed));
  }
  const pick = ids.find((x) => x.state === "blocked") ?? ids.find((x) => x.state === "active") ?? ids.find((x) => x.state === "removed") ?? null;
  const theirs = a.platform || ids.length > 0 || f.profile?.orgId === orgId || f.profileData?.managedBy === orgId;
  return {
    state: pick?.state ?? "none",
    linked: pick?.linked ?? null,
    blockedBy: pick?.state === "blocked" ? (pick.blockedBy ?? "suspension") : null,
    ownLogin: theirs && f.authExists ? ownLogin(f.record) : null,
  };
}

/** Disconnect (an admin, or the person on Me): never a blocked identity, never the only way into the account. */
async function unlink(a: Admin, orgId: string, uid: string) {
  if (!isId(uid)) throw refuse("invalid-argument", "no-account", "Choose a person.");
  const docs = await membersOf(uid, orgId);
  if (!docs.length) throw refuse("not-found", "no-account", "This account has no school sign-in here.");
  if (docs.some((d) => d.get("state") === "blocked")) throw refuse("failed-precondition", "sso-disabled", "This school sign-in is blocked.");
  if (await ssoOnlyAccount(uid)) throw refuse("failed-precondition", "sso-login", "This account has no other way in: add an email login first.");
  let n = 0;
  for (const d of docs) if (d.get("state") === "active") { await d.ref.delete(); n++; }
  await db.doc(`users/${uid}`).set({ ssoLinkedAt: FieldValue.delete() }, { merge: true });
  await audit("sso.unlink", a.uid, { orgId, uid, identities: n });
  return { unlinked: n };
}

/* ---------- ssoJob ---------- */

/**
 * Who hears a staff alert: the organization's admins, or the platform admins (orgId null). Push wording from messages.ts
 * (ssoSecretExpiring, ssoEndpointsMoved, ssoFull). `about` is the school the alert is about: it names the tag, so two
 * schools' alerts on one platform admin's phone don't replace each other.
 */
async function alertStaff(orgId: string | null, kind: Kind, vars: { n?: number; org?: string; orgId?: string }, link: string, about = orgId) {
  const q = orgId ? db.collection("users").where("orgId", "==", orgId).where("role", "==", "orgAdmin") : db.collection("users").where("role", "==", "superadmin");
  const staff = await q.limit(50).get();
  let sent = 0;
  for (const s of staff.docs) sent += await sendToUser(s.id, "staff", kind, vars, link, `darsi-sso-${about ?? "platform"}-${kind}`, s.data()).catch(() => 0);
  return sent;
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The daily work (design §7, §2, §9):
 * 1. Sessions that ran out (identities' expiresAt ≤ now), 500 a page, from a cursor: accounts with no other way in (made by
 *    the school, or matched while still on the handed-out password) are signed out (refresh tokens revoked). Only while
 *    the school's sign-in is on: with it off, nobody would get back in, so the end moves on instead.
 * 2. Client secrets sealed under an older key are sealed again under the current one; the kids still in use are recorded.
 * 3. Endpoints that moved since the test (other providers' discovery): a problem and an alert, never applied.
 * 4. Client secrets expiring within 30 and 7 days: an alert to the organization's admins, once each.
 * 5. A school that was full in the last day: one alert a day to platform admins.
 */
export async function runSsoJob(now = Date.now(), budgetMs = 480_000) {
  const started = Date.now();
  const out = { sessions: 0, revoked: 0, resealed: 0, moved: 0, expiring: 0, full: 0, kids: [] as string[], errors: [] as string[] };
  const note = (what: string, e: unknown) => { out.errors.push(`${what}: ${kindOf(e)}`); logger.error("sso job step failed", { event: "sso-job-failed", what, error: kindOf(e) }); };

  // 1. Sessions.
  const cfgs = new Map<string, SsoConfig | null>();
  const cfgOf = async (orgId: string) => { if (!cfgs.has(orgId)) cfgs.set(orgId, (await loadConfig(orgId, true)).cfg); return cfgs.get(orgId)!; };
  let cursor: number | null = null;
  for (let page = 0; page < 10 && Date.now() - started < budgetMs / 2; page++) {
    let q = db.collection(IDENTITIES).where("expiresAt", "<=", now).orderBy("expiresAt").limit(500);
    if (cursor !== null) q = q.startAfter(cursor);
    const got = await q.get().catch((e) => { note("sessions", e); return null; });
    if (!got) break;
    for (const d of got.docs) {
      const x = readIdentity(d.data());
      cursor = (d.get("expiresAt") as number) ?? cursor;
      if (!x) continue;
      try {
        if (x.revokedAt && x.lastAt !== null && x.revokedAt > x.lastAt) { await d.ref.update({ expiresAt: null }); continue; }
        const cfg = await cfgOf(x.orgId);
        if (cfg?.status !== "on") { await d.ref.update({ expiresAt: sessionEnd(now, cfg?.maxSessionDays ?? 30) }); continue; }
        const f = await accountFacts(x.uid);
        const noOther = f.authExists && (x.linked === "jit" ? !ownLogin(f.record) : (x.linked === "org-made" || x.linked === "admin-map") && f.profile?.mustChangePassword === true);
        if (noOther) { await auth.revokeRefreshTokens(x.uid); out.revoked++; await d.ref.update({ expiresAt: null, revokedAt: now }); }
        else await d.ref.update({ expiresAt: null });
        out.sessions++;
      } catch (e) { note(`session ${d.id.slice(0, 8)}`, e); }
    }
    if (got.size < 500) break;
  }

  // 2.–5. Per configured organization (every one has an ssoSecrets document).
  const ring = keyRing();
  const kids = new Set<string>();
  let orgIds: string[] = [];
  try { orgIds = (await db.collection(SECRETS).get()).docs.map((d) => d.id); } catch (e) { note("secrets", e); }
  for (const orgId of orgIds) {
    if (Date.now() - started > budgetMs) { out.errors.push("ran out of time"); break; }
    try {
      const cfg = await cfgOf(orgId);
      const sref = db.doc(`${SECRETS}/${orgId}`);
      const sec = (await sref.get()).data() ?? {};
      if (cfg && ring) {
        for (const [slot, conn] of [["live", cfg], ["next", cfg.next]] as const) {
          const stored = sec[slot] as { kid?: string } | undefined;
          if (!stored || !conn) continue;
          const r = resealSecret(ring, stored, { orgId, slot, issuer: conn.issuer, tokenHost: tokenHost(conn.endpoints), clientId: conn.clientId });
          if (!r.ok) { await noteProblem(orgId, r.code === "key" ? "secret-key" : "secret-mismatch"); if (stored.kid) kids.add(stored.kid); continue; }
          if (r.changed) { await sref.set({ [slot]: r.stored }, { merge: true }); out.resealed++; }
          kids.add(r.stored.kid);
        }
      }
      if (!cfg) continue;
      const hRef = db.doc(healthPath(orgId));
      const health = (await hRef.get()).data() ?? {};
      const alerts = (health.alerts ?? {}) as Record<string, string>;
      const orgName = str((await db.doc(`orgs/${orgId}`).get()).get("name"), 120);
      const mark = (k: string, v: string) => hRef.set({ alerts: { [k]: v } }, { merge: true });
      // The hours' counters of new accounts (join) that are over: one field an hour would otherwise stay for ever.
      const over = jitStale(health.jit, now);
      if (over.length) await hRef.set({ jit: Object.fromEntries(over.map((k) => [k, FieldValue.delete()])) }, { merge: true });
      // 3. Endpoints (not Google's or Microsoft's constants).
      if ((cfg.status === "on" || cfg.status === "tested") && !constantEndpoints(cfg.preset, cfg.tenant)) {
        try {
          const c = checkDiscovery(await fetchDiscovery(cfg.issuer, { orgId }), { issuer: cfg.issuer, preset: cfg.preset, tenant: cfg.tenant }, emu());
          if (!c.ok) await noteProblem(orgId, "discovery", c.hint, now);
          else {
            const moved = endpointsMoved(cfg.testedEndpoints ?? cfg.endpoints, c.endpoints);
            if (moved.length) {
              out.moved++;
              await noteProblem(orgId, "endpoints-moved", moved.join(","), now);
              logger.warn("sso: provider endpoints moved; not applied, retest needed", { event: "sso-endpoints-moved", orgId, moved });
              if (alerts.moved !== dayOf(now)) { await alertStaff(orgId, "ssoEndpointsMoved", { org: orgName }, "/admin?tab=signin"); await mark("moved", dayOf(now)); }
            }
          }
        } catch (e) { await noteProblem(orgId, "discovery", e instanceof SsoFetchError ? hintFor(e.code) : "bad-answer", now); }
      }
      // 4. The client secret's expiry date (the admin types it; Microsoft's default is six months).
      const expires = cfg.secretExpiresOn ? Date.parse(`${cfg.secretExpiresOn}T00:00:00Z`) : NaN;
      if (Number.isFinite(expires) && cfg.status === "on") {
        const days = Math.ceil((expires - now) / 86_400_000);
        for (const [key, within] of [["secret7", 7], ["secret30", 30]] as const) {
          if (days > within || alerts[key] === cfg.secretExpiresOn) continue;
          out.expiring++;
          await noteProblem(orgId, "secret-expiring", String(Math.max(0, days)), now);
          await alertStaff(orgId, "ssoSecretExpiring", { n: Math.max(0, days), org: orgName }, "/admin?tab=signin");
          await mark(key, cfg.secretExpiresOn!);
          if (key === "secret7") await mark("secret30", cfg.secretExpiresOn!); // the 30-day one would only repeat it
          break;
        }
      }
      // 5. Full.
      const fullAt = Number((health.full as { at?: unknown } | undefined)?.at) || 0;
      if (fullAt > now - 86_400_000 && alerts.full !== dayOf(now)) {
        out.full++;
        await alertStaff(null, "ssoFull", { org: orgName, orgId }, `/super/orgs/${orgId}?tab=signin`, orgId);
        await mark("full", dayOf(now));
      }
    } catch (e) { note(`org ${orgId}`, e); }
  }
  out.kids = [...kids].sort();
  // The heartbeat every scheduled job leaves (stats/jobs: {at, ok, …}; /super's status panel reads it): a run in which
  // a step failed says which one first (a step's name and an error's kind, never its words); one that worked clears it.
  await ssoBeat({ ok: out.errors.length === 0, sessions: out.sessions, revoked: out.revoked, resealed: out.resealed, moved: out.moved, kids: out.kids, error: out.errors[0]?.slice(0, 200) ?? FieldValue.delete() });
  return out;
}

/** stats/jobs.ssoJob. Never throws: the job's own work is done by now. */
const ssoBeat = (fields: Record<string, unknown>) => db.doc("stats/jobs").set({ ssoJob: { at: Date.now(), ...fields } }, { merge: true })
  .catch((e) => logger.error("sso job heartbeat not written", { error: kindOf(e) }));

/** The scheduled run. A run that throws outright still leaves its heartbeat (ok: false) before it is rethrown. */
export async function ssoJobRun(run: () => Promise<Awaited<ReturnType<typeof runSsoJob>>> = runSsoJob) {
  let r: Awaited<ReturnType<typeof runSsoJob>>;
  try { r = await run(); } catch (e) {
    await ssoBeat({ ok: false, error: kindOf(e) });
    throw e;
  }
  if (r.errors.length) logger.warn("sso job: not everything worked", { event: "sso-job-errors", ...r });
  else logger.info("sso job", r);
}

export const ssoJob = onSchedule({ schedule: "30 2 * * *", timeZone: "UTC", timeoutSeconds: 540, memory: "512MiB", retryCount: 0, secrets: [SSO_KEYS], ...runAs }, () => ssoJobRun());

/** Only for tests: the parts the flow tests read directly. */
export const __test = { returnOriginFor, ceilingOf, readIdentity, pickConn, storedConn, isRecent: recent, mint, ssoOnlyAccount };
export type { IdentityDoc };
