/**
 * A stand-in for the Google APIs that connect an organization's web address (functions/src/domains.ts) on
 * http://127.0.0.1:4798, for `npm run local`: Firebase Hosting's custom domains, Firebase Auth's authorized domains,
 * the bucket's CORS list, and DNS as Darsi's own lookup sees it. In the emulator the functions always talk to it,
 * never to Google or to real DNS.
 * - An address under darsiai.org points at Darsi 5 seconds after it is added to Hosting (a platform admin adding its
 *   CNAME in Cloudflare) and has its certificate 15 seconds after.
 * - Any other address waits for its organization's records, as a real one waits for its owner:
 *   GET http://127.0.0.1:4798/dns/<host>?txt=darsi-site=<token> stands in for the owner adding the ownership record
 *   and the CNAME the admin page shows (leave `txt` out to add the CNAME alone); the certificate follows 15 seconds
 *   after Hosting has the address. GET …/dns/<host>?off=1 takes both away (the domain moved elsewhere).
 * - GET http://127.0.0.1:4798/resolve/<host> answers Darsi's DNS lookup: { cname, txt }.
 * - GET http://127.0.0.1:4798/ shows everything it holds.
 */
import http from "node:http";

const TARGET = "darsi-f0685.web.app";
const zone = (host) => host.endsWith(".darsiai.org");

export async function startDomains(port = 4798) {
  /** host → when Hosting got it. */
  const domains = new Map();
  /** host → its DNS outside darsiai.org: the CNAME (since when) and the ownership record's value. */
  const dns = new Map();
  let authorized = ["localhost", "127.0.0.1"];
  let cors = [{ origin: ["http://localhost:4173"], method: ["GET", "HEAD"], maxAgeSeconds: 3600 }];
  let metageneration = 1;

  /** When the address started pointing at Darsi (null: it doesn't). */
  const pointedSince = (host) => {
    if (zone(host)) { const d = domains.get(host); return d ? d.added + 5_000 : null; }
    return dns.get(host)?.cname ?? null;
  };
  const resolve = (host) => {
    const since = pointedSince(host);
    return { cname: since !== null && Date.now() >= since ? [TARGET] : [], txt: dns.get(host)?.txt ? [dns.get(host).txt] : [] };
  };
  const view = (host) => {
    const d = domains.get(host), now = Date.now(), since = pointedSince(host);
    const pointed = since !== null && now >= since;
    const certified = pointed && now >= Math.max(since, d.added) + 15_000;
    return {
      name: `customDomains/${host}`, createTime: new Date(d.added).toISOString(),
      hostState: pointed ? "HOST_ACTIVE" : "HOST_UNHOSTED", ownershipState: pointed ? "OWNERSHIP_ACTIVE" : "OWNERSHIP_MISSING",
      cert: { type: "TEMPORARY", state: certified ? "CERT_ACTIVE" : pointed ? "CERT_PROPAGATING" : "CERT_PREPARING" },
      ...(pointed ? {} : { requiredDnsUpdates: { desired: [{ domainName: host, records: [{ domainName: `${host}.`, type: "A", rdata: "199.36.158.100", requiredAction: "ADD" }] }] } }),
    };
  };

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://stand.in");
      const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
      const body = raw ? JSON.parse(raw) : {};
      const hosting = url.pathname.match(/^\/v1beta1\/projects\/[^/]+\/sites\/[^/]+\/customDomains(?:\/([^/]+))?$/);
      if (hosting && !hosting[1] && req.method === "POST") {
        const host = url.searchParams.get("customDomainId");
        if (domains.has(host)) return json(409, { error: { message: `${host} is already a custom domain` } });
        domains.set(host, { added: Date.now() });
        return json(200, { name: `operations/${host}`, done: false });
      }
      if (hosting && hosting[1]) {
        const host = decodeURIComponent(hosting[1]);
        if (!domains.has(host)) return json(404, { error: { message: `customDomains/${host} not found` } });
        if (req.method === "DELETE") { domains.delete(host); return json(200, { name: `operations/delete-${host}`, done: true }); }
        return json(200, view(host));
      }
      if (/^\/admin\/v2\/projects\/[^/]+\/config$/.test(url.pathname)) {
        if (req.method === "PATCH") authorized = body.authorizedDomains ?? authorized;
        return json(200, { authorizedDomains: authorized });
      }
      if (/^\/storage\/v1\/b\/[^/]+$/.test(url.pathname)) {
        if (req.method === "PATCH") {
          const want = url.searchParams.get("ifMetagenerationMatch");
          if (want && want !== String(metageneration)) return json(412, { error: { message: "Precondition Failed" } });
          cors = body.cors ?? cors; metageneration++;
        }
        return json(200, { cors, metageneration: String(metageneration) });
      }
      const set = url.pathname.match(/^\/dns\/([^/]+)$/);
      if (set) {
        const host = decodeURIComponent(set[1]);
        if (url.searchParams.get("off")) { dns.delete(host); return json(200, { ok: `${host} no longer points at ${TARGET}` }); }
        const d = dns.get(host) ?? { cname: null, txt: null };
        d.cname ??= Date.now();
        if (url.searchParams.get("txt")) d.txt = url.searchParams.get("txt");
        dns.set(host, d);
        return json(200, { ok: `${host} now points at ${TARGET}`, txt: d.txt });
      }
      const look = url.pathname.match(/^\/resolve\/([^/]+)$/);
      if (look) return json(200, resolve(decodeURIComponent(look[1])));
      if (url.pathname === "/") {
        return json(200, { domains: Object.fromEntries([...domains.keys()].map((h) => [h, view(h)])), dns: Object.fromEntries(dns), authorized, cors });
      }
      json(404, { error: { message: `The local stand-in has no ${req.method} ${url.pathname}` } });
    });
  });
  await new Promise((ok, fail) => server.once("error", fail).listen(port, "127.0.0.1", ok));
  return server;
}

// Run on its own: node scripts/local/domains.mjs
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/").replace(/^\//, "")}`) {
  await startDomains();
  console.log("Address stand-in on http://127.0.0.1:4798");
}
