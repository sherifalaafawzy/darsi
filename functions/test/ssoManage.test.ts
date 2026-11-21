// School sign-in beyond the sign-in itself (design §7, §10, §12): manageSso's actions against the stand-in provider,
// ssoJob, and the hooks the rest of the server calls (suspension, removal, password resets, the lock-out guard, account
// deletion, a deleted organization, sessions opened by the school on personal accounts). Same fakes as ssoFlow.test.ts.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminMock, FakeProvider } from "./ssoFakes";

process.env.FUNCTIONS_EMULATOR = "true";
const K0 = randomBytes(32).toString("base64"), K1 = randomBytes(32).toString("base64");
process.env.SSO_KEYS = JSON.stringify({ current: "k1", keys: { k0: K0, k1: K1 } });

const billing = vi.hoisted(() => ({ writeClaims: vi.fn(), refreshClaims: vi.fn(), orgClosed: () => null, freezes: () => false }));
const published = vi.hoisted(() => ({ files: new Map<string, unknown>(), sites: 0, settings: 0, pushes: [] as unknown[] }));
vi.mock("../src/admin.js", async () => (await import("./ssoFakes")).adminMock());
vi.mock("../src/billing.js", () => billing);
vi.mock("../src/storage.js", () => ({
  savePublicJson: async (path: string, data: unknown) => { published.files.set(path, data); },
  bucket: () => ({ file: () => ({ download: async () => [Buffer.from([0x89, 0x50, 0x4e, 0x47])] }), deleteFiles: async () => {}, getFiles: async () => [[]] }),
}));
vi.mock("../src/sites.js", () => ({ writeSitesFile: async () => { published.sites++; return {}; } }));
vi.mock("../src/settings.js", () => ({ SETTINGS: "config/settings", writeSettingsFile: async () => { published.settings++; }, superOn: async () => true }));
vi.mock("../src/notify.js", () => ({ sendToUser: async (...a: unknown[]) => { published.pushes.push(a); return 1; }, forgetAllDevices: async () => 0 }));
vi.mock("../src/agentSessions.js", () => ({ deleteSessions: async () => ({ sessions: 0, sessionsFailed: false }), exportSessions: async () => ({ complete: true, sessions: [] }) }));

const { db, auth, audits } = (await import("../src/admin.js")) as unknown as AdminMock;
const sso = await import("../src/sso");
const store = await import("../src/ssoStore");
const orgMembers = await import("../src/orgMembers");
const platform = await import("../src/platform");
const account = await import("../src/account");
const { fakeProvider } = await import("./ssoFakes");
const { parseKeyRing, sealSecret } = await import("../src/ssoCrypto");
const { tokenHost } = await import("../src/ssoCore");

const ringOf = (current: string) => { const r = parseKeyRing(JSON.stringify({ current, keys: { k0: K0, k1: K1 } })); if (!r.ok) throw new Error("keys"); return r.ring; };
type Body = Record<string, unknown>;
type Callable = { run: (r: unknown) => Promise<Body> };
const call = (fn: unknown, uid: string, data: Body, token: Body = {}) => (fn as Callable).run({ auth: { uid, token }, data });
const manage = (uid: string, data: Body) => call(sso.manageSso, uid, { orgId: "o1", ...data });
const reason = (p: Promise<unknown>) => p.then(() => "ok", (e: { details?: { reason?: string } }) => e.details?.reason ?? `no reason: ${String(e)}`);
let P: FakeProvider;
beforeAll(async () => { P = await fakeProvider(); });
afterAll(async () => { await P.close(); delete process.env.FUNCTIONS_EMULATOR; });

function member(uid: string, role: string, orgId: string | null, more: Body = {}, accountMore: Body = {}) {
  db.docs.set(`users/${uid}`, { name: uid, role, orgId, ...more });
  auth.users.set(uid, { uid, email: `${uid}@mail.example`, providerData: [{ providerId: "password" }], customClaims: { role, ...(orgId ? { orgId } : {}) }, ...accountMore });
}
function install(over: Body = {}, status = "on", kid: "k0" | "k1" = "k1") {
  const c = {
    preset: "oidc", tenant: null, domain: null, oktaServer: null, realm: null, issuer: P.base, subjectKind: "sub", clientId: P.clientId, authMethod: "basic",
    scopes: ["openid", "email", "profile"], allowedDomains: ["school.edu"], openToAll: false, emailsVerifiedBySchool: false, teacherRule: null, classClaim: null,
    maxSessionDays: 30, personalDevices: false, secretExpiresOn: null, endpoints: P.endpoints(), issParam: false, pkce: "s256", connectionId: "conn1", configRev: 1, hasSecret: true,
    status, testedRev: 1, testedEndpoints: P.endpoints(), studentTestRev: null, slug: "nile-abcd", listing: { state: "none" }, ...over,
  } as Body & { issuer: string; clientId: string; endpoints: { token: string } };
  db.docs.set("orgs/o1/private/sso", c);
  db.docs.set("ssoSecrets/o1", { live: sealSecret(ringOf(kid), P.secret, { orgId: "o1", slot: "live", issuer: c.issuer, tokenHost: tokenHost(c.endpoints as never), clientId: c.clientId }) });
  db.docs.set("ssoSlugs/nile-abcd", { orgId: "o1", at: 1 });
  db.docs.set("orgs/o1", { ...db.docs.get("orgs/o1")!, sso: { on: status === "on", slug: "nile-abcd", listed: false } });
  store.forgetConfig();
  return c;
}
function identity(id: string, data: Body) { db.docs.set(`ssoIdentities/${id}`, { orgId: "o1", connectionId: "conn1", issuer: P.base, subject: id, email: `${id}@school.edu`, emailVerified: true, linked: "jit", state: "active", createdAt: 1, lastAt: 1, expiresAt: 2, ...data }); }

beforeEach(() => {
  db.docs.clear(); auth.users.clear(); auth.idTokens.clear(); auth.customTokens.length = 0; auth.revoked.length = 0; auth.signerDown = false; audits.length = 0;
  published.files.clear(); published.sites = 0; published.settings = 0; published.pushes.length = 0;
  P.calls.length = 0;
  sso.resetSsoState();
  billing.writeClaims.mockReset().mockImplementation(async (uid: string, role: string, orgId: string | null) => {
    const u = auth.users.get(uid); if (!u) return null;
    const had = u.customClaims?.orgId;
    u.customClaims = { role, ...(orgId ? { orgId } : {}) };
    if (typeof had === "string" && had !== orgId) await store.ssoClaimsMoved(uid, orgId);
    return null;
  });
  db.docs.set("orgs/o1", { name: "Nile School", status: "active", memberCount: 2 });
  db.docs.set("orgs/o2", { name: "Delta School", status: "active", memberCount: 0 });
  member("a1", "orgAdmin", "o1");
  member("root", "superadmin", null);
});

