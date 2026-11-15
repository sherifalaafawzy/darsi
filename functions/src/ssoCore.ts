/**
 * School sign-in (OpenID Connect; TECHNICAL.md "School sign-in"): the pure decisions. The HTTP functions (ssoEdge,
 * ssoCallback), manageSso and ssoJob fetch the facts and execute what these functions decide; nothing here reads
 * Firestore or Auth, calls the network or logs.
 *
 *  - validateConfig: what an organization admin may save (every field, its limits and its shape per preset).
 *  - rulesFor: what a token is trusted for, decided by the issuer and never by the preset (design §3, callback rules).
 *  - readClaims / checkIdentity: who the verified ID token says the person is, and whether this connection admits them.
 *  - decideSignIn / decideLink: who a school sign-in becomes (design §5), as data.
 *  - checkDiscovery / endpointsMoved: a discovery document checked, and a later one compared with what was tested.
 *  - identityId, slugify, promptFor, buildAuthorizationUrl, returnUrl, the JIT allowance, and SSO_REFUSALS.
 */
import { createHash, randomInt } from "node:crypto";
import { isReservedName } from "./sitesCore.js";
import {
  GOOGLE_ISSUER, GOOGLE_ISSUERS, MICROSOFT_SHARED_TENANTS, PRESET_INFO, SHARED_ISSUER_HOSTS, constantEndpoints, isGuid, isPreset,
  isSchoolTenant, issuerCandidates, type Endpoints, type Preset,
} from "./ssoProviders.js";

// ---- refusal codes (design §11) ----

/** Every refusal school sign-in answers with; the screens word each one (en + ar) with what to do next. Closed list. */
export const SSO_REFUSALS = [
  "sso-off", "sso-no-school", "sso-org-inactive", "sso-state", "sso-origin", "sso-provider", "sso-token", "sso-issuer", "sso-domain",
  "sso-email", "sso-other-org", "sso-staff", "sso-disabled", "sso-removed", "sso-linked", "sso-connect-first", "sso-full", "sso-recent",
  "sso-rate", "sso-discovery", "sso-fields", "sso-secret", "sso-slug", "sso-untested", "sso-student-test", "sso-last-way-in", "sso-key",
  "sso-signer", "sso-own-login", "sso-login", "sso-migrate", "sso-update",
] as const;
export type SsoRefusal = (typeof SSO_REFUSALS)[number];
export const isRefusal = (v: unknown): v is SsoRefusal => typeof v === "string" && (SSO_REFUSALS as readonly string[]).includes(v);

/** ID token algorithms Darsi accepts (design §4 callback). `none` and HMAC algorithms never. */
export const ID_TOKEN_ALGS: readonly string[] = ["RS256", "PS256", "ES256"];

// ---- small checks ----

const CONTROL = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;
/** The same set without the global flag, for test() (a /g regex keeps lastIndex between calls). */
const HAS_CONTROL = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/;
const HOST_LABEL = "(?!-)[a-z0-9-]{1,63}(?<!-)";
const DOMAIN = new RegExp(`^(?=.{1,253}$)${HOST_LABEL}(?:\\.${HOST_LABEL})+$`);
/** A lower-case DNS name with at least one dot (punycode for international names). */
export const isDomain = (v: unknown): v is string => typeof v === "string" && DOMAIN.test(v);
const EMAIL = /^[^\s@\u0000-\u001f]{1,64}@[^\s@]+$/;
/** A plausible email address, lower-cased; null otherwise. Domain part must be a DNS name. */
export function normEmail(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 254) return null;
  const e = v.trim().toLowerCase();
  if (!EMAIL.test(e)) return null;
  return isDomain(e.slice(e.lastIndexOf("@") + 1)) ? e : null;
}
export const emailDomain = (email: string) => email.slice(email.lastIndexOf("@") + 1);
/** Text from a token for display: control and direction-override characters removed, trimmed and capped. */
function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(CONTROL, "").trim().slice(0, max).trim();
  return t || null;
}
const CLAIM_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/;
/** Claims a teacher or class rule may not read: identity, protocol and personal fields. */
const RESERVED_CLAIMS = new Set(["iss", "sub", "aud", "exp", "nbf", "iat", "jti", "nonce", "azp", "auth_time", "at_hash", "c_hash", "acr", "amr", "sid",
  "email", "email_verified", "preferred_username", "upn", "unique_name", "name", "given_name", "family_name", "tid", "oid", "xms_edov", "hd", "ver", "uti", "rh"]);
const isRuleClaim = (v: unknown): v is string => typeof v === "string" && CLAIM_NAME.test(v) && !RESERVED_CLAIMS.has(v) && !v.startsWith("_");

/** Consumer mail domains: an allowed-domain list naming one would admit anyone with a free mailbox there. */
const CONSUMER_DOMAINS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.net", "yandex.ru", "yandex.com", "mail.ru", "zoho.com"]);

// ---- issuer rules (design §4 callback, "Issuer rules come from the issuer, not the preset") ----

export type IssuerRules =
  | { kind: "google"; issuers: readonly string[] }
  | { kind: "microsoft"; tenant: string }
  | { kind: "generic" }
  | { kind: "refused"; why: "url" | "shared" | "tenant" };

/** Hosts that answer for Microsoft's Entra (public, government and China clouds; v1 and v2 issuers). */
const MS_ISSUER_HOSTS = new Set(["login.microsoftonline.com", "sts.windows.net", "login.windows.net", "login.microsoft.com",
  "login.microsoftonline.us", "login.partner.microsoftonline.cn", "sts.chinacloudapi.cn"]);

/** An issuer URL as Darsi accepts it: https (http on a loopback host only in the emulator), no user, query or fragment. */
function issuerUrl(issuer: unknown, emulator = false): URL | null {
  if (typeof issuer !== "string" || !issuer || issuer.length > 300) return null;
  let u: URL;
  try { u = new URL(issuer); } catch { return null; }
  if (u.username || u.password || u.search || u.hash || issuer.includes("#") || issuer.includes("?")) return null;
  const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost";
  if (u.protocol === "https:") return !loopback || emulator ? u : null;
  return u.protocol === "http:" && emulator && loopback ? u : null;
}

/**
 * The rules an issuer's tokens follow, whatever preset was chosen:
 * - accounts.google.com: Google's (allowed domains required; `hd` present and listed; `email_verified === true`).
 * - Entra hosts: Microsoft's, with the tenant from the issuer's path, which must be one school's GUID (never `common`,
 *   `organizations`, `consumers` or the personal-account tenants).
 * - consumer and multi-customer issuers (Apple, Facebook, …): refused.
 * - anything else: generic (allowed domains, or `openToAll` chosen explicitly).
 */
