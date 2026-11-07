/**
 * Darsi Cloud Functions (2nd gen).
 * All role and organization changes happen here, with the Admin SDK, so that clients can never grant themselves access.
 * Roles are stored twice: as Auth custom claims (used by security rules) and on users/{uid} (used by the UI).
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { audit, auth, basicsFor, caller, db, freshCaller, releasePupils, str, type Role } from "./admin.js";
import { alertOrgRequest, alertOrgReviewed } from "./notify.js";
import { progressChanged } from "./progress.js";
import { writeClaims } from "./billing.js";
import { generateCode, generatePassword, isValidEmail, isValidUsername, normalizeCode, suggestUsername, USERNAME_DOMAIN, usernameToEmail } from "./passwords.js";
import { creationOrder, onCreateError, teacherKeys, type RowReason } from "./membersCore.js";
import { approveProblem, handMadeUsername } from "./roles.js";
import { refuseLastAdmin } from "./platform.js";

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
/** Data rights and abuse: an account's data exported or deleted, an account suspended, a project's content removed. */
export { deleteAccount, exportAccountData, moderateSubmission, setAccountSuspended } from "./account.js";
/** Darsi Super: plans, Super for people and organizations, and revenue (docs/SUPER.md). */
export { checkRevenueEvent, fillSeats, grantCredits, grantSuper, onOrgLicence, onSubscriptionWrite, savePlans, setOrgLicence, setSeat, setSuperOn } from "./billing.js";
/** Darsi Super payments: Paymob (EGP) and Stripe (USD) checkouts and their webhooks. */
export { paymobWebhook, setRenewal, startCheckout, stripeWebhook } from "./payments.js";
/** Darsi Super tutor: text answers and the balance (the voice relay is relay.ts, on Cloud Run). */
export { tutorAsk, tutorStatus } from "./tutor.js";
export { tutorSearch } from "./agent.js";
/** Capstone milestones: the checks, the advisory AI review and its limits (TECHNICAL.md "Capstones"). */
export { checkCapstone, saveCapstoneConfig } from "./capstone.js";
/** "Report a problem": anyone's report, with a screenshot and details, for platform admins (bugs.ts). */
export { reportBug } from "./bugs.js";

const MEMBER_ROLES: Role[] = ["student", "teacher", "orgAdmin"];

/** This organization's admins (or a platform admin), checked against the claims Auth holds now (freshCaller). */
async function requireOrgAdmin(req: CallableRequest, orgId: string) {
  const c = await freshCaller(req);
  if (c.role === "superadmin") return c;
  if (c.role !== "orgAdmin" || c.orgId !== orgId) throw new HttpsError("permission-denied", "Only this organization's admins can do that.", { reason: "not-org-admin" });
  return c;
}
/**
 * Role and organization on the profile, then the claims (writeClaims keeps Darsi Super; a new organization means no
 * seat yet). A profile this makes (an invite code used at sign-up can get here before the app creates it, and the app's
 * own create is then refused) also gets the email, name and creation time from Auth (basicsFor), so the person isn't
 * a nameless row on the admins' lists (ux-accounts-04).
 */
