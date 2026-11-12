// School sign-in's way out to a provider (src/ssoFetch.ts; design §9): address checks before any connection, a local
// https server for redirects, timeouts, the size cap, the in-flight limit and the breaker, the token request, and ID
// token verification with the JWKS cache.
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, UnsecuredJWT, type JWK } from "jose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BREAKER_TIMEOUTS, IdTokenError, SsoFetchError, createBudget, defaultLookup, fetchJson, hintFor, ipv4Allowed, resetFetchState, resetJwksCache,
  safeFetch, tokenRequest, verifyIdToken, type Lookup,
} from "../src/ssoFetch";

// A test-only certificate for localhost and 127.0.0.1 (self-signed, valid to 2126), trusted only through `testCa`
// under the emulator flag. Never used outside these tests.
const KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgnl3nHG+yPa5FCNKI
OHwRlkcRyUIPI/jCQKBtbiA+FDmhRANCAAQSlWLn76u40yAUwL0rSRfJokCImHYW
r6d/m03uOQi8CFGfirK+JqEabBnwUPBAvGLjdIX6RDtCQ7HbMZ1McIwK
-----END PRIVATE KEY-----`;
const CERT = `-----BEGIN CERTIFICATE-----
MIIBmjCCAUGgAwIBAgIUXhIZ3czi+RrlN3udSkcsj0ZB25swCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTExMTEzMTkwNFoYDzIxMjYxMDE4
MTMxOTA0WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAAQSlWLn76u40yAUwL0rSRfJokCImHYWr6d/m03uOQi8CFGfirK+JqEa
bBnwUPBAvGLjdIX6RDtCQ7HbMZ1McIwKo28wbTAdBgNVHQ4EFgQUAjKrKfmDeJjj
Izf81t2J0+t8rhYwHwYDVR0jBBgwFoAUAjKrKfmDeJjjIzf81t2J0+t8rhYwDwYD
VR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SHBH8AAAEwCgYIKoZI
zj0EAwIDRwAwRAIgZjtJagsh6oeM3eIlWChDVvT0Q+4dokloWwB6kCikQHcCIE6n
PYfQIoR2dhPfFIUFCy6/nTdAy822eOkAIiKdSAjC
-----END CERTIFICATE-----`;

const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof SsoFetchError ? e.code : `other:${String(e)}`; } };
const vcode = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof IdTokenError ? e.code : `other:${String(e)}`; } };

afterEach(() => { resetFetchState(); delete process.env.FUNCTIONS_EMULATOR; vi.restoreAllMocks(); });

describe("addresses, before any connection", () => {
  const never: Lookup = async () => { throw new Error("lookup must not run"); };

  it("refuses IPv6 literals, mapped forms included, without looking anything up", async () => {
    for (const u of ["https://[::ffff:127.0.0.1]/x", "https://[::ffff:8.8.8.8]/", "https://[2001:4860:4860::8888]/", "https://[::1]:443/", "https://[fe80::1]/"]) {
      expect(await code(safeFetch(u, { lookup: never })), u).toBe("blocked");
    }
  });

  it("refuses private and special IPv4 literals in every spelling the URL parser accepts", async () => {
    for (const u of ["https://127.0.0.1/", "https://0x7f.1/", "https://2130706433/", "https://017700000001/", "https://10.1.2.3/", "https://169.254.169.254/computeMetadata/v1/",
      "https://100.64.1.1/", "https://192.168.1.1/", "https://172.20.0.1/", "https://0.0.0.0/", "https://224.0.0.1/", "https://255.255.255.255/", "https://198.18.0.1/"]) {
      expect(await code(safeFetch(u, { lookup: never })), u).toBe("blocked");
    }
  });

  it("refuses http, credentials in the address and a trailing dot", async () => {
    for (const [u, c] of [["http://idp.school.edu/", "url"], ["https://u:p@idp.school.edu/", "url"], ["https://idp.school.edu./", "url"], ["ftp://idp.school.edu/", "url"], ["nope", "url"]]) {
      expect(await code(safeFetch(u, { lookup: never })), u).toBe(c);
    }
    // Loopback is refused outside the emulator even when spelled as a name.
    expect(await code(safeFetch("https://localhost/", { lookup: async () => [{ address: "127.0.0.1", family: 4 }] }))).toBe("blocked");
    expect(await code(safeFetch("http://127.0.0.1:4797/", { lookup: never }))).toBe("url");
  });

  it("refuses a name when any answer is private, an IPv6 answer, or no IPv4 answer at all", async () => {
    const both: Lookup = async () => [{ address: "93.184.215.14", family: 4 }, { address: "10.0.0.5", family: 4 }];
    expect(await code(safeFetch("https://idp.school.edu/", { lookup: both }))).toBe("blocked");
    expect(await code(safeFetch("https://idp.school.edu/", { lookup: async () => [{ address: "::1", family: 6 }] }))).toBe("blocked");
    expect(await code(safeFetch("https://idp.school.edu/", { lookup: async () => [] }))).toBe("dns");
    // AAAA-only: the IPv4 lookup finds nothing.
    const aaaaOnly: Lookup = async () => { throw Object.assign(new Error("queryA ENODATA"), { code: "ENODATA" }); };
    expect(await code(safeFetch("https://v6only.school.edu/", { lookup: aaaaOnly }))).toBe("dns");
  });

  it("asks DNS for every IPv4 answer (family 4, all: true)", async () => {
    const spy = vi.spyOn(dns.promises, "lookup").mockResolvedValue([{ address: "10.9.9.9", family: 4 }] as never);
    expect(await code(safeFetch("https://idp.school.edu/"))).toBe("blocked");
    expect(spy).toHaveBeenCalledWith("idp.school.edu", { family: 4, all: true });
    expect(await defaultLookup("idp.school.edu")).toEqual([{ address: "10.9.9.9", family: 4 }]);
  });

  it("knows public unicast from the rest", () => {
    for (const a of ["8.8.8.8", "93.184.215.14", "172.32.0.1", "100.128.0.1", "198.20.0.1"]) expect(ipv4Allowed(a), a).toBe(true);
    for (const a of ["0.1.2.3", "10.0.0.1", "100.64.0.1", "100.127.255.255", "127.0.0.1", "169.254.0.1", "172.16.0.1", "172.31.255.255", "192.0.0.8", "192.0.2.1",
      "192.168.0.1", "198.18.0.1", "198.19.255.255", "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255", "::1", "x"]) {
      expect(ipv4Allowed(a), a).toBe(false);
    }
  });

  it("stops at the budget before calling", async () => {
    const budget = createBudget(1000, Date.now() - 2000);
    expect(await code(safeFetch("https://idp.school.edu/", { lookup: never, budget }))).toBe("budget");
  });

  it("maps codes to the wizard's hints", () => {
    expect(hintFor("dns")).toBe("name-not-found");
    expect(hintFor("tls-chain")).toBe("certificate-chain");
    expect(hintFor("connect")).toBe("unreachable");
    expect(hintFor("status")).toBe("bad-answer");
  });
});

// ---- a local https server (emulator mode, with the test CA) ----

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void;
let handler: Handler = (_q, res) => res.end("{}");
let hits: { url: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
let server: https.Server;
let base = "";
const held: http.ServerResponse[] = [];

beforeAll(async () => {
  server = https.createServer({ key: KEY, cert: CERT }, (req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { hits.push({ url: req.url ?? "", headers: req.headers, body }); handler(req, res, body); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { for (const r of held) r.destroy(); server.closeAllConnections(); await new Promise((r) => server.close(r)); });
beforeEach(() => { hits = []; handler = (_q, res) => res.end("{}"); });

const local = { testCa: CERT };
const json = (res: http.ServerResponse, status: number, v: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(v));
};

describe("talking to a provider", () => {
  beforeEach(() => { process.env.FUNCTIONS_EMULATOR = "true"; });

  it("reads JSON over https with the certificate checked and the Host kept", async () => {
    handler = (_q, res) => json(res, 200, { issuer: "x" });
    expect(await fetchJson(`${base}/.well-known/openid-configuration?a=1`, local)).toEqual({ status: 200, json: { issuer: "x" } });
    expect(hits[0].url).toBe("/.well-known/openid-configuration?a=1");
    expect(hits[0].headers.host).toBe(base.slice("https://".length));
    const port = base.split(":").pop();
    expect(await fetchJson(`https://localhost:${port}/x`, local)).toMatchObject({ status: 200 });
    expect(hits[1].headers.host).toBe(`localhost:${port}`);
  });

  it("refuses a certificate it can't trust, and ignores the test CA outside the emulator", async () => {
    expect(await code(safeFetch(`${base}/`))).toBe("tls-chain");
    delete process.env.FUNCTIONS_EMULATOR;
    expect(await code(safeFetch(`${base}/`, local))).toBe("blocked");
    expect(hits).toHaveLength(0);
  });

  it("never follows a redirect", async () => {
    handler = (q, res) => {
      if (q.url === "/start") { res.writeHead(307, { Location: `${base}/next` }); res.end(); return; }
      json(res, 200, { reached: true });
    };
    const e = await safeFetch(`${base}/start`, { ...local, method: "POST", body: "client_secret=s" }).catch((x) => x);
    expect(e).toBeInstanceOf(SsoFetchError);
    expect(e.code).toBe("redirect");
    expect(e.message).toBe("sso-fetch: redirect");
    expect(hits.map((h) => h.url)).toEqual(["/start"]);
  });

  it("caps the body at 512 KB, announced or not", async () => {
    const big = "x".repeat(600 * 1024);
    handler = (_q, res) => { res.writeHead(200, { "Content-Length": String(big.length) }); res.end(big); };
    expect(await code(safeFetch(`${base}/`, local))).toBe("too-large");
    handler = (_q, res) => { res.writeHead(200); for (let i = 0; i < 12; i++) res.write("y".repeat(64 * 1024)); res.end(); };
    expect(await code(safeFetch(`${base}/`, local))).toBe("too-large");
    handler = (_q, res) => { res.writeHead(200); res.end("z".repeat(100 * 1024)); };
    expect((await safeFetch(`${base}/`, local)).body.length).toBe(100 * 1024);
  });

  it("gives up at the timeout, and after 5 timeouts in a row answers at once for 30 s", async () => {
    handler = (_q, res) => { held.push(res); };
    for (let i = 0; i < BREAKER_TIMEOUTS; i++) expect(await code(safeFetch(`${base}/slow`, { ...local, orgId: "orgT", timeoutMs: 100 }))).toBe("timeout");
    const before = hits.length;
    expect(await code(safeFetch(`${base}/slow`, { ...local, orgId: "orgT", timeoutMs: 100 }))).toBe("breaker");
    expect(hits.length).toBe(before);
    // Another organization is not affected.
    handler = (_q, res) => json(res, 200, {});
    expect(await code(safeFetch(`${base}/`, { ...local, orgId: "orgU" }))).toBe("ok");
    // And the breaker closes again after 30 s.
    expect(await code(safeFetch(`${base}/`, { ...local, orgId: "orgT", now: () => Date.now() + 31_000 }))).toBe("ok");
  });

  it("counts a body that stalls or trickles after the headers as a timeout", async () => {
    handler = (_q, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.write("{"); held.push(res); };
    expect(await code(safeFetch(`${base}/stall`, { ...local, orgId: "orgS", timeoutMs: 150 }))).toBe("timeout");
    handler = (_q, res) => {
      res.writeHead(200);
      const t = setInterval(() => res.write("x"), 20);
      res.on("close", () => clearInterval(t));
    };
    expect(await code(safeFetch(`${base}/trickle`, { ...local, orgId: "orgS", timeoutMs: 150 }))).toBe("timeout");
  });

  it("allows at most 10 calls in flight per organization", async () => {
    handler = (_q, res) => { held.push(res); };
    const slow = Array.from({ length: 10 }, () => safeFetch(`${base}/hold`, { ...local, orgId: "orgF", timeoutMs: 1500 }).catch((e) => e.code));
    await vi.waitFor(() => expect(hits.length).toBe(10));
    expect(await code(safeFetch(`${base}/hold`, { ...local, orgId: "orgF" }))).toBe("busy");
    for (const r of held.splice(0)) r.end("{}");
    expect(new Set(await Promise.all(slow.map((p) => p.then((x) => (x instanceof Object ? "ok" : x)))))).toEqual(new Set(["ok"]));
  });

  it("keeps only error and error_description from a JSON error body", async () => {
    handler = (_q, res) => json(res, 401, { error: "invalid_client", error_description: `AADSTS7000215 ${"d".repeat(400)}`, trace_id: "secret-ish" });
    const e = await fetchJson(`${base}/`, local).catch((x) => x);
    expect(e).toMatchObject({ code: "status", status: 401, oauth: { error: "invalid_client" } });
    expect(e.oauth.error_description).toHaveLength(200);
    expect(JSON.stringify(e)).not.toContain("trace_id");
    handler = (_q, res) => { res.writeHead(200); res.end("<html>"); };
    expect(await code(fetchJson(`${base}/`, local))).toBe("json");
  });
});

