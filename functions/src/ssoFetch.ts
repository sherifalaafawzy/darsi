/**
 * School sign-in's only way out to a school's identity provider (TECHNICAL.md "School sign-in", design §9): safeFetch
 * and the helpers on it (fetchJson, fetchDiscovery, tokenRequest), and verifyIdToken with a JWKS cache. The provider's
 * address is chosen by an organization admin, so every call is treated as aimed at Darsi's own network:
 *
 *  - https only (http to 127.0.0.1/localhost only under the functions emulator); any port.
 *  - IPv4 only: an IPv6 literal (bracketed, mapped forms included) is refused, an IPv4 literal is checked against a
 *    BlockList of every non-public range, and a name is resolved with lookup({family: 4, all: true}) and refused when
 *    any answer is blocked. The connection goes to the checked address itself (servername and Host keep the name, so
 *    certificates are still checked), so a second DNS answer can never swap in a private address.
 *  - No redirects (a 3xx is an error: a 307 must never carry a client secret elsewhere); one 8 s timeout for DNS,
 *    connect, headers and body; a 512 KB cap; a per-callback budget checked before each call.
 *  - Per organization per instance: at most 10 calls in flight, and a breaker that answers at once for 30 s after 5
 *    timeouts in a row, so one slow provider holds a fixed share of the instance.
 *
 * Errors are a closed list of codes (FetchCode, VerifyCode). Nothing here logs, and errors never carry request
 * options, bodies, tokens, codes or secrets; from a JSON error body only `error` and `error_description` (≤ 200) are kept.
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from "jose";
import { safeEqual } from "./ssoCrypto.js";
import { discoveryUrl } from "./ssoProviders.js";
import { ID_TOKEN_ALGS } from "./ssoCore.js";

export type FetchCode =
  | "url" | "blocked" | "dns" | "connect" | "tls-chain" | "tls-name" | "tls" | "timeout" | "too-large" | "redirect"
  | "status" | "json" | "id-token" | "budget" | "busy" | "breaker";

/** A provider call that failed; `message` is only the code. `oauth` holds the provider's error code for a status error. */
export class SsoFetchError extends Error {
  readonly code: FetchCode;
  readonly status?: number;
  readonly oauth?: { error: string; error_description?: string };
  constructor(code: FetchCode, status?: number, oauth?: { error: string; error_description?: string }) {
    super(`sso-fetch: ${code}`);
    this.name = "SsoFetchError";
    this.code = code;
    if (status !== undefined) this.status = status;
    if (oauth) this.oauth = oauth;
  }
}

export const FETCH_TIMEOUT_MS = 8000;
export const FETCH_MAX_BYTES = 512 * 1024;
export const CALLBACK_BUDGET_MS = 20_000;
export const MAX_IN_FLIGHT = 10;
export const BREAKER_TIMEOUTS = 5;
export const BREAKER_OPEN_MS = 30_000;

/**
 * Every range that isn't public unicast IPv4 (design §9): this network, private, carrier-grade NAT, loopback,
 * link-local (the metadata server), IETF protocol assignments, the documentation and benchmarking nets, multicast and
 * reserved, and broadcast.
 */
const BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
];
const blockList = new BlockList();
for (const [net, prefix] of BLOCKED) blockList.addSubnet(net, prefix, "ipv4");
blockList.addAddress("255.255.255.255", "ipv4");
/** Whether an IPv4 address may be called (anything that isn't a valid IPv4 address is blocked). */
export const ipv4Allowed = (address: string) => isIP(address) === 4 && !blockList.check(address, "ipv4");

export type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;
/** Every IPv4 answer for a name (dns.promises.lookup, read at call time so tests can watch it). */
export const defaultLookup: Lookup = (host) => dns.promises.lookup(host, { family: 4, all: true });

const emulator = () => process.env.FUNCTIONS_EMULATOR === "true";
const LOOPBACK_NAMES = new Set(["127.0.0.1", "localhost"]);

/** The time and the calls left for one callback (design §9: 20 s, checked before each call). */
export interface Budget { readonly deadline: number }
export const createBudget = (ms = CALLBACK_BUDGET_MS, now = Date.now()): Budget => ({ deadline: now + ms });

