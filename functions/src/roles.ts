/** Roles compared, without Firebase (so the tests can run it). */
/** How much a role may do, for "did this change take power away?". */
const RANK: Record<string, number> = { learner: 0, student: 0, teacher: 1, orgAdmin: 2, superadmin: 3 };
/** A claims change that removes power: a lower role, or leaving (or changing) an organization. */
export const losesPower = (before: { role?: unknown; orgId?: unknown }, after: { role: string; orgId: string | null }) =>
  (RANK[String(before.role ?? "learner")] ?? 0) > (RANK[after.role] ?? 0)
  || (Boolean(before.orgId) && (before.orgId ?? null) !== after.orgId);
