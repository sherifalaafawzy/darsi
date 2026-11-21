// Fakes for the school sign-in flow tests (sso*.test.ts; not a test file itself): fakeFirestore's FakeDb with the
// queries sso.ts runs (equality and range filters, orderBy, startAfter by value, limit, count, recursiveDelete), Auth
// with chosen uids, ID tokens, custom tokens and revocations, the ../src/admin.js stand-in, and a stand-in OpenID
// provider on 127.0.0.1 (discovery, token with PKCE and client authentication, JWKS) that counts every call it gets.
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { HttpsError } from "firebase-functions/v2/https";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { FakeAuth, FakeDb, type FakeUser } from "./fakeFirestore";

type Data = Record<string, unknown>;
type Op = "==" | "<=" | "<" | ">=" | ">";
type Filter = [string, Op, unknown];
interface Page { order?: [string, "asc" | "desc"]; after?: unknown; limit?: number }

const val = (d: Data | undefined, f: string) => f.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Data)[k] : undefined), d);
const cmp = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
function test(v: unknown, op: Op, want: unknown) {
  if (op === "==") return v === want;
  // Like Firestore, a range filter only matches values of the same type (null and missing never match a number).
  if (typeof v !== typeof want || v === null || v === undefined) return false;
  const c = cmp(v, want);
  return op === "<=" ? c <= 0 : op === "<" ? c < 0 : op === ">=" ? c >= 0 : c > 0;
}

export class SsoDb extends FakeDb {
  queries: string[] = [];
  query(col: string, filters: Filter[] | [string, unknown][] = [], page: Page = {}) {
    const self = this;
    const fs = (filters as unknown[]).map((f) => ((f as unknown[]).length === 2 ? [(f as [string, unknown])[0], "==", (f as [string, unknown])[1]] : f) as Filter);
    const run = () => {
      self.queries.push(col);
      let docs = [...self.docs.keys()].filter((k) => k.startsWith(`${col}/`) && !k.slice(col.length + 1).includes("/")).sort()
        .map((k) => self.snap(k)).filter((s) => fs.every(([f, op, v]) => test(s.get(f), op, v)));
      if (page.order) {
        const [f, dir] = page.order, sign = dir === "desc" ? -1 : 1;
        docs = docs.filter((d) => d.get(f) !== undefined && d.get(f) !== null).sort((a, b) => sign * cmp(a.get(f), b.get(f)));
        if (page.after !== undefined) docs = docs.filter((d) => sign * cmp(d.get(f), page.after) > 0);
      }
      return page.limit ? docs.slice(0, page.limit) : docs;
    };
    const q = {
      where: (f: string, op: Op, v: unknown) => self.query(col, [...fs, [f, op, v]], page),
      orderBy: (f: string, dir: "asc" | "desc" = "asc") => self.query(col, fs, { ...page, order: [f, dir] }),
      startAfter: (v: unknown) => self.query(col, fs, { ...page, after: v }),
      limit: (n: number) => self.query(col, fs, { ...page, limit: n }),
      select: (..._f: string[]) => q,
      get: async () => { const docs = run(); return { docs, size: docs.length, empty: !docs.length }; },
      count: () => ({ get: async () => ({ data: () => ({ count: run().length }) }) }),
      isQuery: true,
    };
    return q;
  }
  async recursiveDelete(ref: { path: string }) { for (const k of [...this.docs.keys()]) if (k === ref.path || k.startsWith(`${ref.path}/`)) this.docs.delete(k); }
  /** A top-level collection's documents, by id. */
  all(col: string): ({ id: string } & Data)[] {
    return [...this.docs.entries()].filter(([k]) => k.startsWith(`${col}/`) && !k.slice(col.length + 1).includes("/")).map(([k, v]) => ({ id: k.slice(col.length + 1), ...v }));
  }
}

export type SsoUser = FakeUser & { metadata?: { lastSignInTime?: string | null } };
export class SsoAuth extends FakeAuth {
  declare users: Map<string, SsoUser>;
  /** ID tokens the fake accepts: token → decoded claims (uid, auth_time, …). */
  idTokens = new Map<string, Data>();
  customTokens: { uid: string; claims: Data }[] = [];
  revoked: string[] = [];
  signerDown = false;
  async verifyIdToken(token: string) { const d = this.idTokens.get(token); if (!d) throw Object.assign(new Error("auth/argument-error"), { code: "auth/argument-error" }); return { ...d }; }
  async createCustomToken(uid: string, claims?: Data) {
    if (this.signerDown) throw Object.assign(new Error("iam denied"), { code: "auth/insufficient-permission" });
    this.customTokens.push({ uid, claims: claims ?? {} });
    return `custom.${uid}`;
  }
  async revokeRefreshTokens(uid?: string) { if (uid) this.revoked.push(uid); }
  /** Auth's own: an account made with no email and no password has no provider at all. */
  async createUser(p: { uid?: string; email?: string; password?: string; displayName?: string; emailVerified?: boolean }) {
    const u = await super.createUser(p);
    if (!p.password && !p.email) { this.users.get(u.uid)!.providerData = []; return { ...u, providerData: [] }; }
    return u;
  }
}

