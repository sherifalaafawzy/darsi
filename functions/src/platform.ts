/**
 * What only platform admins do to organizations and accounts (TECHNICAL.md "Platform administration"): create, edit
 * and delete organizations, put anyone in an organization with any role (org admin included), and change anyone's
 * role anywhere, platform admin included. Roles live in Auth custom claims, so every change goes through here.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { audit, auth, db, freshCaller, releasePupils, requireSuper, str, type Role } from "./admin.js";
import { generateCode, isValidEmail, isValidUsername, usernameToEmail } from "./passwords.js";
import { firstAdminProblem } from "./roles.js";
import { bucket } from "./storage.js";
import { writeClaims } from "./billing.js";

const ROLES: Role[] = ["learner", "student", "teacher", "orgAdmin", "superadmin"];
const IN_ORG: Role[] = ["student", "teacher", "orgAdmin"];


/** An organization's editable details, checked: name 2–120 characters, the rest short text. */
function details(d: Record<string, unknown> | undefined, partial: boolean) {
  const out: Record<string, string> = {};
  for (const [k, max] of [["name", 120], ["type", 40], ["country", 80], ["city", 80]] as const) {
    if (d?.[k] === undefined) continue;
    out[k] = str(d[k], max);
  }
  if ((!partial || "name" in out) && (out.name ?? "").length < 2) throw new HttpsError("invalid-argument", "The name needs 2 characters or more.", { reason: "org-name" });
  return out;
}

/**
 * Sets claims and the profile; org changes move the member counts and clear the old org's class and teacher. Someone
 * who leaves an organization, or stops teaching in it, releases its pupils who had them as their teacher.
 */
export async function assign(uid: string, role: Role, orgId: string | null) {
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists) throw new HttpsError("not-found", "No such account.", { reason: "no-account" });
  const before = (user.get("orgId") as string | null | undefined) ?? null;
  const roleBefore = (user.get("role") as Role | undefined) ?? "learner";
  await user.ref.set({ role, orgId, claimsUpdatedAt: FieldValue.serverTimestamp(), ...(before !== orgId ? { teacherId: null, group: null, superSeat: false } : {}) }, { merge: true });
  await writeClaims(uid, role, orgId);
  if (before !== orgId) {
    if (before) await db.doc(`orgs/${before}`).update({ memberCount: FieldValue.increment(-1) }).catch(() => {});
    if (orgId) await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(1) });
  }
  if (before && (before !== orgId || (role !== "teacher" && role !== "orgAdmin"))) await releasePupils(before, uid);
  return { before, roleBefore };
}

export const createOrg = onCall(async (req) => {
  const c = await requireSuper(req);
  const d = details(req.data, false);
  // The first admin is checked before anything is written, so a refusal leaves no organization behind. Naming yourself
  // would make you an org admin and end your platform-admin sessions (setUserRole refuses self-changes for the same
  // reason); another platform admin is demoted only on purpose, from their own page.
  const admin = str(req.data?.adminUid, 128);
  if (admin) {
    const problem = firstAdminProblem(admin, c.uid, await db.doc(`users/${admin}`).get());
    if (problem === "self") throw new HttpsError("failed-precondition", "You can't make yourself an organization's admin: you would stop being a platform admin.", { reason: "admin-self" });
    if (problem === "missing") throw new HttpsError("not-found", "No such account.", { reason: "no-account" });
    if (problem === "superadmin") throw new HttpsError("failed-precondition", "That person is a platform admin. Change their role on their page first.", { reason: "admin-super" });
  }
  const codes = { teacher: generateCode(), student: generateCode() };
  const ref = db.collection("orgs").doc();
  const batch = db.batch();
  batch.set(ref, { type: "school", country: "", city: "", ...d, status: "active", createdBy: c.uid, createdAt: FieldValue.serverTimestamp(), reviewedAt: FieldValue.serverTimestamp(), memberCount: 0 });
  batch.set(db.doc(`orgs/${ref.id}/private/invites`), codes);
  batch.set(db.doc(`inviteCodes/${codes.teacher}`), { orgId: ref.id, role: "teacher" });
  batch.set(db.doc(`inviteCodes/${codes.student}`), { orgId: ref.id, role: "student" });
  await batch.commit();
  const was = admin ? await assign(admin, "orgAdmin", ref.id) : null;
  await audit("createOrg", c.uid, { orgId: ref.id, admin: admin || null, ...(was ? { adminBefore: { role: was.roleBefore, orgId: was.before } } : {}) });
  return { orgId: ref.id };
});

