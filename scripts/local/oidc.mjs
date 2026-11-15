/**
 * A stand-in OpenID provider on http://127.0.0.1:4797, for `npm run local` and the school sign-in e2e test: a school's
 * identity provider with a few test people, so the wizard, a sign-in as a new student, a teacher by the rule and a
 * link from Me run end to end with no Google, Microsoft or Okta account. The functions emulator calls it over http on a
 * loopback address, which ssoFetch allows only under the emulator.
 *
 * In the wizard choose "Other (OpenID Connect)" and type:
 *   issuer        http://127.0.0.1:4797
 *   client ID     darsi-local
 *   client secret local-secret   (a public test value, not a key)
 *   email domain  school.test     teacher rule: claim "groups" holds "teachers"; class claim: "class"
 *
 *   GET  /.well-known/openid-configuration   discovery (S256, client_secret_basic and _post, RS256, end_session)
 *   GET  /authorize                          a tiny page to pick who signs in (no password)
 *   POST /authorize/pick                     back to Darsi's callback with ?code&state&iss
 *   POST /token                              the code (once, 2 minutes), PKCE S256 and the client checked; an ID token
 *   GET  /jwks                               the RSA key made at start (a new one every run)
 *   GET  /logout                             end_session_endpoint: "signed out", and back if a return address is given
 */
import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

export const PEOPLE = [
  { sub: "stand-in-amina", name: "Amina Hassan", email: "amina@school.test", email_verified: true, class: "5B" },
  { sub: "stand-in-omar", name: "Omar Said", email: "omar@school.test", email_verified: true, class: "6A" },
  { sub: "stand-in-tarek", name: "Tarek Nabil", email: "tarek@school.test", email_verified: true, groups: ["teachers"] },
  { sub: "stand-in-guest", name: "Guest (unverified)", email: "guest@school.test", email_verified: false },
];

const b64url = (b) => Buffer.from(b).toString("base64url");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function startOidc({ port = 4797, clientId = "darsi-local", clientSecret = "local-secret", people = PEOPLE } = {}) {
  // Port 0 (tests) takes any free port; the issuer is known once it listens.
  let issuer = `http://127.0.0.1:${port}`;
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = b64url(randomBytes(6));
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };
  /** code → what the token request must match; single use, 2 minutes. */
  const codes = new Map();

  const sign = (claims) => {
    const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
    const body = b64url(JSON.stringify(claims));
    return `${head}.${body}.${b64url(createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey))}`;
  };
  const discovery = () => ({
    issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, end_session_endpoint: `${issuer}/logout`,
    response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"],
    code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    scopes_supported: ["openid", "email", "profile", "groups"], claims_supported: ["sub", "email", "email_verified", "name", "groups", "class"],
    authorization_response_iss_parameter_supported: true,
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", issuer);
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 65536) req.destroy(); });
    req.on("end", () => {
      const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
      const html = (status, body) => { res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>School sign-in (stand-in)</title><body style="font-family:system-ui,sans-serif;max-width:28rem;margin:2rem auto;padding:0 1rem">${body}</body>`); };
      if (url.pathname === "/.well-known/openid-configuration") return json(200, discovery());
      if (url.pathname === "/jwks") return json(200, { keys: [jwk] });
      if (url.pathname === "/logout") {
        const back = url.searchParams.get("post_logout_redirect_uri");
        return html(200, `<p>You are signed out of the stand-in school.</p>${back ? `<p><a href="${esc(back)}">Back</a></p>` : ""}`);
      }
      if (url.pathname === "/authorize" && req.method === "GET") {
        const q = Object.fromEntries(url.searchParams);
        const problem = q.response_type !== "code" ? "response_type must be code" : q.client_id !== clientId ? "unknown client_id"
          : !q.redirect_uri ? "redirect_uri missing" : q.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge ?? "") ? "PKCE S256 required"
          : !q.state || !q.nonce ? "state and nonce required" : null;
        if (problem) return html(400, `<p>${esc(problem)}</p>`);
        const keep = ["redirect_uri", "state", "nonce", "code_challenge"].map((k) => `<input type="hidden" name="${k}" value="${esc(q[k])}">`).join("");
        const rows = people.map((p, i) => `<form method="post" action="/authorize/pick" style="margin:.5rem 0">${keep}<input type="hidden" name="i" value="${i}"><button style="min-height:44px;width:100%;text-align:start">${esc(p.name)} <small>${esc(p.email)}${p.groups ? " (teacher)" : ""}</small></button></form>`).join("");
        return html(200, `<h1 style="font-size:1.2rem">Stand-in school: who is signing in?</h1><p><small>prompt=${esc(q.prompt ?? "none")} scope=${esc(q.scope ?? "")}</small></p>${rows}`);
      }
      if (url.pathname === "/authorize/pick" && req.method === "POST") {
        const f = Object.fromEntries(new URLSearchParams(raw));
        const person = people[Number(f.i)];
        if (!person || !f.redirect_uri) return html(400, "<p>Pick someone.</p>");
        const code = b64url(randomBytes(18));
        codes.set(code, { person, nonce: f.nonce, challenge: f.code_challenge, redirectUri: f.redirect_uri, exp: Date.now() + 120_000 });
        const to = new URL(f.redirect_uri);
        to.searchParams.set("code", code); to.searchParams.set("state", f.state); to.searchParams.set("iss", issuer);
        res.writeHead(302, { Location: to.toString(), "Cache-Control": "no-store" });
        return res.end();
      }
      if (url.pathname === "/token" && req.method === "POST") {
        const f = Object.fromEntries(new URLSearchParams(raw));
        const auth = String(req.headers.authorization ?? "");
        const [id, secret] = auth.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString().split(":").map(decodeURIComponent) : [f.client_id, f.client_secret];
        if (id !== clientId || secret !== clientSecret) return json(401, { error: "invalid_client" });
        if (f.grant_type !== "authorization_code") return json(400, { error: "unsupported_grant_type" });
        const c = codes.get(f.code);
        codes.delete(f.code);
        if (!c || c.exp < Date.now()) return json(400, { error: "invalid_grant", error_description: "unknown or used code" });
        if (c.redirectUri !== f.redirect_uri) return json(400, { error: "invalid_grant", error_description: "redirect_uri differs" });
        if (b64url(createHash("sha256").update(f.code_verifier ?? "").digest()) !== c.challenge) return json(400, { error: "invalid_grant", error_description: "PKCE verifier" });
        const now = Math.floor(Date.now() / 1000);
        return json(200, { access_token: b64url(randomBytes(18)), token_type: "Bearer", expires_in: 300, id_token: sign({ iss: issuer, aud: clientId, iat: now, exp: now + 300, nonce: c.nonce, ...c.person }) });
      }
      json(404, { error: "not_found" });
    });
  });
  await new Promise((ok, fail) => server.once("error", fail).listen(port, "127.0.0.1", ok));
  issuer = `http://127.0.0.1:${server.address().port}`;
  return { issuer, clientId, clientSecret, close: () => server.close() };
}

// `node scripts/local/oidc.mjs` runs it on its own (the e2e suite starts it this way).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const p = await startOidc({ port: Number(process.env.OIDC_PORT) || 4797 });
  console.log(`Stand-in school sign-in on ${p.issuer} (client ${p.clientId})`);
}
