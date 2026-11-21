/**
 * An organization that is suspended, or being deleted, is managed by platform admins only: its own admins keep the
 * role in their claims (writeClaims adds `frozen`, billing.ts), so a callable that compares role and organization
 * alone would go on serving them for as long as the suspension lasts. Every callable an organization's admin reaches
 * calls this after its role check (index.ts requireOrgAdmin and orgMembers.ts orgAdmin do the same in their own words).
 *
 * The organization's status is what decides, not the `frozen` claim: the claim follows the status and can lag behind
 * it (refreshStaff reports the accounts it could not reach).
 *
 * A module of its own, not part of admin.ts: it needs only `db`, so the tests that stand in for admin.ts need nothing new.
 */
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin.js";

/**
 * Throws `permission-denied` with reason `org-suspended` or `org-deleting` (admin/refusals.ts and staff/errors.ts word
 * both) when `orgId` is suspended or being deleted and the caller is not a platform admin. `known`: the status, when
 * the caller has already read the organization's document (no second read).
 */
export async function refuseClosedOrg(c: { role: string }, orgId: string, known?: { status: unknown }): Promise<void> {
  if (c.role === "superadmin") return;
  const status = known ? known.status : (await db.doc(`orgs/${orgId}`).get()).get("status");
  if (status === "suspended") throw new HttpsError("permission-denied", "This organization is suspended. Ask Darsi's team to lift it.", { reason: "org-suspended" });
  if (status === "deleting") throw new HttpsError("permission-denied", "This organization is being deleted.", { reason: "org-deleting" });
}
