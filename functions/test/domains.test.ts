// Connecting an organization's address (domains.ts; TECHNICAL.md "Organization sites"): Darsi's own DNS lookup, the
// calls to Hosting, and the authorized domains and CORS list set as a whole, against a stand-in for Google (and DNS)
// that keeps the state they change.
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DOMAINS_API = "http://stand.in";
process.env.GCLOUD_PROJECT = "darsi-f0685";
vi.mock("../src/storage.js", () => ({ BUCKET: "darsi-f0685" }));

type CorsEntry = { origin: string[]; method: string[]; maxAgeSeconds: number };
/** Google (and DNS) as these calls see it. `fail` makes one path answer 403 once; `race` changes CORS once, under a write. */
const g = {
  domains: new Map<string, Record<string, unknown>>(),
  dns: new Map<string, { cname?: string[]; txt?: string[] }>(),
  authorized: ["localhost", "darsiai.org"],
  cors: [] as CorsEntry[],
  metageneration: 1,
  calls: [] as string[],
  fail: "" as string,
  race: false,
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
vi.stubGlobal("fetch", async (input: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
  const url = new URL(input), method = init?.method ?? "GET", body = init?.body ? JSON.parse(init.body) : undefined;
  g.calls.push(`${method} ${url.pathname}${url.search}`);
  expect(init?.headers?.Authorization).toBeUndefined();
  if (g.fail && url.pathname.includes(g.fail)) { g.fail = ""; return json(403, { error: { message: "The caller does not have permission" } }); }
  if (url.pathname.startsWith("/resolve/")) return json(200, g.dns.get(decodeURIComponent(url.pathname.slice(9))) ?? {});
  const hosting = "/v1beta1/projects/darsi-f0685/sites/darsi-f0685/customDomains";
  if (url.pathname === hosting && method === "POST") {
    const id = url.searchParams.get("customDomainId")!;
    g.domains.set(id, { hostState: "HOST_UNHOSTED", ownershipState: "OWNERSHIP_MISSING", cert: { state: "CERT_PREPARING" },
      requiredDnsUpdates: { desired: [{ records: [
        { domainName: `${id}.`, type: "A", rdata: "199.36.158.100", requiredAction: "ADD" },
        { domainName: `_acme-challenge.${id}.`, type: "TXT", rdata: "acme-token", requiredAction: "ADD" },
      ] }] } });
    return json(200, { name: `operations/${id}` });
  }
  if (url.pathname.startsWith(`${hosting}/`)) {
    const id = decodeURIComponent(url.pathname.slice(hosting.length + 1));
    if (method === "DELETE") return g.domains.delete(id) ? json(200, {}) : json(404, { error: { message: "not found" } });
    const d = g.domains.get(id);
    return d ? json(200, d) : json(404, { error: { message: "not found" } });
  }
  if (url.pathname === "/admin/v2/projects/darsi-f0685/config") {
    if (method === "PATCH") { expect(url.searchParams.get("updateMask")).toBe("authorizedDomains"); g.authorized = body.authorizedDomains; }
    return json(200, { authorizedDomains: g.authorized, signIn: {} });
  }
  if (url.pathname === "/storage/v1/b/darsi-f0685") {
    if (method === "PATCH") {
      if (g.race) { g.race = false; g.cors = [...g.cors, { origin: ["https://elsewhere.org"], method: ["GET"], maxAgeSeconds: 60 }]; g.metageneration++; }
      if (url.searchParams.get("ifMetagenerationMatch") !== String(g.metageneration)) return json(412, { error: { message: "Precondition Failed" } });
      g.cors = body.cors; g.metageneration++;
    }
    return json(200, { cors: g.cors, metageneration: String(g.metageneration) });
  }
  return json(404, { error: { message: `no route ${url.pathname}` } });
});

const { connectHost, disconnectHost, lookupDns, syncAccess } = await import("../src/domains");
const TOKEN = "0123456789abcdef0123456789abcdef";
const pointed = (host: string, proof = true) => g.dns.set(host, { cname: ["darsi-f0685.web.app"], txt: proof ? [`darsi-site=${TOKEN}`] : [] });
const active = (host: string) => g.domains.set(host, { hostState: "HOST_ACTIVE", ownershipState: "OWNERSHIP_ACTIVE", cert: { state: "CERT_ACTIVE" } });

beforeEach(() => {
  g.domains.clear(); g.dns.clear(); g.calls.length = 0; g.fail = ""; g.race = false;
  g.authorized = ["localhost", "darsiai.org"];
  g.cors = [{ origin: ["https://darsiai.org"], method: ["GET", "HEAD"], maxAgeSeconds: 3600 }];
  g.metageneration = 1;
});

describe("connecting an address", () => {
  it("claims nothing in Hosting until the organization's ownership record is there, and says which records to add", async () => {
    const r = await connectHost("learn.cis.edu.eg", { proof: TOKEN });
    expect(r).toEqual({
      steps: { owner: "wait", dns: "wait", hosting: "todo", cert: "todo" },
      records: [
        { name: "_darsi.learn.cis.edu.eg", type: "TXT", value: `darsi-site=${TOKEN}`, action: "add" },
        { name: "learn.cis.edu.eg", type: "CNAME", value: "darsi-f0685.web.app", action: "add" },
      ], issues: [], errors: [],
    });
    expect(g.domains.size).toBe(0);
    expect(g.calls.filter((c) => !c.startsWith("GET"))).toEqual([]);
    // Another organization's token (a domain still pointing at Darsi after its school left) proves nothing.
    g.dns.set("learn.cis.edu.eg", { cname: ["darsi-f0685.web.app"], txt: ["darsi-site=ffffffffffffffffffffffffffffffff"] });
    expect((await connectHost("learn.cis.edu.eg", { proof: TOKEN })).steps.owner).toBe("wait");
    expect(g.domains.size).toBe(0);
  });
  it("adds the Hosting domain once the record is there, asks for a CNAME rather than Hosting's A record, and is done when both see it", async () => {
    g.dns.set("learn.cis.edu.eg", { txt: [`darsi-site=${TOKEN}`] });
    const r = await connectHost("learn.cis.edu.eg", { proof: TOKEN });
    expect(g.domains.has("learn.cis.edu.eg")).toBe(true);
    expect(r.steps).toEqual({ owner: "ok", dns: "wait", hosting: "ok", cert: "wait" });
    expect(r.records).toEqual([
      { name: "learn.cis.edu.eg", type: "CNAME", value: "darsi-f0685.web.app", action: "add" },
      { name: "_acme-challenge.learn.cis.edu.eg", type: "TXT", value: "acme-token", action: "add" },
    ]);
    pointed("learn.cis.edu.eg");
    expect((await connectHost("learn.cis.edu.eg", { proof: TOKEN })).steps.dns).toBe("wait");
    active("learn.cis.edu.eg");
    expect(await connectHost("learn.cis.edu.eg", { proof: TOKEN })).toEqual({ steps: { owner: "ok", dns: "ok", hosting: "ok", cert: "ok" }, records: [], issues: [], errors: [] });
  });
  it("sees an address that no longer points at Darsi, even when Hosting still calls it active", async () => {
    pointed("learn.cis.edu.eg");
    active("learn.cis.edu.eg");
    g.dns.set("learn.cis.edu.eg", { cname: ["someone-else.example.net"], txt: [`darsi-site=${TOKEN}`] });
    const r = await connectHost("learn.cis.edu.eg", { proof: TOKEN });
    expect(r.steps).toMatchObject({ owner: "ok", dns: "wait" });
    expect(r.issues).toEqual(["learn.cis.edu.eg points at someone-else.example.net, not darsi-f0685.web.app."]);
    // Its ownership record gone: owner waits again.
    g.dns.set("learn.cis.edu.eg", { cname: ["darsi-f0685.web.app"] });
    expect((await connectHost("learn.cis.edu.eg", { proof: TOKEN })).steps).toMatchObject({ owner: "wait", dns: "ok" });
  });
  it("needs no ownership record under darsiai.org", async () => {
    const r = await connectHost("cis.darsiai.org");
    expect(r.steps).toEqual({ owner: "ok", dns: "wait", hosting: "ok", cert: "wait" });
    expect(g.calls.some((c) => c.includes("_darsi"))).toBe(false);
  });
  it("keeps the last verdict when DNS can't be asked, and only reads without fix", async () => {
    pointed("cis.darsiai.org"); active("cis.darsiai.org");
    g.fail = "/resolve/";
    const r = await connectHost("cis.darsiai.org", { prev: { owner: "ok", dns: "ok" } });
    expect(r.steps.dns).toBe("ok");
    expect(r.issues[0]).toMatch(/^DNS lookup: 403/);
    g.fail = "/resolve/";
    expect((await connectHost("learn.cis.edu.eg", { proof: TOKEN, prev: null })).steps).toMatchObject({ owner: "wait", dns: "wait" });
    g.calls.length = 0;
    g.dns.set("x.cis.edu.eg", { txt: [`darsi-site=${TOKEN}`] });
    expect((await connectHost("x.cis.edu.eg", { proof: TOKEN, fix: false })).steps).toMatchObject({ owner: "ok", hosting: "todo" });
    expect(g.calls.every((c) => c.startsWith("GET"))).toBe(true);
  });
  it("marks Hosting's refusal, with its words", async () => {
    g.fail = "customDomains";
    expect(await connectHost("other.darsiai.org")).toMatchObject({ steps: { hosting: "error" }, errors: ["Hosting: 403 The caller does not have permission"] });
  });
});

describe("Darsi's own DNS lookup", () => {
  const resolver = (cnames: Record<string, string>, txt: Record<string, string[][]>, broken = "") => ({
    resolveCname: async (n: string) => {
      if (n === broken) throw Object.assign(new Error("queryCname ETIMEOUT"), { code: "ETIMEOUT" });
      if (cnames[n]) return [cnames[n]];
      throw Object.assign(new Error("queryCname ENODATA"), { code: "ENODATA" });
    },
    resolveTxt: async (n: string) => { if (txt[n]) return txt[n]; throw Object.assign(new Error("queryTxt ENOTFOUND"), { code: "ENOTFOUND" }); },
  }) as never;
  it("follows the CNAME chain and joins TXT chunks", async () => {
    const dns = resolver({ "learn.cis.edu.eg": "lb.cis.edu.eg.", "lb.cis.edu.eg": "Darsi-F0685.web.app." }, { "_darsi.learn.cis.edu.eg": [["darsi-site=0123", "abcd"], ["v=spf1"]] });
    expect(await lookupDns("learn.cis.edu.eg", true, dns)).toEqual({ cname: ["lb.cis.edu.eg", "darsi-f0685.web.app"], txt: ["darsi-site=0123abcd", "v=spf1"] });
    expect(await lookupDns("nothing.cis.edu.eg", true, dns)).toEqual({ cname: [], txt: [] });
    expect(await lookupDns("learn.cis.edu.eg", false, dns)).toEqual({ cname: ["lb.cis.edu.eg", "darsi-f0685.web.app"], txt: [] });
  });
  it("throws when the resolver fails, rather than read it as no record", async () => {
    await expect(lookupDns("learn.cis.edu.eg", true, resolver({}, {}, "learn.cis.edu.eg"))).rejects.toThrow(/ETIMEOUT/);
  });
});

describe("sign-in and file access (syncAccess)", () => {
  it("adds the wanted addresses and takes out the ones Darsi added before, never anyone else's", async () => {
    g.authorized = ["localhost", "darsiai.org", "old.school.org", "manual.example.com"];
    g.cors[0].origin.push("https://old.school.org", "https://manual.example.com");
    const r = await syncAccess(["learn.cis.edu.eg", "cis.darsiai.org"], ["old.school.org", "cis.darsiai.org"]);
    expect(g.authorized).toEqual(["localhost", "darsiai.org", "manual.example.com", "learn.cis.edu.eg", "cis.darsiai.org"]);
    expect(g.cors[0].origin).toEqual(["https://darsiai.org", "https://manual.example.com", "https://learn.cis.edu.eg", "https://cis.darsiai.org"]);
    expect(r.errors).toEqual([]);
    expect(r.authorized?.has("learn.cis.edu.eg")).toBe(true);
    expect(r.origins?.has("cis.darsiai.org")).toBe(true);
    expect(r.origins?.has("old.school.org")).toBe(false);
    // Nothing to change: reads only.
    g.calls.length = 0;
    await syncAccess(["learn.cis.edu.eg", "cis.darsiai.org"], ["learn.cis.edu.eg", "cis.darsiai.org"]);
    expect(g.calls.every((c) => c.startsWith("GET"))).toBe(true);
  });
  it("never overwrites a CORS change made meanwhile (the write is conditional, and tried again)", async () => {
    g.race = true;
    await syncAccess(["learn.cis.edu.eg"], []);
    expect(g.cors.flatMap((e) => e.origin)).toEqual(["https://darsiai.org", "https://learn.cis.edu.eg", "https://elsewhere.org"]);
  });
  it("says which list it couldn't set, and still sets the other", async () => {
    g.fail = "/admin/v2/";
    const r = await syncAccess(["learn.cis.edu.eg"], []);
    expect(r.errors).toEqual(["Authentication: 403 The caller does not have permission"]);
    expect(r.authorized).toBeNull();
    expect(r.origins?.has("learn.cis.edu.eg")).toBe(true);
  });
});

describe("disconnecting an address", () => {
  it("takes it out of Hosting, and an address already gone is not a failure", async () => {
    active("cis.darsiai.org"); active("other.darsiai.org");
    expect(await disconnectHost("cis.darsiai.org")).toEqual([]);
    expect([...g.domains.keys()]).toEqual(["other.darsiai.org"]);
    expect(await disconnectHost("cis.darsiai.org")).toEqual([]);
    g.fail = "customDomains";
    expect(await disconnectHost("other.darsiai.org")).toEqual(["Hosting: 403 The caller does not have permission"]);
  });
});
