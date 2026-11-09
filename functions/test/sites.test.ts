// Organization sites (TECHNICAL.md "Organization sites (custom web addresses)"): the shared host rules (shared/sites.ts,
// the web app's own file), manageSite (asking, approving, refusing, checking, removing) with an in-memory Firestore and
// Storage and a stand-in for the Google calls (domains.ts), content/sites.json and its logo copies, sitesJob (the old
// config/sites list moved in, addresses turning live), and the trigger that follows an organization's changes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeAuth, FakeDb } from "./fakeFirestore";
import { checkSiteHost, isDarsiHost, siteFor } from "../src/shared/sites";
import { brandLogoPath, corsWith, hostingCheck, listWith, readLinks, readSiteDoc, sitesNeedPublish, statusOf } from "../src/sitesCore";
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
/** The Google side (domains.ts): what the next check answers, and every call. */
const google = vi.hoisted(() => ({
  calls: [] as string[], warnings: [] as string[], during: null as null | (() => void),
  answer: null as null | HostCheck,
}));
const ALL_OK = { steps: { dns: "ok", hosting: "ok", cert: "ok", auth: "ok", cors: "ok" }, records: [], issues: [], errors: [] } as HostCheck;
const WAITING = {
  steps: { dns: "wait", hosting: "ok", cert: "wait", auth: "ok", cors: "ok" },
  records: [{ name: "learn.cis.edu.eg", type: "CNAME", value: "darsi-f0685.web.app", action: "add" }], issues: [], errors: [],
} as HostCheck;
vi.mock("../src/domains.js", () => ({
  connectHost: async (host: string) => { google.calls.push(`connect ${host}`); google.during?.(); return google.answer!; },
  disconnectHost: async (host: string) => { google.calls.push(`disconnect ${host}`); return google.warnings; },
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

beforeEach(() => {
  db.docs.clear(); auth.users.clear(); audits.length = 0; store.files.clear(); store.saves.length = 0; store.fail429 = 0;
  google.calls.length = 0; google.warnings = []; google.during = null; google.answer = ALL_OK;
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
    expect(await refusal(manageSite.run({ data: { action: "request", host: "cis.darsiai.org" } }))).toBe("unauthenticated:no reason");
    expect(await refusal(act("tea", "request", { host: "cis.darsiai.org" }))).toBe("permission-denied:not-org-admin");
    expect(await refusal(act("adm", "request", { host: "Not a host" }))).toBe("invalid-argument:site-host");
    expect(await refusal(act("adm", "request", { host: "" }))).toBe("invalid-argument:site-host");
    expect(await refusal(act("adm", "request", { host: "www.darsiai.org" }))).toBe("invalid-argument:site-reserved");
    expect(await refusal(act("adm", "explode", { host: "cis.darsiai.org" }))).toBe("invalid-argument:site-action");
    // Org admins ask; platform admins approve, refuse, change the identity and remove.
    for (const a of ["approve", "refuse", "identity", "remove"]) expect(await refusal(act("adm", a, { host: "cis.darsiai.org" })), a).toBe("permission-denied:not-super");
    expect(await refusal(act("root", "request", { host: "cis.darsiai.org" }))).toBe("permission-denied:not-org-admin");
    expect([...db.docs.keys()].filter((k) => k.startsWith("sites/"))).toEqual([]);
    expect(google.calls).toEqual([]);
  });
});

describe("asking for an address (org admins)", () => {
  it("records the request for their own organization, connects nothing and publishes nothing", async () => {
    const r = await act("adm", "request", { host: "cis.darsiai.org" });
    expect(r.site).toMatchObject({ host: "cis.darsiai.org", orgId: "o1", orgName: "CIS Training Platform", status: "requested", requestedBy: "adm", darsi: true, approvedBy: null });
    expect(siteDoc("cis.darsiai.org")).toMatchObject({ status: "requested", orgId: "o1" });
    expect(google.calls).toEqual([]);
    expect(store.saves).toEqual([]);
    expect(audits).toEqual([{ action: "requestSite", by: "adm", data: { orgId: "o1", host: "cis.darsiai.org" } }]);
    // Asking again changes nothing.
    expect((await act("adm", "request", { host: "cis.darsiai.org" })).site).toMatchObject({ status: "requested", requestedBy: "adm" });
  });
  it("refuses an address another organization asked for or uses, and more than three", async () => {
    await act("adm", "request", { host: "cis.darsiai.org" });
    expect(await refusal(act("adm2", "request", { host: "cis.darsiai.org" }))).toBe("already-exists:site-taken");
    for (const h of ["b.cis.org", "c.cis.org"]) await act("adm", "request", { host: h });
    expect(await refusal(act("adm", "request", { host: "d.cis.org" }))).toBe("resource-exhausted:site-limit");
  });
  it("refuses an organization that isn't active yet", async () => {
    db.docs.set("orgs/o1", { name: "CIS", status: "pending" });
    expect(await refusal(act("adm", "request", { host: "cis.darsiai.org" }))).toBe("failed-precondition:org-inactive");
  });
  it("lets the organization take back its own request, not another's, and not a connected address", async () => {
    await act("adm", "request", { host: "cis.darsiai.org" });
    expect(await refusal(act("adm2", "cancel", { host: "cis.darsiai.org" }))).toBe("permission-denied:not-yours");
    expect(await act("adm", "cancel", { host: "cis.darsiai.org" })).toEqual({ site: null });
    expect(siteDoc("cis.darsiai.org")).toBeUndefined();
    await act("root", "approve", { host: "delta.darsiai.org", orgId: "o2" });
    expect(await refusal(act("adm2", "cancel", { host: "delta.darsiai.org" }))).toBe("failed-precondition:site-state");
  });
});

describe("approving an address (platform admins)", () => {
  it("connects it, keeps who asked, publishes content/sites.json with a public copy of the logo, and audits", async () => {
    await act("adm", "request", { host: "cis.darsiai.org" });
    const r = await act("root", "approve", { host: "cis.darsiai.org", darsi: false });
    expect(google.calls).toEqual(["connect cis.darsiai.org"]);
    expect(r.site).toMatchObject({ status: "live", darsi: false, requestedBy: "adm", approvedBy: "root", steps: ALL_OK.steps, error: null });
    expect(siteDoc("cis.darsiai.org")).toMatchObject({ status: "live", liveAt: expect.any(Number), checkedAt: expect.any(Number) });
    const file = published();
    expect(Object.keys(file.sites)).toEqual(["cis.darsiai.org"]);
    const entry = file.sites["cis.darsiai.org"];
    expect(entry).toMatchObject({ orgId: "o1", name: "CIS Training Platform", darsi: false });
    // The org's own logo is for its members only; the copy is under content/ (public), named by its bytes, immutable.
    const copy = [...store.files.keys()].find((k) => k.startsWith("content/sites/o1/"))!;
    expect(copy).toMatch(/^content\/sites\/o1\/[0-9a-f]{20}\.webp$/);
    expect(store.files.get(copy)).toMatchObject({ contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" });
    expect(entry.logo).toBe(`https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/${encodeURIComponent(copy)}?alt=media`);
    expect(siteFor(file, "cis.darsiai.org")).toEqual(entry);
    expect(audits.at(-1)).toEqual({ action: "approveSite", by: "root", data: { orgId: "o1", host: "cis.darsiai.org", darsi: false, status: "live" } });
  });
  it("keeps the DNS records still missing while it connects, and Google's words when a step failed", async () => {
    google.answer = WAITING;
    const r = await act("root", "approve", { host: "learn.cis.edu.eg", orgId: "o1" });
    expect(r.site).toMatchObject({ status: "connecting", records: WAITING.records, requestedBy: "root" });
    // Approved already counts: phones on that address get the organization's look as soon as it answers.
    expect(published().sites["learn.cis.edu.eg"]).toMatchObject({ orgId: "o1" });
    google.answer = { ...ALL_OK, steps: { ...ALL_OK.steps, auth: "error" }, errors: ["Authentication: 403 The caller does not have permission"] };
    db.docs.set("sites/learn.cis.edu.eg", { ...siteDoc("learn.cis.edu.eg"), checkedAt: 0 });
    const again = await act("root", "check", { host: "learn.cis.edu.eg" });
    expect(again.site).toMatchObject({ status: "problem", error: "Authentication: 403 The caller does not have permission" });
    expect(published().sites["learn.cis.edu.eg"]).toBeTruthy();
  });
  it("adds an address nobody asked for, and takes one another organization only asked for", async () => {
    expect(await refusal(act("root", "approve", { host: "cis.darsiai.org" }))).toBe("not-found:no-site");
    expect(await refusal(act("root", "approve", { host: "cis.darsiai.org", orgId: "nope" }))).toBe("not-found:no-org");
    await act("adm2", "request", { host: "cis.darsiai.org" });
    const r = await act("root", "approve", { host: "cis.darsiai.org", orgId: "o1" });
    expect(r.site).toMatchObject({ orgId: "o1", requestedBy: "root", status: "live" });
    // Once approved for one organization, it isn't another's.
    expect(await refusal(act("root", "approve", { host: "cis.darsiai.org", orgId: "o2" }))).toBe("already-exists:site-taken");
    expect(await refusal(act("adm2", "request", { host: "cis.darsiai.org" }))).toBe("already-exists:site-taken");
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
    await act("adm", "request", { host: "cis.darsiai.org" });
    const r = await act("root", "refuse", { host: "cis.darsiai.org", reason: "Please ask for an address with your institute's short name" });
    expect(r.site).toMatchObject({ status: "refused", refusedReason: "Please ask for an address with your institute's short name" });
    expect(await refusal(act("root", "refuse", { host: "cis.darsiai.org" }))).toBe("failed-precondition:site-state");
    expect(store.saves).toEqual([]);
    // Another organization may ask for it now, which replaces the refused request.
    expect((await act("adm2", "request", { host: "cis.darsiai.org" })).site).toMatchObject({ orgId: "o2", status: "requested", refusedReason: null });
    expect((await act("root", "approve", { host: "cis.darsiai.org" })).site).toMatchObject({ orgId: "o2", status: "live" });
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
  it("disconnects and forgets an address, its entry and its logo copy, and says what couldn't be undone", async () => {
    await act("root", "approve", { host: "cis.darsiai.org", orgId: "o1" });
    await act("root", "approve", { host: "delta.darsiai.org", orgId: "o2" });
    google.warnings = ["Hosting: 500 Internal error"];
    const r = await act("root", "remove", { host: "cis.darsiai.org" });
    expect(r).toEqual({ site: null, warnings: ["Hosting: 500 Internal error"] });
    expect(google.calls).toContain("disconnect cis.darsiai.org");
    expect(siteDoc("cis.darsiai.org")).toBeUndefined();
    expect(Object.keys(published().sites)).toEqual(["delta.darsiai.org"]);
    expect([...store.files.keys()].filter((k) => k.startsWith("content/sites/"))).toEqual([]);
    expect(audits.at(-1)).toMatchObject({ action: "removeSite", data: { host: "cis.darsiai.org", warnings: ["Hosting: 500 Internal error"] } });
    // A request is only forgotten: nothing was connected.
    await act("adm", "request", { host: "asked.cis.org" });
    google.calls.length = 0; google.warnings = [];
    expect(await act("root", "remove", { host: "asked.cis.org" })).toEqual({ site: null, warnings: [] });
    expect(google.calls).toEqual([]);
  });
  it("never brings back an address removed while it was being checked", async () => {
    await act("root", "approve", { host: "cis.darsiai.org", orgId: "o1" });
    db.docs.set("sites/cis.darsiai.org", { ...siteDoc("cis.darsiai.org"), checkedAt: 0 });
    google.during = () => db.docs.delete("sites/cis.darsiai.org");
    await expect(act("root", "check", { host: "cis.darsiai.org" })).resolves.toBeTruthy();
    expect(siteDoc("cis.darsiai.org")).toBeUndefined();
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
    expect(await sites.checkSites()).toEqual({ imported: 1, checked: 1, live: 1 });
    expect(siteDoc("cis.darsiai.org")).toMatchObject({ orgId: "o1", status: "live", darsi: true, approvedBy: "root" });
    expect(siteDoc("gone.darsiai.org")).toBeUndefined();
    expect(db.docs.get("config/sites")).toBeUndefined();
    expect(Object.keys(published().sites)).toEqual(["cis.darsiai.org"]);
  });
  it("checks addresses that aren't live yet every run, live ones once a day, and never requests", async () => {
    google.answer = WAITING;
    await act("root", "approve", { host: "learn.cis.edu.eg", orgId: "o1" });
    google.answer = ALL_OK;
    await act("root", "approve", { host: "cis.darsiai.org", orgId: "o1" });
    await act("adm2", "request", { host: "delta.darsiai.org" });
    google.calls.length = 0; store.saves.length = 0;
    expect(await sites.checkSites()).toEqual({ imported: 0, checked: 1, live: 2 });
    expect(google.calls).toEqual(["connect learn.cis.edu.eg"]);
    expect(siteDoc("learn.cis.edu.eg")?.status).toBe("live");
    expect(store.saves).toEqual([]);
    google.calls.length = 0;
    await sites.checkSites(Date.now() + 25 * 3600_000);
    expect(google.calls.sort()).toEqual(["connect cis.darsiai.org", "connect learn.cis.edu.eg"]);
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
    expect(statusOf({ dns: "ok", hosting: "ok", cert: "ok", auth: "ok", cors: "ok" })).toBe("live");
    expect(statusOf({ dns: "wait", hosting: "ok", cert: "wait", auth: "ok", cors: "ok" })).toBe("connecting");
    expect(statusOf({ dns: "wait", hosting: "ok", cert: "wait", auth: "error", cors: "ok" })).toBe("problem");
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
      host: "h.org", orgName: "o1", darsi: true, steps: { dns: "ok", hosting: "todo", cert: "todo", auth: "todo", cors: "todo" }, records: null,
    });
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