export function rulesFor(issuer: unknown, emulator = false): IssuerRules {
  if (issuer === "accounts.google.com") return { kind: "google", issuers: GOOGLE_ISSUERS };
  const u = issuerUrl(issuer, emulator);
  if (!u) return { kind: "refused", why: "url" };
  const host = u.hostname;
  if (host === "accounts.google.com") return { kind: "google", issuers: GOOGLE_ISSUERS };
  if (MS_ISSUER_HOSTS.has(host)) {
    const tenant = u.pathname.split("/")[1]?.toLowerCase() ?? "";
    return isSchoolTenant(tenant) ? { kind: "microsoft", tenant } : { kind: "refused", why: "tenant" };
  }
  if (SHARED_ISSUER_HOSTS.includes(host)) return { kind: "refused", why: "shared" };
  return { kind: "generic" };
}
/** The values a token's `iss` may carry for a configured issuer (Google sends either form). */
export function acceptedIssuers(issuer: string, emulator = false): string[] {
  const r = rulesFor(issuer, emulator);
  return r.kind === "google" ? [...r.issuers] : [issuer];
}

// ---- configuration (design §3, manageSso save) ----

export type TeacherRule =
  /** google: teachers are people whose verified email is at one of these domains, or one of these addresses. */
  | { kind: "email"; domains: string[]; emails: string[] }
  /** microsoft: an app role (`roles` claim) with this value, e.g. "Teacher". */
  | { kind: "role"; value: string }
  /** microsoft: membership of this group (`groups` claim, object ids only). */
  | { kind: "group"; value: string }
  /** okta, keycloak, oidc: a claim (`groups`, `roles` or another) holding this value; a leading "/" is ignored. */
  | { kind: "claim"; claim: string; value: string };

export type AuthMethod = "basic" | "post";
/** Scopes an admin may ask for. `openid` is always sent; `offline_access` is refused (Darsi never keeps provider tokens). */
export const ALLOWED_SCOPES: readonly string[] = ["openid", "email", "profile", "groups", "roles"];

/** What validateConfig returns: the admin-editable part of orgs/{orgId}/private/sso (design §3). */
export interface SsoFields {
  preset: Preset;
  tenant: string | null;
  domain: string | null;
  oktaServer: string | null;
  realm: string | null;
  /** Issuers to try in discovery, best first; the one whose document matches becomes the config's `issuer`. */
  issuerCandidates: string[];
  subjectKind: "sub" | "tid-oid";
  clientId: string;
  /** null: take it from discovery (`token_endpoint_auth_methods_supported`). */
  authMethod: AuthMethod | null;
  scopes: string[];
  allowedDomains: string[];
  openToAll: boolean;
  emailsVerifiedBySchool: boolean;
  teacherRule: TeacherRule | null;
  classClaim: string | null;
  maxSessionDays: number;
  personalDevices: boolean;
  /** "YYYY-MM-DD" or null. */
  secretExpiresOn: string | null;
}
export type ConfigField = "preset" | "tenant" | "domain" | "oktaServer" | "realm" | "issuer" | "clientId" | "authMethod" | "scopes" | "allowedDomains"
  | "openToAll" | "emailsVerifiedBySchool" | "teacherRule" | "classClaim" | "maxSessionDays" | "personalDevices" | "secretExpiresOn";
export type ConfigCheck = { ok: true; fields: SsoFields } | { ok: false; code: "sso-fields" | "sso-issuer"; field: ConfigField };

export const MAX_DOMAINS = 50;
export const MAX_TEACHER_EMAILS = 500;
export const MAX_TEACHER_DOMAINS = 20;
export const DEFAULT_SESSION_DAYS = 30;
const HOST_PORT = new RegExp(`^(?=.{1,253}(?::\\d{1,5})?$)${HOST_LABEL}(?:\\.${HOST_LABEL})+(?::(\\d{1,5}))?$`);
const OKTA_SERVER = /^[A-Za-z0-9]{1,40}$/;
const REALM = /^[A-Za-z0-9._-]{1,64}$/;
const CLIENT_ID = /^[\x21-\x7e]{1,256}$/;
const ROLE_VALUE = /^[A-Za-z0-9._-]{1,64}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Check what an admin saves, field by field (design §3, §6, §9). Endpoints are never accepted from the client: the
 * server runs discovery on `issuerCandidates` itself. Unknown fields are dropped. The issuer's rules (rulesFor) decide
 * what is required, so "Other" pointed at Google needs Google's domains. `emulator` lets an http loopback issuer in.
 */
