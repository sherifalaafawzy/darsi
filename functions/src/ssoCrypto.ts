/**
 * School sign-in's cryptography (TECHNICAL.md "School sign-in", design §2 and §4): the key ring from the `SSO_KEYS`
 * secret, the signed `state` that replaces a stored document at start, the provider nonce and PKCE verifier derived
 * from it, the sealed ticket the callback hands the page, and the client secret sealed to where it may be sent.
 * Pure (node:crypto only): no Firestore, no Auth, no network, and nothing here logs.
 *
 * Every key is HKDF-derived from one master key per key id (`kid`), one label per use, so a key for states can never
 * open a ticket or a secret. Everything sealed or signed names its kid, so a rotation (ssoJob) keeps old states,
 * tickets and secrets readable until the old key leaves the secret.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/** The closed list of what can go wrong here; the server maps them to refusal codes (sso-key, sso-state, sso-secret). */
export type CryptoProblem = "key" | "bad" | "expired" | "mismatch";

const KID = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_KEYS = 10;
const B64URL = /^[A-Za-z0-9_-]*$/;

export const b64url = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");
/** base64url decoded strictly: the string must be exactly what encoding the bytes gives back (no padding, no junk). */
function fromB64url(s: string): Buffer | null {
  if (!B64URL.test(s)) return null;
  const b = Buffer.from(s, "base64url");
  return b.toString("base64url") === s ? b : null;
}
/** A key as written in SSO_KEYS: standard base64 (padded or not) or base64url, decoded strictly. */
function keyBytes(s: unknown): Buffer | null {
  if (typeof s !== "string" || s.length > 64) return null;
  const url = s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return fromB64url(url);
}

type Label = "state" | "nonce" | "pkce" | "ticket" | "secret";