describe("manageSso: who may", () => {
  it("this organization's admins and platform admins; nobody else, and platform-only actions stay platform-only", async () => {
    member("s1", "student", "o1");
    member("x2", "orgAdmin", "o2");
    expect(await reason(manage("s1", { action: "get" }))).toBe("not-org-admin");
    expect(await reason(manage("x2", { action: "get" }))).toBe("not-org-admin");
    expect(await reason(manage("a1", { action: "setCeiling", ceiling: 10 }))).toBe("not-super");
    expect(await reason(call(sso.manageSso, "a1", { action: "setSwitch", on: false }))).toBe("not-super");
    db.docs.set("orgs/o1", { ...db.docs.get("orgs/o1")!, status: "suspended" });
    expect(await reason(manage("a1", { action: "get" }))).toBe("org-suspended");
    expect(await reason(manage("root", { action: "get" }))).toBe("ok");
  });
});

describe("manageSso: setting a connection up", () => {
  const config = (over: Body = {}) => ({ preset: "oidc", issuer: P.base, clientId: P.clientId, allowedDomains: ["school.edu"], ...over });

  it("discover checks the provider from the server and answers its host and abilities", async () => {
    expect(await manage("a1", { action: "discover", preset: "oidc", issuer: P.base })).toMatchObject({ ok: true, issuer: P.base, host: new URL(P.base).host, pkce: "s256", authMethods: ["basic", "post"] });
    expect(await reason(manage("a1", { action: "discover", preset: "oidc", issuer: `${P.base}/nothing-here` }))).toBe("sso-discovery");
    // Microsoft's shared tenants admit the whole world: refused before any call.
    expect(await reason(manage("a1", { action: "discover", preset: "microsoft", tenant: "9188040d-6c67-4c5b-b112-36a304b66dad" }))).toBe("sso-issuer");
  });

  it("save runs discovery, keeps the secret sealed (never readable back), reserves a slug and starts a draft", async () => {
    const r = await manage("a1", { action: "save", config: config(), secret: P.secret });
    expect(r).toMatchObject({ saved: "draft", configRev: 1, hasSecret: true, issuer: P.base });
    const cfg = db.docs.get("orgs/o1/private/sso")!;
    expect(cfg).toMatchObject({ status: "draft", endpoints: P.endpoints(), slug: expect.stringMatching(/^nile-school-[a-z2-9]{4}$/) });
    expect(db.docs.get(`ssoSlugs/${cfg.slug}`)).toMatchObject({ orgId: "o1" });
    expect(JSON.stringify([...db.docs.values()])).not.toContain(P.secret);
    const got = await manage("a1", { action: "get" });
    expect(JSON.stringify(got)).not.toContain(P.secret);
    expect(got).toMatchObject({ callbackUrl: "https://login.darsiai.org/callback/o1", signinUrl: `https://darsiai.org/signin?school=${cfg.slug}`, connected: 0, keyOk: true });
    expect(db.docs.get("orgs/o1")).toMatchObject({ sso: { on: false, slug: cfg.slug } });
    expect(audits.find((a) => a.action === "sso.save")).toMatchObject({ orgId: "o1", secret: true });
  });

  it("endpoints never come from the client, and a field out of shape is named", async () => {
    await manage("a1", { action: "save", config: { ...config(), endpoints: { token: "https://evil.example/token" } }, secret: P.secret });
    expect(db.docs.get("orgs/o1/private/sso")?.endpoints).toEqual(P.endpoints());
    const e = await manage("a1", { action: "save", config: config({ allowedDomains: ["gmail.com"] }) }).catch((x) => x.details);
    expect(e).toMatchObject({ reason: "sso-fields", field: "allowedDomains" });
  });

  it("a new client with people connected needs the admin to say whether they are the same people; a changed client forgets the secret", async () => {
    install({}, "off");
    identity("p1", { uid: "u1" });
    expect(await reason(manage("a1", { action: "save", config: config({ clientId: "new-client" }) }))).toBe("sso-migrate");
    const same = await manage("a1", { action: "save", config: config({ clientId: "new-client" }), migration: "same" });
    expect(same).toMatchObject({ hasSecret: false });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ connectionId: "conn1", clientId: "new-client", status: "draft" });
    expect(db.docs.get("ssoSecrets/o1")?.live).toBeUndefined();
    await manage("a1", { action: "save", config: config({ clientId: "third-client" }), migration: "new", secret: "x" });
    expect(db.docs.get("orgs/o1/private/sso")?.connectionId).not.toBe("conn1");
  });

  it("connected counts the people connected now: not removed or blocked tombstones, nor identities under an earlier connection", async () => {
    install({}, "off");
    identity("p1", { uid: "u1", state: "removed", removedAt: 5 });
    identity("p2", { uid: "u2", state: "removed", moved: true, linked: "self" });
    identity("p3", { uid: "u3", state: "blocked", blockedBy: "suspension", stateBefore: "active" });
    identity("p4", { uid: "u4", connectionId: "conn0" });
    db.docs.set("ssoIdentities/other", { ...db.docs.get("ssoIdentities/p4")!, orgId: "o2", connectionId: "conn1", uid: "u9" });
    expect(await manage("a1", { action: "get" })).toMatchObject({ connected: 0 });
    // With only tombstones, a new client isn't asked whether "they" are the same people: nobody is connected.
    expect(await manage("a1", { action: "save", config: config({ clientId: "new-client" }), secret: "x" })).toMatchObject({ saved: "draft" });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ connectionId: "conn1", clientId: "new-client" });
    // Two people connected (one still being made): counted, and the question comes back with that number.
    identity("p5", { uid: "u5" });
    identity("p6", { uid: "u6", pending: true });
    expect(await manage("a1", { action: "get" })).toMatchObject({ connected: 2 });
    const e = await manage("a1", { action: "save", config: config({ clientId: "third-client" }), secret: "x" }).catch((x) => x.details);
    expect(e).toMatchObject({ reason: "sso-migrate", connected: 2, issuerChanged: false });
  });

  it("a new provider address starts a new connection even with nobody connected, so removed people are found by their address", async () => {
    install({ issuer: "https://old-idp.example" }, "off");
    identity("p1", { uid: "u1", state: "removed", removedAt: 5, issuer: "https://old-idp.example" });
    // Nobody is connected, so nothing is asked; the tombstone stays under the old connection (ssoFlow.test.ts: the
    // person's sign-in at the new provider is matched to it by the verified address, and refused).
    expect(await manage("a1", { action: "save", config: config(), secret: "x" })).toMatchObject({ saved: "draft", issuer: P.base });
    const moved = db.docs.get("orgs/o1/private/sso")!;
    expect(moved.connectionId).toEqual(expect.any(String));
    expect(moved.connectionId).not.toBe("conn1");
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ connectionId: "conn1", state: "removed" });
    expect(audits.find((a) => a.action === "sso.save")).toMatchObject({ migration: "new" });
    // The same address again (another client, or nothing changed about the provider): the connection stays.
    await manage("a1", { action: "save", config: config({ clientId: "new-client" }), secret: "x" });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ connectionId: moved.connectionId, clientId: "new-client" });
  });

  it("while it is on, an edit goes to `next` and the live connection keeps serving; the secret follows without being typed again", async () => {
    install();
    expect(await manage("a1", { action: "save", config: config({ allowedDomains: ["school.edu", "staff.school.edu"] }) })).toMatchObject({ saved: "next", hasSecret: true, configRev: 2 });
    const cfg = db.docs.get("orgs/o1/private/sso")!;
    expect(cfg).toMatchObject({ status: "on", configRev: 1, allowedDomains: ["school.edu"], next: { configRev: 2, allowedDomains: ["school.edu", "staff.school.edu"] } });
    expect(db.docs.get("ssoSecrets/o1")).toHaveProperty("next.kid", "k1");
  });

  it("a connection is stored whole: a merged write deletes by name what this connection no longer has", async () => {
    const { FieldValue } = await import("firebase-admin/firestore");
    const gone = FieldValue.delete();
    const { authorization, token, jwks } = P.endpoints();
    const conn = { ...install(), endpoints: { authorization, token, jwks }, teacherRule: { kind: "claim", claim: "roles", value: "teacher" } };
    const stored = sso.__test.storedConn(conn as never);
    expect(stored.endpoints).toEqual({ authorization, token, jwks, endSession: gone });
    expect(stored.teacherRule).toEqual({ kind: "claim", claim: "roles", value: "teacher", domains: gone, emails: gone });
    // What the connection has is kept, and no rule is no rule (null replaces the whole map).
    expect(sso.__test.storedConn({ ...conn, endpoints: P.endpoints(), teacherRule: null } as never)).toMatchObject({ endpoints: P.endpoints(), teacherRule: null });
    expect(sso.__test.storedConn({ ...conn, teacherRule: { kind: "email", domains: ["staff.school.edu"], emails: [] } } as never).teacherRule)
      .toEqual({ kind: "email", domains: ["staff.school.edu"], emails: [], value: gone, claim: gone });
  });

  it("an edit to another kind of teacher rule leaves none of the earlier rule's fields, so saving it again changes nothing", async () => {
    const c = install();
    const next = { ...c, configRev: 2, teacherRule: { kind: "email", domains: ["staff.school.edu"], emails: ["head@school.edu"] } } as Body;
    for (const k of ["status", "testedRev", "testedEndpoints", "studentTestRev", "slug", "listing"]) delete next[k];
    db.docs.set("orgs/o1/private/sso", { ...c, next });
    store.forgetConfig();
    const rule = { kind: "claim", claim: "roles", value: "teacher" };
    expect(await manage("a1", { action: "save", config: config({ teacherRule: rule }) })).toMatchObject({ saved: "next", configRev: 3 });
    expect((db.docs.get("orgs/o1/private/sso")!.next as Body).teacherRule).toEqual(rule);
    // The same again: unchanged, and the revision (with any test it passed) stays.
    expect(await manage("a1", { action: "save", config: config({ teacherRule: rule }) })).toMatchObject({ saved: "unchanged", configRev: 3 });
    // A draft (not on) is written the same way.
    install({ teacherRule: { kind: "email", domains: ["staff.school.edu"], emails: [] } }, "off");
    await manage("a1", { action: "save", config: config({ teacherRule: rule }) });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ status: "draft" });
    expect(db.docs.get("orgs/o1/private/sso")!.teacherRule).toEqual(rule);
  });

  it("saving what is already there changes nothing and keeps the test", async () => {
    install({}, "tested");
    // The wizard kept its steps on the way (Next on step 3), then Save found nothing to change.
    await manage("a1", { action: "save", partial: true, config: { form: {}, step: 3 } });
    expect(db.docs.get("orgs/o1/private/sso")).toHaveProperty("wip");
    expect(await manage("a1", { action: "save", config: config() })).toMatchObject({ saved: "unchanged", configRev: 1 });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ status: "tested", testedRev: 1 });
    expect(db.docs.get("orgs/o1/private/sso")).not.toHaveProperty("wip"); // the next visit opens where the connection is
  });

  it("the wizard's partial steps are kept as typed, never with a secret", async () => {
    await manage("a1", { action: "save", partial: true, config: { preset: "okta", domain: "school.okta.com", secret: "nope" } });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ wip: { config: { preset: "okta", domain: "school.okta.com" } } });
    expect(JSON.stringify(db.docs.get("orgs/o1/private/sso"))).not.toContain("nope");
  });
});

