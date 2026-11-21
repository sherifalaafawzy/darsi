// School sign-in end to end (design §12), against fakes: Firestore and Auth in memory (ssoFakes), and a stand-in OpenID
// provider on 127.0.0.1 that signs real ID tokens, checks PKCE and client authentication, and counts every call it
// gets. The emulator flag is on (it is what lets the functions call an http loopback provider).
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminMock, FakeProvider } from "./ssoFakes";

process.env.FUNCTIONS_EMULATOR = "true";
process.env.SSO_KEYS = JSON.stringify({ current: "k1", keys: { k1: randomBytes(32).toString("base64") } });

const billing = vi.hoisted(() => ({ writeClaims: vi.fn() }));
vi.mock("../src/admin.js", async () => (await import("./ssoFakes")).adminMock());
vi.mock("../src/billing.js", () => billing);
vi.mock("../src/storage.js", () => ({ savePublicJson: async () => {}, bucket: () => ({ file: () => ({ download: async () => [Buffer.from([1])] }) }) }));
vi.mock("../src/sites.js", () => ({ writeSitesFile: async () => ({}) }));
vi.mock("../src/settings.js", () => ({ SETTINGS: "config/settings", writeSettingsFile: async () => {} }));
vi.mock("../src/notify.js", () => ({ sendToUser: async () => 1 }));

const { db, auth, audits } = (await import("../src/admin.js")) as unknown as AdminMock;
const sso = await import("../src/sso");
const store = await import("../src/ssoStore");
const { fakeProvider, pkcePair, response } = await import("./ssoFakes");
const { parseKeyRing, sealSecret } = await import("../src/ssoCrypto");
const { identityId, tokenHost, GOOGLE_ISSUER } = await import("../src/ssoCore");
const { microsoftIssuer } = await import("../src/ssoProviders");

const ring = (() => { const r = parseKeyRing(process.env.SSO_KEYS); if (!r.ok) throw new Error("keys"); return r.ring; })();
const ORIGIN = "https://darsiai.org";
type Body = Record<string, unknown>;
let P: FakeProvider;
beforeAll(async () => { P = await fakeProvider(); });
afterAll(async () => { await P.close(); delete process.env.FUNCTIONS_EMULATOR; });

/** A connection as manageSso leaves it once tested and on, pointed at the stand-in provider. */
function install(orgId = "o1", over: Body = {}, status = "on") {
  const c = {
    preset: "oidc", tenant: null, domain: null, oktaServer: null, realm: null, issuer: P.base, subjectKind: "sub", clientId: P.clientId, authMethod: "basic",
    scopes: ["openid", "email", "profile"], allowedDomains: ["school.edu"], openToAll: false, emailsVerifiedBySchool: false, teacherRule: null, classClaim: null,
    maxSessionDays: 30, personalDevices: false, secretExpiresOn: null, endpoints: P.endpoints(), issParam: false, pkce: "s256", connectionId: "conn1", configRev: 1, hasSecret: true,
    status, testedRev: 1, testedEndpoints: P.endpoints(), studentTestRev: null, slug: `${orgId}-abcd`, listing: { state: "none" }, ...over,
  } as Body & { issuer: string; clientId: string; endpoints: { token: string; authorization: string; jwks: string } };
  db.docs.set(`orgs/${orgId}/private/sso`, c);
  db.docs.set(`ssoSecrets/${orgId}`, { live: sealSecret(ring, P.secret, { orgId, slot: "live", issuer: c.issuer, tokenHost: tokenHost(c.endpoints), clientId: c.clientId }) });
  db.docs.set(`ssoSlugs/${c.slug}`, { orgId, at: 1 });
  store.forgetConfig();
  return c;
}
const person = (id: string, more: Body = {}) => ({ sub: `sub-${id}`, email: `${id}@school.edu`, email_verified: true, name: id[0].toUpperCase() + id.slice(1), ...more });
const user = (uid: string) => db.docs.get(`users/${uid}`) as Body | undefined;
const idOf = (sub: string, orgId = "o1", conn = "conn1") => `ssoIdentities/${identityId(orgId, conn, sub)}`;
const minted = () => auth.customTokens.filter((t) => t.uid !== "sso-canary");

async function post(path: string, body: Body, headers: Record<string, string> = {}) {
  const { res, out } = response();
  await sso.edge({ method: "POST", path, headers: { origin: ORIGIN, ...headers }, rawBody: Buffer.from(JSON.stringify(body)), ip: "203.0.113.9" }, res);
  return out;
}
async function get(path: string, query: Body) {
  const { res, out } = response();
  await sso.edge({ method: "GET", path, headers: {}, query, ip: "203.0.113.9" }, res);
  return out;
}
/** start, as the page does: its own PKCE pair, and the URL to send the person to. */
async function start(mode: string, extra: Body = {}, headers: Record<string, string> = {}) {
  const k = pkcePair();
  const out = await post("/api/sso/start", { orgId: "o1", mode, challenge: k.challenge, ...extra }, headers);
  return { status: out.status, body: out.body as Body, url: (out.body as { url?: string })?.url ?? "", ...k };
}
/** The provider's redirect back to Darsi's callback, and where the callback then sends the person. */
async function callback(url: string, claims: Body, opts: { path?: string; query?: Body } = {}) {
  const { code, state } = P.authorize(url, claims);
  const { res, out } = response();
  const path = opts.path ?? new URL(new URL(url).searchParams.get("redirect_uri")!).pathname;
  await sso.callback({ method: "GET", path, headers: {}, query: { code, state, ...opts.query } }, res);
  const loc = out.headers.location ?? "";
  const hash = loc ? new URLSearchParams(new URL(loc).hash.slice(1)) : new URLSearchParams();
  return { out, loc, ticket: hash.get("sso"), error: hash.get("sso_error"), detail: hash.get("d"), flow: hash.get("f"), code, state };
}
const finish = (ticket: string | null, verifier: unknown, more: Body = {}, headers: Record<string, string> = {}) => post("/api/sso/finish", { ticket, verifier, ...more }, headers);
/** A whole school sign-in: start, the provider, the callback, finish. */
async function signIn(claims: Body) {
  const s = await start("signin");
  expect(s.status).toBe(200);
  const b = await callback(s.url, claims);
  if (b.error) return { error: b.error } as Body;
  const f = await finish(b.ticket, s.verifier);
  return { status: f.status, ...(f.body as Body) };
}
/** An ID token the fake Auth accepts for this account, signed in `ago` seconds ago. */
function signedIn(uid: string, ago = 30) {
  const t = `id.${uid}.${ago}`;
  auth.idTokens.set(t, { uid, auth_time: Math.floor(Date.now() / 1000) - ago });
  return { authorization: `Bearer ${t}` };
}
function member(uid: string, role: string, orgId: string | null, more: Body = {}, account: Body = {}) {
  db.docs.set(`users/${uid}`, { name: uid, role, orgId, ...more });
  auth.users.set(uid, { uid, email: `${uid}@mail.example`, providerData: [{ providerId: "password" }], customClaims: { role, ...(orgId ? { orgId } : {}) }, ...account });
}

beforeEach(() => {
  db.docs.clear(); db.serial = false; auth.users.clear(); auth.idTokens.clear(); auth.customTokens.length = 0; auth.revoked.length = 0; auth.signerDown = false;
  audits.length = 0; P.calls.length = 0; P.tamper = null; P.tokenIss = null; P.issParam = false;
  sso.resetSsoState();
  sso.WAIT.ms = 20;
  billing.writeClaims.mockReset().mockImplementation(async (uid: string, role: string, orgId: string | null) => {
    const u = auth.users.get(uid);
    if (!u) throw Object.assign(new Error("auth/user-not-found"), { code: "auth/user-not-found" });
    const had = u.customClaims?.orgId;
    u.customClaims = { role, ...(orgId ? { orgId } : {}) };
    // The real writeClaims (billing.ts) calls the school sign-in hook on every organization change.
    if (typeof had === "string" && had !== orgId) await store.ssoClaimsMoved(uid, orgId);
  });
  db.docs.set("orgs/o1", { name: "Nile School", status: "active", memberCount: 1, sso: { on: true, slug: "o1-abcd", listed: false } });
  db.docs.set("orgs/o2", { name: "Delta School", status: "active", memberCount: 0 });
  member("a1", "orgAdmin", "o1");
  install("o1");
});

