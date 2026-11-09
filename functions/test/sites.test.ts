// Organization sites (TECHNICAL.md "Organization sites (custom web addresses)"): the shared host rules (shared/sites.ts,
// the web app's own file), manageSite (asking, approving, refusing, checking, removing) with an in-memory Firestore and
// Storage and a stand-in for the Google calls (domains.ts), ownership tokens, sign-in and file access following DNS
// (syncSiteAccess, its sweep and its lock), content/sites.json and its logo copies, sitesJob (the old config/sites list
// moved in, addresses turning live), and the trigger that follows an organization's changes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeAuth, FakeDb } from "./fakeFirestore";
import { checkSiteHost, isDarsiHost, siteFor } from "../src/shared/sites";
import { brandLogoPath, corsWith, hasAccess, hostingCheck, isReservedName, listWith, planCors, planList, readLinks, readSiteDoc, sitesNeedPublish, statusOf } from "../src/sitesCore";
import type { HostCheck } from "../src/domains";

const audits = vi.hoisted(() => [] as { action: string; by: string; data: Record<string, unknown> }[]);
/** Storage: path → { bytes, contentType, cacheControl }, and every save in order. */
const store = vi.hoisted(() => ({ files: new Map<string, { bytes: Buffer; contentType?: string; cacheControl?: string }>(), saves: [] as string[], fail429: 0 }));
vi.mock("../src/admin.js", async () => {
  const { FakeDb, FakeAuth } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  const db = new FakeDb(), auth = new FakeAuth();
  type Req = { auth?: { uid: string; token: Record<string, unknown> } };
  const freshCaller = async (req: Req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const claims = (await auth.getUser(req.auth.uid).catch(() => null))?.customClaims ?? {};
    return { uid: req.auth.uid, role: (claims.role as string) ?? "learner", orgId: claims.orgId as string | undefined };
  };
  return {
    db, auth, freshCaller,
    audit: async (action: string, by: string, data: Record<string, unknown>) => { audits.push({ action, by, data }); },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});
vi.mock("../src/storage.js", () => {
  const file = (path: string) => ({
    name: path,
    download: async () => { const f = store.files.get(path); if (!f) throw new Error(`No such object: ${path}`); return [f.bytes]; },
    exists: async () => [store.files.has(path)],
    save: async (bytes: Buffer, o: { contentType?: string; metadata?: { cacheControl?: string } }) => { store.files.set(path, { bytes: Buffer.from(bytes), contentType: o.contentType, cacheControl: o.metadata?.cacheControl }); },
    delete: async () => { store.files.delete(path); },
  });
  return {
    bucket: () => ({ file, getFiles: async ({ prefix }: { prefix: string }) => [[...store.files.keys()].filter((k) => k.startsWith(prefix)).map(file)] }),
    publicFileUrl: (path: string) => `https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/${encodeURIComponent(path)}?alt=media`,
    savePublicJson: async (path: string, data: unknown) => {
      if (store.fail429 > 0) { store.fail429--; throw Object.assign(new Error("The rate limit for object mutation has been exceeded"), { code: 429 }); }
      store.saves.push(path);
      store.files.set(path, { bytes: Buffer.from(JSON.stringify(data)), cacheControl: "public, max-age=60" });
    },
  };
});
/**
 * The Google side (domains.ts): what the next check answers (per host, or for all), every call, the proof each check
 * looked for, and the authorized domains and CORS origins as syncAccess leaves them.
 */
const google = vi.hoisted(() => ({
  calls: [] as string[], warnings: [] as string[], during: null as null | (() => void),
  answer: null as null | HostCheck, answers: {} as Record<string, HostCheck>, proofs: {} as Record<string, string | null>,
  authorized: new Set<string>(), origins: new Set<string>(), syncErrors: [] as string[], syncs: 0,
}));
const ALL_OK = { steps: { owner: "ok", dns: "ok", hosting: "ok", cert: "ok" }, records: [], issues: [], errors: [] } as HostCheck;
const WAITING = {
  steps: { owner: "ok", dns: "wait", hosting: "ok", cert: "wait" },
  records: [{ name: "learn.cis.edu.eg", type: "CNAME", value: "darsi-f0685.web.app", action: "add" }], issues: [], errors: [],
} as HostCheck;
const UNPROVED = {
  steps: { owner: "wait", dns: "wait", hosting: "todo", cert: "todo" },
  records: [{ name: "_darsi.learn.cis.edu.eg", type: "TXT", value: "darsi-site=x", action: "add" }], issues: [], errors: [],
} as HostCheck;
vi.mock("../src/domains.js", () => ({
  connectHost: async (host: string, o: { proof?: string | null } = {}) => {
    google.calls.push(`connect ${host}`); google.proofs[host] = o.proof ?? null; google.during?.();
    return google.answers[host] ?? google.answer!;
  },
  disconnectHost: async (host: string) => { google.calls.push(`disconnect ${host}`); return google.warnings; },
  syncAccess: async (want: string[], managed: string[]) => {
    google.syncs++;
    if (!google.syncErrors.length) {
      for (const h of managed) if (!want.includes(h)) { google.authorized.delete(h); google.origins.delete(h); }
      for (const h of want) { google.authorized.add(h); google.origins.add(h); }
    }
    return { authorized: google.syncErrors.length ? null : new Set(google.authorized), origins: new Set(google.origins), errors: [...google.syncErrors] };
  },
}));
vi.useFakeTimers({ toFake: ["setTimeout"] });

const { db, auth } = (await import("../src/admin.js")) as unknown as { db: FakeDb; auth: FakeAuth };
const sites = await import("../src/sites");
type Run = { run: (req: unknown) => Promise<unknown> };
const setOrgSite = sites.setOrgSite as unknown as Run;
const manageSite = sites.manageSite as unknown as Run;
const act = (uid: string, action: string, data: Record<string, unknown>) => manageSite.run(as(uid, { action, ...data })) as Promise<{ site: Record<string, unknown> | null; warnings?: string[] }>;
const siteDoc = (host: string) => db.docs.get(`sites/${host}`);
const as = (uid: string, data: Record<string, unknown>) => ({ auth: { uid, token: {} }, data });
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; details?: { reason?: string } }) => `${e.code}:${e.details?.reason ?? "no reason"}`);
const published = () => JSON.parse(store.files.get("content/sites.json")!.bytes.toString()) as { v: number; sites: Record<string, { orgId: string; name: string; logo: string | null; darsi: boolean }> };
const LOGO = "orgs/o1/brand/logo-abc123def.webp";
const LIVE_STEPS = { owner: "ok", dns: "ok", hosting: "ok", cert: "ok", auth: "ok", cors: "ok" };
/** What Darsi put in the authorized domains and CORS list (config/siteAccess). */
const granted = () => (db.docs.get("config/siteAccess")?.hosts as string[] | undefined) ?? [];