export type Audit = { action: string; by: string } & Data;
/** What ../src/admin.js is in the sso tests. */
export function adminMock() {
  const db = new SsoDb(), auth = new SsoAuth(), audits: Audit[] = [];
  type Req = { auth?: { uid: string; token: Data } };
  const freshCaller = async (req: Req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const claims = (await auth.getUser(req.auth.uid).catch(() => null))?.customClaims ?? {};
    return { uid: req.auth.uid, role: (claims.role as string) ?? "learner", orgId: claims.orgId as string | undefined };
  };
  return {
    db, auth, audits, freshCaller,
    caller: (req: Req) => { if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first."); return { uid: req.auth.uid, role: (req.auth.token.role as string) ?? "learner", orgId: req.auth.token.orgId as string | undefined }; },
    audit: async (action: string, by: string, data: Data) => { audits.push({ action, by, ...data }); },
    releasePupils: async () => 0,
    requireSuper: async (req: Req) => { const c = await freshCaller(req); if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only.", { reason: "not-super" }); return c; },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
}
export type AdminMock = ReturnType<typeof adminMock>;

/** An HTTP response as express's, recording what the function sent. */
export function response() {
  const out = { status: 200, headers: {} as Record<string, string>, body: undefined as unknown, text: "" };
  const res = {
    status: (c: number) => { out.status = c; return res; },
    set: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; return res; },
    json: (b: unknown) => { out.body = b; return res; },
    send: (t: string) => { out.text = t; return res; },
    end: () => res,
  };
  return { res, out };
}

const b64url = (b: Buffer) => b.toString("base64url");
export const pkcePair = () => { const verifier = b64url(randomBytes(32)); return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) }; };

/**
 * A stand-in OpenID provider on 127.0.0.1 (the sso functions accept http on a loopback host only under the emulator
 * flag). authorize() plays the person signing in: it reads the authorization URL Darsi built and hands back the code
 * and state the provider would redirect with. Every HTTP call it receives is in `calls`.
 */
export async function fakeProvider() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const codes = new Map<string, { claims: Data; nonce: string; challenge: string; redirectUri: string; clientId: string }>();
  const calls: { path: string; method: string; form: Record<string, string>; basic: string | null }[] = [];
  const p = {
    base: "", clientId: "darsi-client", secret: "s3cret!", issParam: false,
    /** `iss` in the ID tokens (default: the discovery issuer, `base`). */
    tokenIss: null as string | null,
    /** Change what the next tokens say (for nonce, aud, … tests). */
    tamper: null as ((claims: Data) => Data) | null,
    calls, codes,
    discovery: () => ({
      issuer: p.base, authorization_endpoint: `${p.base}/authorize`, token_endpoint: `${p.base}/token`, jwks_uri: `${p.base}/jwks`, end_session_endpoint: `${p.base}/logout`,
      response_types_supported: ["code"], code_challenge_methods_supported: ["S256"], id_token_signing_alg_values_supported: ["RS256"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"], authorization_response_iss_parameter_supported: p.issParam,
    }),
    endpoints: () => ({ authorization: `${p.base}/authorize`, token: `${p.base}/token`, jwks: `${p.base}/jwks`, endSession: `${p.base}/logout` }),
    /** The person at the provider: returns what the provider redirects back with. */
    authorize(url: string, claims: Data): { code: string; state: string } {
      const u = new URL(url);
      const code = b64url(randomBytes(12));
      codes.set(code, { claims, nonce: u.searchParams.get("nonce")!, challenge: u.searchParams.get("code_challenge")!, redirectUri: u.searchParams.get("redirect_uri")!, clientId: u.searchParams.get("client_id")! });
      return { code, state: u.searchParams.get("state")! };
    },
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", async () => {
      const path = (req.url ?? "").split("?")[0];
      const form = Object.fromEntries(new URLSearchParams(raw));
      const auth = String(req.headers.authorization ?? "");
      calls.push({ path, method: req.method ?? "", form, basic: auth.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString() : null });
      const json = (status: number, body: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
      if (path === "/.well-known/openid-configuration") return json(200, p.discovery());
      if (path === "/jwks") return json(200, { keys: [jwk] });
      if (path !== "/token" || req.method !== "POST") return json(404, { error: "not_found" });
      const [id, secret] = auth.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString().split(":").map(decodeURIComponent) : [form.client_id, form.client_secret];
      if (id !== p.clientId || secret !== p.secret) return json(401, { error: "invalid_client" });
      const c = codes.get(form.code);
      if (!c) return json(400, { error: "invalid_grant" });
      codes.delete(form.code);
      const ok = c.redirectUri === form.redirect_uri && c.clientId === id && b64url(createHash("sha256").update(form.code_verifier ?? "").digest()) === c.challenge;
      if (!ok) return json(400, { error: "invalid_grant", error_description: "PKCE or redirect_uri mismatch" });
      let claims: Data = { sub: "person-1", ...c.claims, nonce: c.nonce };
      if (p.tamper) claims = p.tamper(claims);
      const { iss, aud, ...rest } = claims;
      const t = new SignJWT(rest).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer((iss as string) ?? p.tokenIss ?? p.base)
        .setAudience((aud as string | string[]) ?? p.clientId).setIssuedAt().setExpirationTime("5m");
      json(200, { access_token: "at", token_type: "Bearer", id_token: await t.sign(privateKey) });
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  p.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return p;
}
export type FakeProvider = Awaited<ReturnType<typeof fakeProvider>>;
