/**
 * What only platform admins do to organizations and accounts (TECHNICAL.md "Platform administration"): create, edit
 * and delete organizations, put anyone in an organization with any role (org admin included), and change anyone's
 * role anywhere, platform admin included. Roles live in Auth custom claims, so every change goes through here.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { audit, caller, db, str, type Role } from "./admin.js";
import { generateCode } from "./passwords.js";
import { bucket } from "./storage.js";
import { writeClaims } from "./billing.js";

const ROLES: Role[] = ["learner", "student", "teacher", "orgAdmin", "superadmin"];
const IN_ORG: Role[] = ["student", "teacher", "orgAdmin"];

function requireSuper(req: CallableRequest) {
  const c = caller(req);
  if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only.");
  return c;
}

/** An organization's editable details, checked: name 2–120 characters, the rest short text. */
function details(d: Record<string, unknown> | undefined, partial: boolean) {
  const out: Record<string, string> = {};
  for (const [k, max] of [["name", 120], ["type", 40], ["country", 80], ["city", 80]] as const) {
    if (d?.[k] === undefined) continue;
    out[k] = str(d[k], max);
  }
  if ((!partial || "name" in out) && (out.name ?? "").length < 2) throw new HttpsError("invalid-argument", "The name needs 2 characters or more.");
  return out;
}

/** Sets claims and the profile; org changes move the member counts and clear the old org's class and teacher. */
export async function assign(uid: string, role: Role, orgId: string | null) {
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists) throw new HttpsError("not-found", "No such account.");
  const before = (user.get("orgId") as string | null | undefined) ?? null;
  await user.ref.set({ role, orgId, claimsUpdatedAt: FieldValue.serverTimestamp(), ...(before !== orgId ? { teacherId: null, group: null, superSeat: false } : {}) }, { merge: true });
  await writeClaims(uid, role, orgId);
  if (before !== orgId) {
    if (before) await db.doc(`orgs/${before}`).update({ memberCount: FieldValue.increment(-1) }).catch(() => {});
    if (orgId) await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(1) });
  }
  return { before };
}

export const createOrg = onCall(async (req) => {
  const c = requireSuper(req);
  const d = details(req.data, false);
  const codes = { teacher: generateCode(), student: generateCode() };
  const ref = db.collection("orgs").doc();
  const batch = db.batch();
  batch.set(ref, { type: "school", country: "", city: "", ...d, status: "active", createdBy: c.uid, createdAt: FieldValue.serverTimestamp(), reviewedAt: FieldValue.serverTimestamp(), memberCount: 0 });
  batch.set(db.doc(`orgs/${ref.id}/private/invites`), codes);
  batch.set(db.doc(`inviteCodes/${codes.teacher}`), { orgId: ref.id, role: "teacher" });
  batch.set(db.doc(`inviteCodes/${codes.student}`), { orgId: ref.id, role: "student" });
  await batch.commit();
  const admin = str(req.data?.adminUid, 128);
  if (admin) await assign(admin, "orgAdmin", ref.id);
  await audit("createOrg", c.uid, { orgId: ref.id, admin: admin || null });
  return { orgId: ref.id };
});

export const updateOrg = onCall(async (req) => {
  const c = requireSuper(req);
  const orgId = str(req.data?.orgId, 128);
  const ref = db.doc(`orgs/${orgId}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "No such organization.");
  const d = details(req.data, true);
  const status = req.data?.status;
  if (status !== undefined && status !== "active" && status !== "rejected") throw new HttpsError("invalid-argument", "status must be active or rejected.");
  await ref.update({ ...d, ...(status ? { status } : {}) });
  await audit("updateOrg", c.uid, { orgId, ...d, ...(status ? { status } : {}) });
  return { ok: true };
});

/**
 * Deletes an organization: its members become independent learners (their learning stays with them), its invite
 * codes stop working, and its own courses, logo and files go. The caller types its name to confirm.
 */
export const deleteOrg = onCall({ timeoutSeconds: 300 }, async (req) => {
  const c = requireSuper(req);
  const orgId = str(req.data?.orgId, 128);
  const ref = db.doc(`orgs/${orgId}`);
  const org = await ref.get();
  if (!org.exists) throw new HttpsError("not-found", "No such organization.");
  if (str(req.data?.confirm, 120) !== org.get("name")) throw new HttpsError("failed-precondition", "Type the organization's name to confirm.");
  const members = await db.collection("users").where("orgId", "==", orgId).select().get();
  for (const m of members.docs) {
    await m.ref.set({ role: "learner", orgId: null, teacherId: null, group: null, superSeat: false, claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeClaims(m.id, "learner", null); // their own subscription, if any, stays
  }
  const codes = await db.collection("inviteCodes").where("orgId", "==", orgId).get();
  await Promise.all(codes.docs.map((d) => d.ref.delete()));
  const units = await db.collection("units").where("owner", "==", orgId).get();
  for (const u of units.docs) { await db.doc(`unitDrafts/${u.id}`).delete(); await u.ref.delete(); }
  await bucket().deleteFiles({ prefix: `orgs/${orgId}/` }).catch(() => {});
  await db.recursiveDelete(ref);
  await audit("deleteOrg", c.uid, { orgId, name: org.get("name"), members: members.size, units: units.size });
  return { members: members.size, units: units.size };
});

/**
 * Any account's role and organization: students, teachers and org admins need an active organization; learners and
 * platform admins have none. A platform admin can't change their own role (so nobody locks the platform out).
 */
export const setUserRole = onCall(async (req) => {
  const c = requireSuper(req);
  const uid = str(req.data?.uid, 128), role = str(req.data?.role) as Role;
  if (!ROLES.includes(role)) throw new HttpsError("invalid-argument", "Invalid role.");
  if (uid === c.uid) throw new HttpsError("failed-precondition", "You cannot change your own role.");
  let orgId: string | null = null;
  if (IN_ORG.includes(role)) {
    orgId = str(req.data?.orgId, 128);
    const org = orgId ? await db.doc(`orgs/${orgId}`).get() : null;
    if (!org?.exists) throw new HttpsError("not-found", "Choose an organization.");
    if (org.get("status") !== "active") throw new HttpsError("failed-precondition", "This organization is not active.");
  }
  const { before } = await assign(uid, role, orgId);
  await audit("setUserRole", c.uid, { uid, role, orgId, before });
  return { ok: true };
});
