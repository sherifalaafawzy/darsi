/**
 * School sign-in (OpenID Connect; TECHNICAL.md "School sign-in"): the five presets an organization admin chooses from,
 * the endpoints that never come from discovery (Google and Microsoft), the console steps the wizard words, and the
 * issuers Darsi refuses because anyone in the world can hold an account there. Pure: no Firestore, no Auth, no network.
 *
 * The preset decides what the wizard asks and which parameters Darsi sends; it never decides what a token is trusted
 * for. Those rules come from the issuer itself (ssoCore.rulesFor), so "Other" pointed at Google or Microsoft still gets
 * Google's or Microsoft's rules.
 */

export type Preset = "google" | "microsoft" | "okta" | "keycloak" | "oidc";
export const PRESETS: readonly Preset[] = ["google", "microsoft", "okta", "keycloak", "oidc"];
export const isPreset = (v: unknown): v is Preset => typeof v === "string" && (PRESETS as readonly string[]).includes(v);

/** The endpoints a connection uses: from these constants (Google, Microsoft) or from discovery on the server. */
export interface Endpoints { authorization: string; token: string; jwks: string; endSession?: string }

export const GOOGLE_ISSUER = "https://accounts.google.com";
/** Google ID tokens carry either form in `iss` (Google's documentation says to accept both). */
export const GOOGLE_ISSUERS: readonly string[] = [GOOGLE_ISSUER, "accounts.google.com"];
export const GOOGLE_ENDPOINTS: Readonly<Endpoints> = Object.freeze({
  authorization: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  jwks: "https://www.googleapis.com/oauth2/v3/certs",
});

export const MICROSOFT_HOSTS: readonly string[] = ["login.microsoftonline.com", "sts.windows.net"];
/**
 * Microsoft tenants that are not one school: the multi-tenant aliases, the personal-account (MSA) tenant as it shows
 * in v2 tokens, and the "Microsoft Services" tenant personal accounts carry in v1 tokens. Anyone can get an account in
 * each of them, so a connection that names one would admit the world.
 */
export const MICROSOFT_SHARED_TENANTS: readonly string[] = [
  "common", "organizations", "consumers", "9188040d-6c67-4c5b-b112-36a304b66dad", "f8cdef31-a31e-4b4a-93e4-5f571e91255a",
];
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isGuid = (v: unknown): v is string => typeof v === "string" && GUID.test(v);
/** A single school's Entra tenant: a lower-case GUID that is not one of the shared tenants. */
export const isSchoolTenant = (v: unknown): v is string => isGuid(v) && !MICROSOFT_SHARED_TENANTS.includes(v);

