// The local stand-in school provider (scripts/local/oidc.mjs, `npm run local`) against Darsi's own checks: its discovery
// passes checkDiscovery, its picker page leads back with code, state and iss, its token endpoint wants the client and
// the PKCE verifier, and its ID token verifies and reads as a teacher by the claim rule. Loopback only (emulator flag).
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.FUNCTIONS_EMULATOR = "true";
const { startOidc } = await import("../../scripts/local/oidc.mjs" as string);
const { checkDiscovery, checkIdentity, readClaims, validateConfig } = await import("../src/ssoCore");
const { fetchDiscovery, resetFetchState, SsoFetchError, tokenRequest, verifyIdToken } = await import("../src/ssoFetch");

let p: { issuer: string; clientId: string; clientSecret: string; close: () => void };
beforeAll(async () => { p = await startOidc({ port: 0 }); });
afterAll(() => { p.close(); resetFetchState(); delete process.env.FUNCTIONS_EMULATOR; });

const redirect = "http://127.0.0.1:5001/demo-darsi/europe-west1/ssoCallback/callback/o1";
async function codeFor(person: number, challenge: string) {
  const a = new URL(`${p.issuer}/authorize`);
  for (const [k, v] of Object.entries({ response_type: "code", client_id: p.clientId, redirect_uri: redirect, state: "st", nonce: "nn", code_challenge: challenge, code_challenge_method: "S256" })) a.searchParams.set(k, v);
  expect(await (await fetch(a)).text()).toContain("Tarek Nabil");
  const pick = await fetch(`${p.issuer}/authorize/pick`, { method: "POST", redirect: "manual", body: new URLSearchParams({ redirect_uri: redirect, state: "st", nonce: "nn", code_challenge: challenge, i: String(person) }) });
  return new URL(pick.headers.get("location")!);
}

describe("the stand-in school provider", () => {
  it("passes Darsi's checks from discovery to a verified teacher", async () => {
    expect(checkDiscovery(await fetchDiscovery(p.issuer), { issuer: p.issuer, preset: "oidc" }, true)).toMatchObject({ ok: true, pkce: "s256", issParam: true });
    const rules = { preset: "oidc", issuer: p.issuer, clientId: p.clientId, allowedDomains: ["school.test"], teacherRule: { kind: "claim", claim: "groups", value: "teachers" }, classClaim: "class" };
    expect(validateConfig(rules, Date.now(), true).ok).toBe(true);
    const verifier = randomBytes(32).toString("base64url"), challenge = createHash("sha256").update(verifier).digest("base64url");
    const back = await codeFor(2, challenge);
    expect([back.origin + back.pathname, back.searchParams.get("state"), back.searchParams.get("iss")]).toEqual([redirect, "st", p.issuer]);
    const { idToken } = await tokenRequest({ endpoint: `${p.issuer}/token`, clientId: p.clientId, clientSecret: p.clientSecret, authMethod: "basic", code: back.searchParams.get("code")!, redirectUri: redirect, codeVerifier: verifier });
    const { payload } = await verifyIdToken(idToken, { issuer: p.issuer, clientId: p.clientId, jwksUrl: `${p.issuer}/jwks`, nonce: "nn" });
    const cfg = { issuer: p.issuer, allowedDomains: ["school.test"], openToAll: false, emailsVerifiedBySchool: false, teacherRule: { kind: "claim" as const, claim: "groups", value: "teachers" }, classClaim: "class" };
    const id = readClaims(cfg, payload as Record<string, unknown>, true);
    expect(id).toMatchObject({ subject: "stand-in-tarek", email: "tarek@school.test", emailVerified: true, teacher: true });
    expect(checkIdentity(cfg, id, true)).toEqual({ ok: true });
  });

  it("wants the right client and verifier, and a code only once", async () => {
    const verifier = randomBytes(32).toString("base64url"), challenge = createHash("sha256").update(verifier).digest("base64url");
    const code = (await codeFor(0, challenge)).searchParams.get("code")!;
    const ask = (o: Partial<{ clientSecret: string; codeVerifier: string; authMethod: "basic" | "post" }>) => tokenRequest({ endpoint: `${p.issuer}/token`, clientId: p.clientId, clientSecret: o.clientSecret ?? p.clientSecret, authMethod: o.authMethod ?? "post", code, redirectUri: redirect, codeVerifier: o.codeVerifier ?? verifier });
    await expect(ask({ clientSecret: "wrong" })).rejects.toMatchObject({ code: "status", oauth: { error: "invalid_client" } });
    await expect(ask({ codeVerifier: randomBytes(32).toString("base64url") })).rejects.toBeInstanceOf(SsoFetchError); // the code is spent by the try
    await expect(ask({})).rejects.toMatchObject({ oauth: { error: "invalid_grant" } });
  });
});
