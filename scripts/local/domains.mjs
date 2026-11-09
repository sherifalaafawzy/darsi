/**
 * A stand-in for the Google APIs that connect an organization's web address (functions/src/domains.ts) on
 * http://127.0.0.1:4798, for `npm run local`: Firebase Hosting's custom domains, Firebase Auth's authorized domains
 * and the bucket's CORS list. In the emulator the functions always talk to it, never to Google.
 * - An address under darsiai.org points at Darsi 5 seconds after it is added (Cloudflare's wildcard record covers it)
 *   and has its certificate 20 seconds after.
 * - Any other address waits for the CNAME record Hosting asks for, as a real one waits for its owner:
 *   GET http://127.0.0.1:4798/dns/<host> stands in for the owner adding it; the certificate follows 15 seconds later.
 * - GET http://127.0.0.1:4798/ shows everything it holds.
 */
import http from "node:http";

const TARGET = "darsi-f0685.web.app";

export async function startDomains(port = 4798) {
  /** host → when it was added, and when its DNS record was "added" (null until then). */
  const domains = new Map();
  let authorized = ["localhost", "127.0.0.1"];
  let cors = [{ origin: ["http://localhost:4173"], method: ["GET", "HEAD"], maxAgeSeconds: 3600 }];

  const view = (host) => {
    const d = domains.get(host), now = Date.now();
    const pointedAt = host.endsWith(".darsiai.org") ? d.added + 5_000 : d.dns;
    const pointed = pointedAt !== null && now >= pointedAt;
    const certified = pointed && now >= pointedAt + (host.endsWith(".darsiai.org") ? 15_000 : 15_000);
    return {
      name: `customDomains/${host}`, createTime: new Date(d.added).toISOString(),
      hostState: pointed ? "HOST_ACTIVE" : "HOST_UNHOSTED", ownershipState: pointed ? "OWNERSHIP_ACTIVE" : "OWNERSHIP_MISSING",
      cert: { type: "TEMPORARY", state: certified ? "CERT_ACTIVE" : pointed ? "CERT_PROPAGATING" : "CERT_PREPARING" },
      ...(pointed ? {} : { requiredDnsUpdates: { desired: [{ domainName: host, records: [{ domainName: `${host}.`, type: "CNAME", rdata: `${TARGET}.`, requiredAction: "ADD" }] }] } }),
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
        domains.set(host, { added: Date.now(), dns: null });
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
        if (req.method === "PATCH") cors = body.cors ?? cors;
        return json(200, { cors });
      }
      const dns = url.pathname.match(/^\/dns\/([^/]+)$/);
      if (dns) {
        const host = decodeURIComponent(dns[1]), d = domains.get(host);
        if (!d) return json(404, { error: { message: `${host} isn't a custom domain here` } });
        d.dns ??= Date.now();
        return json(200, { ok: `${host} now points at ${TARGET}` });
      }
      if (url.pathname === "/") return json(200, { domains: Object.fromEntries([...domains.keys()].map((h) => [h, view(h)])), authorized, cors });
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