export const microsoftIssuer = (tenant: string) => `https://login.microsoftonline.com/${tenant}/v2.0`;
export const microsoftEndpoints = (tenant: string): Endpoints => ({
  authorization: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
  token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  jwks: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
  endSession: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/logout`,
});

/**
 * Hosts of issuers whose accounts anyone can make (consumer sign-ins and multi-customer platforms that share one
 * issuer). Refused whatever the preset (`sso-issuer`). Google's and Microsoft's shared forms are handled by their own
 * rules (hd, tenant) instead of this list.
 */
export const SHARED_ISSUER_HOSTS: readonly string[] = [
  "appleid.apple.com", "www.facebook.com", "facebook.com", "limited.facebook.com", "api.login.yahoo.com", "login.yahoo.com",
  "www.linkedin.com", "linkedin.com", "gitlab.com", "id.twitch.tv", "login.salesforce.com", "test.salesforce.com",
  "www.paypal.com", "api.paypal.com", "secure.login.gov", "login.live.com", "account.live.com", "github.com",
  "token.actions.githubusercontent.com", "discord.com", "x.com", "twitter.com", "api.twitter.com",
];

/** What the wizard's "Connect" step asks for, per preset (the server builds the issuer from these). */
export type ConnectField = "tenant" | "domain" | "oktaServer" | "realm" | "issuer";

/**
 * Ids of the console steps the wizard words (admin/sso-strings) for each preset, in order. Stable ids, never text, so
 * the server and the screens agree without either holding the other's words.
 */
export type ConsoleStep =
  | "google-client-web" | "google-internal" | "google-cloud-access" | "google-under18" | "google-redirect" | "google-copy-secret"
  | "ms-register-single-tenant" | "ms-web-platform" | "ms-redirect" | "ms-secret-value" | "ms-optional-email" | "ms-app-roles" | "ms-admin-consent"
  | "okta-oidc-web" | "okta-redirect" | "okta-assign-groups" | "okta-custom-server" | "okta-groups-claim"
  | "kc-realm" | "kc-client" | "kc-redirect" | "kc-client-auth" | "kc-groups-mapper"
  | "oidc-register" | "oidc-redirect" | "oidc-confidential" | "oidc-email-claims";

export interface PresetInfo {
  id: Preset;
  /** Endpoints from constants (no discovery used for sign-in; discovery only checks them). */
  constantEndpoints: boolean;
  /** What identifies a person: `sub`, or `tid:oid` for Microsoft (Entra's `sub` is pairwise per app registration). */
  subjectKind: "sub" | "tid-oid";
  fields: readonly ConnectField[];
  steps: readonly ConsoleStep[];
  /** The teacher rule kinds the wizard offers (ssoCore.TeacherRule). */
  teacherRules: readonly ("email" | "role" | "group" | "claim")[];
  /** Whether "allowed email domains" must have at least one entry. */
  domainsRequired: boolean;
  /** Months to prefill "the secret expires on" with (Entra's default secret lifetime is 6 months). */
  secretMonths: number | null;
  /** The host the person continues at, when it is fixed by the preset (shown on the sign-in button). */
  providerHost: string | null;
}

export const PRESET_INFO: Readonly<Record<Preset, PresetInfo>> = Object.freeze({
  google: {
    id: "google", constantEndpoints: true, subjectKind: "sub", fields: [],
    steps: ["google-client-web", "google-internal", "google-cloud-access", "google-under18", "google-redirect", "google-copy-secret"],
    teacherRules: ["email"], domainsRequired: true, secretMonths: null, providerHost: "accounts.google.com",
  },
  microsoft: {
    id: "microsoft", constantEndpoints: true, subjectKind: "tid-oid", fields: ["tenant"],
    steps: ["ms-register-single-tenant", "ms-web-platform", "ms-redirect", "ms-secret-value", "ms-optional-email", "ms-app-roles", "ms-admin-consent"],
    teacherRules: ["role", "group"], domainsRequired: false, secretMonths: 6, providerHost: "login.microsoftonline.com",
  },
  okta: {
    id: "okta", constantEndpoints: false, subjectKind: "sub", fields: ["domain", "oktaServer"],
    steps: ["okta-oidc-web", "okta-redirect", "okta-assign-groups", "okta-custom-server", "okta-groups-claim"],
    teacherRules: ["claim"], domainsRequired: false, secretMonths: null, providerHost: null,
  },
  keycloak: {
    id: "keycloak", constantEndpoints: false, subjectKind: "sub", fields: ["domain", "realm"],
    steps: ["kc-realm", "kc-client", "kc-redirect", "kc-client-auth", "kc-groups-mapper"],
    teacherRules: ["claim"], domainsRequired: false, secretMonths: null, providerHost: null,
  },
  oidc: {
    id: "oidc", constantEndpoints: false, subjectKind: "sub", fields: ["issuer"],
    steps: ["oidc-register", "oidc-redirect", "oidc-confidential", "oidc-email-claims"],
    teacherRules: ["claim"], domainsRequired: false, secretMonths: null, providerHost: null,
  },
});

/** Where discovery lives for an issuer (OpenID Connect Discovery 1.0 §4: the issuer plus the well-known path). */
export const discoveryUrl = (issuer: string) => `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

/**
 * The issuers to try for the fields typed in the wizard, best first. Okta: the org authorization server, or a custom
 * one (`default` or an id). Keycloak: both path forms (`/realms/x` since Keycloak 17, `/auth/realms/x` before), and
 * the one whose discovery answers with a matching `issuer` is kept. Fields are already checked by ssoCore.validateConfig.
 */
export function issuerCandidates(preset: Preset, f: { tenant?: string | null; domain?: string | null; oktaServer?: string | null; realm?: string | null; issuer?: string | null }): string[] {
  switch (preset) {
    case "google": return [GOOGLE_ISSUER];
    case "microsoft": return f.tenant ? [microsoftIssuer(f.tenant)] : [];
    case "okta": return f.domain ? [f.oktaServer ? `https://${f.domain}/oauth2/${f.oktaServer}` : `https://${f.domain}`] : [];
    case "keycloak": return f.domain && f.realm ? [`https://${f.domain}/realms/${encodeURIComponent(f.realm)}`, `https://${f.domain}/auth/realms/${encodeURIComponent(f.realm)}`] : [];
    case "oidc": return f.issuer ? [f.issuer] : [];
  }
}

/** The constant endpoints of a preset, or null when they come from discovery. */
export function constantEndpoints(preset: Preset, tenant?: string | null): Endpoints | null {
  if (preset === "google") return { ...GOOGLE_ENDPOINTS };
  if (preset === "microsoft") return tenant && isSchoolTenant(tenant) ? microsoftEndpoints(tenant) : null;
  return null;
}