export interface SafeFetchOptions {
  method?: "GET" | "POST";
  /** Request headers (a Host header here is ignored: it is always the URL's). */
  headers?: Record<string, string>;
  body?: string;
  /** The organization the call is for (in-flight limit and breaker); calls without one share a bucket. */
  orgId?: string;
  budget?: Budget;
  /** At most FETCH_TIMEOUT_MS; lower in tests. */
  timeoutMs?: number;
  /** At most FETCH_MAX_BYTES. */
  maxBytes?: number;
  /** Extra trusted CA (PEM), honoured only under the functions emulator: tests and the local stand-in provider. */
  testCa?: string;
  /** Instead of DNS (tests). Its answers are checked against the block list like any others. */
  lookup?: Lookup;
  now?: () => number;
}
export interface FetchResult { status: number; headers: http.IncomingHttpHeaders; body: Buffer }

const flights = new Map<string, number>();
const breakers = new Map<string, { timeouts: number; openUntil: number }>();
/** Tests: forget in-flight counts and breakers. */
export function resetFetchState() { flights.clear(); breakers.clear(); }
/** Whether an organization's breaker is open now (for the status card's hint). */
export const breakerOpen = (orgId: string, now = Date.now()) => (breakers.get(orgId)?.openUntil ?? 0) > now;

interface Target { url: URL; addresses: string[]; servername: string | undefined; port: number }

/** Parse and check the address, and resolve a name to checked IPv4 addresses (design §9). */
async function target(raw: string, lookup: Lookup, signal: AbortSignal): Promise<Target> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new SsoFetchError("url"); }
  if (url.username || url.password) throw new SsoFetchError("url");
  const host = url.hostname;
  // Any bracketed literal is IPv6 (WHATWG writes ::ffff:127.0.0.1 as [::ffff:7f00:1]): refused outright.
  if (host.startsWith("[") || host.includes(":")) throw new SsoFetchError("blocked");
  if (!host || host.endsWith(".")) throw new SsoFetchError("url");
  const loopbackOk = emulator() && LOOPBACK_NAMES.has(host);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopbackOk)) throw new SsoFetchError("url");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (loopbackOk) return { url, addresses: ["127.0.0.1"], servername: host === "localhost" ? host : undefined, port };
  // WHATWG has already turned decimal, octal, hex and dotless forms into a dotted quad here.
  if (isIP(host) === 4) {
    if (!ipv4Allowed(host)) throw new SsoFetchError("blocked");
    return { url, addresses: [host], servername: undefined, port };
  }
  let answers: { address: string; family: number }[];
  try {
    answers = await Promise.race([lookup(host), aborted(signal)]);
  } catch (e) {
    if (e instanceof SsoFetchError) throw e;
    throw new SsoFetchError("dns");
  }
  if (!Array.isArray(answers) || !answers.length) throw new SsoFetchError("dns");
  // One private answer refuses the name: a resolver may hand the other one to the next caller.
  for (const a of answers) if (a.family !== 4 || !ipv4Allowed(a.address)) throw new SsoFetchError("blocked");
  return { url, addresses: [...new Set(answers.map((a) => a.address))].slice(0, 3), servername: host, port };
}

/** A promise that rejects with `timeout` when the signal fires (for the steps that take no signal, such as DNS). */
function aborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) return reject(new SsoFetchError("timeout"));
    signal.addEventListener("abort", () => reject(new SsoFetchError("timeout")), { once: true });
  });
}

const CHAIN = new Set(["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "UNABLE_TO_GET_ISSUER_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT"]);
const CONNECT = new Set(["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "EPIPE", "ETIMEDOUT", "EADDRNOTAVAIL", "ECONNABORTED"]);
/** Map a socket or TLS error to a code (never the error's own text, which may hold the address or worse). */
function classify(e: unknown, signal: AbortSignal): SsoFetchError {
  if (e instanceof SsoFetchError) return e;
  if (signal.aborted) return new SsoFetchError("timeout");
  const code = String((e as { code?: unknown })?.code ?? "");
  if (CHAIN.has(code)) return new SsoFetchError("tls-chain");
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID") return new SsoFetchError("tls-name");
  if (/CERT|TLS|SSL/.test(code)) return new SsoFetchError("tls");
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") return new SsoFetchError("dns");
  if (CONNECT.has(code)) return new SsoFetchError("connect");
  return new SsoFetchError("connect");
}

/** One request to one checked address. */
function once(t: Target, address: string, o: SafeFetchOptions, signal: AbortSignal, maxBytes: number): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { "User-Agent": "Darsi-SSO/1", Accept: "application/json" };
    for (const [k, v] of Object.entries(o.headers ?? {})) if (k.toLowerCase() !== "host") headers[k] = v;
    headers.Host = t.url.host;
    if (o.body !== undefined) headers["Content-Length"] = String(Buffer.byteLength(o.body));
    const https_ = t.url.protocol === "https:";
    const opts: https.RequestOptions = {
      host: address, port: t.port, path: `${t.url.pathname}${t.url.search}`, method: o.method ?? "GET", headers, agent: false, signal,
      ...(https_ ? { servername: t.servername, rejectUnauthorized: true, ...(o.testCa && emulator() ? { ca: o.testCa } : {}) } : {}),
    };
    let settled = false;
    const fail = (e: unknown) => { if (!settled) { settled = true; reject(classify(e, signal)); } };
    const req = (https_ ? https : http).request(opts, (res) => {
      const status = res.statusCode ?? 0;
      // fail() first: destroying the response emits its own events, which must not decide the code.
      if (status >= 300 && status < 400) { fail(new SsoFetchError("redirect", status)); return void res.destroy(); }
      const len = Number(res.headers["content-length"]);
      if (Number.isFinite(len) && len > maxBytes) { fail(new SsoFetchError("too-large")); return void res.destroy(); }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) { fail(new SsoFetchError("too-large")); res.destroy(); return; }
        chunks.push(c);
      });
      res.on("end", () => { if (!settled) { settled = true; resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }); } });
      res.on("error", fail);
      // The timeout destroys the request mid-body too; whichever event comes first, that is a timeout (it feeds the breaker).
      res.on("aborted", () => fail(new SsoFetchError(signal.aborted ? "timeout" : "connect")));
    });
    req.on("error", fail);
    if (o.body !== undefined) req.write(o.body);
    req.end();
  });
}