beforeEach(() => {
  db.docs.clear(); auth.users.clear(); audits.length = 0; store.files.clear(); store.saves.length = 0; store.fail429 = 0;
  google.calls.length = 0; google.warnings = []; google.during = null; google.answer = ALL_OK; google.answers = {}; google.proofs = {};
  google.authorized = new Set(["localhost", "darsiai.org"]); google.origins = new Set(["darsiai.org"]); google.syncErrors = []; google.syncs = 0;
  auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
  auth.users.set("adm", { uid: "adm", customClaims: { role: "orgAdmin", orgId: "o1" } });
  auth.users.set("adm2", { uid: "adm2", customClaims: { role: "orgAdmin", orgId: "o2" } });
  auth.users.set("tea", { uid: "tea", customClaims: { role: "teacher", orgId: "o1" } });
  db.docs.set("orgs/o1", { name: "CIS Training Platform", status: "active", brand: { logo: LOGO, v: 1 } });
  db.docs.set("orgs/o2", { name: "Delta School", status: "active" });
  store.files.set(LOGO, { bytes: Buffer.from("logo-bytes-1"), contentType: "image/webp" });
});

describe("the host rules (shared with the app)", () => {
  it("takes lowercase hostnames, and an empty host as no site", () => {
    expect(checkSiteHost("cis.darsiai.org")).toEqual({ host: "cis.darsiai.org" });
    expect(checkSiteHost("  learn.cis.edu.eg ")).toEqual({ host: "learn.cis.edu.eg" });
    expect(checkSiteHost("x-1.school-7.org")).toEqual({ host: "x-1.school-7.org" });
    expect(checkSiteHost("")).toEqual({ host: "" });
    expect(checkSiteHost("   ")).toEqual({ host: "" });
    expect(checkSiteHost(undefined)).toEqual({ host: "" });
  });
  it("refuses anything that isn't a lowercase hostname", () => {
    for (const bad of ["CIS.darsiai.org", "https://cis.darsiai.org", "cis.darsiai.org/", "cis", "cis..darsiai.org", "-cis.darsiai.org", "cis-.darsiai.org",
      "cis.darsiai.org:443", "*.darsiai.org", "10.0.0.1", "cis darsi.org", "سيس.darsiai.org", `${"a".repeat(64)}.org`, `${"a.".repeat(127)}org`, 7, { host: "x.org" }]) {
      expect(checkSiteHost(bad), String(bad)).toEqual({ problem: "site-host" });
    }
  });
  it("refuses Darsi's own addresses and Hosting's", () => {
    for (const h of ["darsiai.org", "www.darsiai.org", "darsi-f0685.web.app", "other.web.app", "darsi-f0685.firebaseapp.com", "app.localhost"]) {
      expect(checkSiteHost(h), h).toEqual({ problem: "site-reserved" });
    }
    expect(isDarsiHost("localhost")).toBe(true);
    expect(isDarsiHost("127.0.0.1")).toBe(true);
    expect(isDarsiHost("[::1]")).toBe(true);
    expect(isDarsiHost("darsiai.org.")).toBe(true);
    expect(isDarsiHost("cis.darsiai.org")).toBe(false);
    // Names kept for Darsi under darsiai.org are the server's to refuse (the app's startup bundle holds this file whole).
    for (const h of ["login.darsiai.org", "support.darsiai.org", "api.darsiai.org"]) expect(isReservedName(h), h).toBe(true);
    for (const h of ["cis.darsiai.org", "login.cis.edu.eg", "login.org"]) expect(isReservedName(h), h).toBe(false);
  });
  it("reads one host's entry from the file, checked", () => {
    const file = { v: 1, sites: { "cis.darsiai.org": { orgId: "o1", name: " CIS ", logo: "https://firebasestorage.googleapis.com/x.webp", darsi: false } } };
    expect(siteFor(file, "cis.darsiai.org")).toEqual({ orgId: "o1", name: "CIS", logo: "https://firebasestorage.googleapis.com/x.webp", darsi: false });
    expect(siteFor(file, "other.darsiai.org")).toBeNull();
    expect(siteFor(file, "constructor")).toBeNull();
    expect(siteFor(null, "cis.darsiai.org")).toBeNull();
    expect(siteFor({ sites: { h: { orgId: "o1", name: "" } } }, "h")).toBeNull();
    // A logo that isn't a web address is dropped; `darsi` is on unless it is false.
    expect(siteFor({ sites: { h: { orgId: "o1", name: "A", logo: "javascript:alert(1)" } } }, "h")).toEqual({ orgId: "o1", name: "A", logo: null, darsi: true });
    expect(siteFor({ sites: { h: { orgId: "o1", name: "A", logo: "http://127.0.0.1:9199/v0/b/x/o/y?alt=media", darsi: true } } }, "h")?.logo).toBe("http://127.0.0.1:9199/v0/b/x/o/y?alt=media");
  });
});