async function setRole(uid: string, role: Role, orgId: string | null, extra: Record<string, unknown> = {}) {
  const profile = await db.doc(`users/${uid}`).get();
  const before = profile.get("orgId") ?? null;
  const basics = await basicsFor(uid, profile);
  await db.doc(`users/${uid}`).set({ ...basics, role, orgId, ...extra, ...(before !== orgId ? { superSeat: false } : {}), claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await writeClaims(uid, role, orgId);
}

/** A username login someone signed up for by hand (roles.ts handMadeUsername) gets no organization: it is refused here. */
async function refuseHandMadeUsername(req: CallableRequest, uid: string) {
  const email = String(req.auth?.token.email ?? "").toLowerCase();
  if (!email.endsWith(`@${USERNAME_DOMAIN}`)) return;
  if (handMadeUsername(email, (await db.doc(`users/${uid}`).get()).get("createdBy"), USERNAME_DOMAIN)) {
    throw new HttpsError("permission-denied", "This kind of login is only for accounts an organization makes.", { reason: "reserved" });
  }
}

/* ---------- Organizations ---------- */

/** A school, ministry or NGO asks to join Darsi. A super-admin reviews it. */
export const requestOrg = onCall(async (req) => {
  const c = caller(req);
  if (c.orgId) throw new HttpsError("failed-precondition", "You already belong to an organization.", { reason: "in-org" });
  await refuseHandMadeUsername(req, c.uid);
  const name = str(req.data?.name, 120);
  if (name.length < 3) throw new HttpsError("invalid-argument", "Organization name is required.", { reason: "org-name" });
  const existing = await db.collection("orgs").where("createdBy", "==", c.uid).where("status", "==", "pending").limit(1).get();
  if (!existing.empty) throw new HttpsError("already-exists", "You already have a pending request.", { reason: "pending-request" });
  // Every member reads the org document (rules, and each member's phone caches it), so the requester's contact (often
  // a principal's mobile) and reason go to orgs/{id}/private/request, which only its admins and platform admins read.
  const ref = db.collection("orgs").doc();
  const batch = db.batch();
  batch.set(ref, {
    name, type: str(req.data?.type, 40) || "school", country: str(req.data?.country, 80), city: str(req.data?.city, 80),
    size: Math.min(10_000_000, Math.max(0, Math.round(Number(req.data?.size) || 0))) || null,
    status: "pending", createdBy: c.uid, createdAt: FieldValue.serverTimestamp(), memberCount: 0,
  });
  batch.set(requestRef(ref.id), { contact: str(req.data?.contact, 120), reason: str(req.data?.reason, 1000), at: FieldValue.serverTimestamp() });
  await batch.commit();
  await audit("requestOrg", c.uid, { orgId: ref.id });
  // Platform admins hear about it; a failed alert never fails the request.
  await alertOrgRequest(ref.id, name).catch((e) => logger.warn("staffOrgRequest not sent", { orgId: ref.id, error: String(e) }));
  return { orgId: ref.id, status: "pending" };
});

/**
 * Super-admin approves or rejects an organization request. Approval makes the requester its first admin. Only a
 * request still pending is reviewed, checked in the transaction that changes it: a second approval (two admins at once,
 * a stale list, a retry) made a second pair of invite codes nobody could see or rotate away, and a late rejection
 * closed a running organization (FS-RACES). A requester who has since joined another organization (or become a
 * platform admin) is never moved by an approval: it is refused with the reason, and the request can be rejected.
 * The requester hears the outcome on their phone (notify.ts alertOrgReviewed).
 */
export const reviewOrg = onCall(async (req) => {
  const c = await freshCaller(req);
  if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Super-admins only.", { reason: "not-super" });
  const orgId = str(req.data?.orgId, 128), approve = req.data?.approve === true, note = approve ? "" : str(req.data?.note, 500);
  if (!orgId) throw new HttpsError("invalid-argument", "orgId is required.", { reason: "no-org" });
  const ref = db.doc(`orgs/${orgId}`);
  const codes = { teacher: generateCode(), student: generateCode() };
  const org = await db.runTransaction(async (tx) => {
    const o = await tx.get(ref);
    if (!o.exists) throw new HttpsError("not-found", "No such organization.", { reason: "no-org" });
    if (o.get("status") !== "pending") throw new HttpsError("failed-precondition", "This request was already reviewed.", { reason: "reviewed" });
    const by = str(o.get("createdBy"), 128);
    if (approve) {
      const problem = approveProblem(by ? (await tx.get(db.doc(`users/${by}`))).data() : undefined, orgId);
      if (problem === "requester-in-org") throw new HttpsError("failed-precondition", "The requester now belongs to another organization: reject this request instead.", { reason: problem });
      if (problem === "requester-staff") throw new HttpsError("failed-precondition", "The requester is a platform admin: reject this request instead.", { reason: problem });
      tx.update(ref, { status: "active", reviewedAt: FieldValue.serverTimestamp(), reviewedBy: c.uid, memberCount: FieldValue.increment(1) });
      tx.set(invitesRef(orgId), codes);
      tx.set(db.doc(`inviteCodes/${codes.teacher}`), { orgId, role: "teacher" });
      tx.set(db.doc(`inviteCodes/${codes.student}`), { orgId, role: "student" });
    } else {
      tx.update(ref, { status: "rejected", reviewNote: note, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: c.uid });
    }
    return { by, name: str(o.get("name"), 120) };
  });
  if (approve && org.by) await setRole(org.by, "orgAdmin", orgId);
  await audit(approve ? "approveOrg" : "rejectOrg", c.uid, { orgId, requester: org.by || null });
  // The requester hears either way; a failed alert never fails the review.
  if (org.by) await alertOrgReviewed(org.by, orgId, org.name, approve, note).catch((e) => logger.warn("orgReviewed not sent", { orgId, error: String(e) }));
  return approve ? { status: "active", inviteCodes: codes } : { status: "rejected" };
});

/**
 * An organization's invite codes: orgs/{orgId}/private/invites, which only its admins and platform admins can read.
 * (Before 2026-11 they sat on the org document, which every member reads, so a student could see the teacher code.)
 */
const invitesRef = (orgId: string) => db.doc(`orgs/${orgId}/private/invites`);
/** What the requester told platform admins privately: their contact and reason (before 2026-11 on the org document). */
const requestRef = (orgId: string) => db.doc(`orgs/${orgId}/private/request`);

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
  if (c.orgId) throw new HttpsError("failed-precondition", "You already belong to an organization.", { reason: "in-org" });
  await refuseHandMadeUsername(req, c.uid);
  if (!(await countJoinTry(c.uid))) throw new HttpsError("resource-exhausted", "Too many wrong codes. Try again in an hour.", { reason: "too-many-tries" });
  const code = normalizeCode(req.data?.code);
  const inv = code ? await db.doc(`inviteCodes/${code}`).get() : null;
  if (!inv?.exists) throw new HttpsError("not-found", "That code is not valid.", { reason: "bad-code" });
  const { orgId, role } = inv.data() as { orgId: string; role: Role };
  const org = await db.doc(`orgs/${orgId}`).get();
  if (org.get("status") !== "active") throw new HttpsError("failed-precondition", "This organization is not active.", { reason: "org-inactive" });
  await setRole(c.uid, role, orgId);
  await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(1) });
  await db.doc(`joinAttempts/${c.uid}`).delete().catch(() => {});
  await audit("joinOrg", c.uid, { orgId, role });
  return { orgId, role, orgName: org.get("name") };
});

