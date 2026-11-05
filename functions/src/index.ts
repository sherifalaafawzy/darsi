/**
 * Darsi Cloud Functions (2nd gen).
 * All role and organization changes happen here, with the Admin SDK, so that clients can never grant themselves access.
 * Roles are stored twice: as Auth custom claims (used by security rules) and on users/{uid} (used by the UI).
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { audit, auth, caller, db, freshCaller, str, type Role } from "./admin.js";
import { alertOrgRequest } from "./notify.js";
import { progressChanged } from "./progress.js";
import { writeClaims } from "./billing.js";
import { generateCode, generatePassword, isValidEmail, isValidUsername, normalizeCode, suggestUsername, USERNAME_DOMAIN, usernameToEmail } from "./passwords.js";

export type { Role } from "./admin.js";
/** Push notifications: device registration, announcements, review and staff alerts, daily nudges. */
export * from "./notify.js";
/** Course editor: publish, unpublish and delete authored units. */
export * from "./content.js";
/** Platform settings: the tracks (and later the languages) that every unit and screen uses. */
export { saveSettings } from "./settings.js";
export { publishLanguage, unpublishLanguage } from "./languages.js";
/** Analytics: phones' event batches (and Google Analytics), and the accounts and organizations overview. */
export { collect, refreshStats, statsJob } from "./analytics.js";
/** Platform admins: organizations and anyone's role. */
export { createOrg, deleteOrg, findAccount, setUserRole, updateOrg } from "./platform.js";
/** Darsi Super: plans, Super for people and organizations, and revenue (docs/SUPER.md). */
export { checkRevenueEvent, fillSeats, grantCredits, grantSuper, onOrgLicence, onSubscriptionWrite, savePlans, setOrgLicence, setSeat, setSuperOn } from "./billing.js";
/** Darsi Super payments: Paymob (EGP) and Stripe (USD) checkouts and their webhooks. */
export { paymobWebhook, startCheckout, stripeWebhook } from "./payments.js";
/** Darsi Super tutor: text answers and the balance (the voice relay is relay.ts, on Cloud Run). */
export { tutorAsk, tutorStatus } from "./tutor.js";
export { tutorSearch } from "./agent.js";
export { checkCapstone } from "./capstone.js";
/** "Report a problem": anyone's report, with a screenshot and details, for platform admins (bugs.ts). */
export { reportBug } from "./bugs.js";

const MEMBER_ROLES: Role[] = ["student", "teacher", "orgAdmin"];

/** This organization's admins (or a platform admin), checked against the claims Auth holds now (freshCaller). */
async function requireOrgAdmin(req: CallableRequest, orgId: string) {
  const c = await freshCaller(req);
  if (c.role === "superadmin") return c;
  if (c.role !== "orgAdmin" || c.orgId !== orgId) throw new HttpsError("permission-denied", "Only this organization's admins can do that.");
  return c;
}
/** Role and organization on the profile, then the claims (writeClaims keeps Darsi Super; a new organization means no seat yet). */
async function setRole(uid: string, role: Role, orgId: string | null, extra: Record<string, unknown> = {}) {
  const before = (await db.doc(`users/${uid}`).get()).get("orgId") ?? null;
  await db.doc(`users/${uid}`).set({ role, orgId, ...extra, ...(before !== orgId ? { superSeat: false } : {}), claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await writeClaims(uid, role, orgId);
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
  const c = await freshCaller(req);
  if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Super-admins only.");
  const orgId = str(req.data?.orgId), approve = req.data?.approve === true;
  const ref = db.doc(`orgs/${orgId}`); const org = await ref.get();
  if (!org.exists) throw new HttpsError("not-found", "No such organization.");
  if (!approve) { await ref.update({ status: "rejected", reviewNote: str(req.data?.note, 500), reviewedAt: FieldValue.serverTimestamp() }); return { status: "rejected" }; }
  const codes = { teacher: generateCode(), student: generateCode() };
  await db.runTransaction(async (tx) => {
    tx.update(ref, { status: "active", reviewedAt: FieldValue.serverTimestamp(), memberCount: FieldValue.increment(1) });
    tx.set(invitesRef(orgId), codes);
    tx.set(db.doc(`inviteCodes/${codes.teacher}`), { orgId, role: "teacher" });
    tx.set(db.doc(`inviteCodes/${codes.student}`), { orgId, role: "student" });
  });
  await setRole(org.get("createdBy"), "orgAdmin", orgId);
  await audit("approveOrg", c.uid, { orgId });
  return { status: "active", inviteCodes: codes };
});

/**
 * An organization's invite codes: orgs/{orgId}/private/invites, which only its admins and platform admins can read.
 * (Before 2026-11 they sat on the org document, which every member reads, so a student could see the teacher code.)
 */
const invitesRef = (orgId: string) => db.doc(`orgs/${orgId}/private/invites`);

/**
 * Join tries per account: 10 an hour, so codes can't be guessed by trying many. Each try is counted before the code is
 * looked at, in a transaction, so parallel requests can't each read "9 so far" and all go ahead (L4); a try that
 * joins clears the count.
 */
const JOIN_TRIES = 10;
async function countJoinTry(uid: string) {
  const ref = db.doc(`joinAttempts/${uid}`);
  return db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() as { n?: number; since?: number } | undefined;
    const fresh = !d?.since || Date.now() - d.since > 3600e3;
    const n = fresh ? 1 : (d?.n ?? 0) + 1;
    if (n > JOIN_TRIES) return false;
    tx.set(ref, { n, since: fresh ? Date.now() : d!.since });
    return true;
  });
}