export function validateConfig(input: unknown, now: number, emulator = false): ConfigCheck {
  const v = (input ?? {}) as Record<string, unknown>;
  const no = (field: ConfigField, code: "sso-fields" | "sso-issuer" = "sso-fields"): ConfigCheck => ({ ok: false, code, field });
  if (!isPreset(v.preset)) return no("preset");
  const preset = v.preset;

  // Where the provider is.
  let tenant: string | null = null, domain: string | null = null, oktaServer: string | null = null, realm: string | null = null, issuer: string | null = null;
  if (preset === "microsoft") {
    const t = typeof v.tenant === "string" ? v.tenant.trim().toLowerCase() : "";
    if (!isGuid(t)) return no("tenant");
    if (MICROSOFT_SHARED_TENANTS.includes(t)) return no("tenant", "sso-issuer");
    tenant = t;
  }
  if (preset === "okta" || preset === "keycloak") {
    const d = typeof v.domain === "string" ? v.domain.trim().toLowerCase() : "";
    const m = HOST_PORT.exec(d);
    if (!m || (m[1] !== undefined && (Number(m[1]) < 1 || Number(m[1]) > 65535))) return no("domain");
    domain = d;
  }
  if (preset === "okta" && v.oktaServer !== undefined && v.oktaServer !== null && v.oktaServer !== "") {
    if (typeof v.oktaServer !== "string" || !OKTA_SERVER.test(v.oktaServer)) return no("oktaServer");
    oktaServer = v.oktaServer;
  }
  if (preset === "keycloak") {
    if (typeof v.realm !== "string" || !REALM.test(v.realm)) return no("realm");
    realm = v.realm;
  }
  if (preset === "oidc") {
    const i = typeof v.issuer === "string" ? v.issuer.trim() : "";
    if (!issuerUrl(i, emulator)) return no("issuer");
    issuer = i;
  }
  const candidates = issuerCandidates(preset, { tenant, domain, oktaServer, realm, issuer });
  if (!candidates.length) return no(preset === "oidc" ? "issuer" : "domain");
  // Every candidate gets the same rules (they share a host); refused issuers stop here.
  const rules = rulesFor(candidates[0], emulator);
  if (rules.kind === "refused") return no(preset === "oidc" ? "issuer" : preset === "microsoft" ? "tenant" : "domain", "sso-issuer");
  const kind = rules.kind;

  // The client.
  const clientId = typeof v.clientId === "string" ? v.clientId.trim() : "";
  if (!CLIENT_ID.test(clientId)) return no("clientId");
  if (preset === "microsoft" && !isGuid(clientId.toLowerCase())) return no("clientId");
  if (preset === "google" && !/^[A-Za-z0-9-]{1,200}\.apps\.googleusercontent\.com$/.test(clientId)) return no("clientId");
  let authMethod: AuthMethod | null = null;
  if (v.authMethod !== undefined && v.authMethod !== null) {
    if (v.authMethod !== "basic" && v.authMethod !== "post") return no("authMethod");
    authMethod = v.authMethod;
  }

  // Who may sign in.
  let allowedDomains: string[] = [];
  if (v.allowedDomains !== undefined && v.allowedDomains !== null) {
    if (!Array.isArray(v.allowedDomains) || v.allowedDomains.length > MAX_DOMAINS) return no("allowedDomains");
    const set = new Set<string>();
    for (const d of v.allowedDomains) {
      const x = typeof d === "string" ? d.trim().toLowerCase() : "";
      if (!isDomain(x) || CONSUMER_DOMAINS.has(x)) return no("allowedDomains");
      set.add(x);
    }
    allowedDomains = [...set];
  }
  if (kind === "google" && !allowedDomains.length) return no("allowedDomains");
  if (v.openToAll !== undefined && typeof v.openToAll !== "boolean") return no("openToAll");
  if (v.emailsVerifiedBySchool !== undefined && typeof v.emailsVerifiedBySchool !== "boolean") return no("emailsVerifiedBySchool");
  // Only a generic issuer can be open to all, and only when the admin said so in so many words (never by default).
  const openToAll = kind === "generic" && !allowedDomains.length && v.openToAll === true;
  if (kind === "generic" && !allowedDomains.length && !openToAll) return no("openToAll");
  const emailsVerifiedBySchool = kind === "generic" && v.emailsVerifiedBySchool === true;

  // Teacher and class (design §6).
  const teacherRule = readTeacherRule(v.teacherRule, kind === "google" ? "google" : kind === "microsoft" ? "microsoft" : "other");
  if (teacherRule === false) return no("teacherRule");
  let classClaim: string | null = null;
  if (v.classClaim !== undefined && v.classClaim !== null && v.classClaim !== "") {
    if (!isRuleClaim(v.classClaim)) return no("classClaim");
    classClaim = v.classClaim;
  }

  // Scopes: openid email profile always; groups when a generic rule reads `groups`; extras from the allow-list.
  const scopes = ["openid", "email", "profile"];
  if (v.scopes !== undefined && v.scopes !== null) {
    if (!Array.isArray(v.scopes) || v.scopes.length > 10) return no("scopes");
    for (const s of v.scopes) {
      if (typeof s !== "string" || !ALLOWED_SCOPES.includes(s)) return no("scopes");
      if (!scopes.includes(s)) scopes.push(s);
    }
  }
  if (teacherRule?.kind === "claim" && teacherRule.claim === "groups" && !scopes.includes("groups")) scopes.push("groups");
  // Google and Entra refuse scopes they don't know; they send roles/groups/hd without asking.
  const sentScopes = kind === "generic" ? scopes : scopes.filter((s) => s === "openid" || s === "email" || s === "profile");

  // Sessions and devices.
  let maxSessionDays = DEFAULT_SESSION_DAYS;
  if (v.maxSessionDays !== undefined && v.maxSessionDays !== null) {
    if (typeof v.maxSessionDays !== "number" || !Number.isInteger(v.maxSessionDays) || v.maxSessionDays < 1 || v.maxSessionDays > 90) return no("maxSessionDays");
    maxSessionDays = v.maxSessionDays;
  }
  if (v.personalDevices !== undefined && typeof v.personalDevices !== "boolean") return no("personalDevices");
  let secretExpiresOn: string | null = null;
  if (v.secretExpiresOn !== undefined && v.secretExpiresOn !== null && v.secretExpiresOn !== "") {
    if (!validDay(v.secretExpiresOn, now)) return no("secretExpiresOn");
    secretExpiresOn = v.secretExpiresOn as string;
  }

  return {
    ok: true,
    fields: {
      preset, tenant, domain, oktaServer, realm, issuerCandidates: candidates,
      subjectKind: kind === "microsoft" ? "tid-oid" : "sub",
      clientId: preset === "microsoft" ? clientId.toLowerCase() : clientId, authMethod, scopes: sentScopes,
      allowedDomains, openToAll, emailsVerifiedBySchool, teacherRule, classClaim, maxSessionDays,
      personalDevices: v.personalDevices === true, secretExpiresOn,
    },
  };
}

/** A calendar day between 2020 and three years from now. */
function validDay(v: unknown, now: number): boolean {
  if (typeof v !== "string") return false;
  const m = DAY.exec(v);
  if (!m) return false;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return false;
  return t >= Date.UTC(2020, 0, 1) && t <= now + 3 * 366 * 86_400_000;
}

/** A teacher rule in the shape its provider allows; null for none, false when it is malformed. */
function readTeacherRule(v: unknown, kind: "google" | "microsoft" | "other"): TeacherRule | null | false {
  if (v === undefined || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r !== "object") return false;
  if (kind === "google") {
    if (r.kind !== "email") return false;
    const domains = Array.isArray(r.domains) ? r.domains : [], emails = Array.isArray(r.emails) ? r.emails : [];
    if ((r.domains !== undefined && !Array.isArray(r.domains)) || (r.emails !== undefined && !Array.isArray(r.emails))) return false;
    if (domains.length > MAX_TEACHER_DOMAINS || emails.length > MAX_TEACHER_EMAILS) return false;
    const ds = new Set<string>(), es = new Set<string>();
    for (const d of domains) { const x = typeof d === "string" ? d.trim().toLowerCase() : ""; if (!isDomain(x)) return false; ds.add(x); }
    for (const e of emails) { const x = normEmail(e); if (!x) return false; es.add(x); }
    if (!ds.size && !es.size) return false;
    return { kind: "email", domains: [...ds], emails: [...es] };
  }
  if (kind === "microsoft") {
    if (r.kind === "role" && typeof r.value === "string" && ROLE_VALUE.test(r.value)) return { kind: "role", value: r.value };
    // Entra sends group object ids; a display name would never match, so refuse it here rather than at sign-in.
    if (r.kind === "group" && typeof r.value === "string" && isGuid(r.value.toLowerCase())) return { kind: "group", value: r.value.toLowerCase() };
    return false;
  }
  if (r.kind !== "claim" || !isRuleClaim(r.claim) || typeof r.value !== "string") return false;
  const value = r.value.trim().replace(/^\/+/, "");
  if (!value || value.length > 100 || HAS_CONTROL.test(value)) return false;
  return { kind: "claim", claim: r.claim, value };
}