describe("manageSso: turning on and off", () => {
  it("needs a test of the connection as it is, its secret, and an admin who can sign in without it", async () => {
    install({ testedRev: null }, "draft");
    expect(await reason(manage("a1", { action: "turnOn" }))).toBe("sso-untested");
    install({}, "tested");
    auth.users.get("a1")!.providerData = []; // the only admin signs in through the school alone
    expect(await reason(manage("a1", { action: "turnOn" }))).toBe("sso-last-way-in");
    auth.users.get("a1")!.providerData = [{ providerId: "google.com" }];
    auth.signerDown = true;
    expect(await reason(manage("a1", { action: "turnOn" }))).toBe("sso-signer");
    auth.signerDown = false;
    expect(await manage("a1", { action: "turnOn" })).toEqual({ status: "on" });
    expect(db.docs.get("orgs/o1")).toMatchObject({ sso: { on: true, slug: "nile-abcd" } });
    expect(audits.map((a) => a.action)).toContain("sso.turnOn");
  });

  it("Google and Microsoft also need a student's test, or the admin's word that they did one", async () => {
    install({ preset: "google", issuer: "https://accounts.google.com" }, "tested");
    expect(await reason(manage("a1", { action: "turnOn" }))).toBe("sso-student-test");
    expect(await manage("a1", { action: "turnOn", studentChecked: true })).toEqual({ status: "on" });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ studentChecked: { by: "a1", rev: 1 } });
  });

  it("turning off says how many people only sign in through the school", async () => {
    install();
    member("j1", "student", "o1", { sso: true, createdBy: "sso", managedBy: "o1" }, { providerData: [], email: undefined });
    expect(await manage("a1", { action: "turnOff" })).toEqual({ status: "off", ssoOnly: 1 });
    expect(db.docs.get("orgs/o1")).toMatchObject({ sso: { on: false } });
  });
});