export const regenerateInviteCode = onCall(async (req) => {
  const orgId = str(req.data?.orgId), role = str(req.data?.role) as Role;
  await requireOrgAdmin(req, orgId);
  if (role !== "teacher" && role !== "student") throw new HttpsError("invalid-argument", "role must be teacher or student", { reason: "bad-role" });
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
/**
 * One row's outcome, in the request's row order. "exists": the typed email already has an account; "taken": the typed
 * username belongs to someone else. `warning: "teacherNotFound"`: created, but its teacher column named no teacher or
 * admin of this organization, so it has no teacher.
 */
interface MemberResult { row: number; name: string; login: string; password?: string; uid?: string; status: "created" | "exists" | "taken" | "error"; error?: string; reason?: RowReason; warning?: "teacherNotFound" }

/**
 * Create accounts for an organization (manual add or Excel import).
 * People without an email get a username; every account gets a random password and must change it at first sign-in.
 * Teachers and admins are made first, so the pupils who name them in the same request get their teacher.
 */
export const createMembers = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (req): Promise<{ results: MemberResult[] }> => {
  const orgId = str(req.data?.orgId);
  const by = await requireOrgAdmin(req, orgId);
  const org = await db.doc(`orgs/${orgId}`).get();
  if (org.get("status") !== "active") throw new HttpsError("failed-precondition", "Organization is not active.", { reason: "org-inactive" });
  const members: MemberInput[] = Array.isArray(req.data?.members) ? req.data.members : [];
  if (!members.length || members.length > 500) throw new HttpsError("invalid-argument", "Send between 1 and 500 people per request.", { reason: "batch-size" });
  const pwLen = Number(req.data?.passwordLength) || 10;
  const mustChange = req.data?.mustChangePassword !== false;
  const defaultRole: Role = MEMBER_ROLES.includes(req.data?.defaultRole) ? req.data.defaultRole : "student";
  const roleOf = (m: MemberInput): Role => (MEMBER_ROLES.includes(m?.role as Role) ? (m.role as Role) : defaultRole);

  // Resolve teachers' emails (or username logins) to uids, through Auth: a profile's email is only what its owner typed
  // (H1), Auth's is the account's. The account must be a teacher or admin of this org. Teachers this request makes are
  // added as they are created.
  const teacherEmails = [...new Set(members.map((m) => str(m?.teacherEmail).toLowerCase()).filter(Boolean))].slice(0, 200);
  const teacherIds: Record<string, string> = {};
  for (const e of teacherEmails) {
    const login = e.includes("@") ? e : isValidUsername(e) ? usernameToEmail(e) : "";
    const account = login ? await auth.getUserByEmail(login).catch(() => null) : null;
    if (!account) continue;
    const t = await db.doc(`users/${account.uid}`).get();
    if (t.get("orgId") === orgId && (t.get("role") === "teacher" || t.get("role") === "orgAdmin")) teacherIds[e] = account.uid;
  }

  const results: MemberResult[] = [];
  const tried = new Set<string>(); // logins this request already used or tried
  let created = 0;
  for (const i of creationOrder(members.map(roleOf))) {
    const m = members[i] ?? ({} as MemberInput);
    const name = str(m.name, 120);
    const role = roleOf(m);
    let email = str(m.email, 200).toLowerCase();
    let username = str(m.username, 40).toLowerCase();
    if (!name) { results.push({ row: i + 1, name, login: email || username, status: "error", error: "Missing name", reason: "missingName" }); continue; }
    if (email && !isValidEmail(email)) { results.push({ row: i + 1, name, login: email, status: "error", error: "Invalid email", reason: "invalidEmail" }); continue; }
    const typedEmail = Boolean(email), generated = !email && !username;
    const draw = () => { let u: string; do u = suggestUsername(name); while (tried.has(usernameToEmail(u))); return u; };
    if (!email) {
      if (generated) username = draw();
      if (!isValidUsername(username)) { results.push({ row: i + 1, name, login: username, status: "error", error: "Invalid username", reason: "invalidUsername" }); continue; }
      email = usernameToEmail(username);
    }
    const password = m.password && String(m.password).length >= 8 ? String(m.password) : generatePassword(pwLen);
    const teacher = str(m.teacherEmail).toLowerCase();
    for (let draws = 1; ; draws++) {
      tried.add(email);
      try {
        const user = await auth.createUser({ email, password, displayName: name, emailVerified: false });
        await auth.setCustomUserClaims(user.uid, { role, orgId }); // a new account: no Super yet
        const teacherId = teacher ? teacherIds[teacher] ?? null : null;
        await db.doc(`users/${user.uid}`).set({
          name, email, username: username || null, role, orgId, group: str(m.group, 60) || null,
          teacherId, lang: str(m.lang, 8) || "en",
          mustChangePassword: mustChange, passwordSetAt: Date.now(), createdAt: FieldValue.serverTimestamp(), createdBy: by.uid, active: true,
        });
        created++;
        if (role === "teacher" || role === "orgAdmin") for (const k of teacherKeys(email, username || null, usernameToEmail)) teacherIds[k] ??= user.uid;
        results.push({ row: i + 1, name, login: username || email, password, uid: user.uid, status: "created", ...(teacher && !teacherId ? { warning: "teacherNotFound" as const } : {}) });
        break;
      } catch (e: unknown) {
        const code = (e as { code?: string }).code;
        const next = onCreateError(code, { generated, typedEmail, draws });
        // A generated login someone already has: a new draw (a failed createUser leaves nothing behind).
        if (next === "retry") { username = draw(); email = usernameToEmail(username); continue; }
        results.push(next === "exists" ? { row: i + 1, name, login: username || email, status: "exists", error: "Account already exists", reason: "exists" }
          : next === "taken" ? { row: i + 1, name, login: username || email, status: "taken", reason: "taken" }
          : { row: i + 1, name, login: username || email, status: "error", error: String((e as Error).message) });
        break;
      }
    }
  }
  // Row order, as the client reads the results beside the rows it sent.
  results.sort((a, b) => a.row - b.row);
  if (created) await org.ref.update({ memberCount: FieldValue.increment(created) });
  await audit("createMembers", by.uid, { orgId, created, total: members.length });
  return { results };
});

export const setMemberRole = onCall(async (req) => {
  const orgId = str(req.data?.orgId), uid = str(req.data?.uid), role = str(req.data?.role) as Role;
  const by = await requireOrgAdmin(req, orgId);
  if (!MEMBER_ROLES.includes(role)) throw new HttpsError("invalid-argument", "Invalid role.", { reason: "bad-role" });
  // Nobody changes their own role (M2): a demoted admin holding an old token can't promote themselves back.
  if (uid === by.uid) throw new HttpsError("failed-precondition", "You cannot change your own role.", { reason: "self-role" });
  const u = await db.doc(`users/${uid}`).get();
  if (u.get("orgId") !== orgId) throw new HttpsError("not-found", "Not a member of this organization.", { reason: "not-member" });
  if (u.get("role") === "orgAdmin" && role !== "orgAdmin") await refuseLastAdmin(uid, orgId);
  await setRole(uid, role, orgId);
  // A teacher (or admin) who becomes a student no longer teaches anyone here.
  const released = role === "student" ? await releasePupils(orgId, uid) : 0;
  await audit("setMemberRole", by.uid, { orgId, uid, role, before: u.get("role") ?? null, ...(released ? { released } : {}) });
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
  if (uid === by.uid) throw new HttpsError("failed-precondition", "Change your own password from the sign-in page.", { reason: "self-password" });
  const u = await db.doc(`users/${uid}`).get();
  if (u.get("orgId") !== orgId) throw new HttpsError("not-found", "Not a member of this organization.", { reason: "not-member" });
  const account = await auth.getUser(uid).catch(() => null);
  const own = !account?.email?.endsWith(`@${USERNAME_DOMAIN}`) || account.providerData.some((p) => p.providerId !== "password");
  if (own) throw new HttpsError("failed-precondition", "This person signs in with their own email or Google account, so only they can change its password: ask them to use \"Forgot password\" on the sign-in page.", { reason: "own-login" });
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
  if (uid === by.uid) throw new HttpsError("failed-precondition", "You cannot remove yourself.", { reason: "self-remove" });
  const u = await db.doc(`users/${uid}`).get();
  if (u.get("orgId") !== orgId) throw new HttpsError("not-found", "Not a member of this organization.", { reason: "not-member" });
  if (u.get("role") === "orgAdmin") await refuseLastAdmin(uid, orgId);
  // setRole then writeClaims ends their sessions (they leave the organization), so no device keeps its access.
  await setRole(uid, "learner", null, { teacherId: null, group: null });
  await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(-1) });
  // A teacher who leaves takes no pupils along: theirs go back to the org's admins until someone is assigned.
  const released = await releasePupils(orgId, uid);
  await audit("removeMember", by.uid, { orgId, uid, ...(released ? { released } : {}) });
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
  if (!(changedAt > setAt + 1000)) throw new HttpsError("failed-precondition", "Choose a new password first.", { reason: "password-unchanged" });
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