// ---- reading a verified ID token (design §4 callback, §6) ----

/** Who the verified ID token says the person is, as the ticket carries it (no uid: finish decides that). */
export interface Identity {
  /** `sub`, or `tid:oid` for Microsoft. Empty when the token lacks it (checkIdentity refuses). */
  subject: string;
  subjectKind: "sub" | "tid-oid";
  /** The address shown and matched: lower-cased; Microsoft's `email` or else `preferred_username`. */
  email: string | null;
  /** Whether that address counts as verified under the issuer's rules (design §4). */
  emailVerified: boolean;
  /** Microsoft's `preferred_username` (the tenant-verified UPN), which domain checks use. */
  upn: string | null;
  name: string | null;
  hd: string | null;
  tid: string | null;
  oid: string | null;
  /** The teacher rule: true raises a student to teacher; false and null (unknown) never lower anyone. */
  teacher: boolean | null;
  /** The class claim's value when it is a short name (sets `group` at creation only). */
  cls: string | null;
  /** Which of the claims the wizard explains arrived (names only, never values). */
  claimsSeen: string[];
  /** Values of the claim a teacher rule reads (or groups/roles when none is set), for the wizard's test card. ≤ 20. */
  ruleValues: string[];
}

/** The parts of a connection's config that reading and checking a token need. */
export interface IdentityConfig {
  issuer: string;
  allowedDomains: readonly string[];
  openToAll: boolean;
  emailsVerifiedBySchool: boolean;
  teacherRule: TeacherRule | null;
  classClaim: string | null;
}

const SEEN = ["email", "email_verified", "preferred_username", "name", "hd", "tid", "oid", "roles", "groups", "xms_edov", "upn"];
const SUB = /^[\x21-\x7e]{1,255}$/;
const strings = (v: unknown): string[] | null => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);

/**
 * Read the claims of a token whose signature, issuer, audience and nonce are already verified. Microsoft (by issuer):
 * subject `tid:oid`, address `email ?? preferred_username`, verified only with `xms_edov === true` on a sent `email`.
 * Google: `email_verified === true`. Others: `email_verified === true`, or every address when the school vouches.
 */
export function readClaims(config: IdentityConfig, payload: Record<string, unknown>, emulator = false): Identity {
  const rules = rulesFor(config.issuer, emulator);
  const ms = rules.kind === "microsoft";
  const tid = typeof payload.tid === "string" && isGuid(payload.tid.toLowerCase()) ? payload.tid.toLowerCase() : null;
  const oid = typeof payload.oid === "string" && isGuid(payload.oid.toLowerCase()) ? payload.oid.toLowerCase() : null;
  const sub = typeof payload.sub === "string" && SUB.test(payload.sub) ? payload.sub : "";
  const subject = ms ? (tid && oid ? `${tid}:${oid}` : "") : sub;

  const mail = normEmail(payload.email);
  const upn = ms ? normEmail(payload.preferred_username) : null;
  const email = ms ? mail ?? upn : mail;
  const emailVerified = !email ? false
    : ms ? mail !== null && payload.xms_edov === true
    : rules.kind === "google" ? payload.email_verified === true
    : payload.email_verified === true || config.emailsVerifiedBySchool;

  const given = cleanText(payload.given_name, 60), family = cleanText(payload.family_name, 60);
  const name = cleanText(payload.name, 120) ?? (given || family ? [given, family].filter(Boolean).join(" ").slice(0, 120) : null);
  const hd = rules.kind === "google" && typeof payload.hd === "string" ? payload.hd.toLowerCase() : null;

  const rule = config.teacherRule;
  const seen = new Set(SEEN.filter((c) => payload[c] !== undefined));
  if (rule?.kind === "claim" && payload[rule.claim] !== undefined) seen.add(rule.claim);
  if (config.classClaim && payload[config.classClaim] !== undefined) seen.add(config.classClaim);

  const valuesOf = (claim: string) => (strings(payload[claim]) ?? []).map((x) => cleanText(x, 64)).filter((x): x is string => !!x);
  const ruleValues = (rule?.kind === "claim" ? valuesOf(rule.claim) : rule?.kind === "role" ? valuesOf("roles") : rule?.kind === "group" ? valuesOf("groups")
    : rule?.kind === "email" ? [] : [...valuesOf("groups"), ...valuesOf("roles")]).slice(0, 20);

  return {
    subject, subjectKind: ms ? "tid-oid" : "sub", email, emailVerified, upn, name, hd, tid: ms ? tid : null, oid: ms ? oid : null,
    teacher: teacherFrom(rule, payload, email, emailVerified), cls: classFrom(config.classClaim, payload),
    claimsSeen: [...seen], ruleValues,
  };
}

/** The teacher rule on a token: true, false, or null when the token can't say (never used to lower anyone). */
function teacherFrom(rule: TeacherRule | null, p: Record<string, unknown>, email: string | null, verified: boolean): boolean | null {
  if (!rule) return null;
  switch (rule.kind) {
    case "email":
      if (!email || !verified) return null;
      return rule.emails.includes(email) || rule.domains.includes(emailDomain(email));
    case "role": {
      const roles = strings(p.roles);
      return roles ? roles.includes(rule.value) : null;
    }
    case "group": {
      // Groups overage: Entra leaves `groups` out (and points at Graph) when there are too many; that is "unknown".
      const names = p._claim_names as Record<string, unknown> | undefined;
      if (p.hasgroups === true || (names && typeof names === "object" && "groups" in names)) return null;
      const groups = strings(p.groups);
      return groups ? groups.map((g) => g.toLowerCase()).includes(rule.value) : null;
    }
    case "claim": {
      const vals = strings(p[rule.claim]);
      return vals ? vals.map((x) => x.trim().replace(/^\/+/, "")).includes(rule.value) : null;
    }
  }
}

/** The class from a claim: only a single short string that isn't an object id (≤ 40 characters). */
function classFrom(claim: string | null, p: Record<string, unknown>): string | null {
  if (!claim || typeof p[claim] !== "string") return null;
  const c = cleanText(p[claim], 41);
  return c && c.length <= 40 && !isGuid(c.toLowerCase()) ? c : null;
}

/**
 * Whether this connection admits the identity (design §4, rules per issuer). Codes: `sso-issuer` (refused issuer or a
 * token from another tenant), `sso-token` (no usable subject), `sso-domain` (domain not allowed, or no domains on a
 * connection that needs them), `sso-email` (an address that must be verified isn't).
 */