/**
 * Call a provider (design §9). Throws SsoFetchError with a code; never follows a redirect. Answers of any status come
 * back as they are (fetchJson decides what a status means).
 */
export async function safeFetch(raw: string, o: SafeFetchOptions = {}): Promise<FetchResult> {
  const now = o.now ?? Date.now;
  const key = o.orgId ?? "-";
  const left = o.budget ? o.budget.deadline - now() : Infinity;
  if (left <= 0) throw new SsoFetchError("budget");
  const br = breakers.get(key);
  if (br && br.openUntil > now()) throw new SsoFetchError("breaker");
  const n = flights.get(key) ?? 0;
  if (n >= MAX_IN_FLIGHT) throw new SsoFetchError("busy");
  flights.set(key, n + 1);
  const signal = AbortSignal.timeout(Math.max(1, Math.min(o.timeoutMs ?? FETCH_TIMEOUT_MS, FETCH_TIMEOUT_MS, left)));
  const maxBytes = Math.min(o.maxBytes ?? FETCH_MAX_BYTES, FETCH_MAX_BYTES);
  try {
    const t = await target(raw, o.lookup ?? defaultLookup, signal);
    let last: SsoFetchError | null = null;
    for (const address of t.addresses) {
      try {
        const res = await once(t, address, o, signal, maxBytes);
        breakers.delete(key);
        return res;
      } catch (e) {
        last = e instanceof SsoFetchError ? e : classify(e, signal);
        // Only a refused or unreachable address is worth the next one; anything else is the provider's answer.
        if (last.code !== "connect" || signal.aborted) break;
      }
    }
    throw last ?? new SsoFetchError("connect");
  } catch (e) {
    const err = e instanceof SsoFetchError ? e : classify(e, signal);
    if (err.code === "timeout") {
      const b = breakers.get(key) ?? { timeouts: 0, openUntil: 0 };
      b.timeouts++;
      if (b.timeouts >= BREAKER_TIMEOUTS) { b.timeouts = 0; b.openUntil = now() + BREAKER_OPEN_MS; }
      breakers.set(key, b);
    }
    throw err;
  } finally {
    const m = (flights.get(key) ?? 1) - 1;
    if (m > 0) flights.set(key, m); else flights.delete(key);
  }
}

const OAUTH_ERROR = /^[\x20-\x7e]{1,200}$/;
/** Only `error` and `error_description` from an error body, printable and cut to 200. */
function oauthError(body: Buffer): { error: string; error_description?: string } | undefined {
  let j: unknown;
  try { j = JSON.parse(body.toString("utf8")); } catch { return undefined; }
  const o = j as { error?: unknown; error_description?: unknown };
  if (!o || typeof o.error !== "string") return undefined;
  const error = o.error.slice(0, 200);
  if (!OAUTH_ERROR.test(error)) return undefined;
  const desc = typeof o.error_description === "string" ? o.error_description.replace(/[^\x20-\x7e]/g, " ").slice(0, 200) : undefined;
  return desc ? { error, error_description: desc } : { error };
}