describe("the token request", () => {
  beforeEach(() => { process.env.FUNCTIONS_EMULATOR = "true"; });
  const p = { endpoint: "", clientId: "darsi app", clientSecret: "s3:cr+t/é", code: "the-code", redirectUri: "https://login.darsiai.org/callback/org1", codeVerifier: "v".repeat(43) };

  it("sends Basic with form-encoded credentials and returns only the ID token", async () => {
    handler = (_q, res) => json(res, 200, { access_token: "AT", refresh_token: "RT", id_token: "a.b.c", token_type: "Bearer" });
    const r = await tokenRequest({ ...p, endpoint: `${base}/token`, authMethod: "basic" }, local);
    expect(r).toEqual({ idToken: "a.b.c" });
    const h = hits[0];
    expect(h.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(Buffer.from(String(h.headers.authorization).slice(6), "base64").toString()).toBe("darsi+app:s3%3Acr%2Bt%2F%C3%A9");
    expect(Object.fromEntries(new URLSearchParams(h.body))).toEqual({ grant_type: "authorization_code", code: "the-code", redirect_uri: p.redirectUri, code_verifier: p.codeVerifier });
  });

  it("puts the client in the form for `post`", async () => {
    handler = (_q, res) => json(res, 200, { id_token: "a.b.c" });
    await tokenRequest({ ...p, endpoint: `${base}/token`, authMethod: "post" }, local);
    expect(hits[0].headers.authorization).toBeUndefined();
    expect(new URLSearchParams(hits[0].body).get("client_secret")).toBe(p.clientSecret);
  });

  it("reports invalid_client and a missing ID token", async () => {
    handler = (_q, res) => json(res, 400, { error: "invalid_client" });
    expect(await tokenRequest({ ...p, endpoint: `${base}/token`, authMethod: "basic" }, local).catch((e) => e.oauth)).toEqual({ error: "invalid_client" });
    handler = (_q, res) => json(res, 200, { access_token: "AT" });
    expect(await code(tokenRequest({ ...p, endpoint: `${base}/token`, authMethod: "basic" }, local))).toBe("id-token");
  });
});

// ---- ID tokens ----

describe("verifyIdToken", () => {
  const ISS = "https://idp.school.edu", AUD = "darsi", NONCE = "n0nce", JWKS = "https://idp.school.edu/jwks";
  let keyA: CryptoKey, keyB: CryptoKey, jwkA: JWK, jwkB: JWK;
  beforeAll(async () => {
    const a = await generateKeyPair("RS256", { extractable: true }), b = await generateKeyPair("RS256", { extractable: true });
    keyA = a.privateKey; keyB = b.privateKey;
    jwkA = { ...(await exportJWK(a.publicKey)), kid: "A", alg: "RS256", use: "sig" };
    jwkB = { ...(await exportJWK(b.publicKey)), kid: "B", alg: "RS256", use: "sig" };
  });
  beforeEach(() => resetJwksCache());
  const now = Date.UTC(2026, 10, 11, 12);
  // aud and iat go through their setters (SignJWT's setters win over the payload's own fields).
  const sign = ({ aud = AUD, iat = Math.floor(now / 1000), ...claims }: Record<string, unknown> = {}, key = keyA, kid = "A", alg = "RS256") =>
    new SignJWT({ nonce: NONCE, ...claims }).setProtectedHeader({ alg, kid }).setIssuer(ISS).setAudience(aud as string | string[]).setSubject("u1")
      .setIssuedAt(iat as number).setExpirationTime(Math.floor(now / 1000) + 3600).sign(key);
  const opts = (fetchJwks: (u: string) => Promise<unknown>) => ({ issuer: ISS, clientId: AUD, jwksUrl: JWKS, nonce: NONCE, now, fetchJwks });

  it("accepts a token signed by the provider's key, with every claim right", async () => {
    const r = await verifyIdToken(await sign(), opts(async () => ({ keys: [jwkA] })));
    expect(r).toMatchObject({ alg: "RS256", payload: { sub: "u1", iss: ISS, aud: AUD } });
  });

  it("refuses the wrong nonce, audience, issuer, azp, expiry and a future iat", async () => {
    const o = opts(async () => ({ keys: [jwkA] }));
    expect(await vcode(verifyIdToken(await sign({ nonce: "other" }), o))).toBe("nonce");
    expect(await vcode(verifyIdToken(await sign({ nonce: undefined }), o))).toBe("nonce");
    expect(await vcode(verifyIdToken(await new SignJWT({ nonce: NONCE }).setProtectedHeader({ alg: "RS256", kid: "A" }).setIssuer(ISS).setAudience("other").setSubject("u").setIssuedAt(now / 1000).setExpirationTime(now / 1000 + 60).sign(keyA), o))).toBe("aud");
    expect(await vcode(verifyIdToken(await sign(), { ...o, issuer: "https://idp.other.edu" }))).toBe("iss");
    expect(await vcode(verifyIdToken(await sign({ azp: "someone-else" }), o))).toBe("azp");
    expect(await vcode(verifyIdToken(await sign({ aud: [AUD, "other"] }), o))).toBe("azp");
    expect(await vcode(verifyIdToken(await sign({ aud: [AUD, "other"], azp: AUD }), o))).toBe("ok");
    expect(await vcode(verifyIdToken(await sign(), { ...o, now: now + 3600_000 + 61_000 }))).toBe("exp");
    expect(await vcode(verifyIdToken(await sign(), { ...o, now: now + 3600_000 + 30_000 }))).toBe("ok");
    expect(await vcode(verifyIdToken(await sign({ iat: Math.floor(now / 1000) + 120 }), o))).toBe("iat");
    expect(await vcode(verifyIdToken("not.a.token", o))).toBe("malformed");
    expect(await vcode(verifyIdToken("x", o))).toBe("malformed");
  });

  it("accepts either of Google's issuer forms when both are allowed", async () => {
    const o = { ...opts(async () => ({ keys: [jwkA] })), issuer: [ISS, "idp.school.edu"] };
    expect(await vcode(verifyIdToken(await sign(), o))).toBe("ok");
  });

  it("refuses an algorithm outside RS256, PS256 and ES256 and a key it doesn't have", async () => {
    const hs = await new SignJWT({ nonce: NONCE }).setProtectedHeader({ alg: "HS256", kid: "A" }).setIssuer(ISS).setAudience(AUD).setSubject("u")
      .setIssuedAt(now / 1000).setExpirationTime(now / 1000 + 60).sign(new TextEncoder().encode("k".repeat(32)));
    expect(await vcode(verifyIdToken(hs, opts(async () => ({ keys: [jwkA] }))))).toBe("alg");
    // HS256 keyed with the provider's public key (algorithm confusion) and an unsigned token (alg none).
    const confused = await new SignJWT({ nonce: NONCE }).setProtectedHeader({ alg: "HS256", kid: "A" }).setIssuer(ISS).setAudience(AUD).setSubject("u")
      .setIssuedAt(now / 1000).setExpirationTime(now / 1000 + 60).sign(new TextEncoder().encode(JSON.stringify(jwkA)));
    expect(await vcode(verifyIdToken(confused, opts(async () => ({ keys: [jwkA] }))))).toBe("alg");
    const none = new UnsecuredJWT({ nonce: NONCE }).setIssuer(ISS).setAudience(AUD).setSubject("u").setIssuedAt(now / 1000).setExpirationTime(now / 1000 + 60).encode();
    expect(await vcode(verifyIdToken(none, opts(async () => ({ keys: [jwkA] }))))).toBe("alg");
    // A caller asking for an algorithm outside the three gets none of them, not that one.
    expect(await vcode(verifyIdToken(hs, { ...opts(async () => ({ keys: [jwkA] })), algorithms: ["HS256"] }))).toBe("alg");
    expect(await vcode(verifyIdToken(await sign({}, keyB, "A"), opts(async () => ({ keys: [jwkA] }))))).toBe("signature");
    resetJwksCache();
    expect(await vcode(verifyIdToken(await sign(), opts(async () => ({ nope: 1 }))))).toBe("jwks");
    expect(await vcode(verifyIdToken(await sign(), opts(async () => ({ keys: [] }))))).toBe("jwks");
    expect(await vcode(verifyIdToken(await sign(), opts(async () => { throw new SsoFetchError("timeout"); })))).toBe("jwks");
  });

  it("caches keys by address, and fetches once more when the key id is new (a rotation)", async () => {
    let sets = [{ keys: [jwkA] }, { keys: [jwkA, jwkB] }];
    const fetches: string[] = [];
    const f = async (u: string) => { fetches.push(u); return sets.shift() ?? { keys: [jwkA] }; };
    expect(await vcode(verifyIdToken(await sign(), opts(f)))).toBe("ok");
    expect(await vcode(verifyIdToken(await sign(), opts(f)))).toBe("ok");
    expect(fetches).toEqual([JWKS]);
    expect(await vcode(verifyIdToken(await sign({}, keyB, "B"), opts(f)))).toBe("ok");
    expect(fetches).toEqual([JWKS, JWKS]);
    // Another organization's keys address is its own entry.
    expect(await vcode(verifyIdToken(await sign(), { ...opts(f), jwksUrl: "https://idp.school.edu/jwks2" }))).toBe("ok");
    expect(fetches).toEqual([JWKS, JWKS, "https://idp.school.edu/jwks2"]);
    // A key that is still unknown after the one refetch is refused, without fetching again and again.
    sets = [];
    resetJwksCache(); fetches.length = 0;
    const onlyA = opts(async (u) => { fetches.push(u); return { keys: [jwkA] }; });
    expect(await vcode(verifyIdToken(await sign(), onlyA))).toBe("ok");
    expect(await vcode(verifyIdToken(await sign({}, keyB, "B"), onlyA))).toBe("kid");
    expect(fetches).toHaveLength(2);
    // A copy fetched for this very call is not fetched again.
    resetJwksCache(); fetches.length = 0;
    expect(await vcode(verifyIdToken(await sign({}, keyB, "B"), onlyA))).toBe("kid");
    expect(fetches).toHaveLength(1);
  });

  it("refetches a copy older than an hour", async () => {
    let n = 0;
    const o = opts(async () => { n++; return { keys: [jwkA] }; });
    await verifyIdToken(await sign(), o);
    await verifyIdToken(await sign(), { ...o, now: now + 30 * 60_000 });
    expect(n).toBe(1);
    await verifyIdToken(await sign(), { ...o, now: now + 3600_000 + 1000 });
    expect(n).toBe(2);
  });
});
