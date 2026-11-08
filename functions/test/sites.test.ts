// Organization sites (TECHNICAL.md "Organization sites (custom web addresses)"): the shared host rules (shared/sites.ts,
// the web app's own file), setOrgSite with an in-memory Firestore and Storage, content/sites.json and its logo copies,
// and the trigger that publishes again when an organization with a site is renamed, re-branded or deleted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeAuth, FakeDb } from "./fakeFirestore";
import { checkSiteHost, isDarsiHost, siteFor } from "../src/shared/sites";
import { brandLogoPath, readLinks, sitesNeedPublish, withLink } from "../src/sitesCore";

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
vi.useFakeTimers({ toFake: ["setTimeout"] });

const { db, auth } = (await import("../src/admin.js")) as unknown as { db: FakeDb; auth: FakeAuth };
const sites = await import("../src/sites");
type Run = { run: (req: unknown) => Promise<unknown> };
const setOrgSite = sites.setOrgSite as unknown as Run;
const as = (uid: string, data: Record<string, unknown>) => ({ auth: { uid, token: {} }, data });
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; details?: { reason?: string } }) => `${e.code}:${e.details?.reason ?? "no reason"}`);
const published = () => JSON.parse(store.files.get("content/sites.json")!.bytes.toString()) as { v: number; sites: Record<string, { orgId: string; name: string; logo: string | null; darsi: boolean }> };
const LOGO = "orgs/o1/brand/logo-abc123def.webp";