/** GET (or POST) and read a JSON object; a non-2xx answer throws `status` with the provider's OAuth error if any. */
export async function fetchJson(raw: string, o: SafeFetchOptions = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await safeFetch(raw, o);
  if (res.status < 200 || res.status > 299) throw new SsoFetchError("status", res.status, oauthError(res.body));
  let json: unknown;
  try { json = JSON.parse(res.body.toString("utf8")); } catch { throw new SsoFetchError("json", res.status); }
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new SsoFetchError("json", res.status);
  return { status: res.status, json: json as Record<string, unknown> };
}

/** The issuer's discovery document, unchecked (ssoCore.checkDiscovery checks it). */
export const fetchDiscovery = (issuer: string, o: SafeFetchOptions = {}) => fetchJson(discoveryUrl(issuer), o).then((r) => r.json);

/** RFC 6749 §2.3.1: client id and secret are form-encoded before Basic's base64. */
const formEncode = (s: string) => new URLSearchParams({ v: s }).toString().slice(2);

/**
 * The token request (design §4 callback): authorization_code with the derived PKCE verifier and the per-organization
 * redirect URI, the client authenticated with Basic or in the form. Only the ID token is returned; the access token
 * and anything else in the answer are dropped unread. On `invalid_client` the error's `oauth.error` says so (the
 * server retries once with `post` during a test).
 */
export async function tokenRequest(p: {
  endpoint: string; clientId: string; clientSecret: string; authMethod: "basic" | "post"; code: string; redirectUri: string; codeVerifier: string;
}, o: SafeFetchOptions = {}): Promise<{ idToken: string }> {
  const form = new URLSearchParams({ grant_type: "authorization_code", code: p.code, redirect_uri: p.redirectUri, code_verifier: p.codeVerifier });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (p.authMethod === "post") { form.set("client_id", p.clientId); form.set("client_secret", p.clientSecret); }
  else headers.Authorization = `Basic ${Buffer.from(`${formEncode(p.clientId)}:${formEncode(p.clientSecret)}`, "utf8").toString("base64")}`;
  const { json } = await fetchJson(p.endpoint, { ...o, method: "POST", headers: { ...(o.headers ?? {}), ...headers }, body: form.toString() });
  const t = json.id_token;
  if (typeof t !== "string" || t.length > 16384 || t.split(".").length !== 3) throw new SsoFetchError("id-token");
  return { idToken: t };
}

/** What the wizard says about a failed "Check connection" (design §8 step 2). */
export type FetchHint = "name-not-found" | "certificate-chain" | "certificate-name" | "certificate" | "unreachable" | "timeout" | "blocked"
  | "redirect" | "too-large" | "bad-answer" | "busy" | "address";
export function hintFor(code: FetchCode): FetchHint {
  switch (code) {
    case "dns": return "name-not-found";
    case "tls-chain": return "certificate-chain";
    case "tls-name": return "certificate-name";
    case "tls": return "certificate";
    case "connect": return "unreachable";
    case "timeout": return "timeout";
    case "blocked": return "blocked";
    case "redirect": return "redirect";
    case "too-large": return "too-large";
    case "url": return "address";
    case "budget": case "busy": case "breaker": return "busy";
    default: return "bad-answer";
  }
}

// ---- ID tokens ----

export type VerifyCode = "jwks" | "kid" | "alg" | "signature" | "iss" | "aud" | "azp" | "nonce" | "exp" | "iat" | "nbf" | "claims" | "malformed";
export class IdTokenError extends Error {
  readonly code: VerifyCode;
  constructor(code: VerifyCode) { super(`sso-id-token: ${code}`); this.name = "IdTokenError"; this.code = code; }
}

export const JWKS_TTL_MS = 3600_000;
const JWKS_MAX = 500;
type JwksEntry = { at: number; get: ReturnType<typeof createLocalJWKSet> };
/** Keyed by the JWKS address itself, never by issuer (organizations with the same issuer may differ in keys URL). */
const jwksCache = new Map<string, JwksEntry>();
const jwksLoading = new Map<string, Promise<JwksEntry>>();
export function resetJwksCache() { jwksCache.clear(); jwksLoading.clear(); }

export interface VerifyOptions {
  /** The configured issuer; Google's two forms come from ssoCore.acceptedIssuers. */
  issuer: string | readonly string[];
  clientId: string;
  jwksUrl: string;
  /** The nonce derived for this state. */
  nonce: string;
  algorithms?: readonly string[];
  now?: number;
  /** Fetch the key set (default: fetchJson through safeFetch with `fetch`). */
  fetchJwks?: (url: string) => Promise<unknown>;
  fetch?: SafeFetchOptions;
}

function readJwks(v: unknown): JSONWebKeySet {
  const keys = (v as { keys?: unknown })?.keys;
  if (!Array.isArray(keys) || !keys.length || keys.length > 100) throw new IdTokenError("jwks");
  return { keys: keys.filter((k) => k && typeof k === "object") as JSONWebKeySet["keys"] };
}