describe("the callback", () => {
  it("refuses organization A's state at /callback/B before anything leaves Darsi", async () => {
    install("o2");
    const s = await start("signin");
    const b = await callback(s.url, person("amina"), { path: "/callback/o2" });
    expect(b.error).toBe("sso-state");
    expect(P.calls).toEqual([]); // no token request, no JWKS
    expect(db.all("ssoUsed")).toEqual([]); // and the state is not even spent
  });

  it("spends a state once: the same answer replayed is refused, and the provider is asked once", async () => {
    const s = await start("signin");
    const first = await callback(s.url, person("amina"));
    expect(first.ticket).toBeTruthy();
    const { res, out } = response();
    await sso.callback({ method: "GET", path: "/callback/o1", headers: {}, query: { code: first.code, state: first.state } }, res);
    expect(new URLSearchParams(new URL(out.headers.location).hash.slice(1)).get("sso_error")).toBe("sso-state");
    expect(P.calls.filter((c) => c.path === "/token")).toHaveLength(1);
  });

  it("goes back to the page's own origin, at the mode's own path, and never caches or refers", async () => {
    const s = await start("signin");
    const b = await callback(s.url, person("amina"));
    expect(b.out.status).toBe(303);
    expect(b.loc.startsWith(`${ORIGIN}/signin#sso=`)).toBe(true);
    expect(b.flow).toBe((s.body as { flow: string }).flow);
    expect(b.out.headers["cache-control"]).toBe("no-store");
    expect(b.out.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("a state that isn't Darsi's gets a plain page, not a redirect", async () => {
    const { res, out } = response();
    await sso.callback({ method: "GET", path: "/callback/o1", headers: {}, query: { code: "x", state: "k1.e30.AAAA" } }, res);
    expect(out.status).toBe(400);
    expect(out.headers.location).toBeUndefined();
    expect(out.text).toContain("Darsi");
  });

  it("the provider's own error goes back as sso-provider with its code", async () => {
    const s = await start("signin");
    const state = new URL(s.url).searchParams.get("state")!;
    const { res, out } = response();
    await sso.callback({ method: "GET", path: "/callback/o1", headers: {}, query: { error: "access_denied", state } }, res);
    const h = new URLSearchParams(new URL(out.headers.location).hash.slice(1));
    expect([h.get("sso_error"), h.get("d")]).toEqual(["sso-provider", "access_denied"]);
    expect(P.calls).toEqual([]);
  });

  it("refuses a token with the wrong nonce, the wrong audience, or another issuer", async () => {
    P.tamper = (c) => ({ ...c, nonce: "not-the-one" });
    expect((await callback((await start("signin")).url, person("amina"))).error).toBe("sso-token");
    P.tamper = (c) => ({ ...c, aud: "another-client" });
    expect((await callback((await start("signin")).url, person("amina"))).error).toBe("sso-token");
    P.tamper = null; P.tokenIss = "https://evil.example";
    expect((await callback((await start("signin")).url, person("amina"))).error).toBe("sso-issuer");
  });

  it("needs the iss parameter when the provider advertised it (RFC 9207)", async () => {
    install("o1", { issParam: true });
    expect((await callback((await start("signin")).url, person("amina"))).error).toBe("sso-issuer");
    expect((await callback((await start("signin")).url, person("amina"), { query: { iss: "https://evil.example" } })).error).toBe("sso-issuer");
    expect((await callback((await start("signin")).url, person("amina"), { query: { iss: P.base } })).ticket).toBeTruthy();
  });

  it("sends the secret only where it was saved for: a moved token host gets nothing and takes the connection back to draft", async () => {
    const c = install("o1");
    db.docs.set("orgs/o1/private/sso", { ...c, endpoints: { ...c.endpoints, token: P.endpoints().token.replace("127.0.0.1", "localhost") } });
    store.forgetConfig();
    const b = await callback((await start("signin")).url, person("amina"));
    expect(b.error).toBe("sso-secret");
    expect(P.calls.filter((x) => x.path === "/token")).toEqual([]);
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ status: "draft", hasSecret: false });
    expect(db.docs.get("ssoSecrets/o1")?.live).toBeUndefined();
  });

  it("a callback behind this instance's config cache, after an edit was promoted to another client, is an expired flow: nothing is taken back to draft", async () => {
    const c = install("o1");
    expect(await signIn(person("amina"))).toMatchObject({ status: 200 }); // this instance now holds rev 1 for a minute
    const s = await start("signin"); // someone pressed the school button before the promotion
    // Another instance (finishTest runs in ssoEdge) promoted an edit with a new client: rev 2, the live secret sealed
    // again for it. Nothing here forgets the cache.
    db.docs.set("orgs/o1/private/sso", { ...c, clientId: "new-client", configRev: 2, testedRev: 2 });
    db.docs.set("ssoSecrets/o1", { live: sealSecret(ring, "new-secret", { orgId: "o1", slot: "live", issuer: c.issuer, tokenHost: tokenHost(c.endpoints), clientId: "new-client" }) });
    P.calls.length = 0;
    const b = await callback(s.url, person("bob"));
    expect(b.error).toBe("sso-state");
    expect(P.calls.filter((x) => x.path === "/token")).toEqual([]);
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ status: "on", hasSecret: true, configRev: 2, clientId: "new-client" });
    expect(db.docs.get("ssoSecrets/o1")?.live).toBeTruthy();
    expect(db.docs.get("orgs/o1")).toMatchObject({ sso: { on: true } });
    expect(db.docs.get("orgs/o1/private/ssoHealth")?.problems ?? {}).not.toHaveProperty("secret-mismatch");
  });

  it("callbacks that prove nothing run out of places, per address and per hop; the next one writes nothing, calls nobody and keeps its state", async () => {
    let starts = 0;
    const junk = async (headers: Record<string, string> = {}) => {
      // Each start from an address of its own: a start has its own limits, and only the callbacks' places are counted here.
      const ip = `10.9.${starts >> 8}.${starts++ & 255}`;
      const state = new URL((await start("signin", {}, { "fastly-client-ip": ip, "x-forwarded-for": `${ip}, 198.18.0.1` })).url).searchParams.get("state")!;
      const { res, out } = response();
      await sso.callback({ method: "GET", path: "/callback/o1", headers, query: { code: "made-up", state } }, res);
      const h = new URLSearchParams(new URL(out.headers.location).hash.slice(1));
      return [h.get("sso_error"), h.get("d")];
    };
    // One address: its places for the minute go to codes the provider refuses.
    for (let i = 0; i < sso.UNPROVEN.address; i++) expect(await junk()).toEqual(["sso-provider", "invalid_grant"]);
    const used = db.all("ssoUsed").length, asked = P.calls.filter((x) => x.path === "/token").length;
    expect([used, asked]).toEqual([sso.UNPROVEN.address, sso.UNPROVEN.address]);
    // A real person's answer arrives now: turned away before anything is written or sent, its state unspent.
    const real = await start("signin");
    const { code, state } = P.authorize(real.url, person("amina"));
    const arrive = async () => {
      const { res, out } = response();
      await sso.callback({ method: "GET", path: "/callback/o1", headers: {}, query: { code, state } }, res);
      return new URLSearchParams(new URL(out.headers.location).hash.slice(1));
    };
    const turned = await arrive();
    expect([turned.get("sso_error"), turned.get("d")]).toEqual(["sso-provider", "busy"]);
    expect(await junk()).toEqual(["sso-provider", "busy"]);
    expect([db.all("ssoUsed").length, P.calls.filter((x) => x.path === "/token").length]).toEqual([used, asked]);
    // A new address with every request doesn't help on the function's own URL: the hop is the caller's own.
    const forged = (n: number) => ({ "fastly-client-ip": `198.51.100.${n % 250}`, "x-forwarded-for": `198.51.100.${n % 250}, 192.0.2.7` });
    for (let i = 0; i < sso.UNPROVEN.hop; i++) expect(await junk(forged(i))).toEqual(["sso-provider", "invalid_grant"]);
    expect(await junk(forged(251))).toEqual(["sso-provider", "busy"]);
    // …and it never touches people who come another way (Hosting's CDN node is their hop).
    expect(await junk({ "fastly-client-ip": "41.33.12.7", "x-forwarded-for": "41.33.12.7, 151.101.1.1" })).toEqual(["sso-provider", "invalid_grant"]);
    // A minute later the same answer goes through: the state was never spent.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + sso.UNPROVEN.windowMs + 1000);
      expect((await arrive()).get("sso")).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  // Through Hosting the last hop is a CDN node the whole school shares (and so is one address, for a school behind
  // one): at 60 and 40 places a minute, a big school's own cancelled or unassigned sign-ins answered everyone `busy`.
  it("a school's own failed answers through one Hosting node leave room for the next person: the places are ceilings, not per-person limits", async () => {
    const NODE = "151.101.1.1";
    const via = (ip: string) => ({ "fastly-client-ip": ip, "x-forwarded-for": `${ip}, ${NODE}` });
    const arrive = async (query: Body, headers: Record<string, string>) => {
      const { res, out } = response();
      await sso.callback({ method: "GET", path: "/callback/o1", headers, query, ip: NODE }, res);
      const h = new URLSearchParams(new URL(out.headers.location).hash.slice(1));
      return { error: h.get("sso_error"), detail: h.get("d"), ticket: h.get("sso") };
    };
    // 61 people on 61 addresses cancel at the provider (its own error keeps the place for the minute).
    for (let i = 0; i < 61; i++) {
      const state = new URL((await start("signin", {}, via(`41.33.12.${i + 1}`))).url).searchParams.get("state")!;
      expect(await arrive({ error: "access_denied", state }, via(`41.33.12.${i + 1}`))).toMatchObject({ error: "sso-provider", detail: "access_denied" });
    }
    // The next person on that node, from another address, is signed in.
    const real = await start("signin", {}, via("41.33.13.9"));
    const { code, state } = P.authorize(real.url, person("amina"));
    expect((await arrive({ code, state }, via("41.33.13.9"))).ticket).toBeTruthy();
    // …and so is the 41st person of a school behind one address, after 40 of its pupils cancelled.
    sso.resetSsoState();
    for (let i = 0; i < 41; i++) {
      const st = new URL((await start("signin", {}, via("41.33.12.7"))).url).searchParams.get("state")!;
      expect((await arrive({ error: "access_denied", state: st }, via("41.33.12.7"))).detail).toBe("access_denied");
    }
    const next = await start("signin", {}, via("41.33.12.7"));
    const ans = P.authorize(next.url, person("bilal"));
    expect((await arrive({ code: ans.code, state: ans.state }, via("41.33.12.7"))).ticket).toBeTruthy();
  });

  it("answers the provider exchanged give their place back: a school's morning never runs out", async () => {
    for (let i = 0; i < sso.UNPROVEN.address + 5; i++) expect((await callback((await start("signin")).url, person(`p${i}`))).ticket).toBeTruthy();
    // A token the provider issued but Darsi refuses (another domain) is still someone's real answer.
    for (let i = 0; i < sso.UNPROVEN.address + 5; i++) expect((await callback((await start("signin")).url, person(`q${i}`, { email: `q${i}@gmail.com` }))).error).toBe("sso-domain");
    expect((await callback((await start("signin")).url, person("amina"))).ticket).toBeTruthy();
  });
});

describe("start", () => {
  it("returns to Darsi's origin or this organization's own address with access, and nowhere else", async () => {
    expect((await start("signin", {}, { origin: "https://evil.example" })).body).toEqual({ error: "sso-origin" });
    db.docs.set("sites/learn.school.edu", { orgId: "o1", status: "live", steps: { owner: "ok", dns: "ok", hosting: "ok", cert: "ok", auth: "ok", cors: "ok" } });
    expect((await start("signin", {}, { origin: "https://learn.school.edu" })).status).toBe(200);
    db.docs.set("sites/learn.delta.edu", { orgId: "o2", status: "live", steps: { owner: "ok", dns: "ok" } });
    expect((await start("signin", {}, { origin: "https://learn.delta.edu" })).body).toEqual({ error: "sso-origin" });
  });

  it("asks the provider with PKCE S256, the per-organization redirect URI, the derived nonce and the right prompt", async () => {
    const u = new URL((await start("signin")).url);
    expect(u.origin + u.pathname).toBe(`${P.base}/authorize`);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ response_type: "code", client_id: P.clientId, redirect_uri: "https://login.darsiai.org/callback/o1", code_challenge_method: "S256" });
    expect(u.searchParams.get("nonce")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(u.searchParams.get("prompt")).toBeNull(); // a generic provider gets `login` only after this device signed out of a school session
    expect(new URL((await start("signin", { signedOutHere: true })).url).searchParams.get("prompt")).toBe("login");
  });

  it("refuses a challenge that isn't one, a school that is off, and the platform switch", async () => {
    expect((await post("/api/sso/start", { orgId: "o1", mode: "signin", challenge: "short" })).body).toEqual({ error: "sso-state" });
    install("o1", {}, "off");
    expect((await start("signin")).body).toEqual({ error: "sso-no-school" });
    install("o1");
    db.docs.set("config/settings", { ssoOn: false });
    expect((await start("signin")).status).toBe(503);
  });

  it("a new address with every request doesn't dodge the limit: starts are also counted by who connected, before anything is read", async () => {
    // The function's own URL: `fastly-client-ip` (and the first x-forwarded-for hops) are the caller's to write; the
    // last hop is the one Google's front end adds.
    const forged = (n: number) => ({ "fastly-client-ip": `198.51.${n % 250}.${n % 199}`, "x-forwarded-for": `198.51.${n % 250}.${n % 199}, 192.0.2.7` });
    const k = pkcePair();
    const go = (headers: Record<string, string>) => post("/api/sso/start", { orgId: "o1", mode: "signin", challenge: k.challenge }, headers);
    for (let i = 0; i < sso.SIGNIN_HOP_MAX; i++) await go(forged(i));
    expect((await go(forged(50_000))).status).toBe(429);
    const reads = vi.spyOn(db, "doc");
    try {
      expect((await go(forged(77_777))).body).toEqual({ error: "sso-rate" });
      expect(reads).not.toHaveBeenCalled();
    } finally { reads.mockRestore(); }
    // People who come through Hosting (another hop) start as usual.
    expect((await go({ "fastly-client-ip": "41.33.12.7", "x-forwarded-for": "41.33.12.7, 151.101.1.1" })).status).toBe(200);
  });

  // The hop limit used to be 1,500 per 10 minutes: through Hosting that was everyone of one school on one CDN node.
  it("a large school's morning through one Hosting node: the 1,501st person in ten minutes starts like the first", async () => {
    const k = pkcePair();
    const visitor = (n: number) => { const ip = `41.${33 + (n >> 16)}.${(n >> 8) & 255}.${n & 255}`; return { "fastly-client-ip": ip, "x-forwarded-for": `${ip}, 151.101.1.1` }; };
    const go = (n: number) => post("/api/sso/start", { orgId: "o1", mode: "signin", challenge: k.challenge }, visitor(n));
    for (let i = 0; i < 1500; i++) await go(i);
    expect((await go(1500)).status).toBe(200);
  });

  it("takes the school by its slug, and never a tombstoned one", async () => {
    const k = pkcePair();
    expect((await post("/api/sso/start", { slug: "o1-abcd", mode: "signin", challenge: k.challenge })).status).toBe(200);
    db.docs.set("ssoSlugs/o1-abcd", { orgId: "o1", tombstone: true });
    expect((await post("/api/sso/start", { slug: "o1-abcd", mode: "signin", challenge: k.challenge })).body).toEqual({ error: "sso-no-school" });
  });
});