describe("manageSite: who may do what", () => {
  it("refuses guests, members who aren't admins, and bad addresses, and says why", async () => {
    expect(await refusal(manageSite.run({ data: { action: "request", host: "learn.cis.edu.eg" } }))).toBe("unauthenticated:no reason");
    expect(await refusal(act("tea", "request", { host: "learn.cis.edu.eg" }))).toBe("permission-denied:not-org-admin");
    expect(await refusal(act("adm", "request", { host: "Not a host" }))).toBe("invalid-argument:site-host");
    expect(await refusal(act("adm", "request", { host: "" }))).toBe("invalid-argument:site-host");
    expect(await refusal(act("adm", "request", { host: "www.darsiai.org" }))).toBe("invalid-argument:site-reserved");
    expect(await refusal(act("root", "approve", { host: "login.darsiai.org", orgId: "o1" }))).toBe("invalid-argument:site-reserved");
    expect(await refusal(setOrgSite.run(as("root", { orgId: "o1", host: "support.darsiai.org" })))).toBe("invalid-argument:site-reserved");
    expect(await refusal(act("adm", "explode", { host: "cis.darsiai.org" }))).toBe("invalid-argument:site-action");
    // Org admins ask; platform admins approve, refuse, change the identity and remove.
    for (const a of ["approve", "refuse", "identity", "remove"]) expect(await refusal(act("adm", a, { host: "cis.darsiai.org" })), a).toBe("permission-denied:not-super");
    expect(await refusal(act("root", "request", { host: "learn.cis.edu.eg" }))).toBe("permission-denied:not-org-admin");
    expect([...db.docs.keys()].filter((k) => k.startsWith("sites/"))).toEqual([]);
    expect(google.calls).toEqual([]);
  });
});

describe("asking for an address (org admins)", () => {
  it("records the request with its own ownership token and the two records to add, connects nothing and publishes nothing", async () => {
    const r = await act("adm", "request", { host: "learn.cis.edu.eg" });
    expect(r.site).toMatchObject({ host: "learn.cis.edu.eg", orgId: "o1", orgName: "CIS Training Platform", status: "requested", requestedBy: "adm", darsi: true, approvedBy: null });
    const proof = siteDoc("learn.cis.edu.eg")?.proof as string;
    expect(proof).toMatch(/^[0-9a-f]{32}$/);
    expect(siteDoc("learn.cis.edu.eg")?.records).toEqual([
      { name: "_darsi.learn.cis.edu.eg", type: "TXT", value: `darsi-site=${proof}`, action: "add" },
      { name: "learn.cis.edu.eg", type: "CNAME", value: "darsi-f0685.web.app", action: "add" },
    ]);
    expect(google.calls).toEqual([]);
    expect(store.saves).toEqual([]);
    expect(audits).toEqual([{ action: "requestSite", by: "adm", data: { orgId: "o1", host: "learn.cis.edu.eg" } }]);
    // Asking again changes nothing, the token included.
    expect((await act("adm", "request", { host: "learn.cis.edu.eg" })).site).toMatchObject({ status: "requested", requestedBy: "adm", proof });
    // Another organization's request has another token.
    await act("adm2", "request", { host: "learn.delta.edu.eg" });
    expect(siteDoc("learn.delta.edu.eg")?.proof).not.toBe(proof);
  });
  it("refuses an address under darsiai.org (Darsi's to give) and a domain itself (HSTS would cover the school's other subdomains)", async () => {
    expect(await refusal(act("adm", "request", { host: "cis.darsiai.org" }))).toBe("invalid-argument:site-zone");
    for (const h of ["cis.edu.eg", "school.com", "school.co.uk"]) expect(await refusal(act("adm", "request", { host: h })), h).toBe("invalid-argument:site-apex");
    expect((await act("adm", "request", { host: "learn.school.co.uk" })).site).toMatchObject({ status: "requested" });
    expect(await refusal(act("root", "approve", { host: "school.com", orgId: "o1" }))).toBe("invalid-argument:site-apex");
  });
  it("refuses an address another organization asked for or uses, and more than three", async () => {
    await act("adm", "request", { host: "learn.cis.edu.eg" });
    expect(await refusal(act("adm2", "request", { host: "learn.cis.edu.eg" }))).toBe("already-exists:site-taken");
    for (const h of ["b.cis.org", "c.cis.org"]) await act("adm", "request", { host: h });
    expect(await refusal(act("adm", "request", { host: "d.cis.org" }))).toBe("resource-exhausted:site-limit");
  });
  it("refuses an organization that isn't active yet", async () => {
    db.docs.set("orgs/o1", { name: "CIS", status: "pending" });
    expect(await refusal(act("adm", "request", { host: "learn.cis.edu.eg" }))).toBe("failed-precondition:org-inactive");
  });
  it("lets the organization take back its own request, not another's, and not a connected address", async () => {
    await act("adm", "request", { host: "learn.cis.edu.eg" });
    expect(await refusal(act("adm2", "cancel", { host: "learn.cis.edu.eg" }))).toBe("permission-denied:not-yours");
    expect(await act("adm", "cancel", { host: "learn.cis.edu.eg" })).toEqual({ site: null });
    expect(siteDoc("learn.cis.edu.eg")).toBeUndefined();
    await act("root", "approve", { host: "delta.darsiai.org", orgId: "o2" });
    expect(await refusal(act("adm2", "cancel", { host: "delta.darsiai.org" }))).toBe("failed-precondition:site-state");
  });
});