async function loadJwks(url: string, o: VerifyOptions, now: number): Promise<JwksEntry> {
  let p = jwksLoading.get(url);
  if (!p) {
    // One fetch per address at a time: forty callbacks of one school after a key rotation share it.
    p = (async () => {
      let raw: unknown;
      try { raw = o.fetchJwks ? await o.fetchJwks(url) : (await fetchJson(url, o.fetch)).json; }
      catch { throw new IdTokenError("jwks"); }
      let get: JwksEntry["get"];
      try { get = createLocalJWKSet(readJwks(raw)); } catch { throw new IdTokenError("jwks"); }
      const e = { at: now, get };
      jwksCache.delete(url);
      jwksCache.set(url, e);
      if (jwksCache.size > JWKS_MAX) jwksCache.delete(jwksCache.keys().next().value as string);
      return e;
    })().finally(() => jwksLoading.delete(url));
    jwksLoading.set(url, p);
  }
  return p;
}

function verifyCode(e: unknown): VerifyCode {
  if (e instanceof IdTokenError) return e.code;
  const code = String((e as { code?: unknown })?.code ?? ""), claim = String((e as { claim?: unknown })?.claim ?? "");
  switch (code) {
    case "ERR_JWT_EXPIRED": return "exp";
    case "ERR_JWT_CLAIM_VALIDATION_FAILED":
      return claim === "iss" ? "iss" : claim === "aud" ? "aud" : claim === "nbf" ? "nbf" : claim === "iat" ? "iat" : claim === "nonce" ? "nonce" : claim === "exp" ? "exp" : "claims";
    case "ERR_JOSE_ALG_NOT_ALLOWED": case "ERR_JOSE_NOT_SUPPORTED": return "alg";
    case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED": return "signature";
    case "ERR_JWKS_NO_MATCHING_KEY": case "ERR_JWKS_MULTIPLE_MATCHING_KEYS": return "kid";
    case "ERR_JWKS_INVALID": case "ERR_JWK_INVALID": return "jwks";
    default: return "malformed";
  }
}

/**
 * Verify an ID token from the token endpoint (design §4 callback): signature against the provider's keys (cached by
 * address; one refetch when the key id is unknown, for a rotation), algorithms RS256/PS256/ES256 only, exact issuer,
 * audience containing the client, `azp` equal to the client when present or when there are several audiences, the
 * derived nonce, and exp/nbf/iat with 60 s of skew. Throws IdTokenError with a code.
 */
export async function verifyIdToken(token: string, o: VerifyOptions): Promise<{ payload: JWTPayload; alg: string }> {
  if (typeof token !== "string" || token.length > 16384 || token.split(".").length !== 3) throw new IdTokenError("malformed");
  const now = o.now ?? Date.now();
  const algorithms = (o.algorithms ?? ID_TOKEN_ALGS).filter((a) => ID_TOKEN_ALGS.includes(a));
  const options = {
    issuer: typeof o.issuer === "string" ? o.issuer : [...o.issuer], audience: o.clientId, algorithms, clockTolerance: 60,
    currentDate: new Date(now), requiredClaims: ["iss", "aud", "exp", "iat", "sub", "nonce"],
  };
  let entry = jwksCache.get(o.jwksUrl);
  let fresh = false;
  if (!entry || now - entry.at > JWKS_TTL_MS) { entry = await loadJwks(o.jwksUrl, o, now); fresh = true; }
  let result: Awaited<ReturnType<typeof jwtVerify>>;
  try {
    result = await jwtVerify(token, entry.get, options);
  } catch (e) {
    if (fresh || verifyCode(e) !== "kid") throw new IdTokenError(verifyCode(e));
    // The provider may have rotated its keys since the copy was cached: fetch once more, then give up.
    entry = await loadJwks(o.jwksUrl, o, now);
    try { result = await jwtVerify(token, entry.get, options); } catch (e2) { throw new IdTokenError(verifyCode(e2)); }
  }
  const p = result.payload;
  const multi = Array.isArray(p.aud) && p.aud.length > 1;
  if ((p.azp !== undefined || multi) && p.azp !== o.clientId) throw new IdTokenError("azp");
  if (typeof p.iat !== "number" || p.iat > now / 1000 + 60) throw new IdTokenError("iat");
  if (typeof p.nonce !== "string" || !safeEqual(p.nonce, o.nonce)) throw new IdTokenError("nonce");
  return { payload: p, alg: result.protectedHeader.alg };
}