describe("finish proves the browser that started", () => {
  it("login CSRF: another browser's verifier gets nothing, and nothing is made", async () => {
    const s = await start("signin");
    const b = await callback(s.url, person("amina"));
    const other = pkcePair().verifier;
    expect((await finish(b.ticket, other)).body).toEqual({ error: "sso-state" });
    expect(minted()).toEqual([]);
    expect(db.all("ssoIdentities")).toEqual([]);
  });

  it("a missing, empty or \"null\" verifier is refused before the ticket is opened", async () => {
    const s = await start("signin");
    const b = await callback(s.url, person("amina"));
    for (const v of [undefined, "", "null", null, 42]) expect((await finish(b.ticket, v)).body).toEqual({ error: "sso-state" });
    expect((await finish(b.ticket, s.verifier)).status).toBe(200); // the ticket was never spent by those
  });

  it("must come from the origin the flow started on", async () => {
    const s = await start("signin");
    const b = await callback(s.url, person("amina"));
    expect((await finish(b.ticket, s.verifier, {}, { origin: "https://evil.example" })).body).toEqual({ error: "sso-origin" });
  });
});

describe("who a school sign-in becomes", () => {
  it("someone new joins as a student: no email or password at Auth, the organization in the first token, counted once", async () => {
    const r = await signIn(person("amina"));
    expect(r.status).toBe(200);
    const uid = minted()[0].uid;
    expect(minted()[0].claims).toEqual({ sso: "o1" });
    expect(uid).toMatch(/^[A-Za-z0-9]{28}$/);
    expect(auth.users.get(uid)).toMatchObject({ customClaims: { role: "student", orgId: "o1" }, providerData: [] });
    expect(auth.users.get(uid)?.email).toBeUndefined();
    expect(user(uid)).toMatchObject({ role: "student", orgId: "o1", managedBy: "o1", sso: true, createdBy: "sso", ssoEmail: "amina@school.edu", name: "Amina" });
    expect(user(uid)).not.toHaveProperty("email");
    expect(user(uid)).not.toHaveProperty("mustChangePassword");
    expect(db.docs.get(idOf("sub-amina"))).toMatchObject({ uid, linked: "jit", state: "active", email: "amina@school.edu" });
    expect(db.docs.get(idOf("sub-amina"))).not.toHaveProperty("pending");
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 2 });
    // The next sign-in is the same account, and makes nobody new.
    await signIn(person("amina"));
    expect(minted().map((t) => t.uid)).toEqual([uid, uid]);
    expect([...auth.users.keys()].length).toBe(2);
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 2 });
  });

  it("the teacher rule makes a teacher, raises a student later, and the class claim sets the class at creation", async () => {
    install("o1", { teacherRule: { kind: "claim", claim: "groups", value: "teachers" }, classClaim: "class" });
    await signIn(person("tarek", { groups: ["teachers"], class: "5B" }));
    const t = minted()[0].uid;
    expect(user(t)).toMatchObject({ role: "teacher", group: "5B" });
    await signIn(person("mona"));
    const m = minted()[1].uid;
    expect(user(m)).toMatchObject({ role: "student" });
    await signIn(person("mona", { groups: ["/teachers"] }));
    expect(user(m)).toMatchObject({ role: "teacher" });
    expect(auth.users.get(m)?.customClaims).toEqual({ role: "teacher", orgId: "o1" });
    // Never lowered: the claim gone again changes nothing.
    await signIn(person("mona"));
    expect(user(m)).toMatchObject({ role: "teacher" });
  });

  it("connect first: a member of this organization with the same address is told to connect from Me; nothing is made", async () => {
    member("s1", "student", "o1", {}, { email: "amina@school.edu", metadata: { lastSignInTime: "Mon, 03 Nov 2026 10:00:00 GMT" } });
    expect(await signIn(person("amina"))).toMatchObject({ status: 403, error: "sso-connect-first" });
    expect(minted()).toEqual([]);
    expect(db.all("ssoIdentities")).toEqual([]);
    expect(auth.users.size).toBe(2);
  });

  it("an account the organization made, still on its handed-out password, is matched once, and its password is never touched", async () => {
    member("s1", "student", "o1", { createdBy: "a1", mustChangePassword: true }, { email: "amina@school.edu", password: "handed-out" });
    const r = await signIn(person("amina"));
    expect(r.status).toBe(200);
    expect(minted()[0].uid).toBe("s1");
    expect(db.docs.get(idOf("sub-amina"))).toMatchObject({ uid: "s1", linked: "org-made" });
    expect(user("s1")).toHaveProperty("ssoLinkedAt");
    expect(auth.users.get("s1")?.password).toBe("handed-out");
    expect(audits.map((a) => a.action)).toContain("sso.autoLink");
  });

  it("…but not once the person chose their own password and signed in, and never on an address the issuer didn't verify", async () => {
    member("s1", "student", "o1", { createdBy: "a1", mustChangePassword: false }, { email: "amina@school.edu", metadata: { lastSignInTime: "Mon, 03 Nov 2026 10:00:00 GMT" } });
    expect(await signIn(person("amina"))).toMatchObject({ error: "sso-connect-first" });
    install("o1", { allowedDomains: [], openToAll: true });
    member("s1", "student", "o1", { createdBy: "a1", mustChangePassword: true }, { email: "amina@school.edu" });
    expect(await signIn(person("amina", { email_verified: false }))).toMatchObject({ error: "sso-connect-first" });
    expect(minted()).toEqual([]);
  });

  it("removed and blocked identities stay out, whatever the provider says", async () => {
    await signIn(person("amina"));
    db.docs.set(idOf("sub-amina"), { ...db.docs.get(idOf("sub-amina"))!, state: "removed" });
    expect(await signIn(person("amina"))).toMatchObject({ error: "sso-removed" });
    db.docs.set(idOf("sub-amina"), { ...db.docs.get(idOf("sub-amina"))!, state: "blocked" });
    expect(await signIn(person("amina"))).toMatchObject({ error: "sso-disabled" });
    expect(minted()).toHaveLength(1);
  });

  it("removal from the organization (writeClaims' hook) keeps a school-made account out until an admin lets it back in", async () => {
    await signIn(person("amina"));
    const uid = minted()[0].uid;
    db.docs.set(`users/${uid}`, { ...user(uid), role: "learner", orgId: null });
    await billing.writeClaims(uid, "learner", null); // what removeMember and bulk remove end in
    expect(db.docs.get(idOf("sub-amina"))).toMatchObject({ state: "removed" });
    expect(await signIn(person("amina"))).toMatchObject({ error: "sso-removed" });
    const allow = await (sso.manageSso as unknown as { run: (r: unknown) => Promise<Body> }).run({ auth: { uid: "a1", token: {} }, data: { action: "allowBack", orgId: "o1", uid } });
    expect(allow).toEqual({ allowed: true, rejoined: true });
    expect(await signIn(person("amina"))).toMatchObject({ status: 200 });
    expect(minted().at(-1)?.uid).toBe(uid);
    expect(auth.users.get(uid)?.customClaims).toEqual({ role: "student", orgId: "o1" });
  });

  it("a person's own account an admin made (their own email) that left by itself isn't told its school removed it; a managed login is", async () => {
    member("t1", "teacher", "o1", { createdBy: "a1", mustChangePassword: true }, { email: "tarek@school.edu" });
    expect(await signIn(person("tarek"))).toMatchObject({ status: 200 });
    expect(db.docs.get(idOf("sub-tarek"))).toMatchObject({ uid: "t1", linked: "org-made", state: "active" });
    // leaveOrg: the profile, then the claims (whose hook marks the link). Not managed: the link is the person's own.
    db.docs.set("users/t1", { ...user("t1"), role: "learner", orgId: null });
    await billing.writeClaims("t1", "learner", null);
    expect(db.docs.get(idOf("sub-tarek"))).toMatchObject({ state: "removed", moved: true });
    // Removed by the organization (on its list), the same link keeps them out…
    db.docs.set("orgs/o1/private/removed", { uids: { t1: { at: 1, name: "t1" } } });
    expect(await signIn(person("tarek"))).toMatchObject({ error: "sso-removed" });
    // …left of their own accord, it keeps nobody out: the school's sign-in joins them afresh, and never opens t1.
    db.docs.delete("orgs/o1/private/removed");
    expect(await signIn(person("tarek"))).toMatchObject({ status: 200 });
    expect(minted().at(-1)!.uid).not.toBe("t1");
    expect(user("t1")).toMatchObject({ orgId: null });
    // A login the organization manages, connected to the school's sign-in, stays a tombstone whoever took it out.
    member("u1", "student", "o1", { createdBy: "a1", managedBy: "o1" }, { email: "u1@users.darsiai.org" });
    db.docs.set(idOf("sub-u1"), { uid: "u1", orgId: "o1", connectionId: "conn1", issuer: P.base, subject: "sub-u1", email: "u1@school.edu", emailVerified: true, linked: "org-made", state: "active", createdAt: 1, lastAt: 1, expiresAt: null });
    db.docs.set("users/u1", { ...user("u1"), role: "learner", orgId: null });
    await billing.writeClaims("u1", "learner", null);
    expect(db.docs.get(idOf("sub-u1"))).toMatchObject({ state: "removed" });
    expect(db.docs.get(idOf("sub-u1"))).not.toHaveProperty("moved");
    expect(await signIn(person("u1"))).toMatchObject({ error: "sso-removed" });
  });

  it("…and neither after the school moved to another provider: the old link is found by the address, and only the removed list keeps her out", async () => {
    member("t1", "teacher", "o1", { createdBy: "a1" }, { email: "tarek@school.edu" });
    db.docs.set(idOf("sub-tarek"), { uid: "t1", orgId: "o1", connectionId: "conn1", issuer: P.base, subject: "sub-tarek", email: "tarek@school.edu", emailVerified: true, linked: "org-made", state: "active", createdAt: 1, lastAt: 1, expiresAt: null });
    // leaveOrg: not a managed login, so the link is the person's own and is marked `moved`.
    db.docs.set("users/t1", { ...user("t1"), role: "learner", orgId: null });
    await billing.writeClaims("t1", "learner", null);
    expect(db.docs.get(idOf("sub-tarek"))).toMatchObject({ state: "removed", moved: true });
    // The school's new provider knows her by another subject: only the verified address finds the old link.
    install("o1", { connectionId: "conn2" });
    const again = person("tarek", { sub: "new-tarek" });
    // Removed by the organization (on its list), the old link still keeps her out…
    db.docs.set("orgs/o1/private/removed", { uids: { t1: { at: 1, name: "t1" } } });
    expect(await signIn(again)).toMatchObject({ error: "sso-removed" });
    expect(minted()).toEqual([]);
    // …left of her own accord, it keeps nobody out: she joins afresh, and t1 is never opened.
    db.docs.delete("orgs/o1/private/removed");
    expect(await signIn(again)).toMatchObject({ status: 200 });
    expect(minted().at(-1)!.uid).not.toBe("t1");
    expect(user("t1")).toMatchObject({ orgId: null });
    expect(db.docs.get(idOf("new-tarek", "o1", "conn2"))).toMatchObject({ uid: minted().at(-1)!.uid, linked: "jit", state: "active" });
  });

  it("a school that moved to another provider still keeps a removed school-made account out: found by its verified address", async () => {
    await signIn(person("amina"));
    const uid = minted()[0].uid;
    db.docs.set(`users/${uid}`, { ...user(uid), role: "learner", orgId: null });
    await billing.writeClaims(uid, "learner", null);
    expect(db.docs.get(idOf("sub-amina"))).toMatchObject({ state: "removed" });
    // A new provider address is a new connection, even with nobody connected (manageSso save: ssoManage.test.ts), and
    // the new provider knows the person by another subject.
    install("o1", { connectionId: "conn2" });
    expect(await signIn(person("amina", { sub: "other-provider-amina" }))).toMatchObject({ error: "sso-removed" });
    expect(minted()).toHaveLength(1);
    expect(auth.users.size).toBe(2); // the admin and the removed account: nobody new was made
    expect(db.all("ssoIdentities")).toHaveLength(1);
  });

  it("after a move to another provider, a school-made student or teacher is found again by the verified address, once, and the audit log says so", async () => {
    await signIn(person("amina"));
    const uid = minted()[0].uid;
    install("o1", { connectionId: "conn2" });
    audits.length = 0;
    expect(await signIn(person("amina", { sub: "new-amina" }))).toMatchObject({ status: 200 });
    expect(minted().at(-1)!.uid).toBe(uid);
    expect(db.docs.get(idOf("new-amina", "o1", "conn2"))).toMatchObject({ uid, linked: "jit", state: "active" });
    expect(db.docs.get(idOf("sub-amina"))).toBeUndefined();
    expect(audits).toEqual([expect.objectContaining({ action: "sso.rekey", by: uid, uid, orgId: "o1", email: "amina@school.edu", from: "conn1", to: "conn2" })]);
    // From then on it is a known identity: nothing is moved or audited again.
    expect(await signIn(person("amina", { sub: "new-amina" }))).toMatchObject({ status: 200 });
    expect(audits).toHaveLength(1);
    expect(auth.users.size).toBe(2);
  });

  it("…but never a member's account with a login of its own, or one that became an admin: whoever holds the address at the new provider opens nothing", async () => {
    // The head teacher: made by the school's sign-in under the old connection, since made an admin.
    await signIn(person("head"));
    const head = minted()[0].uid;
    db.docs.set(`users/${head}`, { ...user(head), role: "orgAdmin" });
    auth.users.get(head)!.customClaims = { role: "orgAdmin", orgId: "o1" };
    // A teacher an admin made with her own address, matched on her first school sign-in, now on her own password.
    member("t1", "teacher", "o1", { createdBy: "a1", mustChangePassword: true }, { email: "tarek@school.edu" });
    await signIn(person("tarek"));
    expect(db.docs.get(idOf("sub-tarek"))).toMatchObject({ uid: "t1", linked: "org-made" });
    db.docs.set("users/t1", { ...user("t1"), mustChangePassword: false });
    auth.users.get("t1")!.metadata = { lastSignInTime: "Mon, 03 Nov 2026 10:00:00 GMT" };
    // The school moves to a provider whose addresses it vouches for (and where people can set their own).
    install("o1", { connectionId: "conn2", emailsVerifiedBySchool: true });
    audits.length = 0;
    const before = { minted: minted().length, ids: db.all("ssoIdentities").length, users: auth.users.size };
    expect(await signIn(person("head", { sub: "a-pupil", email_verified: false }))).toMatchObject({ status: 403, error: "sso-connect-first" });
    expect(await signIn(person("tarek", { sub: "another-pupil" }))).toMatchObject({ status: 403, error: "sso-connect-first" });
    expect({ minted: minted().length, ids: db.all("ssoIdentities").length, users: auth.users.size }).toEqual(before);
    expect(db.docs.get(idOf("sub-head"))).toMatchObject({ uid: head, connectionId: "conn1" });
    expect(audits).toEqual([]);
    // The teacher signs in with her own password and connects again from Me: the new identity takes the old one's place.
    const s = await start("link", {}, signedIn("t1"));
    const b = await callback(s.url, person("tarek", { sub: "new-tarek" }));
    expect((await finish(b.ticket, s.verifier, { confirm: true }, signedIn("t1"))).body).toEqual({ linked: true, email: "tarek@school.edu" });
    expect(db.docs.get(idOf("new-tarek", "o1", "conn2"))).toMatchObject({ uid: "t1", state: "active", linked: "org-made" });
    expect(db.docs.get(idOf("sub-tarek"))).toBeUndefined();
    expect(audits.at(-1)).toMatchObject({ action: "sso.link", uid: "t1", earlierConnection: true });
    expect(await signIn(person("tarek", { sub: "new-tarek" }))).toMatchObject({ status: 200 });
    expect(minted().at(-1)!.uid).toBe("t1");
    // Demoted to teacher, the head is a school-made teacher again and is found by the address.
    db.docs.set(`users/${head}`, { ...user(head), role: "teacher" });
    auth.users.get(head)!.customClaims = { role: "teacher", orgId: "o1" };
    expect(await signIn(person("head", { sub: "new-head" }))).toMatchObject({ status: 200 });
    expect(minted().at(-1)!.uid).toBe(head);
  });

  it("an admin the school's sign-in made, with an email login added since, connects again from Me after the move, and the account stays the school's", async () => {
    await signIn(person("head"));
    const head = minted()[0].uid;
    db.docs.set(`users/${head}`, { ...user(head), role: "orgAdmin" });
    Object.assign(auth.users.get(head)!, { customClaims: { role: "orgAdmin", orgId: "o1" }, email: "head@mail.example", providerData: [{ providerId: "password" }] });
    install("o1", { connectionId: "conn2" });
    expect(await signIn(person("head", { sub: "new-head" }))).toMatchObject({ error: "sso-connect-first" });
    const s = await start("link", {}, signedIn(head));
    const b = await callback(s.url, person("head", { sub: "new-head" }));
    expect((await finish(b.ticket, s.verifier, { confirm: true }, signedIn(head))).body).toEqual({ linked: true, email: "head@school.edu" });
    // Still `jit`: removal, "Let back in" and the daily job go on treating it as the account the school made.
    expect(db.docs.get(idOf("new-head", "o1", "conn2"))).toMatchObject({ uid: head, linked: "jit", state: "active" });
    expect(db.docs.get(idOf("sub-head"))).toBeUndefined();
    expect(await signIn(person("head", { sub: "new-head" }))).toMatchObject({ status: 200 });
    expect(minted().at(-1)!.uid).toBe(head);
  });

  it("an identity under an earlier connection that is blocked still refuses connecting a new one from Me", async () => {
    member("t1", "teacher", "o1", {}, { email: "t1@gmail.com" });
    db.docs.set(idOf("sub-tarek"), { uid: "t1", orgId: "o1", connectionId: "conn1", issuer: P.base, subject: "sub-tarek", email: "tarek@school.edu", emailVerified: true, linked: "self", state: "blocked", blockedBy: "admin", createdAt: 1, lastAt: 1, expiresAt: null });
    install("o1", { connectionId: "conn2" });
    const s = await start("link", {}, signedIn("t1"));
    const b = await callback(s.url, person("tarek", { sub: "new-tarek" }));
    expect((await finish(b.ticket, s.verifier, { confirm: true }, signedIn("t1"))).body).toEqual({ error: "sso-linked" });
    expect(db.docs.get(idOf("sub-tarek"))).toMatchObject({ state: "blocked" });
    expect(db.docs.get(idOf("new-tarek", "o1", "conn2"))).toBeUndefined();
  });

  it("a provider that names a removed or blocked person by a new subject (pairwise, after its client changed) doesn't make them a new account", async () => {
    await signIn(person("amina"));
    const uid = minted()[0].uid;
    db.docs.set(`users/${uid}`, { ...user(uid), role: "learner", orgId: null });
    await billing.writeClaims(uid, "learner", null);
    expect(db.docs.get(idOf("sub-amina"))).toMatchObject({ state: "removed", emailVerified: true });
    // The admin changed the client at the same provider address: the connection stays (manageSso save), and a provider
    // with pairwise subjects now knows everyone by another one.
    expect(await signIn(person("amina", { sub: "pairwise-2-amina" }))).toMatchObject({ error: "sso-removed" });
    expect(auth.users.size).toBe(2); // the admin and the removed account
    expect(db.all("ssoIdentities")).toHaveLength(1);
    // Blocked (a suspension that outlived the removal) says so instead.
    db.docs.set(idOf("sub-amina"), { ...db.docs.get(idOf("sub-amina"))!, state: "blocked", blockedBy: "suspension" });
    expect(await signIn(person("amina", { sub: "pairwise-2-amina" }))).toMatchObject({ error: "sso-disabled" });
    expect(minted()).toHaveLength(1);
    expect(db.all("ssoIdentities")).toHaveLength(1);
    // Another person at the same provider, with their own address, joins as usual.
    expect(await signIn(person("bilal", { sub: "pairwise-2-bilal" }))).toMatchObject({ status: 200 });
    // A member an admin blocked (still in the organization, the address on their own profile) is told the sign-in is
    // blocked under the new subject too, not to "connect it from Me": the school's sign-in is their only way in.
    const bilal = minted().at(-1)!.uid;
    expect(user(bilal)).toMatchObject({ orgId: "o1", ssoEmail: "bilal@school.edu" });
    db.docs.set(idOf("pairwise-2-bilal"), { ...db.docs.get(idOf("pairwise-2-bilal"))!, state: "blocked", blockedBy: "admin" });
    const before = { users: auth.users.size, ids: db.all("ssoIdentities").length, minted: minted().length };
    expect(await signIn(person("bilal", { sub: "pairwise-3-bilal" }))).toMatchObject({ error: "sso-disabled" });
    expect({ users: auth.users.size, ids: db.all("ssoIdentities").length, minted: minted().length }).toEqual(before);
  });

  it("…but only on an address the issuer verified, and never for a personal link that left of its own accord", async () => {
    install("o1", { allowedDomains: [], openToAll: true });
    await signIn(person("amina"));
    const uid = minted()[0].uid;
    db.docs.set(`users/${uid}`, { ...user(uid), role: "learner", orgId: null });
    await billing.writeClaims(uid, "learner", null);
    // An unverified address proves nothing about who was removed: Mallory typing Amina's joins as herself.
    expect(await signIn(person("mallory", { email: "amina@school.edu", email_verified: false }))).toMatchObject({ status: 200 });
    // The tombstone itself must carry a verified address too.
    db.docs.set(idOf("sub-amina"), { ...db.docs.get(idOf("sub-amina"))!, emailVerified: false });
    expect(await signIn(person("amina", { sub: "pairwise-2-amina" }))).toMatchObject({ status: 200 });
    // A personal account's own link, left of its own accord (not on the removed list), keeps nobody out.
    member("s1", "learner", null);
    auth.users.get("s1")!.customClaims = {};
    const own = (sub: string, email: string) => db.docs.set(idOf(sub), { uid: "s1", orgId: "o1", connectionId: "conn1", issuer: P.base, subject: sub, email, emailVerified: true, linked: "self", state: "removed", moved: true, createdAt: 1, lastAt: 1, expiresAt: null });
    own("sub-omar", "omar@school.edu");
    expect(await signIn(person("omar", { sub: "pairwise-2-omar" }))).toMatchObject({ status: 200 });
    // …and removed by the organization, it does.
    own("sub-zain", "zain@school.edu");
    db.docs.set("orgs/o1/private/removed", { uids: { s1: { at: 1, name: "s1" } } });
    expect(await signIn(person("zain", { sub: "pairwise-2-zain" }))).toMatchObject({ error: "sso-removed" });
  });

  it("someone the organization removed, with no school identity yet, isn't let back in by their verified school address", async () => {
    member("s5", "learner", null, {}, { email: "amina@school.edu" });
    auth.users.get("s5")!.customClaims = {};
    db.docs.set("orgs/o1/private/removed", { uids: { s5: { at: 1, name: "s5" } } });
    expect(await signIn(person("amina"))).toMatchObject({ error: "sso-removed" });
    expect(minted()).toEqual([]);
    expect(db.all("ssoIdentities")).toEqual([]);
    // An address the issuer didn't vouch for proves nothing about who was removed: that one joins as usual.
    install("o1", { allowedDomains: [], openToAll: true });
    expect(await signIn(person("amina", { email_verified: false }))).toMatchObject({ status: 200 });
  });

  it("a profile keeps only an address the issuer vouched for (an unverified one can't shut the real person out)", async () => {
    install("o1", { allowedDomains: [], openToAll: true });
    expect(await signIn(person("mallory", { email: "amina@school.edu", email_verified: false }))).toMatchObject({ status: 200 });
    const m = minted()[0].uid;
    expect(user(m)).toMatchObject({ ssoEmail: null });
    expect(await signIn(person("amina"))).toMatchObject({ status: 200 });
    const a = minted()[1].uid;
    expect(a).not.toBe(m);
    expect(user(a)).toMatchObject({ ssoEmail: "amina@school.edu" });
  });

  it("the allowance: a school that made its hour's accounts, or reached its ceiling, is full", async () => {
    const { jitKey } = await import("../src/ssoCore");
    db.docs.set("orgs/o1/private/ssoHealth", { jit: { [jitKey(Date.now())]: 200 } });
    expect(await signIn(person("amina"))).toMatchObject({ status: 429, error: "sso-full" });
    expect(db.docs.get("orgs/o1/private/ssoHealth")).toHaveProperty("full.at");
    db.docs.set("orgs/o1/private/ssoHealth", {});
    db.docs.set("orgs/o1", { ...db.docs.get("orgs/o1")!, ssoCeiling: 1 });
    expect(await signIn(person("amina"))).toMatchObject({ error: "sso-full" });
    expect(auth.users.size).toBe(1);
  });

  it("a first sign-in's transactions read the person's own identity only: the hour's counter and the member count are raised unread", async () => {
    // Everything a transaction reads is locked until it ends; the organization and its ssoHealth are shared by every
    // first sign-in of a school, so a class joining together would abort each other's transactions.
    const read: string[] = [];
    const run = db.runTransaction.bind(db);
    const spy = vi.spyOn(db, "runTransaction").mockImplementation(((fn: (tx: Body) => Promise<unknown>) =>
      run((tx) => fn({ ...(tx as Body), get: (ref: { path: string }) => { read.push(ref.path); return (tx as { get: (r: unknown) => Promise<unknown> }).get(ref); } }))) as never);
    try {
      const { jitKey } = await import("../src/ssoCore");
      db.docs.set("orgs/o1/private/ssoHealth", { jit: { [jitKey(Date.now())]: 3 }, problems: { full: { n: 1 } } });
      expect(await signIn(person("amina"))).toMatchObject({ status: 200 });
      expect(await signIn(person("bilal"))).toMatchObject({ status: 200 });
      expect(read.sort()).toEqual([idOf("sub-amina"), idOf("sub-amina"), idOf("sub-bilal"), idOf("sub-bilal")].sort());
      // Counted all the same: two more this hour, two more members, and nothing else in ssoHealth touched.
      expect(db.docs.get("orgs/o1/private/ssoHealth")).toEqual({ jit: { [jitKey(Date.now())]: 5 }, problems: { full: { n: 1 } } });
      expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 3 });
    } finally { spy.mockRestore(); }
  });

  it("an organization deleted while someone was joining: nothing to count in, and the creation is still finished", async () => {
    const make = auth.createUser.bind(auth);
    const spy = vi.spyOn(auth, "createUser").mockImplementation(((p: Parameters<typeof make>[0]) => { db.docs.delete("orgs/o1"); return make(p); }) as never);
    try {
      const s = await start("signin");
      const b = await callback(s.url, person("amina"));
      await finish(b.ticket, s.verifier);
    } finally { spy.mockRestore(); }
    expect(db.docs.get("orgs/o1")).toBeUndefined(); // never made again by the count
    expect(db.docs.get(idOf("sub-amina"))).toMatchObject({ linked: "jit", state: "active" });
    expect(db.docs.get(idOf("sub-amina"))).not.toHaveProperty("pending");
  });

  it("two first sign-ins of the same person at once make one account", async () => {
    db.serial = true;
    const one = await start("signin"), two = await start("signin");
    const a = await callback(one.url, person("amina")), b = await callback(two.url, person("amina"));
    const [x, y] = await Promise.all([finish(a.ticket, one.verifier), finish(b.ticket, two.verifier)]);
    expect([x.status, y.status]).toEqual([200, 200]);
    const uids = minted().map((t) => t.uid);
    expect(new Set(uids).size).toBe(1);
    expect(auth.users.size).toBe(2);
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 2 });
  });

  it("a creation that stopped half-way is finished with the same account and counted once, however many finish it", async () => {
    const old = Date.now() - 120_000;
    const pending = (sub: string, uid: string) => db.docs.set(idOf(sub), {
      uid, orgId: "o1", connectionId: "conn1", issuer: P.base, subject: sub, email: `${sub.slice(4)}@school.edu`, emailVerified: true,
      linked: "jit", state: "active", pending: true, createdAt: old, lastAt: old, expiresAt: old + 30 * 86_400_000,
    });
    const joins = () => audits.filter((a) => a.action === "sso.join");
    // Stopped right after the reservation (no Auth account, no profile): two sign-ins resume it at once.
    const A = "A".repeat(28);
    pending("sub-amina", A);
    db.serial = true;
    const one = await start("signin"), two = await start("signin");
    const a = await callback(one.url, person("amina")), b = await callback(two.url, person("amina"));
    const [x, y] = await Promise.all([finish(a.ticket, one.verifier), finish(b.ticket, two.verifier)]);
    expect([x.status, y.status]).toEqual([200, 200]);
    expect(minted().map((t) => t.uid)).toEqual([A, A]);
    expect(user(A)).toMatchObject({ role: "student", orgId: "o1", sso: true });
    expect(db.docs.get(idOf("sub-amina"))).not.toHaveProperty("pending");
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 2 });
    expect(joins()).toEqual([expect.objectContaining({ uid: A, resumed: true })]);
    // Stopped after the profile was written, before the count: whoever resumes it counts it, once.
    const B = "B".repeat(28);
    pending("sub-bob", B);
    auth.users.set(B, { uid: B, providerData: [], customClaims: { role: "student", orgId: "o1" } });
    db.docs.set(`users/${B}`, { name: "Bob", role: "student", orgId: "o1", managedBy: "o1", sso: true, createdBy: "sso", ssoEmail: "bob@school.edu", active: true });
    expect((await signIn(person("bob"))).status).toBe(200);
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 3 });
    expect(db.docs.get(idOf("sub-bob"))).not.toHaveProperty("pending");
    // Signing in again counts nobody and joins nobody.
    await signIn(person("bob")); await signIn(person("amina"));
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 3 });
    expect(joins()).toHaveLength(2);
    expect(auth.users.size).toBe(3);
  });

  it("re-checks the account just before minting, and refuses when the signer can't sign", async () => {
    await signIn(person("amina"));
    const uid = minted()[0].uid;
    auth.users.get(uid)!.disabled = true;
    expect(await signIn(person("amina"))).toMatchObject({ error: "sso-disabled" });
    auth.users.get(uid)!.disabled = false;
    auth.signerDown = true;
    expect(await signIn(person("amina"))).toMatchObject({ status: 503, error: "sso-signer" });
  });

  it("Microsoft: the person is tid:oid (Entra's sub changes per app), and a token from another tenant is refused", async () => {
    const tenant = "11111111-2222-3333-4444-555555555555", oid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const iss = microsoftIssuer(tenant);
    install("o1", { preset: "microsoft", tenant, issuer: iss, subjectKind: "tid-oid", allowedDomains: [] });
    P.tokenIss = iss;
    const ms = (sub: string, more: Body = {}) => ({ sub, tid: tenant, oid, preferred_username: "amina@school.edu", name: "Amina", ...more });
    expect(await signIn(ms("pairwise-1"))).toMatchObject({ status: 200 });
    const uid = minted()[0].uid;
    expect(db.docs.get(idOf(`${tenant}:${oid}`))).toMatchObject({ uid, subject: `${tenant}:${oid}` });
    expect(await signIn(ms("pairwise-2"))).toMatchObject({ status: 200 });
    expect(minted()[1].uid).toBe(uid);
    expect(await signIn(ms("x", { tid: "99999999-2222-3333-4444-555555555555" }))).toMatchObject({ error: "sso-issuer" });
    // The address came from preferred_username, which Entra doesn't vouch for: kept for display, never verified.
    expect(db.docs.get(idOf(`${tenant}:${oid}`))).toMatchObject({ emailVerified: false });
    // The profile's address is the tenant's UPN, never an `email` claim Entra didn't verify (anyone may type one).
    const oid2 = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(await signIn(ms("x2", { oid: oid2, email: "boss@school.edu", preferred_username: "omar@school.edu" }))).toMatchObject({ status: 200 });
    expect(user(minted()[2].uid)).toMatchObject({ ssoEmail: "omar@school.edu" });
  });

  it("Google: hd must be there and allowed, and the address verified and on that domain", async () => {
    install("o1", { preset: "google", issuer: GOOGLE_ISSUER });
    P.tokenIss = GOOGLE_ISSUER;
    const u = new URL((await start("signin")).url);
    expect([u.searchParams.get("hd"), u.searchParams.get("prompt")]).toEqual(["school.edu", "select_account"]);
    expect(await signIn(person("amina", { hd: "school.edu" }))).toMatchObject({ status: 200 });
    expect(await signIn(person("bob"))).toMatchObject({ error: "sso-domain" });
    expect(await signIn(person("bob", { hd: "other.edu", email: "bob@other.edu" }))).toMatchObject({ error: "sso-domain" });
    expect(await signIn(person("bob", { hd: "school.edu", email_verified: false }))).toMatchObject({ error: "sso-email" });
  });
});

