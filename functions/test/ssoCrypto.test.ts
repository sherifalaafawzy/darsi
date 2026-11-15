// School sign-in's cryptography (src/ssoCrypto.ts; design §2 and §4): the key ring, the signed state, the derived
// nonce and PKCE pair, the sealed ticket, and the client secret sealed to where it may be sent.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isChallenge, isVerifier, keyCanary, newState, openSecret, openState, openTicket, parseKeyRing, providerNonce, providerPkce, resealSecret, s256,
  safeEqual, sealSecret, sealTicket, verifierMatches, LINK_CONFIRM_TTL_MS, STATE_TTL_MS, TICKET_TTL_MS, type KeyRing, type SecretBinding,
} from "../src/ssoCrypto";

const K1 = randomBytes(32).toString("base64"), K2 = randomBytes(32).toString("base64url");
const ring = (json: object): KeyRing => {
  const r = parseKeyRing(JSON.stringify(json));
  if (!r.ok) throw new Error("ring");
  return r.ring;
};
const R1 = ring({ current: "k1", keys: { k1: K1 } });
const NOW = Date.UTC(2026, 10, 11, 12);
const CHALLENGE = s256("v".repeat(43));
const fields = { orgId: "org1", mode: "signin" as const, challenge: CHALLENGE, returnOrigin: "https://darsiai.org", rev: 3 };

describe("SSO_KEYS", () => {
  it("reads a ring of 32-byte keys in base64 or base64url", () => {
    const r = parseKeyRing(JSON.stringify({ current: "k2", keys: { k1: K1, k2: K2 } }));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.ring.current).toBe("k2"); expect(r.ring.kids).toEqual(["k1", "k2"]); }
  });

  it("refuses anything that would make a guessable or missing key: 31 or 33 bytes, 'unset', junk, no current", () => {
    const k31 = randomBytes(31).toString("base64"), k33 = randomBytes(33).toString("base64");
    for (const raw of [
      JSON.stringify({ current: "k1", keys: { k1: k31 } }),
      JSON.stringify({ current: "k1", keys: { k1: k33 } }),
      JSON.stringify({ current: "k1", keys: { k1: K1, k2: k31 } }),
      JSON.stringify({ current: "k1", keys: { k1: "unset" } }),
      JSON.stringify({ current: "k1", keys: { k1: `${K1}!` } }),
      JSON.stringify({ current: "k3", keys: { k1: K1 } }),
      JSON.stringify({ current: "k 1", keys: { "k 1": K1 } }),
      JSON.stringify({ current: "k1", keys: {} }),
      JSON.stringify({ current: "k1", keys: [K1] }),
      JSON.stringify({ current: "k0", keys: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, K1])) }),
      "unset", "", "{", "null", undefined, 42,
    ]) expect(parseKeyRing(raw), String(raw)).toEqual({ ok: false, code: "key" });
  });

  it("derives a different key per use, and the same one again for the same key id", () => {
    expect(R1.derive("k1", "state").equals(R1.derive("k1", "ticket"))).toBe(false);
    expect(R1.derive("k1", "secret").equals(R1.derive("k1", "nonce"))).toBe(false);
    expect(R1.derive("k1", "state").equals(ring({ current: "k1", keys: { k1: K1 } }).derive("k1", "state"))).toBe(true);
    expect(() => R1.derive("k9", "state")).toThrow();
  });
});

describe("state", () => {
  it("signs and verifies, and every field comes back", () => {
    const { state, id, kid } = newState(R1, { ...fields, mode: "link", uid: "u1" }, NOW);
    expect(kid).toBe("k1");
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const o = openState(R1, state, NOW + 1000);
    expect(o.ok).toBe(true);
    if (o.ok) expect(o.state).toEqual({ ...fields, mode: "link", uid: "u1", id, exp: NOW + STATE_TTL_MS });
  });

  it("refuses a changed payload, a changed MAC, an unknown key id and another ring's key", () => {
    const { state } = newState(R1, fields, NOW);
    const [kid, body, mac] = state.split(".");
    const other = JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), orgId: "org2" });
    const flip = (s: string) => s.slice(0, -1) + (s.endsWith("A") ? "B" : "A");
    for (const bad of [
      `${kid}.${Buffer.from(other).toString("base64url")}.${mac}`, `${kid}.${body}.${flip(mac)}`, `${kid}.${flip(body)}.${mac}`,
      `k9.${body}.${mac}`, `${kid}.${body}`, `${state}.x`, "", "a.b.c", "x".repeat(5000),
    ]) expect(openState(R1, bad, NOW), bad.slice(0, 40)).toEqual({ ok: false, code: "bad" });
    // The key id is under the MAC: moving a state to another key of the same ring fails too.
    expect(openState(ring({ current: "k1", keys: { k1: K1, k2: K2 } }), `k2.${body}.${mac}`, NOW)).toEqual({ ok: false, code: "bad" });
    expect(openState(R1, `${kid}.${body}.${mac.slice(0, 20)}`, NOW)).toEqual({ ok: false, code: "bad" });
    const R1b = ring({ current: "k1", keys: { k1: randomBytes(32).toString("base64") } });
    expect(openState(R1b, state, NOW)).toEqual({ ok: false, code: "bad" });
  });

  it("says expired (with the state, for the way home) after 60 minutes", () => {
    const { state } = newState(R1, fields, NOW);
    expect(openState(R1, state, NOW + STATE_TTL_MS - 1).ok).toBe(true);
    const o = openState(R1, state, NOW + STATE_TTL_MS);
    expect(o).toMatchObject({ ok: false, code: "expired", state: { returnOrigin: "https://darsiai.org" } });
  });

  it("keeps verifying a state signed with the previous key after a rotation", () => {
    const { state } = newState(R1, fields, NOW);
    const rotated = ring({ current: "k2", keys: { k1: K1, k2: K2 } });
    expect(openState(rotated, state, NOW).ok).toBe(true);
    expect(newState(rotated, fields, NOW).kid).toBe("k2");
  });

  it("refuses to sign a malformed payload (a server bug fails at start)", () => {
    expect(() => newState(R1, { ...fields, challenge: "short" }, NOW)).toThrow();
    expect(() => newState(R1, { ...fields, returnOrigin: "https://darsiai.org/path" }, NOW)).toThrow();
    expect(() => newState(R1, { ...fields, orgId: "a/b" }, NOW)).toThrow();
  });
});