describe("the school finder", () => {
  it("lists a school only once a platform admin approved it, with the snapshot it approved; a rename unlists it", async () => {
    install();
    db.docs.set("orgs/o1", { ...db.docs.get("orgs/o1")!, brand: { logo: "orgs/o1/brand/logo-abcdef.png", v: 1 } });
    await manage("a1", { action: "requestListing" });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ listing: { state: "requested", name: "Nile School", host: new URL(P.base).host, logo: expect.stringMatching(/^data:image\/png;base64,/) } });
    expect(await reason(manage("a1", { action: "listing", approve: true }))).toBe("not-super");
    await manage("root", { action: "listing", approve: true });
    expect(published.files.get("content/sso.json")).toMatchObject({ schools: [{ slug: "nile-abcd", name: "Nile School", host: new URL(P.base).host }] });
    const before = db.docs.get("orgs/o1")!;
    const after = { ...before, name: "Nile Schoo1" };
    db.docs.set("orgs/o1", after);
    await store.ssoOrgRebranded("o1", before, after);
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ listing: { state: "requested", name: "Nile Schoo1" } });
    expect(published.files.get("content/sso.json")).toMatchObject({ schools: [] });
  });

  it("a connection at another provider host is never listed under the host a platform admin approved", async () => {
    const host = new URL(P.base).host;
    install({ listing: { state: "approved", name: "Nile School", logo: null, host: "login.nile.edu", at: 1, by: "root" } }, "tested");
    expect(await manage("a1", { action: "turnOn" })).toEqual({ status: "on" });
    expect(db.docs.get("orgs/o1")).toMatchObject({ sso: { on: true, listed: false } });
    expect(db.docs.get("orgs/o1/private/sso")).toMatchObject({ listing: { state: "requested", host } });
    // The same host as approved: listed again at once.
    install({ listing: { state: "approved", name: "Nile School", logo: null, host, at: 1, by: "root" } }, "tested");
    await manage("a1", { action: "turnOn" });
    expect(db.docs.get("orgs/o1")).toMatchObject({ sso: { on: true, listed: true } });
  });

  it("sites.json carries the school button only while school sign-in is on", async () => {
    install();
    expect(await store.ssoSiteEntry("o1", { get: (f: string) => (f === "sso.on" ? true : undefined) })).toEqual({ slug: "nile-abcd", host: new URL(P.base).host });
    expect(await store.ssoSiteEntry("o1", { get: () => undefined })).toBeNull();
  });
});