describe("link (Me → Connect school sign-in)", () => {
  beforeEach(() => { member("s1", "student", "o1", {}, { email: "s1@gmail.com" }); });
  const linkStart = (headers: Record<string, string>) => start("link", {}, headers);

  it("needs a sign-in within ten minutes, a member of this organization, and never a platform admin", async () => {
    expect((await linkStart({})).body).toEqual({ error: "sso-recent" });
    expect((await linkStart(signedIn("s1", 3600))).body).toEqual({ error: "sso-recent" });
    member("root", "superadmin", null);
    expect((await linkStart(signedIn("root"))).body).toEqual({ error: "sso-staff" });
    member("x2", "student", "o2");
    expect((await linkStart(signedIn("x2"))).body).toEqual({ error: "sso-other-org" });
  });

  it("asks the provider for a fresh sign-in, then links only for the same account, after it confirms", async () => {
    const s = await linkStart(signedIn("s1"));
    expect(new URL(s.url).searchParams.get("prompt")).toBe("login");
    const b = await callback(s.url, person("amina"));
    expect(b.loc.startsWith(`${ORIGIN}/me#sso=`)).toBe(true);
    expect((await finish(b.ticket, s.verifier)).body).toEqual({ error: "sso-recent" });
    member("s2", "student", "o1");
    expect((await finish(b.ticket, s.verifier, {}, signedIn("s2"))).body).toEqual({ error: "sso-state" });
    expect((await finish(b.ticket, s.verifier, {}, signedIn("s1"))).body).toEqual({ confirm: { name: "Amina", email: "amina@school.edu", school: "Nile School" } });
    expect(db.all("ssoIdentities")).toEqual([]);
    expect((await finish(b.ticket, s.verifier, { confirm: true }, signedIn("s1"))).body).toEqual({ linked: true, email: "amina@school.edu" });
    expect(db.docs.get(idOf("sub-amina"))).toMatchObject({ uid: "s1", linked: "self" });
    expect(user("s1")).toHaveProperty("ssoLinkedAt");
    expect(audits.find((a) => a.action === "sso.link")).toMatchObject({ uid: "s1", email: "amina@school.edu" });
    expect(minted()).toEqual([]); // linking signs nobody in
    // From now on the school's sign-in opens s1.
    await signIn(person("amina"));
    expect(minted()[0].uid).toBe("s1");
  });

  it("the confirmation may be answered up to ten minutes after the callback; nothing else outlives the ticket", async () => {
    const s = await linkStart(signedIn("s1"));
    const b = await callback(s.url, person("amina"));
    expect((await finish(b.ticket, s.verifier, {}, signedIn("s1"))).body).toMatchObject({ confirm: { email: "amina@school.edu" } });
    // Another link flow, and a sign-in whose page never finished: their tickets are sealed at the same moment.
    member("s2", "student", "o1");
    const s2 = await linkStart(signedIn("s2"));
    const b2 = await callback(s2.url, person("bob"));
    const si = await start("signin");
    const bi = await callback(si.url, person("carl"));
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t0 = Date.now();
      // Three minutes on, the person has read the question. The first step is over…
      vi.setSystemTime(t0 + 3 * 60_000);
      expect((await finish(b.ticket, s.verifier, {}, signedIn("s1"))).body).toEqual({ error: "sso-state" });
      // …a sign-in's ticket opens nothing, with or without `confirm`…
      expect((await finish(bi.ticket, si.verifier)).body).toEqual({ error: "sso-state" });
      expect((await finish(bi.ticket, si.verifier, { confirm: true })).body).toEqual({ error: "sso-state" });
      expect(minted()).toEqual([]);
      expect(auth.users.size).toBe(3);
      // …and Yes still links, for the same account only.
      expect((await finish(b.ticket, s.verifier, { confirm: true }, signedIn("s2"))).body).toEqual({ error: "sso-state" });
      expect((await finish(b.ticket, s.verifier, { confirm: true }, signedIn("s1"))).body).toEqual({ linked: true, email: "amina@school.edu" });
      expect(db.docs.get(idOf("sub-amina"))).toMatchObject({ uid: "s1", linked: "self" });
      // Eleven minutes after the callback the answer is too late.
      vi.setSystemTime(t0 + 11 * 60_000);
      expect((await finish(b2.ticket, s2.verifier, { confirm: true }, signedIn("s2"))).body).toEqual({ error: "sso-state" });
      expect(db.docs.get(idOf("sub-bob"))).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });

  it("takes the identity from an empty account the school made, which is then deleted; never from one with learning", async () => {
    await signIn(person("amina"));
    const empty = minted()[0].uid;
    const s = await linkStart(signedIn("s1"));
    const b = await callback(s.url, person("amina"));
    expect((await finish(b.ticket, s.verifier, { confirm: true }, signedIn("s1"))).body).toMatchObject({ linked: true });
    expect(db.docs.get(idOf("sub-amina"))).toMatchObject({ uid: "s1" });
    expect(db.docs.get(`accountDeletions/${empty}`)).toMatchObject({ orgId: "o1", via: "sso-link" });

    await signIn(person("bob"));
    const busy = minted()[1].uid;
    db.docs.set(`users/${busy}/progress/l1`, { lessonId: "l1" });
    member("s3", "student", "o1");
    const s2 = await linkStart(signedIn("s3"));
    const b2 = await callback(s2.url, person("bob"));
    expect((await finish(b2.ticket, s2.verifier, { confirm: true }, signedIn("s3"))).body).toEqual({ error: "sso-linked" });
  });

  it("never deletes a school-made account that is an admin or teaches pupils", async () => {
    // Made by the school's sign-in, since made an admin: no learning, and not empty.
    await signIn(person("amina"));
    const head = minted()[0].uid;
    db.docs.set(`users/${head}`, { ...user(head), role: "orgAdmin" });
    auth.users.get(head)!.customClaims = { role: "orgAdmin", orgId: "o1" };
    const s = await linkStart(signedIn("s1"));
    const b = await callback(s.url, person("amina"));
    expect((await finish(b.ticket, s.verifier, { confirm: true }, signedIn("s1"))).body).toEqual({ error: "sso-linked" });
    expect(db.docs.get(`accountDeletions/${head}`)).toBeUndefined();
    expect(db.docs.get(idOf("sub-amina"))).toMatchObject({ uid: head });

    // A teacher the school's sign-in made, with a pupil: the same answer, before the question is even asked.
    await signIn(person("bob"));
    const teacher = minted()[1].uid;
    db.docs.set(`users/${teacher}`, { ...user(teacher), role: "teacher" });
    auth.users.get(teacher)!.customClaims = { role: "teacher", orgId: "o1" };
    db.docs.set("users/p1", { name: "p1", role: "student", orgId: "o1", teacherId: teacher });
    member("s3", "student", "o1");
    const s2 = await linkStart(signedIn("s3"));
    const b2 = await callback(s2.url, person("bob"));
    expect((await finish(b2.ticket, s2.verifier, {}, signedIn("s3"))).body).toEqual({ error: "sso-linked" });
    expect((await finish(b2.ticket, s2.verifier, { confirm: true }, signedIn("s3"))).body).toEqual({ error: "sso-linked" });
    expect(db.docs.get(`accountDeletions/${teacher}`)).toBeUndefined();
    // Once the pupil has another teacher, the empty teacher account makes room as any empty one does.
    db.docs.set("users/p1", { ...user("p1"), teacherId: null });
    expect((await finish(b2.ticket, s2.verifier, { confirm: true }, signedIn("s3"))).body).toMatchObject({ linked: true });
    expect(db.docs.get(`accountDeletions/${teacher}`)).toMatchObject({ orgId: "o1", via: "sso-link" });
  });

  it("a personal account that moves to another organization loses the link (writeClaims' hook)", async () => {
    const s = await linkStart(signedIn("s1"));
    const b = await callback(s.url, person("amina"));
    await finish(b.ticket, s.verifier, { confirm: true }, signedIn("s1"));
    await billing.writeClaims("s1", "student", "o2");
    expect(db.docs.get(idOf("sub-amina"))).not.toMatchObject({ state: "active" });
    // Left of their own accord (not on the removed list): the school's sign-in no longer opens s1, and joins afresh.
    expect(await signIn(person("amina"))).toMatchObject({ status: 200 });
    expect(minted()[0].uid).not.toBe("s1");
  });

  it("someone the organization removed stays out even when their link was to their own account", async () => {
    const s = await linkStart(signedIn("s1"));
    const b = await callback(s.url, person("amina"));
    await finish(b.ticket, s.verifier, { confirm: true }, signedIn("s1"));
    // What removeMember does: the removed list first, then the organization taken away (writeClaims).
    db.docs.set("orgs/o1/private/removed", { uids: { s1: { at: 1, name: "s1" } } });
    db.docs.set("users/s1", { ...user("s1"), role: "learner", orgId: null });
    await billing.writeClaims("s1", "learner", null);
    expect(await signIn(person("amina"))).toMatchObject({ error: "sso-removed" });
    expect(minted()).toEqual([]);
    expect(auth.users.size).toBe(2);
    // "Let back in" lifts it, but never moves the person's own account back into the organization.
    const run = (sso.manageSso as unknown as { run: (r: unknown) => Promise<Body> }).run;
    expect(await run({ auth: { uid: "a1", token: {} }, data: { action: "allowBack", orgId: "o1", uid: "s1" } })).toEqual({ allowed: true, rejoined: false });
    expect(user("s1")).toMatchObject({ orgId: null });
    expect(db.docs.get(idOf("sub-amina"))).toBeUndefined();
    expect(db.docs.get("orgs/o1/private/removed")).toEqual({ uids: {} });
  });

  it("a person who left and came back connects again", async () => {
    const s = await linkStart(signedIn("s1"));
    const b = await callback(s.url, person("amina"));
    await finish(b.ticket, s.verifier, { confirm: true }, signedIn("s1"));
    db.docs.set("users/s1", { ...user("s1"), orgId: "o2" });
    await billing.writeClaims("s1", "student", "o2");
    db.docs.set("users/s1", { ...user("s1"), orgId: "o1" });
    await billing.writeClaims("s1", "student", "o1");
    const s2 = await linkStart(signedIn("s1"));
    const b2 = await callback(s2.url, person("amina"));
    expect((await finish(b2.ticket, s2.verifier, { confirm: true }, signedIn("s1"))).body).toEqual({ linked: true, email: "amina@school.edu" });
    expect(db.docs.get(idOf("sub-amina"))).toMatchObject({ uid: "s1", state: "active", linked: "self" });
  });
});