export function checkIdentity(config: IdentityConfig, id: Identity, emulator = false): { ok: true } | { ok: false; code: SsoRefusal } {
  const rules = rulesFor(config.issuer, emulator);
  const no = (code: SsoRefusal) => ({ ok: false as const, code });
  if (rules.kind === "refused") return no("sso-issuer");
  if (!id.subject) return no("sso-token");
  const domains = config.allowedDomains;
  if (rules.kind === "google") {
    if (!domains.length) return no("sso-domain");
    if (!id.hd || !domains.includes(id.hd)) return no("sso-domain");
    if (!id.email || !id.emailVerified) return no("sso-email");
    if (emailDomain(id.email) !== id.hd) return no("sso-domain");
    return { ok: true };
  }
  if (rules.kind === "microsoft") {
    if (!id.tid || !id.oid) return no("sso-token");
    if (id.tid !== rules.tenant) return no("sso-issuer");
    // Optional for Microsoft (the tenant already scopes it); checked on the tenant-verified UPN, never on `email`.
    if (domains.length && (!id.upn || !domains.includes(emailDomain(id.upn)))) return no("sso-domain");
    return { ok: true };
  }
  if (domains.length) {
    if (!id.email || !domains.includes(emailDomain(id.email))) return no("sso-domain");
    if (!id.emailVerified) return no("sso-email");
    return { ok: true };
  }
  return config.openToAll === true ? { ok: true } : no("sso-domain");
}

// ---- identity documents ----

/**
 * ssoIdentities/{id}: sha256(orgId \n connectionId \n subject), hex. The organization and its connection are in the
 * key, so two organizations with the same issuer never share a mapping, and a new connection starts afresh.
 */
export function identityId(orgId: string, connectionId: string, subject: string): string {
  if (!orgId || !connectionId || !subject || [orgId, connectionId, subject].some((x) => x.includes("\n"))) throw new Error("sso-identity-id");
  return createHash("sha256").update(`${orgId}\n${connectionId}\n${subject}`, "utf8").digest("hex");
}

// ---- who a school sign-in becomes (design §5) ----

export type Linked = "jit" | "org-made" | "self" | "admin-map";
export type IdentityState = "active" | "removed" | "blocked";
export const STAFF_ROLE = "superadmin";
export const PENDING_RECLAIM_MS = 60_000;
export const TOUCH_MS = 24 * 3600_000;
const USERNAME_DOMAIN = "@users.darsi.app";

/** What the server read about one account (Auth record and profile) before deciding. */
export interface AccountFacts {
  uid: string;
  /** The Auth user exists. */
  authExists: boolean;
  disabled: boolean;
  /** Auth's email, lower case. */
  authEmail: string | null;
  /** Auth metadata.lastSignInTime ("" or null when never signed in). */
  lastSignInTime: string | null;
  claims: { role?: string | null; orgId?: string | null } | null;
  /** users/{uid}; null when there is none. */
  profile: { role?: string | null; orgId?: string | null; createdBy?: string | null; sso?: boolean | null; mustChangePassword?: boolean | null } | null;
}
/** ssoIdentities/{id} as read, with its account. */
export interface MappingFacts {
  uid: string;
  linked: Linked;
  state: IdentityState;
  pending: boolean;
  createdAt: number;
  lastAt: number | null;
  account: AccountFacts;
}
export interface SignInInputs {
  orgId: string;
  now: number;
  /** Already passed checkIdentity. */
  identity: Identity;
  mapping: MappingFacts | null;
  /** The Auth account whose email is the identity's address (looked up for any address), and whether it has an identity in this org. */
  emailAccount: (AccountFacts & { hasIdentity: boolean }) | null;
  /** The address is another member's of this organization (Auth email of a member, or another sso account's ssoEmail). */
  emailMember: boolean;
  /** The person is on orgs/{orgId}/private/removed. */
  removed: boolean;
  /**
   * Another identity of this organization's connection, removed or blocked, carries this same verified address (a
   * provider with pairwise subjects knows the person by a new subject once its client changed): joining is refused.
   */
  tombstone?: "removed" | "blocked" | null;
  /** For the JIT allowance (jitAllowed). */
  allowance: { hourCount: number; memberCount: number; ceiling: number };
}
export type SignInDecision =
  | { kind: "refuse"; code: SsoRefusal; dropMapping: boolean; log?: "claims-profile" }
  /** A first sign-in of the same person is creating the account: wait and read the winner. */
  | { kind: "wait" }
  /** Sign in as the mapped account; `raise`: the teacher rule makes this student a teacher (setRole); `touch`: write lastAt/expiresAt. */
  | { kind: "signin"; uid: string; raise: boolean; touch: boolean }
  /** Link the organization-made account still on its handed-out credential (linked "org-made"), then sign in. Never touches its password. */
  | { kind: "link-org-made"; uid: string; dropMapping: boolean; raise: boolean }
  /**
   * Join as a member (design §5.4). `uid` null: a new one (reserve with create() first). `resume`: finish a creation a
   * minute old with the same uid (the allowance was counted when it was reserved).
   */
  | { kind: "jit"; uid: string | null; resume: boolean; role: "student" | "teacher"; group: string | null; dropMapping: boolean };

const isStaff = (a: AccountFacts) => a.claims?.role === STAFF_ROLE || a.profile?.role === STAFF_ROLE;
const neverSignedIn = (a: AccountFacts) => !a.lastSignInTime;

