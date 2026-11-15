// School sign-in's pure decisions (src/ssoCore.ts, src/ssoProviders.ts; design §3 to §6, §9, §11): issuer rules,
// configuration, reading and checking tokens per provider, who a sign-in becomes, discovery, slugs and addresses.
import { describe, expect, it } from "vitest";
import {
  SSO_REFUSALS, acceptedIssuers, buildAuthorizationUrl, callbackUrl, checkDiscovery, checkIdentity, decideLink, decideSignIn, defaultCeiling,
  endpointsMoved, identityId, isSlug, jitAllowed, jitCount, jitHourlyLimit, jitKey, jitStale, hourOf, promptFor, providerKind, readClaims, returnUrl, rulesFor,
  slugify, testOutcome, tokenHost, validateConfig,
  type AccountFacts, type Identity, type IdentityConfig, type MappingFacts, type SignInInputs,
} from "../src/ssoCore";
import { GOOGLE_ENDPOINTS, PRESETS, PRESET_INFO, discoveryUrl, issuerCandidates, microsoftEndpoints, microsoftIssuer } from "../src/ssoProviders";

const NOW = Date.UTC(2026, 10, 11, 12);
const T = "3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c";
const MSA = "9188040d-6c67-4c5b-b112-36a304b66dad";
const OID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

describe("refusal codes", () => {
  it("is the closed list of design §11, each once", () => {
    expect(SSO_REFUSALS).toHaveLength(32);
    expect(new Set(SSO_REFUSALS).size).toBe(32);
    for (const c of ["sso-off", "sso-state", "sso-connect-first", "sso-full", "sso-key", "sso-update", "sso-own-login"]) expect(SSO_REFUSALS).toContain(c);
  });
});

describe("issuer rules come from the issuer, not the preset", () => {
  it("knows Google in both forms", () => {
    expect(rulesFor("https://accounts.google.com").kind).toBe("google");
    expect(rulesFor("accounts.google.com").kind).toBe("google");
    expect(acceptedIssuers("https://accounts.google.com")).toEqual(["https://accounts.google.com", "accounts.google.com"]);
    expect(acceptedIssuers("https://idp.school.edu")).toEqual(["https://idp.school.edu"]);
  });

  it("takes Microsoft's tenant from the issuer and refuses the shared ones", () => {
    expect(rulesFor(microsoftIssuer(T))).toEqual({ kind: "microsoft", tenant: T });
    expect(rulesFor(`https://sts.windows.net/${T}/`)).toEqual({ kind: "microsoft", tenant: T });
    for (const t of ["common", "organizations", "consumers", MSA, "f8cdef31-a31e-4b4a-93e4-5f571e91255a", "school.onmicrosoft.com", ""]) {
      expect(rulesFor(`https://login.microsoftonline.com/${t}/v2.0`), t).toEqual({ kind: "refused", why: "tenant" });
    }
  });

  it("refuses consumer issuers and bad addresses, and treats any other issuer as generic", () => {
    expect(rulesFor("https://appleid.apple.com")).toEqual({ kind: "refused", why: "shared" });
    expect(rulesFor("https://www.facebook.com")).toEqual({ kind: "refused", why: "shared" });
    for (const bad of ["http://idp.school.edu", "https://idp.school.edu?x=1", "https://idp.school.edu#x", "https://u:p@idp.school.edu", "https://127.0.0.1:4797", "nope", 7, null]) {
      expect(rulesFor(bad), String(bad)).toEqual({ kind: "refused", why: "url" });
    }
    expect(rulesFor("https://school.okta.com/oauth2/default")).toEqual({ kind: "generic" });
    expect(rulesFor("http://127.0.0.1:4797", true)).toEqual({ kind: "generic" });
  });
});