describe("manageSso: people", () => {
  beforeEach(() => install());

  it("block and unblock; a block of someone only the school lets in also signs them out", async () => {
    member("j1", "student", "o1", { sso: true, createdBy: "sso", managedBy: "o1" }, { providerData: [], email: undefined });
    identity("p1", { uid: "j1" });
    await manage("a1", { action: "block", uid: "j1" });
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ state: "blocked", blockedBy: "admin" });
    expect(auth.revoked).toEqual(["j1"]);
    await manage("a1", { action: "unblock", uid: "j1" });
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ state: "active" });
  });

  it("unlink: never the only way into an account, never a blocked one; the person may disconnect themself", async () => {
    member("j1", "student", "o1", { sso: true, createdBy: "sso", managedBy: "o1" }, { providerData: [] });
    identity("p1", { uid: "j1" });
    expect(await reason(manage("a1", { action: "unlink", uid: "j1" }))).toBe("sso-login");
    member("s1", "student", "o1", { ssoLinkedAt: 5 });
    identity("p2", { uid: "s1", linked: "self" });
    expect(await manage("s1", { action: "unlink", uid: "s1" })).toEqual({ unlinked: 1 });
    expect(db.docs.get("ssoIdentities/p2")).toBeUndefined();
    expect(db.docs.get("users/s1")).not.toHaveProperty("ssoLinkedAt");
    identity("p3", { uid: "s1", linked: "self", state: "blocked" });
    expect(await reason(manage("s1", { action: "unlink", uid: "s1" }))).toBe("sso-disabled");
  });

  it("person: one person's school sign-in here, as their page needs it, and never a stranger's account", async () => {
    const person = (by: string, uid: string, orgId = "o1") => call(sso.manageSso, by, { action: "person", orgId, uid });
    // Made by the school's sign-in, no login of its own.
    member("j1", "student", "o1", { sso: true, createdBy: "sso", managedBy: "o1" }, { providerData: [], email: undefined });
    identity("p1", { uid: "j1" });
    expect(await person("a1", "j1")).toEqual({ state: "active", linked: "jit", blockedBy: null, ownLogin: false });
    // …which added an email login since: the profile's `sso` stays, Auth says it has a way in of its own.
    auth.users.get("j1")!.providerData = [{ providerId: "password" }];
    expect(await person("a1", "j1")).toMatchObject({ state: "active", ownLogin: true });
    // Blocked: by an admin here, or with the account's suspension.
    await manage("a1", { action: "block", uid: "j1" });
    expect(await person("a1", "j1")).toMatchObject({ state: "blocked", linked: "jit", blockedBy: "admin" });
    await manage("a1", { action: "unblock", uid: "j1" });
    await store.ssoSetBlocked("j1", true, "o1", "suspension");
    expect(await person("root", "j1")).toMatchObject({ state: "blocked", blockedBy: "suspension" });
    await store.ssoSetBlocked("j1", false, "o1", "suspension");
    // An account the organization made, matched to the school's sign-in; a blocked identity is said before an active one.
    member("m1", "teacher", "o1", { createdBy: "a1", ssoLinkedAt: 5 });
    identity("p2", { uid: "m1", linked: "org-made" });
    expect(await person("a1", "m1")).toEqual({ state: "active", linked: "org-made", blockedBy: null, ownLogin: true });
    identity("p2b", { uid: "m1", linked: "org-made", connectionId: "conn0", state: "blocked", blockedBy: "admin" });
    expect(await person("a1", "m1")).toMatchObject({ state: "blocked", blockedBy: "admin" });
    // Someone the organization removed: no longer its member, and its admin is still answered (the identity is its own).
    member("r1", "learner", null, { sso: true, createdBy: "sso", managedBy: "o1" }, { providerData: [] });
    identity("p3", { uid: "r1", state: "removed", removedAt: 5 });
    expect(await person("a1", "r1")).toEqual({ state: "removed", linked: "jit", blockedBy: null, ownLogin: false });
    // A personal account's own link that left of its own accord is as good as none; removed by the organization, it is a tombstone.
    member("s1", "learner", null, { ssoLinkedAt: 5 });
    identity("p4", { uid: "s1", linked: "self", state: "removed", moved: true });
    expect(await person("a1", "s1")).toEqual({ state: "none", linked: null, blockedBy: null, ownLogin: null });
    db.docs.set("orgs/o1/private/removed", { uids: { s1: { at: 1, name: "s1" } } });
    expect(await person("a1", "s1")).toEqual({ state: "removed", linked: "self", blockedBy: null, ownLogin: true });
    // A member with no school sign-in: none, and whether they have a login of their own.
    member("t1", "teacher", "o1");
    expect(await person("a1", "t1")).toEqual({ state: "none", linked: null, blockedBy: null, ownLogin: true });
    // Another organization's member, or nobody: an organization's admin learns nothing; a platform admin is answered.
    member("x1", "student", "o2");
    identity("p5", { uid: "x1", orgId: "o2" });
    expect(await person("a1", "x1")).toEqual({ state: "none", linked: null, blockedBy: null, ownLogin: null });
    expect(await person("a1", "nobody")).toEqual({ state: "none", linked: null, blockedBy: null, ownLogin: null });
    expect(await person("root", "x1")).toEqual({ state: "none", linked: null, blockedBy: null, ownLogin: true });
    expect(await person("root", "x1", "o2")).toMatchObject({ state: "active", linked: "jit" });
    // Who may ask: this organization's admins and platform admins, as for block and "Let back in".
    member("x2", "orgAdmin", "o2");
    expect(await reason(person("x2", "j1"))).toBe("not-org-admin");
    expect(await reason(person("m1", "j1"))).toBe("not-org-admin");
    expect(await reason(call(sso.manageSso, "a1", { action: "person", orgId: "o1", uid: "a/b" }))).toBe("no-account");
    // A read: nothing was audited for it.
    expect(audits.map((a) => a.action).filter((x) => x !== "sso.block" && x !== "sso.unblock")).toEqual([]);
  });

  it("person reads the removed list only for a personal account's moved link", async () => {
    member("j1", "student", "o1", { sso: true, createdBy: "sso", managedBy: "o1" }, { providerData: [] });
    identity("p1", { uid: "j1" });
    const gets: string[] = [];
    const doc = db.doc.bind(db);
    const spy = vi.spyOn(db, "doc").mockImplementation((path: string) => { gets.push(path); return doc(path); });
    await manage("a1", { action: "person", uid: "j1" });
    spy.mockRestore();
    expect(gets).toContain("users/j1");
    expect(gets).not.toContain("orgs/o1/private/removed");
  });

  it("allowBack for someone with no removed school sign-in changes nothing and says so (the removed list asks for everyone on it)", async () => {
    member("s5", "learner", null);
    db.docs.set("orgs/o1/private/removed", { uids: { s5: { at: 1, name: "s5" } } });
    expect(await manage("a1", { action: "allowBack", uid: "s5" })).toEqual({ allowed: false, rejoined: false });
    // The removed list is readmitMember's to clear, not this action's: nothing was touched or audited.
    expect(db.docs.get("orgs/o1/private/removed")).toEqual({ uids: { s5: { at: 1, name: "s5" } } });
    expect(audits).toEqual([]);
    // An identity that is active (never removed) is nothing to let back either.
    member("j1", "student", "o1", { sso: true, createdBy: "sso", managedBy: "o1" }, { providerData: [] });
    identity("p1", { uid: "j1" });
    expect(await manage("a1", { action: "allowBack", uid: "j1" })).toEqual({ allowed: false, rejoined: false });
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ state: "active" });
  });

  it("allowBack from the removed list: a school-made account the organization removed is a student again, and off the list", async () => {
    member("r1", "learner", null, { sso: true, createdBy: "sso", managedBy: "o1" }, { providerData: [] });
    auth.users.get("r1")!.customClaims = { role: "learner" };
    identity("p3", { uid: "r1", state: "removed", removedAt: 5 });
    db.docs.set("orgs/o1/private/removed", { uids: { r1: { at: 1, name: "r1" }, other: { at: 2, name: "o" } } });
    expect(await manage("a1", { action: "allowBack", uid: "r1" })).toEqual({ allowed: true, rejoined: true });
    expect(db.docs.get("ssoIdentities/p3")).toMatchObject({ state: "active" });
    expect(db.docs.get("users/r1")).toMatchObject({ role: "student", orgId: "o1" });
    expect(db.docs.get("orgs/o1/private/removed")).toEqual({ uids: { other: { at: 2, name: "o" } } });
    expect(await manage("a1", { action: "person", uid: "r1" })).toMatchObject({ state: "active", linked: "jit" });
  });

  it("allowBack never puts a person's own account back: one an admin made with the person's own email is only cleared", async () => {
    // a1 typed her real email (createdBy, no managedBy), her first school sign-in matched it (org-made), and she left.
    member("t1", "learner", null, { createdBy: "a1" }, { email: "t1@school.edu" });
    auth.users.get("t1")!.customClaims = { role: "learner" };
    identity("p5", { uid: "t1", linked: "org-made", state: "removed", removedAt: 5 });
    db.docs.set("orgs/o1/private/removed", { uids: { t1: { at: 1, name: "t1" }, other: { at: 2, name: "o" } } });
    const profile = structuredClone(db.docs.get("users/t1"));
    expect(await manage("a1", { action: "allowBack", uid: "t1" })).toEqual({ allowed: true, rejoined: false });
    expect(db.docs.get("users/t1")).toEqual(profile);
    expect(auth.users.get("t1")?.customClaims).toEqual({ role: "learner" });
    expect(billing.writeClaims).not.toHaveBeenCalled();
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 2 });
    // The tombstone and the list's entry go: she joins again with a code, and the school's sign-in no longer refuses her.
    expect(db.docs.get("ssoIdentities/p5")).toBeUndefined();
    expect(db.docs.get("orgs/o1/private/removed")).toEqual({ uids: { other: { at: 2, name: "o" } } });
    expect(audits.at(-1)).toMatchObject({ action: "sso.allowBack", uid: "t1", ownLink: true });
    // Also without the removed list's entry (she left by herself, and an admin calls the action for her uid).
    identity("p5", { uid: "t1", linked: "org-made", state: "removed", removedAt: 5 });
    expect(await manage("a1", { action: "allowBack", uid: "t1" })).toEqual({ allowed: true, rejoined: false });
    expect(db.docs.get("users/t1")).toEqual(profile);
    expect(billing.writeClaims).not.toHaveBeenCalled();
    // A login the organization manages (a username login), connected the same way, is the organization's: a student again.
    member("u1", "learner", null, { createdBy: "a1", managedBy: "o1" }, { email: "u1@users.darsiai.org" });
    auth.users.get("u1")!.customClaims = { role: "learner" };
    identity("p6", { uid: "u1", linked: "org-made", state: "removed", removedAt: 5 });
    expect(await manage("a1", { action: "allowBack", uid: "u1" })).toEqual({ allowed: true, rejoined: true });
    expect(db.docs.get("users/u1")).toMatchObject({ role: "student", orgId: "o1" });
    expect(auth.users.get("u1")?.customClaims).toEqual({ role: "student", orgId: "o1" });
    expect(db.docs.get("ssoIdentities/p6")).toMatchObject({ state: "active" });
    // …and so is a username login from before `managedBy` was written.
    member("u2", "learner", null, { createdBy: "a1" }, { email: "u2@users.darsiai.org" });
    auth.users.get("u2")!.customClaims = { role: "learner" };
    identity("p7", { uid: "u2", linked: "admin-map", state: "removed", removedAt: 5 });
    expect(await manage("a1", { action: "allowBack", uid: "u2" })).toEqual({ allowed: true, rejoined: true });
  });

  it("allowBack for a school-made account that was deleted since: the tombstone goes, and the person is off the list too", async () => {
    // No Auth account and no profile any more (an admin deleted it): only the tombstone and the list's entry are left.
    identity("p4", { uid: "gone1", state: "removed", accountDeleted: true, removedAt: 5 });
    db.docs.set("orgs/o1/private/removed", { uids: { gone1: { at: 1, name: "Gone" }, other: { at: 2, name: "o" } } });
    expect(await manage("a1", { action: "person", uid: "gone1" })).toEqual({ state: "removed", linked: "jit", blockedBy: null, ownLogin: null });
    expect(await manage("a1", { action: "allowBack", uid: "gone1" })).toEqual({ allowed: true, rejoined: false });
    expect(db.docs.get("ssoIdentities/p4")).toBeUndefined();
    expect(db.docs.get("orgs/o1/private/removed")).toEqual({ uids: { other: { at: 2, name: "o" } } });
    expect(audits.at(-1)).toMatchObject({ action: "sso.allowBack", accountDeleted: true });
    expect(auth.users.has("gone1")).toBe(false);
  });

  it("the ceiling and the platform switch are platform admins'", async () => {
    expect(await manage("root", { action: "setCeiling", ceiling: 300 })).toEqual({ ceiling: 300 });
    expect(db.docs.get("orgs/o1")).toMatchObject({ ssoCeiling: 300 });
    expect(await call(sso.manageSso, "root", { action: "setSwitch", on: false })).toEqual({ on: false });
    expect(db.docs.get("config/settings")).toMatchObject({ ssoOn: false });
    expect(published.settings).toBe(1);
  });
});