describe("test mode", () => {
  const run = (data: Body, uid = "a1") => (sso.manageSso as unknown as { run: (r: unknown) => Promise<Body> }).run({ auth: { uid, token: {} }, data: { orgId: "o1", ...data } });

  it("an admin's test records what would happen and never links, makes or signs anyone in", async () => {
    install("o1", { testedRev: null }, "draft");
    const s = await start("test", {}, signedIn("a1"));
    const b = await callback(s.url, person("amina"));
    expect(b.loc.startsWith(`${ORIGIN}/admin?tab=signin#sso=`)).toBe(true);
    expect((await finish(b.ticket, s.verifier)).body).toEqual({ error: "sso-recent" });
    const r = (await finish(b.ticket, s.verifier, {}, signedIn("a1"))).body as Body;
    expect(r).toMatchObject({ tested: "create-student", ok: true, email: "amina@school.edu" });
    expect(r.claimsSeen).toEqual(expect.arrayContaining(["email", "email_verified", "name"]));
    expect(db.all("ssoIdentities")).toEqual([]);
    expect(auth.users.size).toBe(1);
    expect(minted()).toEqual([]);
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ status: "tested", testedRev: 1, lastTest: { ok: true, decision: "create-student", asStudent: false, by: "a1" } });
  });

  it("only this organization's admins test with their own sign-in", async () => {
    member("s1", "student", "o1");
    expect((await start("test", {}, signedIn("s1"))).body).toEqual({ error: "sso-other-org" });
  });

  it("a student's one-time link: no sign-in needed, recorded as the student test, then used up", async () => {
    install("o1", {}, "tested");
    const { token } = await run({ action: "testLink" }) as { token: string };
    const s = await start("test", { testToken: token });
    const b = await callback(s.url, person("amina"));
    // Back to /signin, the page the link opened (a signed-out student can't open the admin pages), same fragment.
    expect(b.out.status).toBe(303);
    expect(b.loc).toBe(`${ORIGIN}/signin#sso=${encodeURIComponent(b.ticket!)}&f=${(s.body as { flow: string }).flow}`);
    expect((await finish(b.ticket, s.verifier)).body).toMatchObject({ tested: "create-student" });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ studentTestRev: 1, lastTest: { asStudent: true } });
    expect(db.docs.get(`ssoTests/${token}`)).toBeUndefined();
    expect((await start("test", { testToken: token })).body).toEqual({ error: "sso-state" });
  });

  it("a student's test that fails goes back to /signin too, with the error; an admin's own goes back to the wizard", async () => {
    install("o1", {}, "tested");
    member("root", "superadmin", null);
    const { token } = await run({ action: "testLink" }) as { token: string };
    const s = await start("test", { testToken: token });
    const b = await callback(s.url, person("eve", { email: "eve@gmail.com" }));
    expect(b.loc).toBe(`${ORIGIN}/signin#sso_error=sso-domain&f=${(s.body as { flow: string }).flow}`);
    // The organization's admin: its sign-in tab. A platform admin: that school's page.
    const own = await start("test", {}, signedIn("a1"));
    const o = await callback(own.url, person("amina"));
    expect(o.loc).toBe(`${ORIGIN}/admin?tab=signin#sso=${encodeURIComponent(o.ticket!)}&f=${(own.body as { flow: string }).flow}`);
    const plat = await start("test", {}, signedIn("root"));
    const p = await callback(plat.url, person("amina"));
    expect(p.loc).toBe(`${ORIGIN}/super/orgs/o1?tab=signin#sso=${encodeURIComponent(p.ticket!)}&f=${(plat.body as { flow: string }).flow}`);
    expect((await finish(p.ticket, plat.verifier, {}, signedIn("root"))).body).toMatchObject({ tested: "create-student" });
  });

  it("finish asks Auth again: an admin who lost the role, was frozen, disabled or moved since the start records nothing", async () => {
    for (const change of [
      (u: Body) => { u.customClaims = { role: "teacher", orgId: "o1" }; },
      (u: Body) => { u.customClaims = { role: "orgAdmin", orgId: "o2" }; },
      (u: Body) => { u.customClaims = { role: "orgAdmin", orgId: "o1", frozen: true }; },
      (u: Body) => { u.disabled = true; },
    ]) {
      member("a1", "orgAdmin", "o1");
      install("o1", { testedRev: null }, "draft");
      const s = await start("test", {}, signedIn("a1"));
      const b = await callback(s.url, person("amina"));
      change(auth.users.get("a1") as unknown as Body);
      expect((await finish(b.ticket, s.verifier, {}, signedIn("a1"))).body).toEqual({ error: "sso-other-org" });
      expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ status: "draft", testedRev: null });
      expect(db.docs.get("orgs/o1/private/sso")).not.toHaveProperty("lastTest");
    }
    // An edit waiting under `next` isn't promoted by someone who is no longer the admin.
    member("a1", "orgAdmin", "o1");
    const c = install("o1");
    db.docs.set("orgs/o1/private/sso", { ...c, next: { ...c, configRev: 2, allowedDomains: ["school.edu", "staff.school.edu"] } });
    db.docs.set("ssoSecrets/o1", { ...db.docs.get("ssoSecrets/o1")!, next: sealSecret(ring, P.secret, { orgId: "o1", slot: "next", issuer: c.issuer, tokenHost: tokenHost(c.endpoints), clientId: c.clientId }) });
    store.forgetConfig();
    const s = await start("test", {}, signedIn("a1"));
    const b = await callback(s.url, person("amina"));
    (auth.users.get("a1") as unknown as Body).customClaims = { role: "learner" };
    expect((await finish(b.ticket, s.verifier, {}, signedIn("a1"))).body).toEqual({ error: "sso-other-org" });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ configRev: 1, allowedDomains: ["school.edu"], next: { configRev: 2 } });
    // Still the admin: the same steps go through.
    member("a1", "orgAdmin", "o1");
    const again = await start("test", {}, signedIn("a1"));
    const ok = await callback(again.url, person("amina"));
    expect((await finish(ok.ticket, again.verifier, {}, signedIn("a1"))).body).toMatchObject({ ok: true });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ configRev: 2, allowedDomains: ["school.edu", "staff.school.edu"] });
  });

  it("a student's link is used once even when two flows were started from it", async () => {
    install("o1", {}, "tested");
    const { token } = await run({ action: "testLink" }) as { token: string };
    const one = await start("test", { testToken: token }), two = await start("test", { testToken: token });
    const a = await callback(one.url, person("amina")), b = await callback(two.url, person("bob"));
    expect((await finish(a.ticket, one.verifier)).body).toMatchObject({ tested: "create-student" });
    expect((await finish(b.ticket, two.verifier)).body).toEqual({ error: "sso-state" });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ lastTest: { email: "amina@school.edu" } });
  });

  it("a passing test of an edit makes it the live connection, with its secret sealed for the live slot", async () => {
    const c = install("o1");
    const next = { ...c, allowedDomains: ["school.edu", "staff.school.edu"], configRev: 2 };
    for (const k of ["status", "testedRev", "testedEndpoints", "studentTestRev", "slug", "listing"]) delete (next as Body)[k];
    db.docs.set("orgs/o1/private/sso", { ...c, next });
    db.docs.set("ssoSecrets/o1", { ...db.docs.get("ssoSecrets/o1")!, next: sealSecret(ring, P.secret, { orgId: "o1", slot: "next", issuer: c.issuer, tokenHost: tokenHost(c.endpoints), clientId: c.clientId }) });
    store.forgetConfig();
    const s = await start("test", {}, signedIn("a1"));
    expect(new URL(s.url).searchParams.get("state")).toBeTruthy();
    const b = await callback(s.url, person("amina"));
    expect((await finish(b.ticket, s.verifier, {}, signedIn("a1"))).body).toMatchObject({ promoted: true });
    const cfg = db.docs.get("orgs/o1/private/sso")!;
    expect(cfg).toMatchObject({ configRev: 2, testedRev: 2, status: "on", allowedDomains: ["school.edu", "staff.school.edu"] });
    expect(cfg.next).toBeUndefined();
    expect(db.docs.get("ssoSecrets/o1")?.next).toBeUndefined();
    // Sign-in goes on, now on the promoted connection.
    expect(await signIn(person("amina"))).toMatchObject({ status: 200 });
  });

  // The writes are merged sets, and a merge joins maps key by key: the address the provider before had stayed in
  // `endpoints`, and /api/sso/school went on answering it for the sign-out note.
  it("a promoted edit whose provider has no end-session address doesn't keep the old one", async () => {
    const c = install("o1");
    expect((await get("/api/sso/school", { slug: "o1-abcd" })).body).toMatchObject({ endSession: `${P.base}/logout` });
    const { authorization, token, jwks } = P.endpoints();
    const next = { ...c, endpoints: { authorization, token, jwks }, configRev: 2 };
    for (const k of ["status", "testedRev", "testedEndpoints", "studentTestRev", "slug", "listing"]) delete (next as Body)[k];
    db.docs.set("orgs/o1/private/sso", { ...c, next });
    db.docs.set("ssoSecrets/o1", { ...db.docs.get("ssoSecrets/o1")!, next: sealSecret(ring, P.secret, { orgId: "o1", slot: "next", issuer: c.issuer, tokenHost: tokenHost(c.endpoints), clientId: c.clientId }) });
    store.forgetConfig();
    const s = await start("test", {}, signedIn("a1"));
    const b = await callback(s.url, person("amina"));
    expect((await finish(b.ticket, s.verifier, {}, signedIn("a1"))).body).toMatchObject({ promoted: true });
    const cfg = db.docs.get("orgs/o1/private/sso") as { endpoints: Body; testedEndpoints: Body; listing: Body; slug: string };
    expect(cfg.endpoints).toEqual({ authorization, token, jwks });
    expect(cfg.testedEndpoints).toEqual({ authorization, token, jwks });
    // What the merge is kept for stays: the slug and the listing were not in the write.
    expect(cfg).toMatchObject({ configRev: 2, slug: "o1-abcd", listing: { state: "none" } });
    expect((await get("/api/sso/school", { slug: "o1-abcd" })).body).toMatchObject({ orgId: "o1", endSession: null });
  });

  it("an edit that moves to another provider host unlists the school until a platform admin approves it again", async () => {
    const c = install("o1", { listing: { state: "approved", name: "Nile School", logo: null, host: new URL(P.base).host, at: 1, by: "root" } });
    db.docs.set("orgs/o1", { ...db.docs.get("orgs/o1")!, sso: { on: true, slug: "o1-abcd", listed: true } });
    const moved = { ...c.endpoints, authorization: P.endpoints().authorization.replace("127.0.0.1", "localhost") };
    const next = { ...c, endpoints: moved, configRev: 2 };
    for (const k of ["status", "testedRev", "testedEndpoints", "studentTestRev", "slug", "listing"]) delete (next as Body)[k];
    db.docs.set("orgs/o1/private/sso", { ...c, next });
    db.docs.set("ssoSecrets/o1", { ...db.docs.get("ssoSecrets/o1")!, next: sealSecret(ring, P.secret, { orgId: "o1", slot: "next", issuer: c.issuer, tokenHost: tokenHost(c.endpoints), clientId: c.clientId }) });
    store.forgetConfig();
    const s = await start("test", {}, signedIn("a1"));
    const b = await callback(s.url.replace("localhost", "127.0.0.1"), person("amina"));
    expect((await finish(b.ticket, s.verifier, {}, signedIn("a1"))).body).toMatchObject({ promoted: true });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ listing: { state: "requested", host: new URL(moved.authorization).host } });
    expect(db.docs.get("orgs/o1")).toMatchObject({ sso: { listed: false } });
  });
});