describe("providers", () => {
  it("has five presets with constant endpoints only for Google and Microsoft", () => {
    expect(PRESETS).toEqual(["google", "microsoft", "okta", "keycloak", "oidc"]);
    expect(PRESETS.filter((p) => PRESET_INFO[p].constantEndpoints)).toEqual(["google", "microsoft"]);
    expect(microsoftEndpoints(T).token).toBe(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`);
    expect(discoveryUrl("https://idp.school.edu/")).toBe("https://idp.school.edu/.well-known/openid-configuration");
    expect(issuerCandidates("keycloak", { domain: "kc.school.edu", realm: "pupils" })).toEqual(["https://kc.school.edu/realms/pupils", "https://kc.school.edu/auth/realms/pupils"]);
    expect(issuerCandidates("okta", { domain: "school.okta.com", oktaServer: "default" })).toEqual(["https://school.okta.com/oauth2/default"]);
    expect(issuerCandidates("okta", { domain: "school.okta.com" })).toEqual(["https://school.okta.com"]);
  });
});

describe("validateConfig", () => {
  const google = { preset: "google", clientId: "123-abc.apps.googleusercontent.com", allowedDomains: ["school.edu"] };
  const ms = { preset: "microsoft", tenant: T, clientId: OID };
  const okta = { preset: "okta", domain: "school.okta.com", clientId: "0oa1", allowedDomains: ["school.edu"] };
  const field = (v: unknown, emulator = false) => { const r = validateConfig(v, NOW, emulator); return r.ok ? "ok" : `${r.code}:${r.field}`; };

  it("accepts a minimal Google, Microsoft and Okta configuration with the defaults", () => {
    const g = validateConfig(google, NOW);
    expect(g).toMatchObject({ ok: true, fields: { preset: "google", subjectKind: "sub", scopes: ["openid", "email", "profile"], maxSessionDays: 30, personalDevices: false, openToAll: false, issuerCandidates: ["https://accounts.google.com"] } });
    expect(validateConfig(ms, NOW)).toMatchObject({ ok: true, fields: { subjectKind: "tid-oid", issuerCandidates: [microsoftIssuer(T)], allowedDomains: [] } });
    expect(field(okta)).toBe("ok");
  });

  it("requires Google's domains and client form, Microsoft's tenant GUID, and refuses shared tenants", () => {
    expect(field({ ...google, allowedDomains: [] })).toBe("sso-fields:allowedDomains");
    expect(field({ ...google, clientId: "abc" })).toBe("sso-fields:clientId");
    expect(field({ ...ms, tenant: "common" })).toBe("sso-fields:tenant");
    expect(field({ ...ms, tenant: MSA })).toBe("sso-issuer:tenant");
    expect(field({ ...ms, clientId: "darsi" })).toBe("sso-fields:clientId");
  });

  it("follows the issuer's rules under 'Other' and refuses shared issuers", () => {
    expect(field({ preset: "oidc", issuer: "https://accounts.google.com", clientId: "x" })).toBe("sso-fields:allowedDomains");
    expect(field({ preset: "oidc", issuer: "https://appleid.apple.com", clientId: "x", openToAll: true })).toBe("sso-issuer:issuer");
    expect(field({ preset: "oidc", issuer: `https://login.microsoftonline.com/common/v2.0`, clientId: "x" })).toBe("sso-issuer:issuer");
    expect(field({ preset: "oidc", issuer: "http://idp.school.edu", clientId: "x", openToAll: true })).toBe("sso-fields:issuer");
    expect(field({ preset: "oidc", issuer: "http://127.0.0.1:4797", clientId: "x", openToAll: true }, true)).toBe("ok");
  });

  it("never opens a generic connection to everyone by default", () => {
    expect(field({ ...okta, allowedDomains: [] })).toBe("sso-fields:openToAll");
    expect(field({ ...okta, allowedDomains: [], openToAll: "yes" })).toBe("sso-fields:openToAll");
    expect(validateConfig({ ...okta, allowedDomains: [], openToAll: true }, NOW)).toMatchObject({ ok: true, fields: { openToAll: true } });
    // Google and Microsoft can never be open to all, and the school can't vouch for their addresses.
    expect(validateConfig({ ...ms, openToAll: true, emailsVerifiedBySchool: true }, NOW)).toMatchObject({ ok: true, fields: { openToAll: false, emailsVerifiedBySchool: false } });
  });

  it("checks domains, scopes, session length, devices and the secret's expiry", () => {
    expect(field({ ...okta, allowedDomains: ["gmail.com"] })).toBe("sso-fields:allowedDomains");
    expect(field({ ...okta, allowedDomains: ["*.school.edu"] })).toBe("sso-fields:allowedDomains");
    expect(field({ ...okta, allowedDomains: Array.from({ length: 51 }, (_, i) => `s${i}.edu`) })).toBe("sso-fields:allowedDomains");
    expect(validateConfig({ ...okta, allowedDomains: ["School.EDU", "school.edu"] }, NOW)).toMatchObject({ ok: true, fields: { allowedDomains: ["school.edu"] } });
    expect(field({ ...okta, scopes: ["offline_access"] })).toBe("sso-fields:scopes");
    expect(field({ ...okta, scopes: ["admin"] })).toBe("sso-fields:scopes");
    for (const d of [0, 91, 1.5, "30"]) expect(field({ ...okta, maxSessionDays: d })).toBe("sso-fields:maxSessionDays");
    for (const d of [1, 90]) expect(validateConfig({ ...okta, maxSessionDays: d }, NOW)).toMatchObject({ ok: true, fields: { maxSessionDays: d } });
    expect(field({ ...okta, personalDevices: "no" })).toBe("sso-fields:personalDevices");
    expect(field({ ...okta, secretExpiresOn: "2027-02-30" })).toBe("sso-fields:secretExpiresOn");
    expect(field({ ...okta, secretExpiresOn: "2040-01-01" })).toBe("sso-fields:secretExpiresOn");
    expect(field({ ...okta, secretExpiresOn: "2027-05-11" })).toBe("ok");
    expect(field({ ...okta, domain: "school.okta.com:99999" })).toBe("sso-fields:domain");
    expect(field({ preset: "keycloak", domain: "kc.school.edu:8443", realm: "a b", clientId: "x", openToAll: true })).toBe("sso-fields:realm");
    expect(field({ preset: "nope" })).toBe("sso-fields:preset");
  });

  it("accepts the teacher rule shapes each provider can fill in, and nothing else", () => {
    expect(validateConfig({ ...google, teacherRule: { kind: "email", domains: ["staff.school.edu"], emails: ["Head@School.edu"] } }, NOW))
      .toMatchObject({ ok: true, fields: { teacherRule: { kind: "email", domains: ["staff.school.edu"], emails: ["head@school.edu"] } } });
    expect(field({ ...google, teacherRule: { kind: "email", domains: [], emails: [] } })).toBe("sso-fields:teacherRule");
    expect(field({ ...google, teacherRule: { kind: "claim", claim: "groups", value: "t" } })).toBe("sso-fields:teacherRule");
    expect(field({ ...google, teacherRule: { kind: "email", emails: Array.from({ length: 501 }, (_, i) => `t${i}@school.edu`) } })).toBe("sso-fields:teacherRule");
    expect(field({ ...ms, teacherRule: { kind: "role", value: "Teacher" } })).toBe("ok");
    expect(field({ ...ms, teacherRule: { kind: "group", value: OID.toUpperCase() } })).toBe("ok");
    expect(field({ ...ms, teacherRule: { kind: "group", value: "Teachers" } })).toBe("sso-fields:teacherRule");
    expect(validateConfig({ ...okta, teacherRule: { kind: "claim", claim: "groups", value: "/teachers" } }, NOW))
      .toMatchObject({ ok: true, fields: { teacherRule: { kind: "claim", claim: "groups", value: "teachers" }, scopes: ["openid", "email", "profile", "groups"] } });
    expect(field({ ...okta, teacherRule: { kind: "claim", claim: "email", value: "x" } })).toBe("sso-fields:teacherRule");
    expect(field({ ...okta, teacherRule: { kind: "claim", claim: "groups", value: "a‮b" } })).toBe("sso-fields:teacherRule");
    expect(field({ ...okta, classClaim: "sub" })).toBe("sso-fields:classClaim");
    expect(field({ ...okta, classClaim: "class" })).toBe("ok");
  });
});

const cfg = (over: Partial<IdentityConfig> = {}): IdentityConfig => ({
  issuer: "https://accounts.google.com", allowedDomains: ["school.edu"], openToAll: false, emailsVerifiedBySchool: false, teacherRule: null, classClaim: null, ...over,
});
const read = (c: IdentityConfig, p: Record<string, unknown>) => { const id = readClaims(c, p); return { id, check: checkIdentity(c, id) }; };

describe("Google tokens", () => {
  const ok = { sub: "1001", email: "Amina@School.edu", email_verified: true, hd: "school.edu", name: "Amina ‮A" };
  it("admits a verified address of a listed hosted domain", () => {
    const { id, check } = read(cfg(), ok);
    expect(check).toEqual({ ok: true });
    expect(id).toMatchObject({ subject: "1001", subjectKind: "sub", email: "amina@school.edu", emailVerified: true, hd: "school.edu", name: "Amina A", tid: null });
    expect(id.claimsSeen).toEqual(expect.arrayContaining(["email", "email_verified", "hd", "name"]));
  });
  it("refuses a missing or unlisted hd, an unverified address, and an address outside hd", () => {
    expect(read(cfg(), { ...ok, hd: undefined }).check).toEqual({ ok: false, code: "sso-domain" });
    expect(read(cfg(), { ...ok, hd: "other.edu" }).check).toEqual({ ok: false, code: "sso-domain" });
    expect(read(cfg(), { ...ok, email_verified: false }).check).toEqual({ ok: false, code: "sso-email" });
    expect(read(cfg(), { ...ok, email_verified: "true" }).check).toEqual({ ok: false, code: "sso-email" });
    expect(read(cfg(), { ...ok, email: "amina@gmail.com" }).check).toEqual({ ok: false, code: "sso-domain" });
    expect(read(cfg({ allowedDomains: [] }), ok).check).toEqual({ ok: false, code: "sso-domain" });
    expect(read(cfg(), { ...ok, sub: undefined }).check).toEqual({ ok: false, code: "sso-token" });
  });
  it("reads the email teacher rule only on a verified address", () => {
    const c = cfg({ teacherRule: { kind: "email", domains: [], emails: ["amina@school.edu"] } });
    expect(read(c, ok).id.teacher).toBe(true);
    expect(read(c, { ...ok, email: "omar@school.edu" }).id.teacher).toBe(false);
    expect(read(c, { ...ok, email_verified: false }).id.teacher).toBe(null);
  });
});

describe("Microsoft tokens", () => {
  const c = cfg({ issuer: microsoftIssuer(T), allowedDomains: [] });
  const ok = { sub: "pairwise", tid: T, oid: OID, preferred_username: "Amina@School.edu", name: "Amina" };
  it("keys the person on tid:oid and uses preferred_username when there is no email", () => {
    const { id, check } = read(c, ok);
    expect(check).toEqual({ ok: true });
    expect(id).toMatchObject({ subject: `${T}:${OID}`, subjectKind: "tid-oid", email: "amina@school.edu", emailVerified: false, upn: "amina@school.edu", hd: null });
  });
  it("counts an email as verified only with xms_edov", () => {
    expect(read(c, { ...ok, email: "a@school.edu", xms_edov: true }).id).toMatchObject({ email: "a@school.edu", emailVerified: true });
    expect(read(c, { ...ok, email: "a@school.edu" }).id.emailVerified).toBe(false);
    expect(read(c, { ...ok, xms_edov: true }).id.emailVerified).toBe(false);
  });
  it("refuses another tenant's token, a missing oid, and an unlisted UPN domain", () => {
    expect(read(c, { ...ok, tid: MSA }).check).toEqual({ ok: false, code: "sso-issuer" });
    expect(read(c, { ...ok, oid: undefined }).check).toEqual({ ok: false, code: "sso-token" });
    const listed = cfg({ issuer: microsoftIssuer(T), allowedDomains: ["school.edu"] });
    expect(read(listed, ok).check).toEqual({ ok: true });
    // The domain check reads the tenant-verified UPN, never `email`.
    expect(read(listed, { ...ok, preferred_username: "a@other.edu", email: "a@school.edu" }).check).toEqual({ ok: false, code: "sso-domain" });
  });
  it("reads app roles and groups, and a groups overage is unknown", () => {
    expect(read(cfg({ ...c, teacherRule: { kind: "role", value: "Teacher" } }), { ...ok, roles: ["Teacher"] }).id).toMatchObject({ teacher: true, ruleValues: ["Teacher"] });
    expect(read(cfg({ ...c, teacherRule: { kind: "role", value: "Teacher" } }), ok).id.teacher).toBe(null);
    const g = cfg({ ...c, teacherRule: { kind: "group", value: OID } });
    expect(read(g, { ...ok, groups: [OID.toUpperCase()] }).id.teacher).toBe(true);
    expect(read(g, { ...ok, groups: ["x"] }).id.teacher).toBe(false);
    expect(read(g, { ...ok, hasgroups: true }).id.teacher).toBe(null);
    expect(read(g, { ...ok, _claim_names: { groups: "src1" } }).id.teacher).toBe(null);
  });
  it("is refused under any preset when the issuer names a shared tenant", () => {
    const common = cfg({ issuer: "https://login.microsoftonline.com/common/v2.0", allowedDomains: [] });
    expect(read(common, ok).check).toEqual({ ok: false, code: "sso-issuer" });
  });
});

describe("other providers", () => {
  const c = cfg({ issuer: "https://idp.school.edu", allowedDomains: ["school.edu"] });
  const ok = { sub: "u-1", email: "a@school.edu", email_verified: true };
  it("needs email_verified unless the school vouches for its addresses", () => {
    expect(read(c, ok).check).toEqual({ ok: true });
    expect(read(c, { ...ok, email_verified: undefined }).check).toEqual({ ok: false, code: "sso-email" });
    expect(read(cfg({ ...c, emailsVerifiedBySchool: true }), { ...ok, email_verified: undefined }).check).toEqual({ ok: true });
    expect(read(c, { ...ok, email: "a@else.edu" }).check).toEqual({ ok: false, code: "sso-domain" });
    expect(read(c, { sub: "u-1" }).check).toEqual({ ok: false, code: "sso-domain" });
  });
  it("admits anyone only when open to all was chosen", () => {
    expect(read(cfg({ issuer: "https://idp.school.edu", allowedDomains: [] }), { sub: "x" }).check).toEqual({ ok: false, code: "sso-domain" });
    expect(read(cfg({ issuer: "https://idp.school.edu", allowedDomains: [], openToAll: true }), { sub: "x" }).check).toEqual({ ok: true });
  });
  it("reads a claim rule (leading / ignored) and a short class name", () => {
    const r = cfg({ ...c, teacherRule: { kind: "claim", claim: "groups", value: "teachers" }, classClaim: "class" });
    expect(read(r, { ...ok, groups: ["/teachers", "/all"], class: "7B" }).id).toMatchObject({ teacher: true, cls: "7B", ruleValues: ["/teachers", "/all"] });
    expect(read(r, { ...ok, groups: "students", class: OID }).id).toMatchObject({ teacher: false, cls: null });
    expect(read(r, { ...ok, class: "x".repeat(41) }).id.cls).toBe(null);
    expect(read(r, { ...ok, class: ["7B"] }).id.cls).toBe(null);
    expect(read(r, ok).id.claimsSeen).not.toContain("groups");
  });
});

describe("identityId", () => {
  it("is the hex sha256 of org, connection and subject", () => {
    const a = identityId("org1", "c1", "s");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(identityId("org1", "c1", "s")).toBe(a);
    expect(identityId("org2", "c1", "s")).not.toBe(a);
    expect(identityId("org1", "c2", "s")).not.toBe(a);
    expect(() => identityId("org1", "c1", "a\nb")).toThrow();
    expect(() => identityId("org1", "c1", "")).toThrow();
  });
});

describe("slugs", () => {
  const fixed = () => 0;
  it("makes a Latin slug plus 4 random characters, 'school' for names without Latin letters or reserved ones", () => {
    expect(slugify("Cairo International School", fixed)).toBe("cairo-international-school-aaaa");
    expect(slugify("École Élémentaire", fixed)).toBe("ecole-elementaire-aaaa");
    expect(slugify("مدرسة النيل", fixed)).toBe("school-aaaa");
    expect(slugify("Admin", fixed)).toBe("school-aaaa");
    expect(slugify("SSO", fixed)).toBe("school-aaaa");
    const long = slugify("The Very Long Name Of A Wonderful International School", fixed);
    expect(long.length).toBeLessThanOrEqual(35);
    expect(long).toMatch(/^[a-z0-9-]+-aaaa$/);
    expect(isSlug(slugify("Nile Academy"))).toBe(true);
  });
  it("refuses reserved and malformed slugs a platform admin types", () => {
    for (const s of ["sso", "login", "auth", "admin", "www", "a--b", "-a", "A", "", "x".repeat(51)]) expect(isSlug(s), s).toBe(false);
    expect(isSlug("nile-academy")).toBe(true);
  });
});

// Entra's tenant discovery document (shape as served; it has no code_challenge_methods_supported).
const entraDoc = (t: string) => ({
  token_endpoint: `https://login.microsoftonline.com/${t}/oauth2/v2.0/token`,
  token_endpoint_auth_methods_supported: ["client_secret_post", "private_key_jwt", "client_secret_basic"],
  jwks_uri: `https://login.microsoftonline.com/${t}/discovery/v2.0/keys`,
  response_modes_supported: ["query", "fragment", "form_post"], subject_types_supported: ["pairwise"],
  id_token_signing_alg_values_supported: ["RS256"], response_types_supported: ["code", "id_token", "code id_token", "id_token token"],
  scopes_supported: ["openid", "profile", "email", "offline_access"], issuer: `https://login.microsoftonline.com/${t}/v2.0`,
  request_uri_parameter_supported: false, userinfo_endpoint: "https://graph.microsoft.com/oidc/userinfo",
  authorization_endpoint: `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`,
  device_authorization_endpoint: `https://login.microsoftonline.com/${t}/oauth2/v2.0/devicecode`,
  http_logout_supported: true, frontchannel_logout_supported: true, end_session_endpoint: `https://login.microsoftonline.com/${t}/oauth2/v2.0/logout`,
  claims_supported: ["sub", "iss", "aud", "exp", "iat", "auth_time", "acr", "nonce", "preferred_username", "name", "tid", "ver", "at_hash", "c_hash", "email"],
  tenant_region_scope: "EU", cloud_instance_name: "microsoftonline.com", cloud_graph_host_name: "graph.windows.net", msgraph_host: "graph.microsoft.com",
});
const googleDoc = {
  issuer: "https://accounts.google.com", authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  token_endpoint: "https://oauth2.googleapis.com/token", jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
  response_types_supported: ["code", "token", "id_token", "code token", "code id_token", "token id_token", "code token id_token", "none"],
  subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"], scopes_supported: ["openid", "email", "profile"],
  token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"], code_challenge_methods_supported: ["plain", "S256"],
  authorization_response_iss_parameter_supported: true,
};
const kc = "https://kc.school.edu/realms/pupils";
const kcDoc = {
  issuer: kc, authorization_endpoint: `${kc}/protocol/openid-connect/auth`, token_endpoint: `${kc}/protocol/openid-connect/token`,
  jwks_uri: `${kc}/protocol/openid-connect/certs`, end_session_endpoint: `${kc}/protocol/openid-connect/logout`,
  id_token_signing_alg_values_supported: ["PS384", "ES384", "RS384", "HS256", "RS256", "ES256", "PS256"],
  token_endpoint_auth_methods_supported: ["private_key_jwt", "client_secret_basic", "client_secret_post", "tls_client_auth", "client_secret_jwt"],
  code_challenge_methods_supported: ["plain", "S256"], response_types_supported: ["code", "none"], authorization_response_iss_parameter_supported: true,
};

describe("discovery", () => {
  it("passes Entra's document without code_challenge_methods_supported, keeping the constant endpoints", () => {
    const r = checkDiscovery(entraDoc(T), { issuer: microsoftIssuer(T), preset: "microsoft", tenant: T });
    expect(r).toEqual({ ok: true, endpoints: microsoftEndpoints(T), pkce: "unadvertised", issParam: false, authMethods: ["basic", "post"], authMethod: "basic", algs: ["RS256"] });
  });

  it("passes Google's document, with the iss parameter", () => {
    expect(checkDiscovery(googleDoc, { issuer: "https://accounts.google.com", preset: "google" }))
      .toMatchObject({ ok: true, endpoints: GOOGLE_ENDPOINTS, pkce: "s256", issParam: true });
  });

  it("reads a generic document: endpoints, algorithms Darsi accepts, end session", () => {
    expect(checkDiscovery(kcDoc, { issuer: kc, preset: "keycloak" })).toMatchObject({
      ok: true, pkce: "s256", algs: ["RS256", "PS256", "ES256"], authMethod: "basic", endpoints: { token: `${kc}/protocol/openid-connect/token`, endSession: `${kc}/protocol/openid-connect/logout` },
    });
  });

  it("names what is wrong", () => {
    const want = { issuer: kc, preset: "keycloak" as const };
    expect(checkDiscovery({ ...kcDoc, issuer: "https://kc.school.edu/auth/realms/pupils" }, want))
      .toEqual({ ok: false, code: "sso-discovery", hint: "issuer-mismatch", got: "https://kc.school.edu/auth/realms/pupils", want: kc });
    expect(checkDiscovery({ ...kcDoc, code_challenge_methods_supported: ["plain"] }, want)).toMatchObject({ ok: false, hint: "pkce" });
    expect(checkDiscovery({ ...kcDoc, token_endpoint: "http://kc.school.edu/token" }, want)).toMatchObject({ ok: false, hint: "endpoint" });
    expect(checkDiscovery({ ...kcDoc, jwks_uri: undefined }, want)).toMatchObject({ ok: false, hint: "endpoint" });
    expect(checkDiscovery({ ...kcDoc, id_token_signing_alg_values_supported: ["HS256", "none"] }, want)).toMatchObject({ ok: false, hint: "alg" });
    expect(checkDiscovery({ ...kcDoc, token_endpoint_auth_methods_supported: ["private_key_jwt"] }, want)).toMatchObject({ ok: false, hint: "auth-method" });
    expect(checkDiscovery({ ...kcDoc, response_types_supported: ["id_token"] }, want)).toMatchObject({ ok: false, hint: "response-type" });
    expect(checkDiscovery([], want)).toMatchObject({ ok: false, hint: "document" });
    expect(checkDiscovery({ ...googleDoc, token_endpoint: "https://tokens.example.com/token" }, { issuer: "https://accounts.google.com", preset: "google" }))
      .toMatchObject({ ok: false, hint: "constants", got: "https://tokens.example.com" });
    expect(checkDiscovery({ ...entraDoc(MSA) }, { issuer: microsoftIssuer(MSA), preset: "oidc" })).toMatchObject({ ok: false, code: "sso-issuer" });
  });

  it("reports endpoints whose origin moved, and lets a path change on the same origin through", () => {
    const tested = microsoftEndpoints(T);
    expect(endpointsMoved(tested, { ...tested, token: tested.token.replace("v2.0/token", "v3/token") })).toEqual([]);
    expect(endpointsMoved(tested, { ...tested, jwks: "https://keys.example.com/k" })).toEqual(["jwks"]);
    expect(endpointsMoved(tested, { ...tested, endSession: "https://other.example/logout" })).toEqual(["endSession"]);
    expect(tokenHost(tested)).toBe("login.microsoftonline.com");
  });
});

describe("start and return addresses", () => {
  it("chooses the prompt per mode and provider", () => {
    const p = (mode: "signin" | "link" | "test", kind: "google" | "microsoft" | "other", personalDevices = false, signedOutHere = false) => promptFor({ mode, kind, personalDevices, signedOutHere });
    expect(p("link", "microsoft")).toEqual({ prompt: "login", maxAge0: false });
    expect(p("link", "google")).toEqual({ prompt: "select_account", maxAge0: true });
    expect(p("test", "other")).toEqual({ prompt: "login", maxAge0: false });
    expect(p("signin", "google")).toEqual({ prompt: "select_account", maxAge0: false });
    expect(p("signin", "microsoft", true)).toEqual({ prompt: null, maxAge0: false });
    expect(p("signin", "other")).toEqual({ prompt: null, maxAge0: false });
    expect(p("signin", "other", false, true)).toEqual({ prompt: "login", maxAge0: false });
    expect(providerKind(microsoftIssuer(T))).toBe("microsoft");
    expect(providerKind("https://idp.school.edu")).toBe("other");
  });

  it("builds the authorization address with every parameter, keeping the endpoint's own query", () => {
    const u = new URL(buildAuthorizationUrl({
      authorization: "https://idp.school.edu/auth?tenant=x", clientId: "c", redirectUri: callbackUrl("https://login.darsiai.org/callback/", "org1"),
      scopes: ["openid", "email"], state: "s", nonce: "n", challenge: "ch", kind: "microsoft", prompt: "login", maxAge0: false,
    }));
    expect(Object.fromEntries(u.searchParams)).toEqual({
      tenant: "x", response_type: "code", client_id: "c", redirect_uri: "https://login.darsiai.org/callback/org1", scope: "openid email", state: "s",
      nonce: "n", code_challenge: "ch", code_challenge_method: "S256", prompt: "login", response_mode: "query",
    });
    const g = new URL(buildAuthorizationUrl({ authorization: GOOGLE_ENDPOINTS.authorization, clientId: "c", redirectUri: "r", scopes: ["email"], state: "s", nonce: "n", challenge: "c", kind: "google", prompt: "select_account", maxAge0: true, hd: "school.edu" }));
    expect(g.searchParams.get("hd")).toBe("school.edu");
    expect(g.searchParams.get("max_age")).toBe("0");
    expect(g.searchParams.get("scope")).toBe("openid email");
    expect(() => callbackUrl("https://login.darsiai.org/callback", "../x")).toThrow();
  });

  it("returns to a constant path on exactly the start's origin", () => {
    const base = { returnOrigin: "https://learn.school.edu", orgId: "org1", platformAdmin: false, flow: "abcd1234" };
    expect(returnUrl({ ...base, mode: "signin", ticket: "k1.iv.ct" })).toBe("https://learn.school.edu/signin#sso=k1.iv.ct&f=abcd1234");
    expect(returnUrl({ ...base, mode: "link", error: "sso-state" })).toBe("https://learn.school.edu/me#sso_error=sso-state&f=abcd1234");
    expect(returnUrl({ ...base, mode: "test", ticket: "t" })).toBe("https://learn.school.edu/admin?tab=signin#sso=t&f=abcd1234");
    expect(returnUrl({ ...base, mode: "test", platformAdmin: true, ticket: "t" })).toBe("https://learn.school.edu/super/orgs/org1?tab=signin#sso=t&f=abcd1234");
    // A student's test (a test link, no sign-in) goes back to the page the link opened, with the same fragment.
    expect(returnUrl({ ...base, mode: "test", studentTest: true, ticket: "t" })).toBe("https://learn.school.edu/signin#sso=t&f=abcd1234");
    expect(returnUrl({ ...base, mode: "test", studentTest: true, error: "sso-domain", detail: "gmail.com" })).toBe("https://learn.school.edu/signin#sso_error=sso-domain&d=gmail.com&f=abcd1234");
    // Only a test's: the flag changes nothing for a sign-in or a link.
    expect(returnUrl({ ...base, mode: "link", studentTest: true, ticket: "t" })).toBe("https://learn.school.edu/me#sso=t&f=abcd1234");
    expect(returnUrl({ ...base, returnOrigin: "https://learn.school.edu/x", mode: "signin", ticket: "t" })).toBe(null);
    expect(returnUrl({ ...base, returnOrigin: "not a url", mode: "signin", ticket: "t" })).toBe(null);
  });
});

describe("JIT allowance", () => {
  it("allows max(200, a quarter of the members) an hour, within the ceiling", () => {
    expect(jitHourlyLimit(0)).toBe(200);
    expect(jitHourlyLimit(2000)).toBe(500);
    expect(defaultCeiling(100)).toBe(150);
    expect(defaultCeiling(null)).toBe(2000);
    expect(jitAllowed({ hourCount: 199, memberCount: 10, ceiling: 2000 })).toBe(true);
    expect(jitAllowed({ hourCount: 200, memberCount: 10, ceiling: 2000 })).toBe(false);
    expect(jitAllowed({ hourCount: 0, memberCount: 150, ceiling: 150 })).toBe(false);
    expect(jitAllowed({ hourCount: 0, memberCount: 149, ceiling: 150 })).toBe(true);
    // One counter per hour (`h<hour>`), so a sign-in raises it without reading it.
    expect(jitKey(NOW)).toBe(`h${hourOf(NOW)}`);
    expect(jitCount({ [jitKey(NOW)]: 7 }, NOW)).toBe(7);
    expect(jitCount({ [jitKey(NOW - 3600_000)]: 7 }, NOW)).toBe(0);
    expect(jitCount({ hour: hourOf(NOW), n: 7 }, NOW)).toBe(0); // the shape before the counters were per hour
    expect(jitCount({ [jitKey(NOW)]: "7" }, NOW)).toBe(0);
    expect(jitCount(undefined, NOW)).toBe(0);
    // The daily job deletes every hour but this one and the last.
    expect(jitStale({ [jitKey(NOW)]: 1, [jitKey(NOW - 3600_000)]: 2, [jitKey(NOW - 7200_000)]: 3, hour: 1, n: 2 }, NOW).sort()).toEqual([jitKey(NOW - 7200_000), "hour", "n"].sort());
    expect(jitStale(undefined, NOW)).toEqual([]);
  });
});

// ---- who a sign-in becomes ----

const ident = (over: Partial<Identity> = {}): Identity => ({
  subject: "s1", subjectKind: "sub", email: "amina@school.edu", emailVerified: true, upn: null, name: "Amina", hd: "school.edu", tid: null, oid: null,
  teacher: null, cls: null, claimsSeen: [], ruleValues: [], ...over,
});
const account = (over: Partial<AccountFacts> = {}, profile: AccountFacts["profile"] = {}): AccountFacts => ({
  uid: "u1", authExists: true, disabled: false, authEmail: "amina@school.edu", lastSignInTime: "Tue, 10 Nov 2026 10:00:00 GMT",
  claims: { role: "student", orgId: "org1" }, ...over,
  profile: { role: "student", orgId: "org1", createdBy: null, sso: true, mustChangePassword: false, ...profile },
});
const mapping = (over: Partial<MappingFacts> = {}): MappingFacts => ({
  uid: "u1", linked: "jit", state: "active", pending: false, createdAt: NOW - 86_400_000, lastAt: NOW - 3600_000, account: account(), ...over,
});
const inputs = (over: Partial<SignInInputs> = {}): SignInInputs => ({
  orgId: "org1", now: NOW, identity: ident(), mapping: null, emailAccount: null, emailMember: false, removed: false,
  allowance: { hourCount: 0, memberCount: 10, ceiling: 2000 }, ...over,
});

describe("decideSignIn: a mapped identity", () => {
  it("signs in, touching lastAt only once a day, and raises a student to teacher (never lowers)", () => {
    expect(decideSignIn(inputs({ mapping: mapping() }))).toEqual({ kind: "signin", uid: "u1", raise: false, touch: false });
    expect(decideSignIn(inputs({ mapping: mapping({ lastAt: NOW - 25 * 3600_000 }) }))).toMatchObject({ kind: "signin", touch: true });
    expect(decideSignIn(inputs({ mapping: mapping(), identity: ident({ teacher: true }) }))).toMatchObject({ kind: "signin", raise: true });
    const teacher = mapping({ account: account({ claims: { role: "teacher", orgId: "org1" } }, { role: "teacher" }) });
    expect(decideSignIn(inputs({ mapping: teacher, identity: ident({ teacher: false }) }))).toMatchObject({ kind: "signin", raise: false });
  });

  it("refuses blocked, removed, disabled and platform admins", () => {
    expect(decideSignIn(inputs({ mapping: mapping({ state: "blocked" }) }))).toMatchObject({ kind: "refuse", code: "sso-disabled" });
    expect(decideSignIn(inputs({ mapping: mapping({ state: "removed" }) }))).toMatchObject({ kind: "refuse", code: "sso-removed" });
    expect(decideSignIn(inputs({ mapping: mapping({ account: account({ disabled: true }) }) }))).toMatchObject({ kind: "refuse", code: "sso-disabled" });
    expect(decideSignIn(inputs({ mapping: mapping({ linked: "self", account: account({ claims: { role: "superadmin" } }, { role: "superadmin", orgId: null }) }) })))
      .toMatchObject({ kind: "refuse", code: "sso-staff" });
    expect(decideSignIn(inputs({ mapping: mapping({ account: account({}, { role: "superadmin" }) }) }))).toMatchObject({ kind: "refuse", code: "sso-staff" });
  });

  it("refuses (and logs) when claims and profile disagree", () => {
    expect(decideSignIn(inputs({ mapping: mapping({ account: account({ claims: { role: "teacher", orgId: "org1" } }) }) })))
      .toEqual({ kind: "refuse", code: "sso-other-org", dropMapping: false, log: "claims-profile" });
    expect(decideSignIn(inputs({ mapping: mapping({ account: account({ claims: { role: "student", orgId: "org2" } }) }) })))
      .toMatchObject({ kind: "refuse", code: "sso-other-org", log: "claims-profile" });
  });

  it("waits for a creation under a minute old, and finishes an older one with the same uid", () => {
    expect(decideSignIn(inputs({ mapping: mapping({ pending: true, createdAt: NOW - 10_000 }) }))).toEqual({ kind: "wait" });
    expect(decideSignIn(inputs({ mapping: mapping({ pending: true, createdAt: NOW - 61_000, account: account({ authExists: false }) }) })))
      .toEqual({ kind: "jit", uid: "u1", resume: true, role: "student", group: null, dropMapping: false });
    expect(decideSignIn(inputs({ removed: true, mapping: mapping({ pending: true, createdAt: NOW - 61_000 }) }))).toMatchObject({ kind: "refuse", code: "sso-removed" });
  });

  it("does not re-admit a school-made account that left; drops other stale mappings and goes on as unmapped", () => {
    const left = account({ claims: { role: "learner" } }, { role: "learner", orgId: null });
    expect(decideSignIn(inputs({ mapping: mapping({ account: left }) }))).toMatchObject({ kind: "refuse", code: "sso-removed" });
    expect(decideSignIn(inputs({ mapping: mapping({ linked: "self", account: left }) }))).toEqual({ kind: "jit", uid: null, resume: false, role: "student", group: null, dropMapping: true });
    expect(decideSignIn(inputs({ mapping: mapping({ account: account({ authExists: false }) }) }))).toMatchObject({ kind: "jit", uid: null, dropMapping: true });
  });
});

describe("decideSignIn: an account the organization made", () => {
  const orgMade = (over: Partial<AccountFacts> = {}, profile: AccountFacts["profile"] = {}) => ({
    ...account({ uid: "m1", lastSignInTime: null, ...over }, { createdBy: "admin1", sso: null, mustChangePassword: true, ...profile }), hasIdentity: false,
  });

  it("links it while it is still on the handed-out credential and the verified address is its own", () => {
    expect(decideSignIn(inputs({ emailAccount: orgMade() }))).toEqual({ kind: "link-org-made", uid: "m1", dropMapping: false, raise: false });
    expect(decideSignIn(inputs({ emailAccount: orgMade({ lastSignInTime: "x" }) }))).toMatchObject({ kind: "link-org-made" });
    expect(decideSignIn(inputs({ emailAccount: orgMade({}, { mustChangePassword: false }) }))).toMatchObject({ kind: "link-org-made" });
    expect(decideSignIn(inputs({ emailAccount: orgMade({ authEmail: "AMINA@school.edu" }), identity: ident({ teacher: true }) }))).toMatchObject({ kind: "link-org-made", raise: true });
  });

  it("asks them to connect from Me when any condition fails (and creates nothing)", () => {
    const cases: [string, ReturnType<typeof orgMade>, Partial<Identity>?][] = [
      ["signed in and changed password", orgMade({ lastSignInTime: "x" }, { mustChangePassword: false })],
      ["unverified address", orgMade(), { emailVerified: false }],
      ["made by sso", orgMade({}, { createdBy: "sso" })],
      ["not made by an admin", orgMade({}, { createdBy: null })],
      ["org admin", orgMade({ claims: { role: "orgAdmin", orgId: "org1" } }, { role: "orgAdmin" })],
      ["already has an identity", { ...orgMade(), hasIdentity: true }],
      ["disabled", orgMade({ disabled: true })],
      ["claims in another org", orgMade({ claims: { role: "student", orgId: "org2" } })],
    ];
    for (const [why, e, id] of cases) expect(decideSignIn(inputs({ emailAccount: e, identity: ident(id) })), why).toMatchObject({ kind: "refuse", code: "sso-connect-first" });
  });

  it("never matches a username login, and leaves people of other organizations alone", () => {
    const user = orgMade({ authEmail: "amina@users.darsiai.org" });
    expect(decideSignIn(inputs({ emailAccount: user, identity: ident({ email: "amina@users.darsiai.org" }) }))).toMatchObject({ kind: "refuse", code: "sso-connect-first" });
    const other = orgMade({ claims: { role: "student", orgId: "org2" } }, { orgId: "org2" });
    expect(decideSignIn(inputs({ emailAccount: other }))).toMatchObject({ kind: "jit", uid: null });
  });
});

describe("decideSignIn: joining", () => {
  it("refuses an address another member holds", () => {
    expect(decideSignIn(inputs({ emailMember: true }))).toEqual({ kind: "refuse", code: "sso-connect-first", dropMapping: false });
  });
  it("refuses people the admin removed, and an organization at its allowance", () => {
    expect(decideSignIn(inputs({ removed: true }))).toMatchObject({ kind: "refuse", code: "sso-removed" });
    // The same verified address on an identity the organization removed or blocked (another subject, same connection): never a new account.
    expect(decideSignIn(inputs({ tombstone: "removed" }))).toMatchObject({ kind: "refuse", code: "sso-removed" });
    expect(decideSignIn(inputs({ tombstone: "blocked" }))).toMatchObject({ kind: "refuse", code: "sso-disabled" });
    expect(decideSignIn(inputs({ tombstone: "removed", mapping: mapping({ pending: true, createdAt: NOW - 61_000 }) }))).toMatchObject({ kind: "refuse", code: "sso-removed" });
    expect(decideSignIn(inputs({ tombstone: null }))).toMatchObject({ kind: "jit" });
    // Blocked is said as blocked also for someone still a member (their own profile holds the address), and before an
    // account the organization made is matched: never "connect it from Me", never a way round the block.
    expect(decideSignIn(inputs({ tombstone: "blocked", emailMember: true }))).toEqual({ kind: "refuse", code: "sso-disabled", dropMapping: false });
    const orgMade = { ...account({ uid: "m1", lastSignInTime: null }, { createdBy: "admin1", sso: null, mustChangePassword: true }), hasIdentity: false };
    expect(decideSignIn(inputs({ emailAccount: orgMade }))).toMatchObject({ kind: "link-org-made" });
    expect(decideSignIn(inputs({ tombstone: "blocked", emailAccount: orgMade }))).toMatchObject({ kind: "refuse", code: "sso-disabled" });
    // A removed one changes nothing for people who are members now: they connect from Me, or are matched, as before.
    expect(decideSignIn(inputs({ tombstone: "removed", emailMember: true }))).toMatchObject({ kind: "refuse", code: "sso-connect-first" });
    expect(decideSignIn(inputs({ tombstone: "removed", emailAccount: orgMade }))).toMatchObject({ kind: "link-org-made" });
    expect(decideSignIn(inputs({ allowance: { hourCount: 200, memberCount: 10, ceiling: 2000 } }))).toMatchObject({ kind: "refuse", code: "sso-full" });
    expect(decideSignIn(inputs({ allowance: { hourCount: 0, memberCount: 2000, ceiling: 2000 } }))).toMatchObject({ kind: "refuse", code: "sso-full" });
  });
  it("joins as a student, or a teacher by the rule, with the class", () => {
    expect(decideSignIn(inputs())).toEqual({ kind: "jit", uid: null, resume: false, role: "student", group: null, dropMapping: false });
    expect(decideSignIn(inputs({ identity: ident({ teacher: true, cls: "7B" }) }))).toMatchObject({ kind: "jit", role: "teacher", group: "7B" });
    expect(decideSignIn(inputs({ identity: ident({ teacher: null }) }))).toMatchObject({ kind: "jit", role: "student" });
  });
  it("words the test card's decision", () => {
    expect(testOutcome(decideSignIn(inputs()))).toBe("create-student");
    expect(testOutcome(decideSignIn(inputs({ identity: ident({ teacher: true }) })))).toBe("create-teacher");
    expect(testOutcome(decideSignIn(inputs({ emailMember: true })))).toBe("refuse:sso-connect-first");
    expect(testOutcome(decideSignIn(inputs({ mapping: mapping() })))).toBe("signin");
  });
});

describe("decideLink", () => {
  const caller = account({ uid: "me" }, { createdBy: null, sso: null });
  const base = { orgId: "org1", caller, identity: ident(), mapping: null, callerHasIdentity: false, heldByEmptyJit: false };
  it("links a member's own account (self, or org-made when the organization made it)", () => {
    expect(decideLink(base)).toEqual({ kind: "link", linked: "self", replace: null });
    expect(decideLink({ ...base, caller: account({ uid: "me" }, { createdBy: "admin1" }) })).toMatchObject({ kind: "link", linked: "org-made" });
  });
  it("refuses platform admins, other organizations and a second identity", () => {
    expect(decideLink({ ...base, caller: account({ uid: "me", claims: { role: "superadmin" } }, { role: "superadmin", orgId: null }) })).toEqual({ kind: "refuse", code: "sso-staff" });
    expect(decideLink({ ...base, caller: account({ uid: "me", claims: { role: "student", orgId: "org2" } }) })).toEqual({ kind: "refuse", code: "sso-other-org" });
    expect(decideLink({ ...base, callerHasIdentity: true })).toEqual({ kind: "refuse", code: "sso-linked" });
  });
  it("moves an identity off an empty school-made account, and refuses one in use", () => {
    const held = mapping({ uid: "jit1", account: account({ uid: "jit1" }, { createdBy: "sso" }) });
    expect(decideLink({ ...base, mapping: held, heldByEmptyJit: true })).toEqual({ kind: "link", linked: "self", replace: { uid: "jit1", wipe: true } });
    expect(decideLink({ ...base, mapping: held })).toEqual({ kind: "refuse", code: "sso-linked" });
    // An account that administers the organization is never deleted to make room, by its claims or by its profile.
    const adminBy = (claims: AccountFacts["claims"], role: string) => mapping({ uid: "jit1", linked: "jit", account: account({ uid: "jit1", claims }, { role, createdBy: "sso" }) });
    expect(decideLink({ ...base, mapping: adminBy({ role: "orgAdmin", orgId: "org1" }, "orgAdmin"), heldByEmptyJit: true })).toEqual({ kind: "refuse", code: "sso-linked" });
    expect(decideLink({ ...base, mapping: adminBy({ role: "orgAdmin", orgId: "org1" }, "student"), heldByEmptyJit: true })).toEqual({ kind: "refuse", code: "sso-linked" });
    expect(decideLink({ ...base, mapping: adminBy({ role: "student", orgId: "org1" }, "orgAdmin"), heldByEmptyJit: true })).toEqual({ kind: "refuse", code: "sso-linked" });
    // A teacher's is still replaced here: whether it has pupils is the caller's to say (heldByEmptyJit).
    expect(decideLink({ ...base, mapping: adminBy({ role: "teacher", orgId: "org1" }, "teacher"), heldByEmptyJit: true })).toMatchObject({ kind: "link", replace: { uid: "jit1", wipe: true } });
    expect(decideLink({ ...base, mapping: mapping({ uid: "x", linked: "self", account: account({ uid: "x" }) }), heldByEmptyJit: true })).toEqual({ kind: "refuse", code: "sso-linked" });
    expect(decideLink({ ...base, mapping: mapping({ uid: "gone", account: account({ uid: "gone", authExists: false }) }) })).toEqual({ kind: "link", linked: "self", replace: { uid: "gone", wipe: false } });
    expect(decideLink({ ...base, mapping: mapping({ uid: "x", state: "removed" }) })).toEqual({ kind: "refuse", code: "sso-removed" });
    expect(decideLink({ ...base, mapping: mapping({ uid: "me" }) })).toEqual({ kind: "already" });
  });
});
