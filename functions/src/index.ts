/**
 * Darsi Cloud Functions (2nd gen).
 * All role and organization changes happen here, with the Admin SDK, so that clients can never grant themselves access.
 * Roles are stored twice: as Auth custom claims (used by security rules) and on users/{uid} (used by the UI).
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { audit, auth, caller, db, str, type Role } from "./admin.js";
import { alertOrgRequest } from "./notify.js";
import { recentWeeks } from "./nudge.js";
import { generateCode, generatePassword, isValidEmail, isValidUsername, suggestUsername, usernameToEmail } from "./passwords.js";

export type { Role } from "./admin.js";
/** Push notifications: device registration, announcements, review and staff alerts, daily nudges. */
export * from "./notify.js";
/** Course editor: publish, unpublish and delete authored units. */
export * from "./content.js";
/** Platform settings: the tracks (and later the languages) that every unit and screen uses. */
export { saveSettings } from "./settings.js";

const MEMBER_ROLES: Role[] = ["student", "teacher", "orgAdmin"];

function requireOrgAdmin(req: CallableRequest, orgId: string) {
  const c = caller(req);
  if (c.role === "superadmin") return c;
  if (c.role !== "orgAdmin" || c.orgId !== orgId) throw new HttpsError("permission-denied", "Only this organization's admins can do that.");
  return c;
}
async function setRole(uid: string, role: Role, orgId: string | null, extra: Record<string, unknown> = {}) {
  await auth.setCustomUserClaims(uid, orgId ? { role, orgId } : { role });
  await db.doc(`users/${uid}`).set({ role, orgId, ...extra, claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/* ---------- Organizations ---------- */

/** A school, ministry or NGO asks to join Darsi. A super-admin reviews it. */
export const requestOrg = onCall(async (req) => {
  const c = caller(req);
  if (c.orgId) throw new HttpsError("failed-precondition", "You already belong to an organization.");
  const name = str(req.data?.name, 120);
  if (name.length < 3) throw new HttpsError("invalid-argument", "Organization name is required.");
  const existing = await db.collection("orgs").where("createdBy", "==", c.uid).where("status", "==", "pending").limit(1).get();
  if (!existing.empty) throw new HttpsError("already-exists", "You already have a pending request.");
  const ref = await db.collection("orgs").add({
    name, type: str(req.data?.type, 40) || "school", country: str(req.data?.country, 80), city: str(req.data?.city, 80),
    size: Number(req.data?.size) || null, contact: str(req.data?.contact, 120), reason: str(req.data?.reason, 1000),
    status: "pending", createdBy: c.uid, createdAt: FieldValue.serverTimestamp(), memberCount: 0,
  });
  await audit("requestOrg", c.uid, { orgId: ref.id });
  // Platform admins hear about it; a failed alert never fails the request.
  await alertOrgRequest(ref.id, name).catch((e) => logger.warn("staffOrgRequest not sent", { orgId: ref.id, error: String(e) }));
  return { orgId: ref.id, status: "pending" };
});

/** Super-admin approves or rejects an organization request. Approval makes the requester its first admin. */
export const reviewOrg = onCall(async (req) => {
  const c = caller(req);
  if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Super-admins only.");
  const orgId = str(req.data?.orgId), approve = req.data?.approve === true;
  const ref = db.doc(`orgs/${orgId}`); const org = await ref.get();
  if (!org.exists) throw new HttpsError("not-found", "No such organization.");
  if (!approve) { await ref.update({ status: "rejected", reviewNote: str(req.data?.note, 500), reviewedAt: FieldValue.serverTimestamp() }); return { status: "rejected" }; }
  const codes = { teacher: generateCode(), student: generateCode() };
  await db.runTransaction(async (tx) => {
    tx.update(ref, { status: "active", inviteCodes: codes, reviewedAt: FieldValue.serverTimestamp(), memberCount: FieldValue.increment(1) });
    tx.set(db.doc(`inviteCodes/${codes.teacher}`), { orgId, role: "teacher" });
    tx.set(db.doc(`inviteCodes/${codes.student}`), { orgId, role: "student" });
  });
  await setRole(org.get("createdBy"), "orgAdmin", orgId);
  await audit("approveOrg", c.uid, { orgId });
  return { status: "active", inviteCodes: codes };
});

/** Join an organization with an invite code (teacher or student code). */
export const joinOrg = onCall(async (req) => {
  const c = caller(req);
  if (c.orgId) throw new HttpsError("failed-precondition", "You already belong to an organization.");
  const code = str(req.data?.code, 20).toUpperCase();
  const inv = await db.doc(`inviteCodes/${code}`).get();
  if (!inv.exists) throw new HttpsError("not-found", "That code is not valid.");
  const { orgId, role } = inv.data() as { orgId: string; role: Role };
  const org = await db.doc(`orgs/${orgId}`).get();
  if (org.get("status") !== "active") throw new HttpsError("failed-precondition", "This organization is not active.");
  await setRole(c.uid, role, orgId);
  await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(1) });
  return { orgId, role, orgName: org.get("name") };
});

export const regenerateInviteCode = onCall(async (req) => {
  const orgId = str(req.data?.orgId), role = str(req.data?.role) as Role;
  requireOrgAdmin(req, orgId);
  if (role !== "teacher" && role !== "student") throw new HttpsError("invalid-argument", "role must be teacher or student");
  const org = await db.doc(`orgs/${orgId}`).get();
  const old = org.get(`inviteCodes.${role}`) as string | undefined;
  const code = generateCode();
  const batch = db.batch();
  if (old) batch.delete(db.doc(`inviteCodes/${old}`));
  batch.set(db.doc(`inviteCodes/${code}`), { orgId, role });
  batch.update(org.ref, { [`inviteCodes.${role}`]: code });
  await batch.commit();
  return { code };
});

/* ---------- Members ---------- */

interface MemberInput { name: string; email?: string; username?: string; role?: Role; group?: string; teacherEmail?: string; lang?: string; password?: string }
interface MemberResult { row: number; name: string; login: string; password?: string; uid?: string; status: "created" | "exists" | "error"; error?: string }

/**
 * Create accounts for an organization (manual add or Excel import).
 * People without an email get a username; every account gets a random password and must change it at first sign-in.
 */
export const createMembers = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (req): Promise<{ results: MemberResult[] }> => {
  const orgId = str(req.data?.orgId);
  const by = requireOrgAdmin(req, orgId);
  const org = await db.doc(`orgs/${orgId}`).get();
  if (org.get("status") !== "active") throw new HttpsError("failed-precondition", "Organization is not active.");
  const members: MemberInput[] = Array.isArray(req.data?.members) ? req.data.members : [];
  if (!members.length || members.length > 500) throw new HttpsError("invalid-argument", "Send between 1 and 500 people per request.");
  const pwLen = Number(req.data?.passwordLength) || 10;
  const mustChange = req.data?.mustChangePassword !== false;
  const defaultRole: Role = MEMBER_ROLES.includes(req.data?.defaultRole) ? req.data.defaultRole : "student";

  // Resolve teacher emails → uids within this org.
  const teacherEmails = [...new Set(members.map((m) => str(m.teacherEmail).toLowerCase()).filter(Boolean))];
  const teacherIds: Record<string, string> = {};
  for (const e of teacherEmails) {
    const q = await db.collection("users").where("orgId", "==", orgId).where("email", "==", e).limit(1).get();
    if (!q.empty) teacherIds[e] = q.docs[0].id;
  }

  const results: MemberResult[] = [];
  let created = 0;
  for (const [i, m] of members.entries()) {
    const name = str(m.name, 120);
    const role: Role = MEMBER_ROLES.includes(m.role as Role) ? (m.role as Role) : defaultRole;
    let email = str(m.email, 200).toLowerCase();
    let username = str(m.username, 40).toLowerCase();
    if (!name) { results.push({ row: i + 1, name, login: email || username, status: "error", error: "Missing name" }); continue; }
    if (email && !isValidEmail(email)) { results.push({ row: i + 1, name, login: email, status: "error", error: "Invalid email" }); continue; }
    if (!email) { if (!username) username = suggestUsername(name); if (!isValidUsername(username)) { results.push({ row: i + 1, name, login: username, status: "error", error: "Invalid username" }); continue; } email = usernameToEmail(username); }
    const password = m.password && String(m.password).length >= 8 ? String(m.password) : generatePassword(pwLen);
    try {
      const user = await auth.createUser({ email, password, displayName: name, emailVerified: false });
      await auth.setCustomUserClaims(user.uid, { role, orgId });
      await db.doc(`users/${user.uid}`).set({
        name, email, username: username || null, role, orgId, group: str(m.group, 60) || null,
        teacherId: teacherIds[str(m.teacherEmail).toLowerCase()] ?? null, lang: str(m.lang, 8) || "en",
        mustChangePassword: mustChange, createdAt: FieldValue.serverTimestamp(), createdBy: by.uid, active: true,
      });
      created++;
      results.push({ row: i + 1, name, login: username || email, password, uid: user.uid, status: "created" });
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      results.push({ row: i + 1, name, login: username || email, status: code === "auth/email-already-exists" ? "exists" : "error", error: code === "auth/email-already-exists" ? "Account already exists" : String((e as Error).message) });
    }
  }
  if (created) await org.ref.update({ memberCount: FieldValue.increment(created) });
  await audit("createMembers", by.uid, { orgId, created, total: members.length });
  return { results };
});