describe("ssoJob", () => {
  const now = Date.UTC(2026, 10, 11, 2, 30);
  // What sendToUser was asked to send: [uid, category, kind, vars, link, tag].
  const pushes = () => (published.pushes as unknown[][]).map((a) => a.slice(0, 6));

  it("signs out accounts with no other way in once their session ran out; never while school sign-in is off", async () => {
    install();
    member("j1", "student", "o1", { sso: true, createdBy: "sso", managedBy: "o1" }, { providerData: [] });
    member("s1", "student", "o1");
    identity("p1", { uid: "j1", lastAt: now - 31 * 86_400_000, expiresAt: now - 1000 });
    identity("p2", { uid: "s1", linked: "self", lastAt: now - 31 * 86_400_000, expiresAt: now - 1000 });
    const r = await sso.runSsoJob(now);
    expect(r).toMatchObject({ sessions: 2, revoked: 1 });
    expect(auth.revoked).toEqual(["j1"]);
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ expiresAt: null, revokedAt: now });
    expect(db.docs.get("ssoIdentities/p2")).toMatchObject({ expiresAt: null });
    install({}, "off");
    identity("p3", { uid: "j1", expiresAt: now - 1000 });
    auth.revoked.length = 0;
    await sso.runSsoJob(now);
    expect(auth.revoked).toEqual([]);
    expect((db.docs.get("ssoIdentities/p3")!.expiresAt as number) > now).toBe(true);
  });

  it("leaves its heartbeat in stats/jobs as the other jobs do: on time and clean, or failed with the first step's kind", async () => {
    install();
    db.docs.set("stats/jobs", { statsJob: { at: 1, ok: true } });
    await sso.runSsoJob(now);
    const jobs = db.docs.get("stats/jobs")!;
    expect(jobs.statsJob).toEqual({ at: 1, ok: true }); // the other jobs' heartbeats stay
    expect(jobs.ssoJob).toMatchObject({ ok: true, sessions: 0, revoked: 0, resealed: 0, moved: 0, kids: ["k1"] });
    expect(jobs.ssoJob).not.toHaveProperty("error");
    expect(Math.abs((jobs.ssoJob as { at: number }).at - Date.now())).toBeLessThan(60_000);
    // A step that fails: ok false, with which step and the error's kind (never its words); the next clean run clears it.
    member("j1", "student", "o1", { sso: true, createdBy: "sso", managedBy: "o1" }, { providerData: [] });
    identity("p1", { uid: "j1", lastAt: now - 31 * 86_400_000, expiresAt: now - 1000 });
    const revoke = vi.spyOn(auth, "revokeRefreshTokens").mockRejectedValueOnce(Object.assign(new Error("SECRET WORDS"), { code: "auth/internal-error" }));
    await sso.runSsoJob(now);
    revoke.mockRestore();
    const failed = db.docs.get("stats/jobs")!.ssoJob as { ok: boolean; error: string };
    expect(failed).toMatchObject({ ok: false, error: expect.stringMatching(/^session [\w-]{1,8}: auth\/internal-error$/) });
    expect(JSON.stringify(failed)).not.toContain("SECRET WORDS");
    await sso.runSsoJob(now);
    expect(db.docs.get("stats/jobs")!.ssoJob).toMatchObject({ ok: true });
    expect(db.docs.get("stats/jobs")!.ssoJob).not.toHaveProperty("error");
  });

  it("a run that throws outright still leaves a failed heartbeat, and is rethrown", async () => {
    await expect(sso.ssoJobRun(async () => { throw Object.assign(new Error("SECRET WORDS"), { code: "unavailable" }); })).rejects.toThrow();
    expect(db.docs.get("stats/jobs")!.ssoJob).toMatchObject({ ok: false, error: "unavailable" });
    expect((db.docs.get("stats/jobs")!.ssoJob as { at: number }).at).toBeGreaterThan(0);
  });

  it("seals secrets under an older key again under the current one", async () => {
    install({}, "on", "k0");
    expect(db.docs.get("ssoSecrets/o1")).toHaveProperty("live.kid", "k0");
    const r = await sso.runSsoJob(now);
    expect(r.resealed).toBe(1);
    expect(r.kids).toEqual(["k1"]);
    expect(db.docs.get("ssoSecrets/o1")).toHaveProperty("live.kid", "k1");
  });

  it("an endpoint that moved since the test is a problem to retest, never applied", async () => {
    install({ testedEndpoints: { ...P.endpoints(), token: "https://old.example/token" } });
    const r = await sso.runSsoJob(now);
    expect(r.moved).toBe(1);
    expect(db.docs.get("orgs/o1/private/ssoHealth")).toHaveProperty("problems.endpoints-moved.hint", "token");
    expect(db.docs.get("orgs/o1/private/sso")?.testedEndpoints).toMatchObject({ token: "https://old.example/token" });
    // The organization's admins hear it once a day, with the link to their sign-in tab; nobody else does.
    expect(pushes()).toEqual([["a1", "staff", "ssoEndpointsMoved", { org: "Nile School" }, "/admin?tab=signin", "darsi-sso-o1-ssoEndpointsMoved"]]);
    expect((await sso.runSsoJob(now)).moved).toBe(1);
    expect(pushes()).toHaveLength(1);
    expect((await sso.runSsoJob(now + 86_400_000)).moved).toBe(1);
    expect(pushes()).toHaveLength(2);
  });

  it("warns about a client secret expiring within 30 and 7 days, once each", async () => {
    install({ secretExpiresOn: "2026-11-30" });
    member("a2", "orgAdmin", "o1");
    member("t1", "teacher", "o1");
    member("x2", "orgAdmin", "o2");
    expect((await sso.runSsoJob(now)).expiring).toBe(1);
    expect((await sso.runSsoJob(now)).expiring).toBe(0);
    expect(db.docs.get("orgs/o1/private/ssoHealth")).toMatchObject({ alerts: { secret30: "2026-11-30" } });
    // Every admin of that organization, with the days left; not its teachers, another organization's admins or platform admins.
    const alert = (uid: string, n: number) => [uid, "staff", "ssoSecretExpiring", { n, org: "Nile School" }, "/admin?tab=signin", "darsi-sso-o1-ssoSecretExpiring"];
    expect(pushes().sort()).toEqual([alert("a1", 19), alert("a2", 19)]);
    published.pushes.length = 0;
    install({ secretExpiresOn: "2026-11-15" });
    expect((await sso.runSsoJob(now)).expiring).toBe(1);
    expect((await sso.runSsoJob(now)).expiring).toBe(0);
    expect(pushes().sort()).toEqual([alert("a1", 4), alert("a2", 4)]);
  });

  it("the alerts' kinds have push wording in both languages", async () => {
    const { KINDS, message } = await vi.importActual<typeof import("../src/messages")>("../src/messages");
    for (const k of ["ssoSecretExpiring", "ssoEndpointsMoved", "ssoFull"] as const) {
      expect(KINDS).toContain(k);
      for (const lang of ["en", "ar"]) expect(message(k, lang, { n: 4, org: "Nile School" }).body).toContain("Nile School");
    }
  });

  it("tells platform admins once a day about a school that was full", async () => {
    install();
    db.docs.set("orgs/o1/private/ssoHealth", { full: { at: now - 3600_000 } });
    member("root2", "superadmin", null);
    expect((await sso.runSsoJob(now)).full).toBe(1);
    expect((await sso.runSsoJob(now)).full).toBe(0);
    // Platform admins only, with the link to that school's sign-in tab and a tag of its own.
    const alert = (uid: string) => [uid, "staff", "ssoFull", { org: "Nile School", orgId: "o1" }, "/super/orgs/o1?tab=signin", "darsi-sso-o1-ssoFull"];
    expect(pushes().sort()).toEqual([alert("root"), alert("root2")]);
    // Full again the next day: one more alert each.
    db.docs.set("orgs/o1/private/ssoHealth", { ...db.docs.get("orgs/o1/private/ssoHealth")!, full: { at: now + 80_000_000 } });
    expect((await sso.runSsoJob(now + 86_400_000)).full).toBe(1);
    expect(pushes()).toHaveLength(4);
  });

  it("deletes the hours' counters of new accounts that are over, and keeps this hour's and the last", async () => {
    install();
    const { jitKey } = await import("../src/ssoCore");
    const [cur, last, old, older] = [0, 1, 2, 30].map((h) => jitKey(now - h * 3600_000));
    db.docs.set("orgs/o1/private/ssoHealth", { jit: { [cur]: 4, [last]: 9, [old]: 12, [older]: 200 }, problems: { full: { n: 1 } } });
    await sso.runSsoJob(now);
    expect(db.docs.get("orgs/o1/private/ssoHealth")).toEqual({ jit: { [cur]: 4, [last]: 9 }, problems: { full: { n: 1 } } });
    // Nothing over: nothing written.
    const writes = db.writes.length;
    await sso.runSsoJob(now);
    expect(db.writes.slice(writes).filter((w) => w.path === "orgs/o1/private/ssoHealth")).toEqual([]);
  });
});

