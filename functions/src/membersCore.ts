/**
 * The pure parts of createMembers (index.ts), tested in test/members.test.ts: the order accounts are made in, the
 * logins a teacher can be named by in a sheet, and what a login that is already taken means. And of joining: an
 * invite code's expiry and limit, an organization's join policy, and the list of people it removed.
 */

/** Roles a pupil's "teacher email" may point at. */
const TEACHING = new Set(["teacher", "orgAdmin"]);

/**
 * Row indexes in the order to create them: teachers and admins first, each group in file order. A pupil can then name
 * a teacher listed anywhere in the same request (the sheet's template lists the teacher first, but nothing says a
 * sheet must), and a teacher created in this request is found.
 */
export function creationOrder(roles: readonly string[]): number[] {
  return creationWaves(roles).flat();
}
/**
 * The same order in its two waves: [teachers and admins, everyone else]. createMembers makes several accounts at a
 * time, and finishes the first wave before it starts the second, so every pupil still finds a teacher made in the
 * same request.
 */
export function creationWaves(roles: readonly string[]): [number[], number[]] {
  const staff: number[] = [], rest: number[] = [];
  roles.forEach((r, i) => (TEACHING.has(r) ? staff : rest).push(i));
  return [staff, rest];
}

/** How many accounts createMembers makes at a time: one at a time, 500 rows did not fit the function's 540 s. */
export const CREATE_WIDTH = 6;
/**
 * Runs `job` for every item, at most `width` at a time, each started in list order. A job that throws stops the pool
 * (the others already started still finish), so jobs that must all be tried catch their own errors.
 */
export async function pool<T>(items: readonly T[], width: number, job: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => { while (next < items.length) await job(items[next++]); };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(Math.floor(width) || 1, items.length)) }, worker));
}
/** A list in groups of `n` (the last one shorter). */
export const chunks = <T>(list: readonly T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n));

/** The length of the passwords createMembers makes: what the admin chose, kept to 8–32 (10 when it says nothing). */
export const passwordLength = (v: unknown): number => Math.min(32, Math.max(8, Math.floor(Number(v)) || 10));

/**
 * What a sheet's teacher column may hold for an account: its email, and for a username login the username and the
 * hidden email it maps to. All lower case, as createMembers compares them.
 */
export function teacherKeys(email: string, username: string | null | undefined, toEmail: (u: string) => string): string[] {
  const keys = new Set([email.toLowerCase()]);
  if (username) { keys.add(username.toLowerCase()); keys.add(toEmail(username).toLowerCase()); }
  return [...keys].filter(Boolean);
}

/**
 * Why a row wasn't created, as a code the admin's screen words in their language (AddPeople's Results): the server's
 * English `error` stays for older apps and the logs.
 */
export type RowReason = "missingName" | "invalidEmail" | "invalidUsername" | "exists" | "taken";

/**
 * What a profile lacks that its owner's app would have written at sign-up, from the Auth account: the email (Auth's,
 * in lower case, as the rules compare it), the name and the creation time. A server write can reach a brand-new
 * account before its app creates the profile (joining with an invite code, or a guest's lessons synced at sign-up);
 * the app's own create is then refused because the document exists, so the server fills these. Nothing for a profile
 * that has its email (every real profile does), or when Auth has no account. `createdAt: true` means "now".
 */
export function missingBasics(p: { email?: unknown; name?: unknown; createdAt?: unknown } | undefined, a: { email?: string; displayName?: string } | null | undefined):
  { email?: string; name?: string; createdAt?: true } {
  if (!a || (typeof p?.email === "string" && p.email)) return {};
  const name = (a.displayName ?? "").trim().slice(0, 120);
  return {
    ...(a.email ? { email: a.email.toLowerCase() } : {}),
    ...(!p?.name && name ? { name } : {}),
    ...(!p?.createdAt ? { createdAt: true as const } : {}),
  };
}

/** How many logins createMembers draws for a person before it gives up (each draw is one in tens of thousands). */
export const MAX_DRAWS = 6;

/**
 * createUser failed: "retry" with a new login when the login was generated and is taken (draws left), "taken" when the
 * admin typed a username someone already has, "exists" when the typed email already has an account, null for any other
 * failure.
 */
export function onCreateError(code: string | undefined, o: { generated: boolean; typedEmail: boolean; draws: number }): "retry" | "taken" | "exists" | null {
  if (code !== "auth/email-already-exists") return null;
  if (o.generated) return o.draws < MAX_DRAWS ? "retry" : "taken";
  return o.typedEmail ? "exists" : "taken";
}

/* ---------- Joining with an invite code (joinOrg, setJoinPolicy, removeMember) ---------- */

/**
 * Why an invite code can't be used now, or null. inviteCodes/{code} may carry `expiresAt` (ms), `maxUses` and `uses`;
 * a code without them never expires and has no limit, as every code did before 2026-11.
 */
export function codeProblem(inv: { expiresAt?: unknown; maxUses?: unknown; uses?: unknown } | undefined, now: number): "code-expired" | "code-used-up" | null {
  const expiresAt = Number(inv?.expiresAt) || 0, maxUses = Number(inv?.maxUses) || 0;
  if (expiresAt && now >= expiresAt) return "code-expired";
  if (maxUses && (Number(inv?.uses) || 0) >= maxUses) return "code-used-up";
  return null;
}