/** Design §5, in order: a mapped identity, an organization-made account to link, an address another member holds, joining. */
export function decideSignIn(i: SignInInputs): SignInDecision {
  const { orgId, identity: id, mapping: m } = i;
  const refuse = (code: SsoRefusal, dropMapping = false, log?: "claims-profile"): SignInDecision => ({ kind: "refuse", code, dropMapping, ...(log ? { log } : {}) });
  const role: "student" | "teacher" = id.teacher === true ? "teacher" : "student";
  let dropMapping = false;

  if (m) {
    if (m.state === "blocked") return refuse("sso-disabled");
    if (m.state === "removed") return refuse("sso-removed");
    if (m.pending) {
      if (i.now - m.createdAt < PENDING_RECLAIM_MS) return { kind: "wait" };
      // A creation that stopped half-way: finish it with the same uid (createUser and setRole are repeated idempotently).
      if (i.removed) return refuse("sso-removed");
      if (i.tombstone) return refuse(i.tombstone === "blocked" ? "sso-disabled" : "sso-removed");
      return { kind: "jit", uid: m.uid, resume: true, role, group: id.cls, dropMapping: false };
    }
    const a = m.account;
    if (!a.authExists) dropMapping = true;
    else if (isStaff(a)) return refuse("sso-staff");
    else if (a.profile?.orgId !== orgId) {
      // A school-made account that left (or lost) this organization is not signed in or re-admitted by the school.
      if (m.linked === "jit") return refuse("sso-removed");
      dropMapping = true;
    } else {
      if (a.disabled) return refuse("sso-disabled");
      if ((a.claims?.orgId ?? null) !== orgId || (a.claims?.role ?? null) !== (a.profile?.role ?? null)) return refuse("sso-other-org", false, "claims-profile");
      return { kind: "signin", uid: m.uid, raise: id.teacher === true && a.profile?.role === "student", touch: m.lastAt === null || i.now - m.lastAt >= TOUCH_MS };
    }
  }

  // A blocked identity of this connection carries this verified address (the provider names the person by a new
  // subject): the block is the answer, as it is for the blocked identity itself above, also for someone still a
  // member. Otherwise "connect it from Me" (§5.3) is said to a person whose only way in is the sign-in an admin
  // blocked, or the new subject is matched to an account the organization made (§5.2) in spite of the block.
  if (i.tombstone === "blocked") return refuse("sso-disabled", dropMapping);
  // §5.2: an account this organization made, still on the credential it handed out, with the same verified address.
  const e = i.emailAccount;
  if (e && orgMadeLinkable(e, orgId, id)) {
    return { kind: "link-org-made", uid: e.uid, dropMapping, raise: id.teacher === true && e.profile?.role === "student" };
  }
  // §5.3: someone in this organization already has this address: they connect from Me; nothing is created.
  if (i.emailMember || (e && e.authExists && e.profile?.orgId === orgId)) return refuse("sso-connect-first", dropMapping);
  // §5.4: join as a student (or a teacher by the rule).
  if (i.removed) return refuse("sso-removed", dropMapping);
  // The same person under a new subject: the identity the organization removed still says no (never a new account;
  // a blocked one was answered above).
  if (i.tombstone) return refuse("sso-removed", dropMapping);
  if (!jitAllowed(i.allowance)) return refuse("sso-full", dropMapping);
  return { kind: "jit", uid: null, resume: false, role, group: id.cls, dropMapping };
}

/**
 * §5.2's conditions, all of them: this org's member made by this org's admin (not by sso), student or teacher in both
 * claims and profile, no identity yet, still on the handed-out credential (must change password, or never signed in),
 * not disabled, and the token's address verified under the issuer rules and equal to the account's Auth email.
 * Username logins (@users.darsi.app) never match.
 */
export function orgMadeLinkable(e: AccountFacts & { hasIdentity: boolean }, orgId: string, id: Identity): boolean {
  const p = e.profile;
  if (!e.authExists || e.disabled || e.hasIdentity || !p) return false;
  if (p.orgId !== orgId || (e.claims?.orgId ?? null) !== orgId) return false;
  if (!p.createdBy || p.createdBy === "sso") return false;
  if ((p.role !== "student" && p.role !== "teacher") || e.claims?.role !== p.role) return false;
  if (!(p.mustChangePassword === true || neverSignedIn(e))) return false;
  if (!id.email || !id.emailVerified || !e.authEmail) return false;
  const auth = e.authEmail.toLowerCase();
  return !auth.endsWith(USERNAME_DOMAIN) && auth === id.email;
}

export interface LinkInputs {
  orgId: string;
  /** The signed-in caller (same uid as the ticket, checked by the server). */
  caller: AccountFacts;
  identity: Identity;
  mapping: MappingFacts | null;
  /** The caller already holds another identity in this organization. */
  callerHasIdentity: boolean;
  /** The mapping's account is a JIT account of this org with no progress, submissions or certificates, and no pupils. */
  heldByEmptyJit: boolean;
}
export type LinkDecision =
  | { kind: "refuse"; code: SsoRefusal }
  | { kind: "already" }
  /** Link (two-step: confirm first). `replace`: move the identity from that account; `wipe`: it is an empty JIT account to delete. */
  | { kind: "link"; linked: "self" | "org-made"; replace: { uid: string; wipe: boolean } | null };

/** Design §4 finish, link mode: who may connect this school identity to their own account. */
export function decideLink(i: LinkInputs): LinkDecision {
  const { caller: c, mapping: m, orgId } = i;
  const no = (code: SsoRefusal): LinkDecision => ({ kind: "refuse", code });
  if (isStaff(c)) return no("sso-staff");
  if (!c.authExists || c.disabled) return no("sso-disabled");
  if (c.profile?.orgId !== orgId || (c.claims?.orgId ?? null) !== orgId) return no("sso-other-org");
  let replace: { uid: string; wipe: boolean } | null = null;
  if (m) {
    if (m.uid === c.uid) return m.state === "active" && !m.pending ? { kind: "already" } : no(m.state === "blocked" ? "sso-disabled" : "sso-removed");
    if (m.state === "blocked") return no("sso-disabled");
    if (m.state === "removed") return no("sso-removed");
    if (m.pending) return no("sso-linked");
    if (!m.account.authExists) replace = { uid: m.uid, wipe: false };
    // An account that administers the organization is never deleted to make room, however empty: it refuses below.
    else if (m.linked === "jit" && i.heldByEmptyJit && m.account.profile?.orgId === orgId && m.account.profile?.createdBy === "sso"
      && m.account.profile?.role !== "orgAdmin" && m.account.claims?.role !== "orgAdmin") replace = { uid: m.uid, wipe: true };
    else return no("sso-linked");
  }
  if (i.callerHasIdentity) return no("sso-linked");
  const made = !!c.profile?.createdBy && c.profile.createdBy !== "sso";
  return { kind: "link", linked: made ? "org-made" : "self", replace };
}

/** The test card's decision, as an id the wizard words ("would sign in as …", "would create a student", "would refuse: …"). */
export function testOutcome(d: SignInDecision): string {
  switch (d.kind) {
    case "refuse": return `refuse:${d.code}`;
    case "wait": return "wait";
    case "signin": return d.raise ? "signin-raise" : "signin";
    case "link-org-made": return "link-org-made";
    case "jit": return d.role === "teacher" ? "create-teacher" : "create-student";
  }
}

// ---- the JIT allowance (design §5.4) ----