describe("approving an address (platform admins)", () => {
  it("connects it with the organization's own token, gives it sign-in, keeps who asked, publishes content/sites.json with a public copy of the logo, and audits", async () => {
    await act("adm", "request", { host: "learn.cis.edu.eg" });
    const proof = siteDoc("learn.cis.edu.eg")?.proof;
    const r = await act("root", "approve", { host: "learn.cis.edu.eg", darsi: false });
    expect(google.calls).toEqual(["connect learn.cis.edu.eg"]);
    expect(google.proofs["learn.cis.edu.eg"]).toBe(proof);
    expect(r.site).toMatchObject({ status: "live", darsi: false, requestedBy: "adm", approvedBy: "root", steps: LIVE_STEPS, error: null, proof });
    expect(siteDoc("learn.cis.edu.eg")).toMatchObject({ status: "live", liveAt: expect.any(Number), checkedAt: expect.any(Number) });
    expect(google.authorized.has("learn.cis.edu.eg")).toBe(true);
    expect(google.origins.has("learn.cis.edu.eg")).toBe(true);
    expect(granted()).toEqual(["learn.cis.edu.eg"]);
    expect(db.docs.get("config/siteAccess")?.lockUntil).toBe(0);
    const file = published();
    expect(Object.keys(file.sites)).toEqual(["learn.cis.edu.eg"]);
    const entry = file.sites["learn.cis.edu.eg"];
    expect(entry).toMatchObject({ orgId: "o1", name: "CIS Training Platform", darsi: false });
    // The org's own logo is for its members only; the copy is under content/ (public), named by its bytes, immutable.
    const copy = [...store.files.keys()].find((k) => k.startsWith("content/sites/o1/"))!;
    expect(copy).toMatch(/^content\/sites\/o1\/[0-9a-f]{20}\.webp$/);
    expect(store.files.get(copy)).toMatchObject({ contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" });
    expect(entry.logo).toBe(`https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/${encodeURIComponent(copy)}?alt=media`);
    expect(siteFor(file, "learn.cis.edu.eg")).toEqual(entry);
    expect(audits.at(-1)).toEqual({ action: "approveSite", by: "root", data: { orgId: "o1", host: "learn.cis.edu.eg", darsi: false, status: "live" } });
  });
  it("needs no token under darsiai.org, and makes a new one for an address it adds directly", async () => {
    await act("root", "approve", { host: "cis.darsiai.org", orgId: "o1" });
    expect(google.proofs["cis.darsiai.org"]).toBeNull();
    expect(siteDoc("cis.darsiai.org")).toMatchObject({ proof: null, status: "live" });
    await act("root", "approve", { host: "learn.delta.edu.eg", orgId: "o2" });
    expect(google.proofs["learn.delta.edu.eg"]).toMatch(/^[0-9a-f]{32}$/);
  });
  it("gives no sign-in while the ownership record or the CNAME is missing", async () => {
    google.answer = UNPROVED;
    const r = await act("root", "approve", { host: "learn.cis.edu.eg", orgId: "o1" });
    expect(r.site).toMatchObject({ status: "connecting", steps: { owner: "wait", dns: "wait", auth: "wait", cors: "wait" } });
    expect(google.authorized.has("learn.cis.edu.eg")).toBe(false);
    expect(google.origins.has("learn.cis.edu.eg")).toBe(false);
    expect(granted()).toEqual([]);
  });
  it("keeps the DNS records still missing while it connects, and Google's words when a step failed", async () => {
    google.answer = WAITING;
    const r = await act("root", "approve", { host: "learn.cis.edu.eg", orgId: "o1" });
    expect(r.site).toMatchObject({ status: "connecting", records: WAITING.records, requestedBy: "root" });
    // Approved already counts: phones on that address get the organization's look as soon as it answers.
    expect(published().sites["learn.cis.edu.eg"]).toMatchObject({ orgId: "o1" });
    google.answer = { ...ALL_OK, steps: { ...ALL_OK.steps, hosting: "error" }, errors: ["Hosting: 403 The caller does not have permission"] };
    db.docs.set("sites/learn.cis.edu.eg", { ...siteDoc("learn.cis.edu.eg"), checkedAt: 0 });
    const again = await act("root", "check", { host: "learn.cis.edu.eg" });
    expect(again.site).toMatchObject({ status: "problem", error: "Hosting: 403 The caller does not have permission" });
    expect(published().sites["learn.cis.edu.eg"]).toBeTruthy();
    // Sign-in that couldn't be given is a problem too, with Google's words; the next run that works clears it.
    google.answer = ALL_OK; google.syncErrors = ["Authentication: 403 The caller does not have permission"];
    db.docs.set("sites/learn.cis.edu.eg", { ...siteDoc("learn.cis.edu.eg"), checkedAt: 0 });
    expect((await act("root", "check", { host: "learn.cis.edu.eg" })).site).toMatchObject({
      status: "problem", steps: { auth: "error" }, error: "Authentication: 403 The caller does not have permission",
    });
    google.syncErrors = [];
    db.docs.set("sites/learn.cis.edu.eg", { ...siteDoc("learn.cis.edu.eg"), checkedAt: 0 });
    expect((await act("root", "check", { host: "learn.cis.edu.eg" })).site).toMatchObject({ status: "live", error: null, steps: LIVE_STEPS });
  });
  it("adds an address nobody asked for, and takes one another organization only asked for, with a token of its own", async () => {
    expect(await refusal(act("root", "approve", { host: "learn.cis.edu.eg" }))).toBe("not-found:no-site");
    expect(await refusal(act("root", "approve", { host: "learn.cis.edu.eg", orgId: "nope" }))).toBe("not-found:no-org");
    await act("adm2", "request", { host: "learn.cis.edu.eg" });
    const asked = siteDoc("learn.cis.edu.eg")?.proof;
    const r = await act("root", "approve", { host: "learn.cis.edu.eg", orgId: "o1" });
    expect(r.site).toMatchObject({ orgId: "o1", requestedBy: "root", status: "live" });
    // The other organization's DNS record proves nothing for this one.
    expect(google.proofs["learn.cis.edu.eg"]).not.toBe(asked);
    // Once approved for one organization, it isn't another's.
    expect(await refusal(act("root", "approve", { host: "learn.cis.edu.eg", orgId: "o2" }))).toBe("already-exists:site-taken");
    expect(await refusal(act("adm2", "request", { host: "learn.cis.edu.eg" }))).toBe("already-exists:site-taken");
  });
  it("changes only Darsi's identity on an approved address, without connecting again", async () => {
    await act("root", "approve", { host: "cis.darsiai.org", orgId: "o1" });
    google.calls.length = 0;
    const r = await act("root", "identity", { host: "cis.darsiai.org", darsi: false });
    expect(r.site).toMatchObject({ darsi: false, status: "live" });
    expect(google.calls).toEqual([]);
    expect(published().sites["cis.darsiai.org"].darsi).toBe(false);
    expect(audits.at(-1)?.action).toBe("siteIdentity");
    expect(await refusal(act("root", "identity", { host: "nothing.darsiai.org" }))).toBe("failed-precondition:site-state");
  });
  it("refuses a request with a reason; the address is free again and can still be approved", async () => {
    await act("adm", "request", { host: "learn.cis.edu.eg" });
    const first = siteDoc("learn.cis.edu.eg")?.proof;
    const r = await act("root", "refuse", { host: "learn.cis.edu.eg", reason: "Please ask for an address with your institute's short name" });
    expect(r.site).toMatchObject({ status: "refused", refusedReason: "Please ask for an address with your institute's short name" });
    expect(await refusal(act("root", "refuse", { host: "learn.cis.edu.eg" }))).toBe("failed-precondition:site-state");
    expect(store.saves).toEqual([]);
    // Another organization may ask for it now, which replaces the refused request, token and all.
    expect((await act("adm2", "request", { host: "learn.cis.edu.eg" })).site).toMatchObject({ orgId: "o2", status: "requested", refusedReason: null });
    expect(siteDoc("learn.cis.edu.eg")?.proof).not.toBe(first);
    expect((await act("root", "approve", { host: "learn.cis.edu.eg" })).site).toMatchObject({ orgId: "o2", status: "live" });
  });
  it("tries again when Storage says the file changed too recently (429)", async () => {
    store.fail429 = 2;
    const run = act("root", "approve", { host: "cis.darsiai.org", orgId: "o1" });
    await vi.runAllTimersAsync();
    await run;
    expect(published().sites["cis.darsiai.org"]).toBeTruthy();
  });
});

describe("checking and removing an address", () => {
  it("checks for the organization's own admins too, at most every 15 seconds", async () => {
    google.answer = WAITING;
    await act("root", "approve", { host: "learn.cis.edu.eg", orgId: "o1" });
    google.answer = ALL_OK; google.calls.length = 0;
    expect((await act("adm", "check", { host: "learn.cis.edu.eg" })).site).toMatchObject({ status: "connecting" });
    expect(google.calls).toEqual([]);
    db.docs.set("sites/learn.cis.edu.eg", { ...siteDoc("learn.cis.edu.eg"), checkedAt: Date.now() - 16_000 });
    expect((await act("adm", "check", { host: "learn.cis.edu.eg" })).site).toMatchObject({ status: "live" });
    expect(google.calls).toEqual(["connect learn.cis.edu.eg"]);
    expect(await refusal(act("adm2", "check", { host: "learn.cis.edu.eg" }))).toBe("permission-denied:not-yours");
    await act("adm", "request", { host: "asked.cis.org" });
    expect(await refusal(act("adm", "check", { host: "asked.cis.org" }))).toBe("failed-precondition:site-state");
  });
  it("takes sign-in and file access back as soon as the address no longer points at Darsi, and gives them again when it does", async () => {
    await act("root", "approve", { host: "learn.cis.edu.eg", orgId: "o1" });
    expect(google.authorized.has("learn.cis.edu.eg")).toBe(true);
    // The school's domain lapsed and someone else's DNS took it over.
    google.answer = { ...WAITING, issues: ["learn.cis.edu.eg points at elsewhere.example.net, not darsi-f0685.web.app."] };
    db.docs.set("sites/learn.cis.edu.eg", { ...siteDoc("learn.cis.edu.eg"), checkedAt: 0 });
    const r = await act("adm", "check", { host: "learn.cis.edu.eg" });
    expect(r.site).toMatchObject({ status: "connecting", steps: { dns: "wait", auth: "wait", cors: "wait" } });
    expect(google.authorized.has("learn.cis.edu.eg")).toBe(false);
    expect(google.origins.has("learn.cis.edu.eg")).toBe(false);
    expect(granted()).toEqual([]);
    // Still approved: phones there keep the organization's look, and it comes back by itself.
    expect(published().sites["learn.cis.edu.eg"]).toBeTruthy();
    google.answer = ALL_OK;
    await sites.checkSites();
    expect(siteDoc("learn.cis.edu.eg")).toMatchObject({ status: "live", steps: LIVE_STEPS });
    expect(google.authorized.has("learn.cis.edu.eg")).toBe(true);
  });
  it("disconnects and forgets an address, its entry, its sign-in and its logo copy, and says what couldn't be undone", async () => {
    await act("root", "approve", { host: "cis.darsiai.org", orgId: "o1" });
    await act("root", "approve", { host: "delta.darsiai.org", orgId: "o2" });
    google.warnings = ["Hosting: 500 Internal error"];
    const r = await act("root", "remove", { host: "cis.darsiai.org" });
    expect(r).toEqual({ site: null, warnings: ["Hosting: 500 Internal error"] });
    expect(google.calls).toContain("disconnect cis.darsiai.org");
    expect(siteDoc("cis.darsiai.org")).toBeUndefined();
    expect(google.authorized.has("cis.darsiai.org")).toBe(false);
    expect(google.authorized.has("delta.darsiai.org")).toBe(true);
    expect(granted()).toEqual(["delta.darsiai.org"]);
    expect(Object.keys(published().sites)).toEqual(["delta.darsiai.org"]);
    expect([...store.files.keys()].filter((k) => k.startsWith("content/sites/"))).toEqual([]);
    expect(audits.at(-1)).toMatchObject({ action: "removeSite", data: { host: "cis.darsiai.org", warnings: ["Hosting: 500 Internal error"] } });
    // A request is only forgotten: nothing was connected.
    await act("adm", "request", { host: "asked.cis.org" });
    google.calls.length = 0; google.warnings = []; google.syncs = 0;
    expect(await act("root", "remove", { host: "asked.cis.org" })).toEqual({ site: null, warnings: [] });
    expect(google.calls).toEqual([]);
    expect(google.syncs).toBe(0);
    // Sign-in that couldn't be taken back is said too; Darsi keeps it listed, so the next run takes it out.
    google.syncErrors = ["Authentication: 503 Backend error"];
    expect((await act("root", "remove", { host: "delta.darsiai.org" })).warnings).toEqual(["Authentication: 503 Backend error"]);
    expect(granted()).toEqual(["delta.darsiai.org"]);
    google.syncErrors = [];
    await sites.checkSites();
    expect(google.authorized.has("delta.darsiai.org")).toBe(false);
    expect(granted()).toEqual([]);
  });
  it("never brings back an address removed while it was being checked", async () => {
    await act("root", "approve", { host: "cis.darsiai.org", orgId: "o1" });
    db.docs.set("sites/cis.darsiai.org", { ...siteDoc("cis.darsiai.org"), checkedAt: 0 });
    google.during = () => db.docs.delete("sites/cis.darsiai.org");
    await expect(act("root", "check", { host: "cis.darsiai.org" })).resolves.toBeTruthy();
    expect(siteDoc("cis.darsiai.org")).toBeUndefined();
  });
  it("takes out an address Darsi gave sign-in to that nothing lists any more, whatever left it there", async () => {
    // A run that stopped halfway, or a write that raced another: the address is still in Google's lists.
    db.docs.set("config/siteAccess", { hosts: ["gone.school.org"], lockUntil: 0 });
    google.authorized.add("gone.school.org"); google.origins.add("gone.school.org");
    google.authorized.add("manual.example.com");
    await sites.checkSites();
    expect(google.authorized.has("gone.school.org")).toBe(false);
    expect(google.origins.has("gone.school.org")).toBe(false);
    // What Darsi didn't put there stays.
    expect(google.authorized.has("manual.example.com")).toBe(true);
    expect(granted()).toEqual([]);
  });
  it("takes sign-in from an organization's address that has no right to it, even one added by hand", async () => {
    google.answer = WAITING;
    await act("root", "approve", { host: "learn.cis.edu.eg", orgId: "o1" });
    google.authorized.add("learn.cis.edu.eg"); google.origins.add("learn.cis.edu.eg");
    expect(granted()).toEqual([]);
    await sites.checkSites();
    expect(google.authorized.has("learn.cis.edu.eg")).toBe(false);
    expect(google.origins.has("learn.cis.edu.eg")).toBe(false);
  });
  it("waits for another run of the access lists, and says so if it can't get its turn", async () => {
    db.docs.set("config/siteAccess", { hosts: [], lockUntil: Date.now() + 10 * 60_000 });
    const run = sites.syncSiteAccess();
    await vi.runAllTimersAsync();
    expect(await run).toEqual(["Busy: another change to web addresses is being applied. This one follows within 15 minutes."]);
    expect(google.syncs).toBe(0);
    // A lock left by a run that crashed long ago is taken.
    db.docs.set("config/siteAccess", { hosts: [], lockUntil: Date.now() - 1 });
    expect(await sites.syncSiteAccess()).toEqual([]);
    expect(google.syncs).toBe(1);
  });
  it("publishes a site without a logo when the organization has none, or its file is gone", async () => {
    db.docs.set("orgs/o1", { name: "CIS Training Platform", status: "active", brand: { logo: "orgs/o1/brand/logo-missing99.png", v: 2 } });
    await act("root", "approve", { host: "cis.darsiai.org", orgId: "o1" });
    expect(published().sites["cis.darsiai.org"].logo).toBeNull();
    // Another organization's file is never copied for this one.
    db.docs.set("orgs/o2", { name: "Delta School", status: "active", brand: { logo: LOGO, v: 1 } });
    await act("root", "approve", { host: "delta.darsiai.org", orgId: "o2" });
    expect(published().sites["delta.darsiai.org"].logo).toBeNull();
  });
});

describe("setOrgSite (for phones with the older app)", () => {
  it("approves an address directly, or removes all of an organization's", async () => {
    expect(await refusal(setOrgSite.run(as("adm", { orgId: "o1", host: "cis.darsiai.org" })))).toBe("permission-denied:not-super");
    expect(await refusal(setOrgSite.run(as("root", { host: "cis.darsiai.org" })))).toBe("invalid-argument:no-org");
    expect(await setOrgSite.run(as("root", { orgId: "o1", host: "cis.darsiai.org", darsi: false }))).toEqual({ site: { host: "cis.darsiai.org", darsi: false } });
    expect(siteDoc("cis.darsiai.org")).toMatchObject({ status: "live", orgId: "o1" });
    expect(await setOrgSite.run(as("root", { orgId: "o1", host: "" }))).toEqual({ site: null });
    expect(siteDoc("cis.darsiai.org")).toBeUndefined();
    expect(published().sites).toEqual({});
  });
});

describe("sitesJob", () => {
  it("moves the old config/sites list in, checks it, publishes, and drops the list", async () => {
    db.docs.set("orgs/o1", { ...db.docs.get("orgs/o1"), site: { host: "cis.darsiai.org", darsi: true } });
    db.docs.set("config/sites", { list: [{ host: "cis.darsiai.org", orgId: "o1" }, { host: "gone.darsiai.org", orgId: "o9" }], updatedBy: "root" });
    expect(await sites.checkSites()).toEqual({ imported: 1, checked: 1, live: 1, errors: [] });
    expect(siteDoc("cis.darsiai.org")).toMatchObject({ orgId: "o1", status: "live", darsi: true, approvedBy: "root" });
    expect(siteDoc("gone.darsiai.org")).toBeUndefined();
    expect(db.docs.get("config/sites")).toBeUndefined();
    expect(Object.keys(published().sites)).toEqual(["cis.darsiai.org"]);
  });
  it("checks addresses that aren't live yet every run, live ones every hour, and never requests", async () => {
    google.answer = WAITING;
    await act("root", "approve", { host: "learn.cis.edu.eg", orgId: "o1" });
    google.answer = ALL_OK;
    await act("root", "approve", { host: "cis.darsiai.org", orgId: "o1" });
    await act("adm2", "request", { host: "learn.delta.edu.eg" });
    google.calls.length = 0; store.saves.length = 0;
    expect(await sites.checkSites()).toEqual({ imported: 0, checked: 1, live: 2, errors: [] });
    expect(google.calls).toEqual(["connect learn.cis.edu.eg"]);
    expect(siteDoc("learn.cis.edu.eg")?.status).toBe("live");
    expect(store.saves).toEqual([]);
    google.calls.length = 0;
    await sites.checkSites(Date.now() + 61 * 60_000);
    expect(google.calls.sort()).toEqual(["connect cis.darsiai.org", "connect learn.cis.edu.eg"]);
  });
  it("gives an address approved before ownership tokens one, and reads an old one under darsiai.org as owned", async () => {
    db.docs.set("sites/old.cis.edu.eg", { orgId: "o1", status: "live", steps: { dns: "ok", hosting: "ok", cert: "ok", auth: "ok", cors: "ok" }, checkedAt: 0 });
    db.docs.set("sites/cis.darsiai.org", { orgId: "o1", status: "live", steps: { dns: "ok", hosting: "ok", cert: "ok", auth: "ok", cors: "ok" }, checkedAt: Date.now() });
    google.answers["old.cis.edu.eg"] = UNPROVED;
    await sites.checkSites();
    expect(google.proofs["old.cis.edu.eg"]).toMatch(/^[0-9a-f]{32}$/);
    expect(siteDoc("old.cis.edu.eg")).toMatchObject({ proof: google.proofs["old.cis.edu.eg"], status: "connecting" });
    expect(readSiteDoc("cis.darsiai.org", siteDoc("cis.darsiai.org"))?.steps?.owner).toBe("ok");
    expect(google.authorized.has("cis.darsiai.org")).toBe(true);
    expect(google.authorized.has("old.cis.edu.eg")).toBe(false);
  });
});

describe("following an organization's changes (onOrgSite)", () => {
  type Data = Record<string, unknown> | undefined;
  const event = (orgId: string, before: Data, after: Data) => ({ params: { orgId }, data: { before: { data: () => before }, after: { data: () => after } } });
  const onOrgSite = sites.onOrgSite as unknown as { run: (e: unknown) => Promise<unknown> };

  it("looks only when an organization was renamed, re-branded or deleted", () => {
    const org = { name: "CIS", brand: { logo: LOGO, v: 1 }, memberCount: 3 };
    expect(sitesNeedPublish(org, { ...org, memberCount: 4 })).toBe(false);
    expect(sitesNeedPublish(org, { ...org, licence: { seats: 5 } })).toBe(false);
    expect(sitesNeedPublish(org, { ...org, name: "CIS Academy" })).toBe(true);
    expect(sitesNeedPublish(org, { ...org, brand: { logo: "orgs/o1/brand/logo-zzz999zzz.png", v: 2 } })).toBe(true);
    expect(sitesNeedPublish(org, { ...org, brand: null })).toBe(true);
    expect(sitesNeedPublish(org, undefined)).toBe(true);
    expect(sitesNeedPublish(undefined, org)).toBe(false);
  });

  it("publishes the new name and logo, and disconnects a deleted organization's addresses", async () => {
    await act("root", "approve", { host: "cis.darsiai.org", orgId: "o1" });
    await act("adm", "request", { host: "asked.cis.org" });
    const before = db.docs.get("orgs/o1")!;
    const firstLogo = published().sites["cis.darsiai.org"].logo;
    // OrgBranding (a client) writes the org document: a new name and logo.
    const logo2 = "orgs/o1/brand/logo-newlogo12.png";
    store.files.set(logo2, { bytes: Buffer.from("logo-bytes-2"), contentType: "image/png" });
    db.docs.set("orgs/o1", { ...before, name: "CIS Academy", brand: { logo: logo2, v: 2 } });
    store.saves.length = 0;
    await onOrgSite.run(event("o1", before, db.docs.get("orgs/o1")));
    expect(store.saves).toEqual(["content/sites.json"]);
    const entry = published().sites["cis.darsiai.org"];
    expect(entry.name).toBe("CIS Academy");
    expect(entry.logo).toMatch(/\.png\?alt=media$/);
    expect(entry.logo).not.toBe(firstLogo);
    expect(siteDoc("cis.darsiai.org")?.orgName).toBe("CIS Academy");
    expect(siteDoc("asked.cis.org")?.orgName).toBe("CIS Academy");
    expect([...store.files.keys()].filter((k) => k.startsWith("content/sites/"))).toHaveLength(1);
    // A member count changing does nothing; an organization without addresses publishes nothing.
    store.saves.length = 0;
    await onOrgSite.run(event("o1", db.docs.get("orgs/o1"), { ...db.docs.get("orgs/o1"), memberCount: 9 }));
    await onOrgSite.run(event("o2", db.docs.get("orgs/o2"), { ...db.docs.get("orgs/o2"), name: "Delta" }));
    expect(store.saves).toEqual([]);
    // Deleted: disconnected and forgotten, so another organization can have the address.
    const last = db.docs.get("orgs/o1");
    db.docs.delete("orgs/o1");
    google.calls.length = 0;
    await onOrgSite.run(event("o1", last, undefined));
    expect(google.calls).toEqual(["disconnect cis.darsiai.org"]);
    expect(google.authorized.has("cis.darsiai.org")).toBe(false);
    expect(siteDoc("cis.darsiai.org")).toBeUndefined();
    expect(siteDoc("asked.cis.org")).toBeUndefined();
    expect(published().sites).toEqual({});
    expect([...store.files.keys()].filter((k) => k.startsWith("content/sites/"))).toEqual([]);
  });
});

describe("the pure parts", () => {
  it("reads what Hosting says about a custom domain", () => {
    expect(hostingCheck({ hostState: "HOST_ACTIVE", ownershipState: "OWNERSHIP_ACTIVE", cert: { state: "CERT_ACTIVE" } }))
      .toEqual({ hosting: "ok", dns: "ok", cert: "ok", records: [], issues: [] });
    const waiting = hostingCheck({
      hostState: "HOST_UNHOSTED", ownershipState: "OWNERSHIP_MISSING", cert: { state: "CERT_PREPARING" },
      requiredDnsUpdates: { desired: [{ records: [
        { domainName: "learn.cis.edu.eg.", type: "CNAME", rdata: "darsi-f0685.web.app.", requiredAction: "ADD" },
        { domainName: "learn.cis.edu.eg", type: "A", rdata: "1.2.3.4", requiredAction: "REMOVE" },
        { domainName: "learn.cis.edu.eg", type: "TXT", rdata: "x", requiredAction: "NONE" },
      ] }] },
      issues: [{ message: "DNS isn't visible yet" }],
    });
    expect(waiting).toEqual({
      hosting: "ok", dns: "wait", cert: "wait", issues: ["DNS isn't visible yet"],
      records: [{ name: "learn.cis.edu.eg", type: "CNAME", value: "darsi-f0685.web.app", action: "add" }, { name: "learn.cis.edu.eg", type: "A", value: "1.2.3.4", action: "remove" }],
    });
    expect(hostingCheck({ hostState: "HOST_CONFLICT", cert: { state: "CERT_EXPIRED" } })).toMatchObject({ dns: "error", cert: "error" });
    expect(hostingCheck({ hostState: "HOST_ACTIVE", ownershipState: "OWNERSHIP_ACTIVE", cert: { state: "CERT_EXPIRING_SOON" } }).cert).toBe("ok");
  });
  it("is live only when every step is done, and a problem when one failed", () => {
    expect(statusOf({ owner: "ok", dns: "ok", hosting: "ok", cert: "ok", auth: "ok", cors: "ok" })).toBe("live");
    expect(statusOf({ owner: "wait", dns: "ok", hosting: "ok", cert: "ok", auth: "ok", cors: "ok" })).toBe("connecting");
    expect(statusOf({ owner: "ok", dns: "wait", hosting: "ok", cert: "wait", auth: "ok", cors: "ok" })).toBe("connecting");
    expect(statusOf({ owner: "ok", dns: "wait", hosting: "ok", cert: "wait", auth: "error", cors: "ok" })).toBe("problem");
  });
  it("gives sign-in only to an approved address with its ownership record that points at Darsi", () => {
    const site = (status: string, steps: Record<string, string> | null) => readSiteDoc("learn.cis.edu.eg", { orgId: "o1", status, steps })!;
    expect(hasAccess(site("live", LIVE_STEPS))).toBe(true);
    expect(hasAccess(site("problem", { ...LIVE_STEPS, cert: "error" }))).toBe(true);
    expect(hasAccess(site("connecting", { ...LIVE_STEPS, owner: "wait" }))).toBe(false);
    expect(hasAccess(site("connecting", { ...LIVE_STEPS, dns: "wait" }))).toBe(false);
    expect(hasAccess(site("requested", null))).toBe(false);
    expect(hasAccess(site("refused", LIVE_STEPS))).toBe(false);
  });
  it("plans the access lists: adds and drops, keeps the rest in place, and says when nothing changes", () => {
    expect(planList(["localhost", "darsiai.org", "old.org"], ["new.org"], ["old.org"])).toEqual(["localhost", "darsiai.org", "new.org"]);
    expect(planList(["darsiai.org", "new.org"], ["new.org"], ["old.org"])).toBeNull();
    const cors = [{ origin: ["https://darsiai.org", "https://old.org"], method: ["GET"], maxAgeSeconds: 60 }];
    expect(planCors(cors, ["https://new.org"], ["https://old.org"])).toEqual([{ origin: ["https://darsiai.org", "https://new.org"], method: ["GET"], maxAgeSeconds: 60 }]);
    expect(planCors(cors, ["https://old.org"], [])).toBeNull();
  });
  it("adds an origin to the bucket's CORS list once, keeping the rest, and takes it out again", () => {
    const cors = [{ origin: ["https://darsiai.org"], method: ["GET", "HEAD"], maxAgeSeconds: 3600 }];
    expect(corsWith(cors, "https://darsiai.org", true)).toBeNull();
    const added = corsWith(cors, "https://cis.darsiai.org", true)!;
    expect(added).toEqual([{ origin: ["https://darsiai.org", "https://cis.darsiai.org"], method: ["GET", "HEAD"], maxAgeSeconds: 3600 }]);
    expect(cors[0].origin).toEqual(["https://darsiai.org"]);
    expect(corsWith(added, "https://cis.darsiai.org", false)).toEqual(cors);
    expect(corsWith(cors, "https://cis.darsiai.org", false)).toBeNull();
    expect(corsWith(undefined, "https://cis.darsiai.org", true)?.[0]).toMatchObject({ origin: ["https://cis.darsiai.org"], method: ["GET", "HEAD"] });
  });
  it("adds and removes an authorized domain once", () => {
    expect(listWith(["darsiai.org"], "cis.darsiai.org", true)).toEqual(["darsiai.org", "cis.darsiai.org"]);
    expect(listWith(["darsiai.org", "cis.darsiai.org"], "cis.darsiai.org", true)).toBeNull();
    expect(listWith(["darsiai.org", "cis.darsiai.org"], "cis.darsiai.org", false)).toEqual(["darsiai.org"]);
    expect(listWith(undefined, "x.org", false)).toBeNull();
  });
  it("reads a stored site, checked", () => {
    expect(readSiteDoc("h.org", { status: "nope", orgId: "o1" })).toBeNull();
    expect(readSiteDoc("h.org", { status: "live" })).toBeNull();
    expect(readSiteDoc("h.org", { status: "live", orgId: "o1", steps: { dns: "ok", cert: "bad" } })).toMatchObject({
      host: "h.org", orgName: "o1", darsi: true, steps: { owner: "todo", dns: "ok", hosting: "todo", cert: "todo", auth: "todo", cors: "todo" }, records: null, proof: null,
    });
    expect(readSiteDoc("h.org", { status: "live", orgId: "o1", proof: "<script>" })?.proof).toBeNull();
  });
  it("reads the old config/sites list, one entry per host", () => {
    expect(readLinks([{ host: "b.org", orgId: "o2" }, { host: "b.org", orgId: "o3" }, { host: "", orgId: "x" }, "junk", { host: "a.org", orgId: "o1" }]))
      .toEqual([{ host: "b.org", orgId: "o2" }, { host: "a.org", orgId: "o1" }]);
    expect(readLinks(null)).toEqual([]);
  });
  it("copies only the organization's own logo files", () => {
    expect(brandLogoPath("o1", LOGO)).toBe(LOGO);
    expect(brandLogoPath("o1", "orgs/o2/brand/logo-abc123def.webp")).toBeNull();
    expect(brandLogoPath("o1", "orgs/o1/brand/../secret/logo-abc123def.webp")).toBeNull();
    expect(brandLogoPath("o1", "orgs/o1/brand/logo-abc123def.svg")).toBeNull();
    expect(brandLogoPath("o1", "orgs/o1/brand/sub/logo.png")).toBeNull();
    expect(brandLogoPath("o1", null)).toBeNull();
    // A logo a platform admin's script put there under another name is still the organization's.
    expect(brandLogoPath("o1", "orgs/o1/brand/logo-CIS_2026.jpeg")).toBe("orgs/o1/brand/logo-CIS_2026.jpeg");
  });
});