export const updateOrg = onCall(async (req) => {
  const c = await requireSuper(req);
  const orgId = str(req.data?.orgId, 128);
  const ref = db.doc(`orgs/${orgId}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "No such organization.", { reason: "no-org" });
  const d = details(req.data, true);
  const status = req.data?.status;
  if (status !== undefined && status !== "active" && status !== "rejected") throw new HttpsError("invalid-argument", "status must be active or rejected.", { reason: "bad-status" });
  await ref.update({ ...d, ...(status ? { status } : {}) });
  await audit("updateOrg", c.uid, { orgId, ...d, ...(status ? { status } : {}) });
  return { ok: true };
});

/**
 * Deletes an organization: its members become independent learners (their learning stays with them), its invite
 * codes stop working, and its own courses, logo and files go. The caller types its name to confirm.
 */
export const deleteOrg = onCall({ timeoutSeconds: 300 }, async (req) => {
  const c = await requireSuper(req);
  const orgId = str(req.data?.orgId, 128);
  const ref = db.doc(`orgs/${orgId}`);
  const org = await ref.get();
  if (!org.exists) throw new HttpsError("not-found", "No such organization.", { reason: "no-org" });
  if (str(req.data?.confirm, 120) !== org.get("name")) throw new HttpsError("failed-precondition", "Type the organization's name to confirm.", { reason: "confirm-name" });
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
 * An organization keeps an admin: its only admin is not demoted, moved out or removed until someone else is made its
 * admin (refused with `last-admin`; OrgManage says so before asking). Refusals carry a stable `reason` in their details,
 * which the admin screens put in the admin's language (admin/refusals.ts); the English message stays as a fallback.
 */
export async function refuseLastAdmin(uid: string, orgId: string) {
  const admins = await db.collection("users").where("orgId", "==", orgId).where("role", "==", "orgAdmin").select().limit(2).get();
  if (admins.docs.length > 0 && admins.docs.every((d) => d.id === uid)) {
    throw new HttpsError("failed-precondition", "This is the organization's only admin. Make someone else its admin first.", { reason: "last-admin" });
  }
}

/**
 * Any account's role and organization: students, teachers and org admins need an active organization; learners and
 * platform admins have none. A platform admin can't change their own role (so nobody locks the platform out).
 */
export const setUserRole = onCall(async (req) => {
  const c = await requireSuper(req);
  const uid = str(req.data?.uid, 128), role = str(req.data?.role) as Role;
  if (!ROLES.includes(role)) throw new HttpsError("invalid-argument", "Invalid role.", { reason: "bad-role" });
  if (uid === c.uid) throw new HttpsError("failed-precondition", "You cannot change your own role.", { reason: "self-role" });
  let orgId: string | null = null;
  if (IN_ORG.includes(role)) {
    orgId = str(req.data?.orgId, 128);
    const org = orgId ? await db.doc(`orgs/${orgId}`).get() : null;
    if (!org?.exists) throw new HttpsError("not-found", "Choose an organization.", { reason: "no-org" });
    if (org.get("status") !== "active") throw new HttpsError("failed-precondition", "This organization is not active.", { reason: "org-inactive" });
  }
  const now = await db.doc(`users/${uid}`).get();
  const adminOf = now.get("role") === "orgAdmin" ? (now.get("orgId") as string | null | undefined) : null;
  if (adminOf && (role !== "orgAdmin" || orgId !== adminOf)) await refuseLastAdmin(uid, adminOf);
  const { before, roleBefore } = await assign(uid, role, orgId);
  await audit("setUserRole", c.uid, { uid, role, orgId, before, roleBefore });
  return { ok: true };
});

/**
 * An account by its email or username login (H1): resolved through Auth, which knows the account's real email,
 * never through users/{uid}.email, which only says what its owner typed. Shows whether that email is verified, and
 * how many profiles claim it (more than one means someone typed another person's address before 2026-11; the screens
 * then refuse to pick one). Platform admins find anyone; an org admin only their own members.
 */
export const findAccount = onCall(async (req) => {
  const c = await freshCaller(req);
  if (c.role !== "superadmin" && c.role !== "orgAdmin") throw new HttpsError("permission-denied", "Admins only.", { reason: "not-admin" });
  const raw = str(req.data?.login, 200).toLowerCase();
  const email = raw.includes("@") ? raw : isValidUsername(raw) ? usernameToEmail(raw) : "";
  if (!email || !isValidEmail(email)) return { account: null, profiles: 0 };
  const [user, claimed] = await Promise.all([
    auth.getUserByEmail(email).catch(() => null),
    db.collection("users").where("email", "==", email).select().limit(5).get(),
  ]);
  const profile = user ? await db.doc(`users/${user.uid}`).get() : null;
  if (c.role === "orgAdmin" && (!profile || profile.get("orgId") !== c.orgId)) return { account: null, profiles: 0 };
  const ids = new Set(claimed.docs.map((d) => d.id));
  if (user) ids.add(user.uid);
  if (!user || !profile?.exists) return { account: null, profiles: ids.size - (user ? 1 : 0) };
  return {
    account: {
      uid: user.uid, email: user.email ?? email, emailVerified: user.emailVerified, name: String(profile.get("name") ?? user.displayName ?? ""),
      username: (profile.get("username") as string | null | undefined) ?? null, role: (profile.get("role") as string | undefined) ?? "learner",
      orgId: (profile.get("orgId") as string | null | undefined) ?? null, teach: (profile.get("teach") as string | undefined) ?? null,
      provider: user.providerData.map((p) => p.providerId).sort().join(",") || "password",
    },
    profiles: ids.size,
  };
});