/** Who may join an organization with its codes (orgs/{orgId}/private/invites.policy). Nothing set: anyone with a code. */
export interface JoinPolicy { requireVerifiedEmail: boolean; allowedDomains: string[] }
export const readJoinPolicy = (p: unknown): JoinPolicy => {
  const o = (p && typeof p === "object" ? p : {}) as { requireVerifiedEmail?: unknown; allowedDomains?: unknown };
  return {
    requireVerifiedEmail: o.requireVerifiedEmail === true,
    allowedDomains: Array.isArray(o.allowedDomains) ? o.allowedDomains.filter((d): d is string => typeof d === "string" && !!d).map((d) => d.toLowerCase()) : [],
  };
};
/**
 * Why this account may not join under the organization's policy, or null. The email and whether it is verified come
 * from the ID token (Auth's own, never what a profile says). A domain must match exactly: "school.edu" does not let
 * "pupils.school.edu" in. An unverified address proves nothing about its domain, so a school that lists domains
 * should also require verified emails (the screen says so).
 */
export function policyProblem(policy: unknown, token: { email?: unknown; email_verified?: unknown } | undefined): "email-unverified" | "email-domain" | null {
  const p = readJoinPolicy(policy);
  if (p.requireVerifiedEmail && token?.email_verified !== true) return "email-unverified";
  if (p.allowedDomains.length) {
    const email = typeof token?.email === "string" ? token.email.toLowerCase() : "";
    const at = email.lastIndexOf("@");
    if (at < 1 || !p.allowedDomains.includes(email.slice(at + 1))) return "email-domain";
  }
  return null;
}

/** Limits on one invite code: null clears one, a missing field leaves it as it is. */
export interface CodeLimits { expiresAt?: number | null; maxUses?: number | null }
export interface JoinPolicyChange { policy: Partial<JoinPolicy>; codes: { teacher?: CodeLimits; student?: CodeLimits } }
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;
export const MAX_DOMAINS = 20, MAX_USES = 1_000_000;
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/**
 * What setJoinPolicy was asked to change, checked, or null when any part is wrong (the whole request is then refused
 * as `bad-policy`, and nothing is saved). Domains are trimmed, lower-cased, a leading "@" dropped, and repeated ones
 * merged: at most 20. An expiry is a time in the future (ms); a limit is 1 to a million uses.
 */
export function joinPolicyChange(d: unknown, now: number): JoinPolicyChange | null {
  if (!plain(d)) return null;
  const out: JoinPolicyChange = { policy: {}, codes: {} };
  if (d.requireVerifiedEmail !== undefined) {
    if (typeof d.requireVerifiedEmail !== "boolean") return null;
    out.policy.requireVerifiedEmail = d.requireVerifiedEmail;
  }
  if (d.allowedDomains !== undefined) {
    if (!Array.isArray(d.allowedDomains) || d.allowedDomains.length > MAX_DOMAINS) return null;
    const domains = new Set<string>();
    for (const raw of d.allowedDomains) {
      const domain = typeof raw === "string" ? raw.trim().toLowerCase().replace(/^@/, "") : "";
      if (domain.length > 253 || !DOMAIN.test(domain)) return null;
      domains.add(domain);
    }
    out.policy.allowedDomains = [...domains];
  }
  if (d.codes !== undefined) {
    if (!plain(d.codes) || Object.keys(d.codes).some((k) => k !== "teacher" && k !== "student")) return null;
    for (const role of ["teacher", "student"] as const) {
      const c = d.codes[role];
      if (c === undefined) continue;
      if (!plain(c)) return null;
      const limits: CodeLimits = {};
      if (c.expiresAt !== undefined) {
        if (c.expiresAt !== null && !(typeof c.expiresAt === "number" && Number.isSafeInteger(c.expiresAt) && c.expiresAt > now)) return null;
        limits.expiresAt = c.expiresAt as number | null;
      }
      if (c.maxUses !== undefined) {
        if (c.maxUses !== null && !(typeof c.maxUses === "number" && Number.isInteger(c.maxUses) && c.maxUses >= 1 && c.maxUses <= MAX_USES)) return null;
        limits.maxUses = c.maxUses as number | null;
      }
      out.codes[role] = limits;
    }
  }
  return out;
}

/** People an organization removed (orgs/{orgId}/private/removed.uids): their codes no longer let them back in. */
export type Removed = Record<string, { at: number; name?: string }>;
/** As many as the list keeps: beyond it the oldest removals are forgotten (each entry is small; the document stays far under 1 MB). */
export const REMOVED_MAX = 2000;
/** The list with one more removal, the oldest dropped beyond `max`. */
export function withRemoved(uids: Removed | undefined, uid: string, entry: { at: number; name?: string }, max = REMOVED_MAX): Removed {
  const out: Removed = { ...(uids ?? {}), [uid]: entry };
  const ids = Object.keys(out);
  if (ids.length > max) for (const id of ids.sort((a, b) => (out[a]?.at ?? 0) - (out[b]?.at ?? 0)).slice(0, ids.length - max)) delete out[id];
  return out;
}