/** Join an organization with an invite code (teacher or student code). */
export const joinOrg = onCall(async (req) => {
  const c = caller(req);
  if (c.orgId) throw new HttpsError("failed-precondition", "You already belong to an organization.");
  if (!(await countJoinTry(c.uid))) throw new HttpsError("resource-exhausted", "Too many wrong codes. Try again in an hour.");
  const code = normalizeCode(req.data?.code);
  const inv = code ? await db.doc(`inviteCodes/${code}`).get() : null;
  if (!inv?.exists) throw new HttpsError("not-found", "That code is not valid.");
  const { orgId, role } = inv.data() as { orgId: string; role: Role };
  const org = await db.doc(`orgs/${orgId}`).get();
  if (org.get("status") !== "active") throw new HttpsError("failed-precondition", "This organization is not active.");
  await setRole(c.uid, role, orgId);
  await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(1) });
  await db.doc(`joinAttempts/${c.uid}`).delete().catch(() => {});
  await audit("joinOrg", c.uid, { orgId, role });
  return { orgId, role, orgName: org.get("name") };
});

export const regenerateInviteCode = onCall(async (req) => {
  const orgId = str(req.data?.orgId), role = str(req.data?.role) as Role;
  await requireOrgAdmin(req, orgId);
  if (role !== "teacher" && role !== "student") throw new HttpsError("invalid-argument", "role must be teacher or student");
  const [org, priv] = await Promise.all([db.doc(`orgs/${orgId}`).get(), invitesRef(orgId).get()]);
  const old = (priv.get(role) ?? org.get(`inviteCodes.${role}`)) as string | undefined;
  const code = generateCode();
  const batch = db.batch();
  if (old) batch.delete(db.doc(`inviteCodes/${old}`));
  batch.set(db.doc(`inviteCodes/${code}`), { orgId, role });
  // Both codes now live privately; an org document from before 2026-11 loses its readable copy.
  const other = role === "teacher" ? "student" : "teacher";
  batch.set(invitesRef(orgId), { [role]: code, ...(priv.get(other) || !org.get(`inviteCodes.${other}`) ? {} : { [other]: org.get(`inviteCodes.${other}`) }) }, { merge: true });
  if (org.get("inviteCodes")) batch.update(org.ref, { inviteCodes: FieldValue.delete() });
  await batch.commit();
  await audit("regenerateInviteCode", req.auth!.uid, { orgId, role });
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
  const by = await requireOrgAdmin(req, orgId);
  const org = await db.doc(`orgs/${orgId}`).get();
  if (org.get("status") !== "active") throw new HttpsError("failed-precondition", "Organization is not active.");
  const members: MemberInput[] = Array.isArray(req.data?.members) ? req.data.members : [];
  if (!members.length || members.length > 500) throw new HttpsError("invalid-argument", "Send between 1 and 500 people per request.");
  const pwLen = Number(req.data?.passwordLength) || 10;
  const mustChange = req.data?.mustChangePassword !== false;
  const defaultRole: Role = MEMBER_ROLES.includes(req.data?.defaultRole) ? req.data.defaultRole : "student";

  // Resolve teachers' emails (or username logins) â†’ uids, through Auth: a profile's email is only what its owner typed
  // (H1), Auth's is the account's. The account must be a teacher or admin of this org.
  const teacherEmails = [...new Set(members.map((m) => str(m.teacherEmail).toLowerCase()).filter(Boolean))].slice(0, 200);
  const teacherIds: Record<string, string> = {};
  for (const e of teacherEmails) {
    const login = e.includes("@") ? e : isValidUsername(e) ? usernameToEmail(e) : "";
    const account = login ? await auth.getUserByEmail(login).catch(() => null) : null;
    if (!account) continue;
    const t = await db.doc(`users/${account.uid}`).get();
    if (t.get("orgId") === orgId && (t.get("role") === "teacher" || t.get("role") === "orgAdmin")) teacherIds[e] = account.uid;
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
      await auth.setCustomUserClaims(user.uid, { role, orgId }); // a new account: no Super yet
      await db.doc(`users/${user.uid}`).set({
        name, email, username: username || null, role, orgId, group: str(m.group, 60) || null,
        teacherId: teacherIds[str(m.teacherEmail).toLowerCase()] ?? null, lang: str(m.lang, 8) || "en",
        mustChangePassword: mustChange, passwordSetAt: Date.now(), createdAt: FieldValue.serverTimestamp(), createdBy: by.uid, active: true,
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
  const by = await requireOrgAdmin(req, orgId);
  if (!MEMBER_ROLES.includes(role)) throw new HttpsError("invalid-argument", "Invalid role.");
  // Nobody changes their own role (M2): a demoted admin holding an old token can't promote themselves back.
  if (uid === by.uid) throw new HttpsError("failed-precondition", "You cannot change your own role.");
  const u = await db.doc(`users/${uid}`).get();
  if (u.get("orgId") !== orgId) throw new HttpsError("not-found", "Not a member of this organization.");
  await setRole(uid, role, orgId);
  await audit("setMemberRole", by.uid, { orgId, uid, role, before: u.get("role") ?? null });
  return { ok: true };
});

/**
 * A new password for a member, shown to their admin once. Only for logins the organization made (username accounts,
 * `@users.darsi.app`, with nothing but a password): anyone who signs in with their own email or Google keeps sole
 * control of their account (M4) and resets it themselves from the sign-in page.
 */
export const resetMemberPassword = onCall(async (req) => {
  const orgId = str(req.data?.orgId), uid = str(req.data?.uid);
  const by = await requireOrgAdmin(req, orgId);
  if (uid === by.uid) throw new HttpsError("failed-precondition", "Change your own password from the sign-in page.");
  const u = await db.doc(`users/${uid}`).get();
  if (u.get("orgId") !== orgId) throw new HttpsError("not-found", "Not a member of this organization.");
  const account = await auth.getUser(uid).catch(() => null);
  const own = !account?.email?.endsWith(`@${USERNAME_DOMAIN}`) || account.providerData.some((p) => p.providerId !== "password");
  if (own) throw new HttpsError("failed-precondition", "This person signs in with their own email or Google account, so only they can change its password: ask them to use \"Forgot password\" on the sign-in page.");
  const password = generatePassword(Number(req.data?.passwordLength) || 10);
  await auth.updateUser(uid, { password });
  // The time the password was set, so passwordChanged can tell a real change from a flag cleared without one (I1).
  await u.ref.update({ mustChangePassword: true, passwordSetAt: Date.now() });
  await audit("resetMemberPassword", by.uid, { orgId, uid });
  return { password, login: u.get("username") || u.get("email") };
});

export const removeMember = onCall(async (req) => {
  const orgId = str(req.data?.orgId), uid = str(req.data?.uid);
  const by = await requireOrgAdmin(req, orgId);
  if (uid === by.uid) throw new HttpsError("failed-precondition", "You cannot remove yourself.");
  const u = await db.doc(`users/${uid}`).get();
  if (u.get("orgId") !== orgId) throw new HttpsError("not-found", "Not a member of this organization.");
  // setRole â†’ writeClaims ends their sessions (they leave the organization), so no device keeps its access.
  await setRole(uid, "learner", null, { teacherId: null, group: null });
  await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(-1) });
  await audit("removeMember", by.uid, { orgId, uid });
  return { ok: true };
});

/**
 * Clears the first-login flag after the person picks their own password. Only this function clears it, and only once
 * the account's password really changed after an admin set it (I1): Auth moves an account's "tokens valid after" time
 * when its password changes, so that time must be later than when the admin's password was set.
 */
export const passwordChanged = onCall(async (req) => {
  const c = caller(req);
  const [u, account] = await Promise.all([db.doc(`users/${c.uid}`).get(), auth.getUser(c.uid)]);
  if (u.get("mustChangePassword") !== true) return { ok: true };
  const setAt = Number(u.get("passwordSetAt")) || (u.get("createdAt")?.toMillis?.() as number | undefined) || 0;
  const changedAt = account.tokensValidAfterTime ? Date.parse(account.tokensValidAfterTime) : 0;
  // Whole seconds on Auth's side; a password changed in the same second as it was set is not a change anyone makes.
  if (!(changedAt > setAt + 1000)) throw new HttpsError("failed-precondition", "Choose a new password first.");
  await u.ref.set({ mustChangePassword: false }, { merge: true });
  return { ok: true };
});

/* ---------- Learning summary (what admins and teachers see) ---------- */

/**
 * Keeps users/{uid}.summary up to date as lesson results arrive (progress.ts: a fixed few reads per write, only
 * published lessons, competencies from the unit). The summary's fields are summarize's: lessons, XP, accuracy, time,
 * per track and per competency, last activity, lessons per ISO week for the last 12 weeks, and lastLessonAt.
 */
export const onProgressWrite = onDocumentWritten({ document: "users/{uid}/progress/{lessonId}", maxInstances: 20 }, async (event) => {
  await progressChanged(event.params.uid, event.params.lessonId);
});