export const setMemberRole = onCall(async (req) => {
  const orgId = str(req.data?.orgId), uid = str(req.data?.uid), role = str(req.data?.role) as Role;
  const by = requireOrgAdmin(req, orgId);
  if (!MEMBER_ROLES.includes(role)) throw new HttpsError("invalid-argument", "Invalid role.");
  const u = await db.doc(`users/${uid}`).get();
  if (u.get("orgId") !== orgId) throw new HttpsError("not-found", "Not a member of this organization.");
  if (uid === by.uid && role !== "orgAdmin") throw new HttpsError("failed-precondition", "You cannot remove your own admin role.");
  await setRole(uid, role, orgId);
  return { ok: true };
});

export const resetMemberPassword = onCall(async (req) => {
  const orgId = str(req.data?.orgId), uid = str(req.data?.uid);
  requireOrgAdmin(req, orgId);
  const u = await db.doc(`users/${uid}`).get();
  if (u.get("orgId") !== orgId) throw new HttpsError("not-found", "Not a member of this organization.");
  const password = generatePassword(Number(req.data?.passwordLength) || 10);
  await auth.updateUser(uid, { password });
  await u.ref.update({ mustChangePassword: true });
  return { password, login: u.get("username") || u.get("email") };
});

export const removeMember = onCall(async (req) => {
  const orgId = str(req.data?.orgId), uid = str(req.data?.uid);
  const by = requireOrgAdmin(req, orgId);
  if (uid === by.uid) throw new HttpsError("failed-precondition", "You cannot remove yourself.");
  const u = await db.doc(`users/${uid}`).get();
  if (u.get("orgId") !== orgId) throw new HttpsError("not-found", "Not a member of this organization.");
  await setRole(uid, "learner", null, { teacherId: null, group: null });
  await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(-1) });
  return { ok: true };
});