describe("GET /api/sso/school", () => {
  it("answers what the sign-in screen shows for /signin?school=, and the same 404 for unknown and off", async () => {
    const r = await get("/api/sso/school", { slug: "o1-abcd" });
    expect(r.body).toMatchObject({ orgId: "o1", name: "Nile School", host: new URL(P.base).host, listed: false, logo: null });
    expect((await get("/api/sso/school", { slug: "nobody-xxxx" })).status).toBe(404);
    install("o1", {}, "off");
    expect((await get("/api/sso/school", { slug: "o1-abcd" })).body).toEqual({ error: "sso-no-school" });
  });

  // Every open of /signin?school=<slug> makes one lookup: at 120 per address per 10 minutes, pupil 121 of a school
  // behind one address got `sso-rate` and no school button.
  it("a whole school behind one address looks its school up; the limit is a ceiling far above that", async () => {
    const look = async (ip: string) => {
      const { res, out } = response();
      await sso.edge({ method: "GET", path: "/api/sso/school", headers: { "fastly-client-ip": ip, "x-forwarded-for": `${ip}, 151.101.1.1` }, query: { slug: "o1-abcd" }, ip: "151.101.1.1" }, res);
      return out.status;
    };
    for (let i = 0; i < 120; i++) expect(await look("41.33.12.7")).toBe(200);
    expect(await look("41.33.12.7")).toBe(200);
    // Still a limit per address: one address's flood ends, and nobody else's lookups do.
    for (let i = 121; i < sso.SCHOOL_MAX; i++) await look("41.33.12.7");
    expect(await look("41.33.12.7")).toBe(429);
    expect(await look("41.33.12.8")).toBe(200);
  });

  // The wizard's Test step comes before Turn on: /signin?school=<slug>&try=<token> must show the school meanwhile
  // (found by the signed-in browser suite: the page said "we couldn't find this school's sign-in" and had no button).
  it("a student's test link names a school whose sign-in isn't on yet; a used, expired or another school's link doesn't", async () => {
    install("o1", {}, "tested");
    const good = "t".repeat(32), old = "x".repeat(32), other = "y".repeat(32);
    db.docs.set(`ssoTests/${good}`, { orgId: "o1", by: "a1", expireAt: Date.now() + 3_600_000 });
    db.docs.set(`ssoTests/${old}`, { orgId: "o1", by: "a1", expireAt: Date.now() - 1 });
    db.docs.set(`ssoTests/${other}`, { orgId: "o2", by: "a2", expireAt: Date.now() + 3_600_000 });
    // Without a link, a school that isn't on answers as one Darsi doesn't know.
    expect((await get("/api/sso/school", { slug: "o1-abcd" })).body).toEqual({ error: "sso-no-school" });
    const r = await get("/api/sso/school", { slug: "o1-abcd", try: good });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ orgId: "o1", slug: "o1-abcd", name: "Nile School", host: new URL(P.base).host, listed: false, logo: null });
    expect(r.headers["cache-control"]).toBe("no-store"); // the answer ends when the link is used
    // Looking is not using: the link is still there for start.
    expect(db.docs.get(`ssoTests/${good}`)).toBeDefined();
    // A link that is expired, unknown or malformed is answered as start answers it, whatever the slug.
    for (const t of [old, "z".repeat(32), "short"]) {
      for (const slug of ["o1-abcd", "nobody-xxxx"]) expect((await get("/api/sso/school", { slug, try: t })).body).toEqual({ error: "sso-state" });
    }
    // Another school's link shows nothing of this one (as an unknown school), nor does a good link with another slug.
    expect((await get("/api/sso/school", { slug: "o1-abcd", try: other })).body).toEqual({ error: "sso-no-school" });
    expect((await get("/api/sso/school", { slug: "nobody-xxxx", try: good })).body).toEqual({ error: "sso-no-school" });
    // Used (finish deletes it): the page says so instead of offering the test again.
    db.docs.delete(`ssoTests/${good}`);
    expect((await get("/api/sso/school", { slug: "o1-abcd", try: good })).body).toEqual({ error: "sso-state" });
  });

  it("a test link for a school that is on shows the connection under test", async () => {
    const moved = { ...P.endpoints(), authorization: "https://login.new-school.example/authorize" };
    const c = install();
    db.docs.set("orgs/o1/private/sso", { ...c, next: { ...c, configRev: 2, endpoints: moved } });
    store.forgetConfig();
    const token = "n".repeat(32);
    db.docs.set(`ssoTests/${token}`, { orgId: "o1", by: "a1", expireAt: Date.now() + 3_600_000 });
    expect((await get("/api/sso/school", { slug: "o1-abcd" })).body).toMatchObject({ host: new URL(P.base).host });
    expect((await get("/api/sso/school", { slug: "o1-abcd", try: token })).body).toMatchObject({ orgId: "o1", host: "login.new-school.example" });
  });
});