beforeEach(() => {
  db.docs.clear(); auth.users.clear(); audits.length = 0; store.files.clear(); store.saves.length = 0; store.fail429 = 0;
  auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
  auth.users.set("adm", { uid: "adm", customClaims: { role: "orgAdmin", orgId: "o1" } });
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

describe("setOrgSite", () => {
  it("is for platform admins only, and says why", async () => {
    expect(await refusal(setOrgSite.run({ data: { orgId: "o1", host: "cis.darsiai.org" } }))).toBe("unauthenticated:no reason");
    expect(await refusal(setOrgSite.run(as("adm", { orgId: "o1", host: "cis.darsiai.org" })))).toBe("permission-denied:not-super");
    expect(await refusal(setOrgSite.run(as("root", { host: "cis.darsiai.org" })))).toBe("invalid-argument:no-org");
    expect(await refusal(setOrgSite.run(as("root", { orgId: "nope", host: "cis.darsiai.org" })))).toBe("not-found:no-org");
    expect(await refusal(setOrgSite.run(as("root", { orgId: "o1", host: "Not a host" })))).toBe("invalid-argument:site-host");
    expect(await refusal(setOrgSite.run(as("root", { orgId: "o1", host: "darsiai.org" })))).toBe("invalid-argument:site-reserved");
    expect(await refusal(setOrgSite.run(as("root", { orgId: "o1", host: "darsi-f0685.web.app" })))).toBe("invalid-argument:site-reserved");
    expect(db.docs.get("orgs/o1")?.site).toBeUndefined();
    expect(store.saves).toEqual([]);
  });

  it("stores the site, publishes content/sites.json with a public copy of the logo, and audits", async () => {
    expect(await setOrgSite.run(as("root", { orgId: "o1", host: "cis.darsiai.org", darsi: false }))).toEqual({ site: { host: "cis.darsiai.org", darsi: false } });
    expect(db.docs.get("orgs/o1")?.site).toEqual({ host: "cis.darsiai.org", darsi: false });
    expect(db.docs.get("config/sites")).toMatchObject({ list: [{ host: "cis.darsiai.org", orgId: "o1" }], rev: 1 });
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
    expect(audits).toEqual([{ action: "setOrgSite", by: "root", data: { orgId: "o1", host: "cis.darsiai.org", darsi: false, before: null } }]);
  });

  it("shows Darsi's identity unless told not to, and moves an organization to a new host", async () => {
    await setOrgSite.run(as("root", { orgId: "o1", host: "cis.darsiai.org" }));
    expect(published().sites["cis.darsiai.org"].darsi).toBe(true);
    await setOrgSite.run(as("root", { orgId: "o1", host: "learn.cis.edu.eg", darsi: true }));
    expect(Object.keys(published().sites)).toEqual(["learn.cis.edu.eg"]);
    expect(db.docs.get("config/sites")?.list).toEqual([{ host: "learn.cis.edu.eg", orgId: "o1" }]);
    expect(audits.at(-1)?.data).toMatchObject({ host: "learn.cis.edu.eg", before: "cis.darsiai.org" });
  });

  it("refuses a host another organization uses, unless that organization is gone", async () => {
    await setOrgSite.run(as("root", { orgId: "o1", host: "cis.darsiai.org" }));
    expect(await refusal(setOrgSite.run(as("root", { orgId: "o2", host: "cis.darsiai.org" })))).toBe("already-exists:site-taken");
    expect(db.docs.get("orgs/o2")?.site).toBeUndefined();
    // The same organization saving again (Darsi's identity turned off) is no conflict.
    await setOrgSite.run(as("root", { orgId: "o1", host: "cis.darsiai.org", darsi: false }));
    expect(published().sites["cis.darsiai.org"]).toMatchObject({ orgId: "o1", darsi: false });
    db.docs.delete("orgs/o1");
    await setOrgSite.run(as("root", { orgId: "o2", host: "cis.darsiai.org" }));
    expect(published().sites["cis.darsiai.org"]).toMatchObject({ orgId: "o2", name: "Delta School", logo: null });
    // The deleted organization's logo copy went with it.
    expect([...store.files.keys()].filter((k) => k.startsWith("content/sites/"))).toEqual([]);
  });

  it("an empty host removes the site, its entry and its logo copy", async () => {
    await setOrgSite.run(as("root", { orgId: "o1", host: "cis.darsiai.org" }));
    await setOrgSite.run(as("root", { orgId: "o2", host: "delta.darsiai.org" }));
    expect(await setOrgSite.run(as("root", { orgId: "o1", host: "" }))).toEqual({ site: null });
    expect(db.docs.get("orgs/o1")).not.toHaveProperty("site");
    expect(Object.keys(published().sites)).toEqual(["delta.darsiai.org"]);
    expect([...store.files.keys()].filter((k) => k.startsWith("content/sites/"))).toEqual([]);
    expect(audits.at(-1)?.data).toMatchObject({ orgId: "o1", host: null, before: "cis.darsiai.org" });
  });

  it("publishes a site without a logo when the organization has none, or its file is gone", async () => {
    db.docs.set("orgs/o1", { name: "CIS Training Platform", status: "active", brand: { logo: "orgs/o1/brand/logo-missing99.png", v: 2 } });
    await setOrgSite.run(as("root", { orgId: "o1", host: "cis.darsiai.org" }));
    expect(published().sites["cis.darsiai.org"].logo).toBeNull();
    // Another organization's file is never copied for this one.
    db.docs.set("orgs/o2", { name: "Delta School", status: "active", brand: { logo: LOGO, v: 1 } });
    await setOrgSite.run(as("root", { orgId: "o2", host: "delta.darsiai.org" }));
    expect(published().sites["delta.darsiai.org"].logo).toBeNull();
  });

  it("tries again when Storage says the file changed too recently (429)", async () => {
    store.fail429 = 2;
    const run = setOrgSite.run(as("root", { orgId: "o1", host: "cis.darsiai.org" }));
    await vi.runAllTimersAsync();
    await run;
    expect(published().sites["cis.darsiai.org"]).toBeTruthy();
  });
});

describe("publishing again when an organization changes (onOrgSite)", () => {
  type Data = Record<string, unknown> | undefined;
  const event = (orgId: string, before: Data, after: Data) => ({ params: { orgId }, data: { before: { data: () => before }, after: { data: () => after } } });
  const onOrgSite = sites.onOrgSite as unknown as { run: (e: unknown) => Promise<unknown> };

  it("only for an organization with a site whose name or logo changed, or that was deleted", () => {
    const site = { host: "cis.darsiai.org", darsi: true };
    const org = { name: "CIS", brand: { logo: LOGO, v: 1 }, site, memberCount: 3 };
    expect(sitesNeedPublish(org, { ...org, memberCount: 4 })).toBe(false);
    expect(sitesNeedPublish(org, { ...org, licence: { seats: 5 } })).toBe(false);
    expect(sitesNeedPublish(org, { ...org, name: "CIS Academy" })).toBe(true);
    expect(sitesNeedPublish(org, { ...org, brand: { logo: "orgs/o1/brand/logo-zzz999zzz.png", v: 2 } })).toBe(true);
    expect(sitesNeedPublish(org, { ...org, brand: null })).toBe(true);
    expect(sitesNeedPublish(org, undefined)).toBe(true);
    // Without a site, nothing; `site` itself is setOrgSite's, which publishes on its own.
    expect(sitesNeedPublish({ name: "A" }, { name: "B" })).toBe(false);
    expect(sitesNeedPublish({ name: "A" }, undefined)).toBe(false);
    expect(sitesNeedPublish({ ...org, site: undefined }, org)).toBe(false);
    expect(sitesNeedPublish(org, { ...org, site: { host: "cis.darsiai.org", darsi: false } })).toBe(false);
  });

  it("publishes the new name and logo, and drops a deleted organization and its host", async () => {
    await setOrgSite.run(as("root", { orgId: "o1", host: "cis.darsiai.org" }));
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
    expect([...store.files.keys()].filter((k) => k.startsWith("content/sites/"))).toHaveLength(1);
    // A member count changing publishes nothing.
    store.saves.length = 0;
    await onOrgSite.run(event("o1", db.docs.get("orgs/o1"), { ...db.docs.get("orgs/o1"), memberCount: 9 }));
    expect(store.saves).toEqual([]);
    // Deleted: out of the file and of config/sites, so another organization can have the host.
    const last = db.docs.get("orgs/o1");
    db.docs.delete("orgs/o1");
    await onOrgSite.run(event("o1", last, undefined));
    expect(published().sites).toEqual({});
    expect(db.docs.get("config/sites")?.list).toEqual([]);
    expect([...store.files.keys()].filter((k) => k.startsWith("content/sites/"))).toEqual([]);
  });
});

describe("the config/sites list", () => {
  it("keeps one entry per host and per organization, sorted", () => {
    expect(readLinks([{ host: "b.org", orgId: "o2" }, { host: "b.org", orgId: "o3" }, { host: "", orgId: "x" }, "junk", { host: "a.org", orgId: "o1" }]))
      .toEqual([{ host: "b.org", orgId: "o2" }, { host: "a.org", orgId: "o1" }]);
    expect(readLinks(null)).toEqual([]);
    const list = [{ host: "a.org", orgId: "o1" }, { host: "c.org", orgId: "o3" }];
    expect(withLink(list, "o1", "b.org")).toEqual([{ host: "b.org", orgId: "o1" }, { host: "c.org", orgId: "o3" }]);
    expect(withLink(list, "o1", "")).toEqual([{ host: "c.org", orgId: "o3" }]);
    expect(withLink(list, "o2", "c.org")).toEqual([{ host: "a.org", orgId: "o1" }, { host: "c.org", orgId: "o2" }]);
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