/** Clear the first-login flag after the person picks their own password (they cannot set it back themselves). */
export const passwordChanged = onCall(async (req) => {
  const c = caller(req);
  await db.doc(`users/${c.uid}`).set({ mustChangePassword: false }, { merge: true });
  return { ok: true };
});

/* ---------- Learning summary (what admins and teachers see) ---------- */

/**
 * Recompute users/{uid}.summary whenever a lesson result is written: lessons, XP, competencies, last activity,
 * plus lessons per ISO week (UTC, the last 12 weeks) and lastLessonAt, which the daily nudges read.
 */
export const onProgressWrite = onDocumentWritten("users/{uid}/progress/{lessonId}", async (event) => {
  const uid = event.params.uid;
  const snap = await db.collection(`users/${uid}/progress`).get();
  const competencies: Record<string, number> = {};
  const units: Record<string, number> = {};
  const completed: string[] = [];
  let xp = 0, accSum = 0, last = "";
  for (const d of snap.docs) {
    const p = d.data();
    xp += Number(p.xp) || 0; accSum += Number(p.accuracy) || 0;
    if (typeof p.completedAt === "string") { completed.push(p.completedAt); if (p.completedAt > last) last = p.completedAt; }
    if (p.unitId) units[p.unitId] = (units[p.unitId] ?? 0) + 1;
    for (const code of (p.competencies as string[] | undefined) ?? []) competencies[code] = (competencies[code] ?? 0) + 1;
  }
  const summary = {
    lessonsDone: snap.size, xp, avgAccuracy: snap.size ? accSum / snap.size : 0, lastActive: last || null, competencies, units,
    weeks: recentWeeks(completed), lastLessonAt: last || null,
  };
  // mergeFields replaces each summary field whole, so weeks older than 12 are dropped instead of merged back in.
  await db.doc(`users/${uid}`).set({ summary }, { mergeFields: Object.keys(summary).map((k) => `summary.${k}`) });
});