export const JIT_HOURLY_MIN = 200;
export const DEFAULT_CEILING = 2000;
/** New accounts per organization per hour: 200, or a quarter of its members when that is more. */
export const jitHourlyLimit = (memberCount: number) => Math.max(JIT_HOURLY_MIN, Math.floor(Math.max(0, memberCount) * 0.25));
/** The members ceiling when a platform admin set none: licence seats × 1.5, or 2,000 without a licence. */
export const defaultCeiling = (seats?: number | null) => (typeof seats === "number" && seats > 0 ? Math.floor(seats * 1.5) : DEFAULT_CEILING);
/** Whether one more account may be made now. */
export function jitAllowed(a: { hourCount: number; memberCount: number; ceiling: number }): boolean {
  return a.hourCount < jitHourlyLimit(a.memberCount) && a.memberCount + 1 <= a.ceiling;
}
export const hourOf = (now: number) => Math.floor(now / 3600_000);
/**
 * ssoHealth.jit is one counter per hour, `h<hour>` → how many accounts were made in it. A field per hour, so the
 * sign-in raises it with an increment and reads nothing (a counter it had to read first would be locked by every first
 * sign-in of a school at once). The daily job deletes the hours that are over (jitStale).
 */
export const jitKey = (now: number) => `h${hourOf(now)}`;
/** ssoHealth.jit as stored, read for this hour (an earlier hour's counter counts 0). */
export function jitCount(stored: unknown, now: number): number {
  const n = (stored as Record<string, unknown> | null | undefined)?.[jitKey(now)];
  return typeof n === "number" && n >= 0 ? n : 0;
}
/** The fields of ssoHealth.jit that are not this hour's or the one before (anything else kept there too). */
export function jitStale(stored: unknown, now: number): string[] {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return [];
  const keep = new Set([jitKey(now), jitKey(now - 3600_000)]);
  return Object.keys(stored).filter((k) => !keep.has(k));
}

// ---- slugs (design §3 ssoSlugs) ----

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const SLUG_EXTRA_RESERVED = ["sso", "login", "auth", "school", "schools", "darsi", "callback", "oidc", "saml"];
const SUFFIX = "abcdefghjkmnpqrstuvwxyz23456789";
/** A name kept away from schools: sitesCore's reserved web names, plus sign-in words. */
export const isReservedSlug = (s: string) => isReservedName(`${s}.darsiai.org`) || SLUG_EXTRA_RESERVED.includes(s);
/** A slug a platform admin may set: lower case, digits and single hyphens, 1–50 characters, not reserved. */
export const isSlug = (v: unknown): v is string => typeof v === "string" && SLUG.test(v) && !v.includes("--") && !isReservedSlug(v);

/**
 * The server's slug for an approved name: Latin letters and digits of the name (accents dropped; an Arabic name gives
 * "school"), at most 30, then "-" and 4 random characters without look-alikes, so a slug never imitates another
 * school's and a freed one is never guessed.
 */
export function slugify(name: string, rand: (n: number) => number = randomInt): string {
  let base = String(name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (base.length > 30) base = base.slice(0, 30).replace(/-[^-]*$/, "") || base.slice(0, 30);
  base = base.replace(/-+$/, "");
  if (!base || isReservedSlug(base)) base = "school";
  let suffix = "";
  for (let k = 0; k < 4; k++) suffix += SUFFIX[rand(SUFFIX.length)];
  return `${base}-${suffix}`;
}

// ---- discovery (design §9) ----

export type DiscoveryHint = "document" | "issuer-mismatch" | "endpoint" | "pkce" | "alg" | "response-type" | "auth-method" | "constants";
export type DiscoveryCheck =
  | { ok: true; endpoints: Endpoints; pkce: "s256" | "unadvertised"; issParam: boolean; authMethods: AuthMethod[]; authMethod: AuthMethod; algs: string[] }
  | { ok: false; code: "sso-discovery" | "sso-issuer"; hint: DiscoveryHint; got?: string; want?: string };

/** An endpoint from a document: https (loopback http only in the emulator), no user or fragment, ≤ 500 characters. */
export function endpointOk(v: unknown, emulator = false): v is string {
  if (typeof v !== "string" || v.length > 500) return false;
  let u: URL;
  try { u = new URL(v); } catch { return false; }
  if (u.username || u.password || u.hash || v.includes("#")) return false;
  const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost";
  if (u.protocol === "https:") return !loopback || emulator;
  return u.protocol === "http:" && emulator && loopback;
}
const originOf = (v: string) => { try { return new URL(v).origin; } catch { return ""; } };

/**
 * Check a discovery document for the issuer it was fetched for (Check connection, and ssoJob's refresh). The issuer
 * must match exactly; endpoints must be https; PKCE is refused only when `code_challenge_methods_supported` is present
 * and lacks S256 (Entra never advertises it, and S256 is always sent); an RS256/PS256/ES256 signing algorithm must be
 * offered; the client authenticates with client_secret_basic or client_secret_post (basic preferred, the spec's
 * default). Google and Microsoft keep their constant endpoints: the document is only compared with them (by origin, so
 * a moved path at the same host doesn't fail every school's check).
 */
export function checkDiscovery(doc: unknown, want: { issuer: string; preset: Preset; tenant?: string | null }, emulator = false): DiscoveryCheck {
  const no = (hint: DiscoveryHint, extra: { got?: string; want?: string } = {}): DiscoveryCheck => ({ ok: false, code: "sso-discovery", hint, ...extra });
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return no("document");
  const d = doc as Record<string, unknown>;
  if (d.issuer !== want.issuer) return no("issuer-mismatch", { got: typeof d.issuer === "string" ? d.issuer.slice(0, 300) : "", want: want.issuer });
  if (rulesFor(want.issuer, emulator).kind === "refused") return { ok: false, code: "sso-issuer", hint: "document" };
  if (!endpointOk(d.authorization_endpoint, emulator) || !endpointOk(d.token_endpoint, emulator) || !endpointOk(d.jwks_uri, emulator)) return no("endpoint");
  if (Array.isArray(d.response_types_supported) && !d.response_types_supported.includes("code")) return no("response-type");
  let pkce: "s256" | "unadvertised" = "unadvertised";
  if (d.code_challenge_methods_supported !== undefined) {
    if (!Array.isArray(d.code_challenge_methods_supported) || !d.code_challenge_methods_supported.includes("S256")) return no("pkce");
    pkce = "s256";
  }
  // id_token_signing_alg_values_supported is required by the spec and always lists RS256; absent, assume RS256.
  const offered = Array.isArray(d.id_token_signing_alg_values_supported) ? d.id_token_signing_alg_values_supported : ["RS256"];
  const algs = ID_TOKEN_ALGS.filter((a) => offered.includes(a));
  if (!algs.length) return no("alg");
  const methods = Array.isArray(d.token_endpoint_auth_methods_supported) ? d.token_endpoint_auth_methods_supported : ["client_secret_basic"];
  const authMethods: AuthMethod[] = [];
  if (methods.includes("client_secret_basic")) authMethods.push("basic");
  if (methods.includes("client_secret_post")) authMethods.push("post");
  if (!authMethods.length) return no("auth-method");

  let endpoints: Endpoints = {
    authorization: d.authorization_endpoint as string, token: d.token_endpoint as string, jwks: d.jwks_uri as string,
    ...(endpointOk(d.end_session_endpoint, emulator) ? { endSession: d.end_session_endpoint as string } : {}),
  };
  const fixed = want.preset === "google" || want.preset === "microsoft" ? constantEndpoints(want.preset, want.tenant) : null;
  if (want.preset === "google" || want.preset === "microsoft") {
    if (!fixed) return no("constants");
    const moved = (["authorization", "token", "jwks"] as const).find((k) => originOf(fixed[k]) !== originOf(endpoints[k]));
    if (moved) return no("constants", { got: originOf(endpoints[moved]), want: originOf(fixed[moved]) });
    endpoints = fixed;
  }
  return { ok: true, endpoints, pkce, issParam: d.authorization_response_iss_parameter_supported === true, authMethods, authMethod: authMethods[0], algs };
}

/**
 * Endpoints whose origin changed since the test (ssoJob's refresh): such a change is never applied silently (problem
 * `endpoints-moved`, retest required). A path change on the same origin may be applied. `endSession` counts only when
 * both have one.
 */
export function endpointsMoved(tested: Endpoints, fresh: Endpoints): (keyof Endpoints)[] {
  const keys: (keyof Endpoints)[] = ["authorization", "token", "jwks"];
  if (tested.endSession && fresh.endSession) keys.push("endSession");
  return keys.filter((k) => originOf(tested[k] as string) !== originOf(fresh[k] as string));
}

/** The host a token request goes to (the secret is sealed to it). */
export const tokenHost = (endpoints: Endpoints) => { try { return new URL(endpoints.token).host; } catch { return ""; } };

// ---- start: prompt, authorization URL, callback and return addresses (design §4) ----

export type ProviderKind = "google" | "microsoft" | "other";
/** Which provider's parameters to send: the issuer's kind for Google and Microsoft, whatever the preset. */
export function providerKind(issuer: string, emulator = false): ProviderKind {
  const k = rulesFor(issuer, emulator).kind;
  return k === "google" || k === "microsoft" ? k : "other";
}

/**
 * The `prompt` to send (design §4 start), and whether to add `max_age=0`.
 * - link and test: a fresh sign-in at the provider. `login` where it exists; Google has no `prompt=login`, so it gets
 *   `select_account` with `max_age=0`, which makes Google ask for the password again.
 * - signin: the account chooser on Google and Microsoft unless the school chose "personal devices only"; `login` on the
 *   others when this device signed out of a school session (shared computers).
 */
export function promptFor(o: { mode: "signin" | "link" | "test"; kind: ProviderKind; personalDevices: boolean; signedOutHere: boolean }): { prompt: "login" | "select_account" | null; maxAge0: boolean } {
  if (o.mode !== "signin") return o.kind === "google" ? { prompt: "select_account", maxAge0: true } : { prompt: "login", maxAge0: false };
  if (o.kind !== "other") return { prompt: o.personalDevices ? null : "select_account", maxAge0: false };
  return { prompt: o.signedOutHere ? "login" : null, maxAge0: false };
}

/** The per-organization redirect URI the school registers: SSO_CALLBACK/<orgId> (the immutable id, never the slug). */
export function callbackUrl(base: string, orgId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(orgId)) throw new Error("sso-org-id");
  return `${base.replace(/\/+$/, "")}/${orgId}`;
}