describe("PKCE and the nonce", () => {
  it("follows RFC 7636's S256 example", () => {
    expect(s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("checks the page's challenge and verifier shapes before anything else", () => {
    expect(isChallenge(CHALLENGE)).toBe(true);
    for (const v of ["", "null", undefined, null, "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}.`]) expect(isChallenge(v)).toBe(false);
    expect(isVerifier("a".repeat(43))).toBe(true);
    expect(isVerifier("a".repeat(128))).toBe(true);
    for (const v of ["", "null", undefined, null, "a".repeat(42), "a".repeat(129), `${"a".repeat(42)}~`, `${"a".repeat(42)}.`]) expect(isVerifier(v)).toBe(false);
  });

  it("matches a verifier to its challenge only", () => {
    const v = randomBytes(32).toString("base64url");
    expect(verifierMatches(v, s256(v))).toBe(true);
    expect(verifierMatches(randomBytes(32).toString("base64url"), s256(v))).toBe(false);
    expect(verifierMatches("null", s256(v))).toBe(false);
    expect(verifierMatches(undefined, s256(v))).toBe(false);
    expect(verifierMatches(v, "x")).toBe(false);
  });

  it("derives the provider's nonce and PKCE pair from the state id, per key, without storing anything", () => {
    const a = providerPkce(R1, "k1", "AAAAAAAAAAAAAAAAAAAAAA"), b = providerPkce(R1, "k1", "BBBBBBBBBBBBBBBBBBBBBB");
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.challenge).toBe(s256(a.verifier));
    expect(providerPkce(R1, "k1", "AAAAAAAAAAAAAAAAAAAAAA")).toEqual(a);
    expect(b.verifier).not.toBe(a.verifier);
    expect(providerNonce(R1, "k1", "AAAAAAAAAAAAAAAAAAAAAA")).not.toBe(a.verifier);
    const R2 = ring({ current: "k1", keys: { k1: K2 } });
    expect(providerNonce(R2, "k1", "AAAAAAAAAAAAAAAAAAAAAA")).not.toBe(providerNonce(R1, "k1", "AAAAAAAAAAAAAAAAAAAAAA"));
  });

  it("compares in constant time and refuses different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("ticket", () => {
  const data = { orgId: "org1", mode: "signin", challenge: CHALLENGE, returnOrigin: "https://darsiai.org", identity: { subject: "s1", email: "a@school.edu" } };

  it("seals and opens what the callback verified, for 2 minutes", () => {
    const t = sealTicket(R1, data, NOW);
    expect(t.split(".")).toHaveLength(3);
    expect(t).not.toContain("school.edu");
    const o = openTicket<typeof data>(R1, t, NOW + TICKET_TTL_MS - 1);
    expect(o).toEqual({ ok: true, data: { ...data, exp: NOW + TICKET_TTL_MS } });
    expect(openTicket(R1, t, NOW + TICKET_TTL_MS)).toEqual({ ok: false, code: "expired" });
  });

  it("opens late only when the caller allows it, and no later than that (a link's confirmation answer)", () => {
    const t = sealTicket(R1, data, NOW);
    const late = LINK_CONFIRM_TTL_MS - TICKET_TTL_MS;
    expect(LINK_CONFIRM_TTL_MS).toBe(10 * 60_000);
    expect(openTicket<typeof data>(R1, t, NOW + TICKET_TTL_MS, late)).toEqual({ ok: true, data: { ...data, exp: NOW + TICKET_TTL_MS } });
    expect(openTicket(R1, t, NOW + LINK_CONFIRM_TTL_MS - 1, late).ok).toBe(true);
    expect(openTicket(R1, t, NOW + LINK_CONFIRM_TTL_MS, late)).toEqual({ ok: false, code: "expired" });
    expect(openTicket(R1, t, NOW + TICKET_TTL_MS, 0)).toEqual({ ok: false, code: "expired" });
  });

  it("refuses a ticket that was changed or sealed with another key", () => {
    const t = sealTicket(R1, data, NOW);
    const [kid, iv, ct] = t.split(".");
    const flipped = Buffer.from(ct, "base64url"); flipped[0] ^= 1;
    const iv2 = Buffer.from(iv, "base64url"); iv2[0] ^= 1;
    for (const bad of [`${kid}.${iv}.${flipped.toString("base64url")}`, `${kid}.${iv2.toString("base64url")}.${ct}`, `k9.${iv}.${ct}`, `${kid}.${iv}`, "", "x".repeat(9000)]) {
      expect(openTicket(R1, bad, NOW)).toEqual({ ok: false, code: "bad" });
    }
    expect(openTicket(ring({ current: "k1", keys: { k1: K2 } }), t, NOW)).toEqual({ ok: false, code: "bad" });
    // A state is not a ticket, and a ticket is not a state: separate keys.
    expect(openState(R1, t, NOW)).toEqual({ ok: false, code: "bad" });
    expect(openTicket(R1, newState(R1, fields, NOW).state, NOW)).toEqual({ ok: false, code: "bad" });
    // A truncated tag, and a sealed client secret presented as a ticket (another sub-key and additional data).
    expect(openTicket(R1, `${kid}.${iv}.${ct.slice(0, -4)}`, NOW)).toEqual({ ok: false, code: "bad" });
    const s = sealSecret(R1, "x", { orgId: "org1", slot: "live", issuer: "https://i.example", tokenHost: "i.example", clientId: "c" });
    expect(openTicket(R1, `${s.kid}.${s.iv}.${s.ct}`, NOW)).toEqual({ ok: false, code: "bad" });
  });
});

describe("client secret", () => {
  const bind: SecretBinding = { orgId: "org1", slot: "live", issuer: "https://idp.school.edu", tokenHost: "idp.school.edu", clientId: "darsi" };

  it("opens only for the binding it was sealed with", () => {
    const s = sealSecret(R1, "s3cr3t", bind);
    expect(s.kid).toBe("k1");
    expect(JSON.stringify(s)).not.toContain("s3cr3t");
    expect(openSecret(R1, s, bind)).toEqual({ ok: true, secret: "s3cr3t" });
    for (const change of [{ orgId: "org2" }, { slot: "next" as const }, { issuer: "https://evil.example" }, { tokenHost: "evil.example" }, { clientId: "other" }]) {
      expect(openSecret(R1, s, { ...bind, ...change }), JSON.stringify(change)).toEqual({ ok: false, code: "mismatch" });
    }
  });

  it("cannot be moved between fields by a separator in a value", () => {
    const a: SecretBinding = { ...bind, issuer: "https://a|b", tokenHost: "c" };
    const s = sealSecret(R1, "x", a);
    expect(openSecret(R1, s, { ...bind, issuer: "https://a", tokenHost: "b|c" })).toEqual({ ok: false, code: "mismatch" });
  });

  it("says `key` when its key left the ring or the stored value isn't ours", () => {
    const s = sealSecret(R1, "s", bind);
    expect(openSecret(ring({ current: "k2", keys: { k2: K2 } }), s, bind)).toEqual({ ok: false, code: "key" });
    expect(openSecret(R1, null, bind)).toEqual({ ok: false, code: "key" });
    expect(openSecret(R1, { kid: "k1" }, bind)).toEqual({ ok: false, code: "key" });
    expect(openSecret(R1, { ...s, ct: s.ct.slice(2) }, bind)).toEqual({ ok: false, code: "mismatch" });
  });

  it("is sealed again under the current key by the job, and left alone when it already is", () => {
    const s = sealSecret(R1, "s", bind);
    const rotated = ring({ current: "k2", keys: { k1: K1, k2: K2 } });
    const r = resealSecret(rotated, s, bind);
    expect(r.ok && r.changed && r.stored.kid).toBe("k2");
    if (r.ok) {
      expect(openSecret(ring({ current: "k2", keys: { k2: K2 } }), r.stored, bind)).toEqual({ ok: true, secret: "s" });
      expect(resealSecret(rotated, r.stored, bind)).toEqual({ ok: true, changed: false, stored: r.stored });
    }
    expect(resealSecret(rotated, s, { ...bind, clientId: "x" })).toEqual({ ok: false, code: "mismatch" });
  });

  it("refuses an empty or huge secret, and the canary passes", () => {
    expect(() => sealSecret(R1, "", bind)).toThrow();
    expect(() => sealSecret(R1, "x".repeat(513), bind)).toThrow();
    expect(keyCanary(R1)).toBe(true);
  });
});