describe("hooks in the rest of the server", () => {
  beforeEach(() => install());

  it("an organization's suspension of a login blocks its school sign-in, and lifting it opens only what it closed", async () => {
    member("j1", "student", "o1", { managedBy: "o1", sso: true, createdBy: "sso" });
    identity("p1", { uid: "j1" });
    await call(orgMembers.setMemberSuspended, "a1", { orgId: "o1", uid: "j1", suspended: true });
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ state: "blocked", blockedBy: "suspension" });
    await call(orgMembers.setMemberSuspended, "a1", { orgId: "o1", uid: "j1", suspended: false });
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ state: "active" });
    await store.ssoSetBlocked("j1", true, "o1", "admin");
    await store.ssoSetBlocked("j1", false, "o1", "suspension");
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ state: "blocked", blockedBy: "admin" });
  });

  // The organization's suspension blocks the identity; removal lifts the suspension. The block used to stay behind, as
  // "suspension", for good: restore said not-suspended, unblock was not its to lift, and "Let back in" takes only a
  // removed identity, so a school-made account (no login to use a code with) was locked out with its learning.
  it("a school-made login the organization suspended and then removed comes out removed, and can be let back in", async () => {
    member("j1", "student", "o1", { managedBy: "o1", sso: true, createdBy: "sso" }, { providerData: [], email: undefined });
    identity("p1", { uid: "j1" });
    await call(orgMembers.setMemberSuspended, "a1", { orgId: "o1", uid: "j1", suspended: true });
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ state: "blocked", blockedBy: "suspension" });
    expect(auth.users.get("j1")?.disabled).toBe(true);
    const out = await call(orgMembers.bulkMembers, "a1", { orgId: "o1", uids: ["j1"], action: "remove" });
    expect(out.results).toEqual([{ uid: "j1", ok: true }]);
    // The suspension was the organization's business: the login works again, and the school's sign-in is `removed`.
    expect(auth.users.get("j1")?.disabled).toBe(false);
    expect(db.docs.get("users/j1")).not.toHaveProperty("suspended");
    const removed = db.docs.get("ssoIdentities/p1")!;
    expect(removed).toMatchObject({ state: "removed", removedAt: expect.any(Number) });
    expect(removed).not.toHaveProperty("blockedBy");
    expect(removed).not.toHaveProperty("stateBefore");
    expect(await manage("a1", { action: "person", uid: "j1" })).toMatchObject({ state: "removed", linked: "jit", blockedBy: null });
    expect(await manage("a1", { action: "allowBack", uid: "j1" })).toEqual({ allowed: true, rejoined: true });
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ state: "active" });
    expect(db.docs.get("users/j1")).toMatchObject({ role: "student", orgId: "o1" });
  });

  it("someone removed while blocked stays blocked, and lifting the block leaves them removed, never active", async () => {
    member("j1", "student", "o1", { managedBy: "o1", sso: true, createdBy: "sso" }, { providerData: [], email: undefined });
    identity("p1", { uid: "j1" });
    await manage("a1", { action: "block", uid: "j1" });
    expect(await store.ssoClaimsMoved("j1", null, 77)).toBe(1);
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ state: "blocked", blockedBy: "admin", stateBefore: "removed", removedAt: 77 });
    expect(await store.ssoClaimsMoved("j1", null, 99)).toBe(0); // once more: nothing left to mark
    // The suspension's lifting is not the admin's block's to end.
    await store.ssoSetBlocked("j1", false, "o1", "suspension");
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ state: "blocked", blockedBy: "admin" });
    await manage("a1", { action: "unblock", uid: "j1" });
    const p1 = db.docs.get("ssoIdentities/p1")!;
    expect(p1).toMatchObject({ state: "removed", removedAt: 77 });
    expect(p1).not.toHaveProperty("stateBefore");
    // A person's own link keeps what tells "left by themself" from "removed" (staleMovedLink reads `moved`).
    member("s1", "student", "o1");
    identity("p2", { uid: "s1", linked: "self" });
    await call(account.setAccountSuspended, "root", { uid: "s1", suspended: true });
    await store.ssoClaimsMoved("s1", null);
    expect(db.docs.get("ssoIdentities/p2")).toMatchObject({ state: "blocked", stateBefore: "removed", moved: true });
    await call(account.setAccountSuspended, "root", { uid: "s1", suspended: false });
    expect(db.docs.get("ssoIdentities/p2")).toMatchObject({ state: "removed", moved: true });
    // Someone who is still a member (the new organization is this one) is untouched.
    identity("p3", { uid: "j1", state: "blocked", blockedBy: "admin", stateBefore: "active" });
    await store.ssoClaimsMoved("j1", "o1");
    expect(db.docs.get("ssoIdentities/p3")).toMatchObject({ state: "blocked", stateBefore: "active" });
  });

  it("a platform admin's suspension blocks every school sign-in of the account", async () => {
    member("s1", "student", "o1");
    identity("p1", { uid: "s1", linked: "self" });
    await call(account.setAccountSuspended, "root", { uid: "s1", suspended: true });
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ state: "blocked" });
  });

  it("a new password for an account only the school's sign-in opens is refused as sso-login", async () => {
    member("j1", "student", "o1", { managedBy: "o1", sso: true, createdBy: "sso" }, { providerData: [], email: undefined });
    const out = await call(orgMembers.bulkMembers, "a1", { orgId: "o1", uids: ["j1"], action: "resetPassword" });
    expect(out.results).toEqual([{ uid: "j1", ok: false, reason: "sso-login" }]);
  });

  it("the lock-out guard: with school sign-in on, the last admin with a password or Google login stays an admin", async () => {
    db.docs.set("orgs/o1", { ...db.docs.get("orgs/o1")!, sso: { on: true, slug: "nile-abcd" } });
    member("a2", "orgAdmin", "o1", { sso: true, createdBy: "sso" }, { providerData: [] });
    expect(await reason(platform.refuseLastAdmin("a1", "o1"))).toBe("sso-last-way-in");
    const out = await call(orgMembers.bulkMembers, "root", { orgId: "o1", uids: ["a1"], action: "setRole", role: "teacher" });
    expect(out.results).toEqual([{ uid: "a1", ok: false, reason: "sso-last-way-in" }]);
    auth.users.get("a2")!.providerData = [{ providerId: "password" }];
    expect(await reason(platform.refuseLastAdmin("a1", "o1"))).toBe("ok");
  });

  it("an account deleted by someone else keeps the school from making the person a new one; deleted by its owner, nothing is kept", async () => {
    identity("p1", { uid: "j1" });
    identity("p2", { uid: "j1", linked: "self", orgId: "o2" });
    await store.ssoAccountWiped("j1", true);
    expect(db.docs.get("ssoIdentities/p1")).toMatchObject({ state: "removed", accountDeleted: true });
    expect(db.docs.get("ssoIdentities/p2")).toBeUndefined();
    await store.ssoAccountWiped("j1", false);
    expect(db.docs.get("ssoIdentities/p1")).toBeUndefined();
  });

  it("a deleted organization's secret, identities and test links go, and its slug is never anyone else's", async () => {
    identity("p1", { uid: "j1" });
    db.docs.set("ssoTests/t1", { orgId: "o1", expireAt: 1 });
    await store.ssoOrgDeleted("o1");
    expect(db.docs.get("ssoSecrets/o1")).toBeUndefined();
    expect(db.all("ssoIdentities")).toEqual([]);
    expect(db.docs.get("ssoTests/t1")).toBeUndefined();
    expect(db.docs.get("ssoSlugs/nile-abcd")).toMatchObject({ orgId: "o1", tombstone: true });
    expect(db.docs.get("orgs/o1/private/sso")).toBeUndefined();
  });

  it("a session the school opened on a personal account can't export or delete it, or pay", async () => {
    member("s1", "learner", null);
    expect(await reason(call(account.exportAccountData, "s1", {}, { sso: "o1" }))).toBe("sso-own-login");
    expect(await reason(store.refuseSsoSession({ sso: "o1" }, "s1"))).toBe("sso-own-login");
    // An account the organization manages is the organization's to handle: its session isn't refused here.
    member("j1", "student", "o1", { managedBy: "o1" });
    expect(await reason(store.refuseSsoSession({ sso: "o1" }, "j1"))).toBe("ok");
    expect(await reason(store.refuseSsoSession({}, "s1"))).toBe("ok");
    // An account made before `managedBy` was written: its username login says the organization made it and looks
    // after it (roles.managedAccount; account.ts lets the same session export and delete it).
    member("u9", "student", "o1", { createdBy: "a1" }, { email: "u9@users.darsiai.org" });
    expect(await reason(store.refuseSsoSession({ sso: "o1" }, "u9"))).toBe("ok");
    // Only Auth's own email counts: a profile that merely says so, or `createdBy` alone, gives the organization nothing.
    member("u8", "student", "o1", { createdBy: "a1", email: "u8@users.darsiai.org" });
    expect(await reason(store.refuseSsoSession({ sso: "o1" }, "u8"))).toBe("sso-own-login");
    // Auth is asked only when the profile doesn't settle it, and an Auth that can't answer never reads as "managed".
    const down = vi.spyOn(auth, "getUser").mockRejectedValue(Object.assign(new Error("unavailable"), { code: "auth/internal-error" }));
    try {
      expect(await reason(store.refuseSsoSession({ sso: "o1" }, "j1"))).toBe("ok");
      expect(down).not.toHaveBeenCalled();
      await expect(store.refuseSsoSession({ sso: "o1" }, "u9")).rejects.toThrow("unavailable");
      await expect(store.refuseSsoSession({ sso: "o1" }, "s1")).rejects.toThrow("unavailable");
    } finally { down.mockRestore(); }
  });
});