/** The authorization request (design §4 start), built with URL and searchParams from the stored, tested endpoint. */
export function buildAuthorizationUrl(o: {
  authorization: string; clientId: string; redirectUri: string; scopes: readonly string[]; state: string; nonce: string; challenge: string;
  kind: ProviderKind; prompt: "login" | "select_account" | null; maxAge0: boolean; hd?: string | null;
}): string {
  const u = new URL(o.authorization);
  const p = u.searchParams;
  p.set("response_type", "code");
  p.set("client_id", o.clientId);
  p.set("redirect_uri", o.redirectUri);
  p.set("scope", o.scopes.includes("openid") ? o.scopes.join(" ") : ["openid", ...o.scopes].join(" "));
  p.set("state", o.state);
  p.set("nonce", o.nonce);
  p.set("code_challenge", o.challenge);
  p.set("code_challenge_method", "S256");
  if (o.prompt) p.set("prompt", o.prompt);
  if (o.maxAge0) p.set("max_age", "0");
  // hd is only a hint to Google's chooser; the callback checks the token's hd against the list.
  if (o.kind === "google" && o.hd) p.set("hd", o.hd);
  if (o.kind === "microsoft") p.set("response_mode", "query");
  return u.toString();
}

/** The short, non-secret flow id the page stores beside its verifier and the callback repeats in the fragment. */
export const flowOf = (stateId: string) => stateId.slice(0, 8);

/**
 * Where the callback sends the person (design §4): a constant path per mode on the start's own origin. A test goes
 * back to whoever ran it: an admin's own to the wizard (the organization's tab, or the school's page for a platform
 * admin), a student's (started from a test link, with no sign-in) to /signin, the page the link opened and the only
 * one of the three a signed-out person can open.
 */
export function returnPath(mode: "signin" | "link" | "test", orgId: string, platformAdmin: boolean, studentTest = false): string {
  if (mode === "signin" || (mode === "test" && studentTest)) return "/signin";
  if (mode === "link") return "/me";
  return platformAdmin ? `/super/orgs/${encodeURIComponent(orgId)}?tab=signin` : "/admin?tab=signin";
}

/**
 * The callback's Location: the mode's path on `returnOrigin`, with `#sso=<ticket>&f=<flow>` or
 * `#sso_error=<code>&f=<flow>`. null when the address would not be on exactly that origin (asserted, never assumed).
 */
export function returnUrl(o: { returnOrigin: string; mode: "signin" | "link" | "test"; orgId: string; platformAdmin: boolean; studentTest?: boolean; flow: string } & ({ ticket: string } | { error: SsoRefusal; detail?: string })): string | null {
  let u: URL;
  try { u = new URL(returnPath(o.mode, o.orgId, o.platformAdmin, o.studentTest === true), o.returnOrigin); } catch { return null; }
  if (u.origin !== o.returnOrigin) return null;
  const f = new URLSearchParams();
  if ("ticket" in o) f.set("sso", o.ticket); else { f.set("sso_error", o.error); if (o.detail) f.set("d", o.detail.slice(0, 64)); }
  f.set("f", o.flow);
  u.hash = f.toString();
  return u.toString();
}

/** Google's `hd` hint: the first allowed domain. */
export const hdHint = (allowedDomains: readonly string[]) => allowedDomains[0] ?? null;
export { GOOGLE_ISSUER, PRESET_INFO };