/** The parsed SSO_KEYS: which key is current, and every key (exactly 32 bytes each). */
export class KeyRing {
  readonly current: string;
  readonly #keys: Map<string, Buffer>;
  readonly #derived = new Map<string, Buffer>();
  constructor(current: string, keys: Map<string, Buffer>) { this.current = current; this.#keys = keys; }
  get kids(): string[] { return [...this.#keys.keys()]; }
  has(kid: unknown): kid is string { return typeof kid === "string" && this.#keys.has(kid); }
  /** HKDF-SHA256 sub-key for one use of one key; cached, since every request derives the same few. */
  derive(kid: string, label: Label): Buffer {
    const id = `${kid}\n${label}`;
    let k = this.#derived.get(id);
    if (!k) {
      const master = this.#keys.get(kid);
      if (!master) throw new Error("sso-key");
      k = Buffer.from(hkdfSync("sha256", master, "darsi-sso", `darsi-sso/${label}/v1`, 32));
      this.#derived.set(id, k);
    }
    return k;
  }
}

/**
 * SSO_KEYS as stored in Secret Manager: `{"current":"k1","keys":{"k1":"<32 bytes, base64>", …}}`. Refused (`key`)
 * unless it parses, names a current key that exists, has 1 to 10 keys with plain ids, and every key decodes to
 * exactly 32 bytes: a placeholder such as "unset" must keep the feature closed, never become a key.
 */
export function parseKeyRing(raw: unknown): { ok: true; ring: KeyRing } | { ok: false; code: "key" } {
  const no = { ok: false as const, code: "key" as const };
  if (typeof raw !== "string" || raw.length > 4096) return no;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return no; }
  const o = v as { current?: unknown; keys?: unknown };
  if (!o || typeof o !== "object" || typeof o.current !== "string" || !o.keys || typeof o.keys !== "object" || Array.isArray(o.keys)) return no;
  const entries = Object.entries(o.keys as Record<string, unknown>);
  if (!entries.length || entries.length > MAX_KEYS) return no;
  const keys = new Map<string, Buffer>();
  for (const [kid, val] of entries) {
    const b = keyBytes(val);
    if (!KID.test(kid) || !b || b.length !== 32) return no;
    keys.set(kid, b);
  }
  if (!keys.has(o.current)) return no;
  return { ok: true, ring: new KeyRing(o.current, keys) };
}

const hmac = (key: Buffer, data: string) => createHmac("sha256", key).update(data, "utf8").digest();
/** Equal strings, compared in constant time (lengths may differ: that alone is not secret). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8"), y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---- PKCE between the page and Darsi, and between Darsi and the provider ----

const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9_-]{43,128}$/;
/** The page's S256 challenge, as `start` accepts it (a base64url SHA-256: exactly 43 characters). */
export const isChallenge = (v: unknown): v is string => typeof v === "string" && CHALLENGE.test(v);
/**
 * The page's verifier, as `finish` accepts it. Stricter than RFC 7636 (no `.` or `~`): the page makes it from 32
 * random bytes in base64url. An empty, "null" or missing verifier fails here, before the ticket is touched.
 */
export const isVerifier = (v: unknown): v is string => typeof v === "string" && VERIFIER.test(v);
/** PKCE S256: base64url(SHA-256(verifier)). */
export const s256 = (verifier: string) => b64url(createHash("sha256").update(verifier, "ascii").digest());
/** Whether a verifier belongs to a challenge (both shapes checked, compared in constant time). */
export const verifierMatches = (verifier: unknown, challenge: unknown) => isVerifier(verifier) && isChallenge(challenge) && safeEqual(s256(verifier), challenge);

/** The provider nonce for a state id: nothing is stored at start, the callback derives it again. */
export const providerNonce = (ring: KeyRing, kid: string, id: string) => b64url(hmac(ring.derive(kid, "nonce"), id));
/** Darsi's own PKCE pair towards the provider for a state id (the verifier is 43 base64url characters). */
export function providerPkce(ring: KeyRing, kid: string, id: string): { verifier: string; challenge: string } {
  const verifier = b64url(hmac(ring.derive(kid, "pkce"), id));
  return { verifier, challenge: s256(verifier) };
}

// ---- the signed state ----

export type SsoMode = "signin" | "link" | "test";
export const SSO_MODES: readonly SsoMode[] = ["signin", "link", "test"];
/** What `start` signs into `state` (design §4). `exp` and `id` are set by newState. */
export interface StatePayload {
  /** 16 random bytes, base64url: the replay guard's document id (ssoUsed/{id}) and the nonce/PKCE seed. */
  id: string;
  orgId: string;
  mode: SsoMode;
  /** The signed-in caller for link and test. */
  uid?: string;
  /** The page's S256 challenge; finish proves the browser with its verifier. */
  challenge: string;
  /** Origin the ticket returns to (Darsi's own, or this organization's address with access). */
  returnOrigin: string;
  /** configRev (or the `next` rev for a test) the flow started against. */
  rev: number;
  /** ms since epoch. */
  exp: number;
  /** A student's test link token, or the admin who tests. */
  test?: { token?: string; uid?: string };
}
export const STATE_TTL_MS = 60 * 60_000;
const MAX_STATE = 2048;
const ORG_ID = /^[A-Za-z0-9_-]{1,128}$/;
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const STATE_ID = /^[A-Za-z0-9_-]{22}$/;
const TEST_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

const isOrigin = (v: unknown): v is string => {
  if (typeof v !== "string" || v.length > 300) return false;
  try { const u = new URL(v); return u.origin === v && (u.protocol === "https:" || u.protocol === "http:"); } catch { return false; }
};

/** The payload's shape, checked again after the MAC (defence in depth: a bug elsewhere never signs junk usefully). */
function stateShape(p: unknown): p is StatePayload {
  const s = p as StatePayload;
  if (!s || typeof s !== "object") return false;
  if (!STATE_ID.test(String(s.id)) || !ORG_ID.test(String(s.orgId)) || !SSO_MODES.includes(s.mode)) return false;
  if (s.uid !== undefined && !UID.test(String(s.uid))) return false;
  if (!isChallenge(s.challenge) || !isOrigin(s.returnOrigin)) return false;
  if (!Number.isSafeInteger(s.rev) || s.rev < 0 || !Number.isFinite(s.exp)) return false;
  if (s.test !== undefined) {
    if (!s.test || typeof s.test !== "object") return false;
    if (s.test.token !== undefined && !TEST_TOKEN.test(String(s.test.token))) return false;
    if (s.test.uid !== undefined && !UID.test(String(s.test.uid))) return false;
  }
  return true;
}

/**
 * A new signed state: `<kid>.<base64url(JSON)>.<HMAC>` under the current key's state sub-key, valid 60 minutes.
 * The kid leads so a state signed just before a rotation still verifies (design §4 has `JSON.HMAC`; the kid is the
 * only addition). Throws on a payload that would not verify, so a server bug fails at start, not at the callback.
 */
export function newState(ring: KeyRing, fields: Omit<StatePayload, "id" | "exp">, now: number): { state: string; id: string; kid: string } {
  const kid = ring.current;
  const payload: StatePayload = { ...fields, id: b64url(randomBytes(16)), exp: now + STATE_TTL_MS };
  if (!stateShape(payload)) throw new Error("sso-state shape");
  const body = `${kid}.${b64url(Buffer.from(JSON.stringify(payload), "utf8"))}`;
  const state = `${body}.${b64url(hmac(ring.derive(kid, "state"), body))}`;
  if (state.length > MAX_STATE) throw new Error("sso-state size");
  return { state, id: payload.id, kid };
}

export type OpenedState =
  | { ok: true; state: StatePayload; kid: string }
  /** Validly signed but past `exp`: the callback still sends the person back to its own returnOrigin with sso-state. */
  | { ok: false; code: "expired"; state: StatePayload; kid: string }
  | { ok: false; code: "bad" };

/** Verify a state from the callback's query: MAC first (constant time), then shape, then expiry. */
export function openState(ring: KeyRing, raw: unknown, now: number): OpenedState {
  const bad = { ok: false as const, code: "bad" as const };
  if (typeof raw !== "string" || raw.length > MAX_STATE) return bad;
  const parts = raw.split(".");
  if (parts.length !== 3) return bad;
  const [kid, body, mac] = parts;
  if (!ring.has(kid)) return bad;
  const want = b64url(hmac(ring.derive(kid, "state"), `${kid}.${body}`));
  if (!safeEqual(mac, want)) return bad;
  const json = fromB64url(body);
  if (!json) return bad;
  let p: unknown;
  try { p = JSON.parse(json.toString("utf8")); } catch { return bad; }
  if (!stateShape(p)) return bad;
  if (now >= p.exp) return { ok: false, code: "expired", state: p, kid };
  return { ok: true, state: p, kid };
}

// ---- AES-256-GCM (tickets and secrets) ----

function seal(key: Buffer, plain: Buffer, aad: string): { iv: string; ct: string } {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  return { iv: b64url(iv), ct: b64url(ct) };
}
function unseal(key: Buffer, ivS: string, ctS: string, aad: string): Buffer | null {
  const iv = fromB64url(ivS), all = fromB64url(ctS);
  if (!iv || iv.length !== 12 || !all || all.length < 17) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key, iv);
    d.setAAD(Buffer.from(aad, "utf8"));
    d.setAuthTag(all.subarray(all.length - 16));
    return Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]);
  } catch { return null; }
}

