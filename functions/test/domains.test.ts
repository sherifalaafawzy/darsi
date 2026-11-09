// Connecting an organization's address (domains.ts; TECHNICAL.md "Organization sites"): the calls to Hosting, Identity
// Toolkit and Storage, against a stand-in for Google that keeps the state they change.
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DOMAINS_API = "http://stand.in";
process.env.GCLOUD_PROJECT = "darsi-f0685";
vi.mock("../src/storage.js", () => ({ BUCKET: "darsi-f0685" }));

/** Google as these calls see it. `fail` makes one path answer 403 once. */
const g = {
  domains: new Map<string, Record<string, unknown>>(),
  authorized: ["localhost", "darsiai.org"],
  cors: [{ origin: ["https://darsiai.org"], method: ["GET", "HEAD"], maxAgeSeconds: 3600 }] as { origin: string[]; method: string[]; maxAgeSeconds: number }[],
  calls: [] as string[],
  fail: "" as string,
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
vi.stubGlobal("fetch", async (input: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
  const url = new URL(input), method = init?.method ?? "GET", body = init?.body ? JSON.parse(init.body) : undefined;
  g.calls.push(`${method} ${url.pathname}${url.search}`);
  expect(init?.headers?.Authorization).toBeUndefined();
  if (g.fail && url.pathname.includes(g.fail)) { g.fail = ""; return json(403, { error: { message: "The caller does not have permission" } }); }
  const hosting = "/v1beta1/projects/darsi-f0685/sites/darsi-f0685/customDomains";
  if (url.pathname === hosting && method === "POST") {
    const id = url.searchParams.get("customDomainId")!;
    g.domains.set(id, { hostState: "HOST_UNHOSTED", ownershipState: "OWNERSHIP_MISSING", cert: { state: "CERT_PREPARING" },
      requiredDnsUpdates: { desired: [{ records: [{ domainName: `${id}.`, type: "CNAME", rdata: "darsi-f0685.web.app.", requiredAction: "ADD" }] }] } });
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
    expect(url.searchParams.get("fields")).toBe("cors");
    if (method === "PATCH") g.cors = body.cors;
    return json(200, { cors: g.cors });
  }
  return json(404, { error: { message: `no route ${url.pathname}` } });
});

const { connectHost, disconnectHost } = await import("../src/domains");

beforeEach(() => {
  g.domains.clear(); g.calls.length = 0; g.fail = "";
  g.authorized = ["localhost", "darsiai.org"];
  g.cors = [{ origin: ["https://darsiai.org"], method: ["GET", "HEAD"], maxAgeSeconds: 3600 }];
});

describe("connecting an address", () => {
  it("adds the Hosting domain, and the sign-in domain and CORS origin only once the address points at Darsi", async () => {
    const r = await connectHost("learn.cis.edu.eg");
    expect(r).toEqual({
      steps: { dns: "wait", hosting: "ok", cert: "wait", auth: "wait", cors: "wait" },
      records: [{ name: "learn.cis.edu.eg", type: "CNAME", value: "darsi-f0685.web.app", action: "add" }], issues: [], errors: [],
    });
    expect(g.domains.has("learn.cis.edu.eg")).toBe(true);
    // Nobody has shown they run its DNS yet, so no page there may sign people in, or read Darsi's files.
    expect(g.authorized).toEqual(["localhost", "darsiai.org"]);
    expect(g.cors[0].origin).toEqual(["https://darsiai.org"]);
    g.domains.set("learn.cis.edu.eg", { hostState: "HOST_ACTIVE", ownershipState: "OWNERSHIP_ACTIVE", cert: { state: "CERT_PROPAGATING" } });
    expect((await connectHost("learn.cis.edu.eg")).steps).toEqual({ dns: "ok", hosting: "ok", cert: "wait", auth: "ok", cors: "ok" });
    expect(g.authorized).toEqual(["localhost", "darsiai.org", "learn.cis.edu.eg"]);
    expect(g.cors[0].origin).toEqual(["https://darsiai.org", "https://learn.cis.edu.eg"]);
  });
  it("changes nothing that is already there, and turns live once Hosting is", async () => {
    await connectHost("cis.darsiai.org");
    g.domains.set("cis.darsiai.org", { hostState: "HOST_ACTIVE", ownershipState: "OWNERSHIP_ACTIVE", cert: { state: "CERT_ACTIVE" } });
    await connectHost("cis.darsiai.org");
    g.calls.length = 0;
    const r = await connectHost("cis.darsiai.org");
    expect(r.steps).toEqual({ dns: "ok", hosting: "ok", cert: "ok", auth: "ok", cors: "ok" });
    expect(g.calls.filter((c) => !c.startsWith("GET"))).toEqual([]);
    expect(g.authorized.filter((d) => d === "cis.darsiai.org")).toHaveLength(1);
  });
  it("only reads without fix", async () => {
    const r = await connectHost("cis.darsiai.org", false);
    expect(r.steps).toEqual({ dns: "todo", hosting: "todo", cert: "todo", auth: "todo", cors: "todo" });
    expect(g.calls.every((c) => c.startsWith("GET"))).toBe(true);
  });
  it("marks a step that Google refused, with its words, and still does the others", async () => {
    await connectHost("cis.darsiai.org");
    g.domains.set("cis.darsiai.org", { hostState: "HOST_ACTIVE", ownershipState: "OWNERSHIP_ACTIVE", cert: { state: "CERT_ACTIVE" } });
    g.fail = "/admin/v2/";
    const r = await connectHost("cis.darsiai.org");
    expect(r.steps).toMatchObject({ hosting: "ok", auth: "error", cors: "ok" });
    expect(r.errors).toEqual(["Authentication: 403 The caller does not have permission"]);
    g.fail = "customDomains";
    expect((await connectHost("other.darsiai.org")).errors).toEqual(["Hosting: 403 The caller does not have permission"]);
  });
});

describe("disconnecting an address", () => {
  const live = async (host: string) => {
    await connectHost(host);
    g.domains.set(host, { hostState: "HOST_ACTIVE", ownershipState: "OWNERSHIP_ACTIVE", cert: { state: "CERT_ACTIVE" } });
    await connectHost(host);
  };
  it("takes out the Hosting domain, the sign-in domain and the CORS origin, and leaves the rest", async () => {
    await live("cis.darsiai.org");
    await live("other.darsiai.org");
    expect(await disconnectHost("cis.darsiai.org")).toEqual([]);
    expect([...g.domains.keys()]).toEqual(["other.darsiai.org"]);
    expect(g.authorized).toEqual(["localhost", "darsiai.org", "other.darsiai.org"]);
    expect(g.cors[0].origin).toEqual(["https://darsiai.org", "https://other.darsiai.org"]);
    // Already gone is not a failure.
    expect(await disconnectHost("cis.darsiai.org")).toEqual([]);
  });
  it("says what it couldn't undo", async () => {
    await live("cis.darsiai.org");
    g.fail = "/storage/";
    expect(await disconnectHost("cis.darsiai.org")).toEqual(["Storage CORS: 403 The caller does not have permission"]);
    expect(g.domains.has("cis.darsiai.org")).toBe(false);
  });
});
