/** Roles compared, without Firebase (so the tests can run it). */
/** How much a role may do, for "did this change take power away?". */
const RANK: Record<string, number> = { learner: 0, student: 0, teacher: 1, orgAdmin: 2, superadmin: 3 };
/** A claims change that removes power: a lower role, or leaving (or changing) an organization. */
export const losesPower = (before: { role?: unknown; orgId?: unknown }, after: { role: string; orgId: string | null }) =>
  (RANK[String(before.role ?? "learner")] ?? 0) > (RANK[after.role] ?? 0)
  || (Boolean(before.orgId) && (before.orgId ?? null) !== after.orgId);

/**
 * Whether an account still teaches in an organization (a teacher or admin of it): a student's project alert goes to
 * their teacher only then (notify.ts onSubmissionCreated), else to the organization's admins.
 */
export const stillTeaches = (teacher: { role?: unknown; orgId?: unknown } | undefined, orgId: string | null | undefined) =>
  !!teacher && !!orgId && teacher.orgId === orgId && (teacher.role === "teacher" || teacher.role === "orgAdmin");

/**
 * A username login (`<name>@users.darsi.app`) that someone signed up for by hand rather than one an organization made
 * (createMembers sets `createdBy`). Auth can't refuse the domain at sign-up without a blocking function, so the rules
 * give such an account no profile, and joinOrg and requestOrg refuse it: it could otherwise pose as a school's username
 * account, or take a login a school means to give a pupil (sec-rules-05).
 */
export const handMadeUsername = (email: unknown, createdBy: unknown, domain = "users.darsi.app") =>
  typeof email === "string" && email.toLowerCase().endsWith(`@${domain}`) && !createdBy;

/**
 * Why a platform admin can't approve an organization request now, or null (reviewOrg): its requester has since joined
 * another organization (approving would take them out of it without a word to that school), or became a platform admin
 * (approving would demote them). A platform admin rejects such a request instead.
 */
export function approveProblem(requester: { role?: unknown; orgId?: unknown } | undefined, orgId: string): "requester-in-org" | "requester-staff" | null {
  if (requester?.role === "superadmin") return "requester-staff";
  if (typeof requester?.orgId === "string" && requester.orgId && requester.orgId !== orgId) return "requester-in-org";
  return null;
}

/**
 * Why a platform admin can't name this account as a new organization's first admin (createOrg), or null: not
 * themselves (they would lose the platform role), not another platform admin (a demotion is done on purpose, from that
 * person's page), and only an account that has a profile.
 */
export function firstAdminProblem(adminUid: string, callerUid: string, profile: { exists: boolean; get(field: string): unknown }): "self" | "missing" | "superadmin" | null {
  if (adminUid === callerUid) return "self";
  if (!profile.exists) return "missing";
  if (profile.get("role") === "superadmin") return "superadmin";
  return null;
}

/**
 * Who may delete or export an account's data (account.ts), or why not. `self`: the person themself; they may delete
 * an account they made (not one their organization made, which its admins manage), and never while a platform admin
 * or an org admin (someone else must take the role over first). Platform admins act for anyone but themselves and other
 * platform admins; org admins only for students and teachers their organization made.
 */
export type AccountAction = "delete" | "export";
export interface AccountTarget { uid: string; exists: boolean; role?: unknown; orgId?: unknown; createdBy?: unknown; email?: string | null }
export interface AccountCaller { uid: string; role: string; orgId?: string | null }
export function accountActionProblem(action: AccountAction, c: AccountCaller, t: AccountTarget, usernameDomain = "users.darsi.app"):
  "self-staff" | "self-org" | "superadmin" | "not-yours" | "missing" | null {
  const orgMade = Boolean(t.createdBy) || Boolean(t.email?.toLowerCase().endsWith(`@${usernameDomain}`));
  if (c.uid === t.uid) {
    if (action === "export") return null;
    if (c.role === "superadmin" || c.role === "orgAdmin" || t.role === "superadmin" || t.role === "orgAdmin") return "self-staff";
    if (orgMade && t.orgId) return "self-org";
    return null;
  }
  if (!t.exists) return c.role === "superadmin" ? null : "missing";
  if (t.role === "superadmin") return "superadmin";
  if (c.role === "superadmin") return null;
  if (c.role === "orgAdmin" && c.orgId && t.orgId === c.orgId && orgMade && (t.role === "student" || t.role === "teacher")) return null;
  return "not-yours";
}