// ---- the ticket (callback → page → finish) ----

export const TICKET_TTL_MS = 2 * 60_000;
/** A link's confirmation answer: ten minutes from the callback, so the person can read the question (finish with confirm). */
export const LINK_CONFIRM_TTL_MS = 10 * 60_000;
const MAX_TICKET = 8192;
const TICKET_AAD = "darsi-sso-ticket/v1";

/**
 * Seal what the callback verified (design §4: orgId, mode, uid, challenge, returnOrigin, identity, test) for 2
 * minutes: `<kid>.<iv>.<ciphertext+tag>`, base64url. It rides in a URL fragment, so it is size-capped. Replaying it is
 * harmless: finish still needs the browser's verifier for the challenge inside. One thing outlives the 2 minutes: a
 * link's confirmation answer (LINK_CONFIRM_TTL_MS; openTicket's `lateMs`, finish in sso.ts).
 */
export function sealTicket<T extends object>(ring: KeyRing, data: T, now: number): string {
  const kid = ring.current;
  const { iv, ct } = seal(ring.derive(kid, "ticket"), Buffer.from(JSON.stringify({ ...data, exp: now + TICKET_TTL_MS }), "utf8"), TICKET_AAD);
  const t = `${kid}.${iv}.${ct}`;
  if (t.length > MAX_TICKET) throw new Error("sso-ticket size");
  return t;
}

/**
 * Open a ticket from finish's body: `bad` when it is not ours or was changed, `expired` after 2 minutes, or `lateMs`
 * later (the caller then says what a ticket past its `exp` is still good for: finish, a link's confirmation only).
 */
export function openTicket<T extends object>(ring: KeyRing, raw: unknown, now: number, lateMs = 0): { ok: true; data: T & { exp: number } } | { ok: false; code: "bad" | "expired" } {
  if (typeof raw !== "string" || raw.length > MAX_TICKET) return { ok: false, code: "bad" };
  const parts = raw.split(".");
  if (parts.length !== 3 || !ring.has(parts[0])) return { ok: false, code: "bad" };
  const plain = unseal(ring.derive(parts[0], "ticket"), parts[1], parts[2], TICKET_AAD);
  if (!plain) return { ok: false, code: "bad" };
  let data: T & { exp: number };
  try { data = JSON.parse(plain.toString("utf8")); } catch { return { ok: false, code: "bad" }; }
  if (!data || typeof data !== "object" || !Number.isFinite(data.exp)) return { ok: false, code: "bad" };
  if (now >= data.exp + lateMs) return { ok: false, code: "expired" };
  return { ok: true, data };
}

// ---- the client secret (ssoSecrets/{orgId}.live / .next) ----

export type SecretSlot = "live" | "next";
/** Where a sealed secret may be sent; bound into the ciphertext as additional data and repeated inside it. */
export interface SecretBinding { orgId: string; slot: SecretSlot; issuer: string; tokenHost: string; clientId: string }
/** What ssoSecrets stores per slot. */
export interface SealedSecret { kid: string; iv: string; ct: string }
const MAX_SECRET = 512;

/**
 * The additional data (design §2: orgId|slot|issuer|tokenHost|clientId), written as a JSON array so no value can move
 * a boundary (a clientId with a "|" in it cannot pass for another issuer's).
 */
const secretAad = (b: SecretBinding) => JSON.stringify(["darsi-sso-secret/v1", b.orgId, b.slot, b.issuer, b.tokenHost, b.clientId]);

/** Seal a client secret under the current key, bound to the organization, slot, issuer, token host and client. */
export function sealSecret(ring: KeyRing, secret: string, b: SecretBinding): SealedSecret {
  if (typeof secret !== "string" || !secret.length || secret.length > MAX_SECRET) throw new Error("sso-secret");
  const kid = ring.current;
  const plain = JSON.stringify({ secret, issuer: b.issuer, tokenHost: b.tokenHost, clientId: b.clientId });
  return { kid, ...seal(ring.derive(kid, "secret"), Buffer.from(plain, "utf8"), secretAad(b)) };
}

/**
 * Open a sealed secret for exactly the binding about to be used. `key`: its kid left the ring (or the stored value is
 * not ours); `mismatch`: the organization, slot, issuer, token host or client differs from when it was saved, so the
 * secret must not be sent (the server drops the connection to draft and records the problem).
 */
export function openSecret(ring: KeyRing, stored: unknown, b: SecretBinding): { ok: true; secret: string } | { ok: false; code: "key" | "mismatch" } {
  const s = stored as SealedSecret;
  if (!s || typeof s !== "object" || typeof s.iv !== "string" || typeof s.ct !== "string" || !ring.has(s.kid)) return { ok: false, code: "key" };
  const plain = unseal(ring.derive(s.kid, "secret"), s.iv, s.ct, secretAad(b));
  if (!plain) return { ok: false, code: "mismatch" };
  let v: { secret?: unknown; issuer?: unknown; tokenHost?: unknown; clientId?: unknown };
  try { v = JSON.parse(plain.toString("utf8")); } catch { return { ok: false, code: "mismatch" }; }
  // The additional data already binds these; checking the sealed copies too costs nothing and survives a format slip.
  if (typeof v.secret !== "string" || v.issuer !== b.issuer || v.tokenHost !== b.tokenHost || v.clientId !== b.clientId) return { ok: false, code: "mismatch" };
  return { ok: true, secret: v.secret };
}

/**
 * ssoJob's re-encryption: a secret sealed under an older kid, sealed again under the current one (same binding).
 * `changed: false` when it already uses the current key. A key may leave SSO_KEYS only when no stored secret names it.
 */
export function resealSecret(ring: KeyRing, stored: unknown, b: SecretBinding): { ok: true; changed: boolean; stored: SealedSecret } | { ok: false; code: "key" | "mismatch" } {
  const s = stored as SealedSecret;
  const opened = openSecret(ring, stored, b);
  if (!opened.ok) return opened;
  if (s.kid === ring.current) return { ok: true, changed: false, stored: s };
  return { ok: true, changed: true, stored: sealSecret(ring, opened.secret, b) };
}

/** manageSso `get` for platform admins: the current key seals and opens (a canary, no stored data involved). */
export function keyCanary(ring: KeyRing): boolean {
  const b: SecretBinding = { orgId: "canary", slot: "live", issuer: "https://canary.invalid", tokenHost: "canary.invalid", clientId: "canary" };
  try { const o = openSecret(ring, sealSecret(ring, "canary", b), b); return o.ok && o.secret === "canary"; } catch { return false; }
}
