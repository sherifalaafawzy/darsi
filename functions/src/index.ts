/**
 * Darsi Cloud Functions (2nd gen).
 * All role and organization changes happen here, with the Admin SDK, so that clients can never grant themselves access.
 * Roles are stored twice: as Auth custom claims (used by security rules) and on users/{uid} (used by the UI).
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { accountByLogin, legacyHolds } from "./logins.js";
import { audit, auth, basicsFor, caller, db, freshCaller, releasePupils, str, type Role } from "./admin.js";
import { alertOrgRequest, alertOrgReviewed } from "./notify.js";
import { progressChanged } from "./progress.js";
import { writeClaims } from "./billing.js";
import { generateCode, generatePassword, isUsernameEmail, isValidEmail, isValidUsername, normalizeCode, suggestUsername, USERNAME_DOMAINS, usernameToEmail } from "./passwords.js";
import { chunks, codeProblem, CREATE_WIDTH, creationWaves, joinPolicyChange, onCreateError, passwordLength, policyProblem, pool, readJoinPolicy, teacherKeys, withRemoved, type Removed, type RowReason } from "./membersCore.js";
import { approveProblem, handMadeUsername, losesPower } from "./roles.js";
import { liftOrgSuspension, refuseLastAdmin } from "./platform.js";
import { ownLogin } from "./ssoStore.js";

export type { Role } from "./admin.js";
/** Push notifications: device registration, announcements, review and staff alerts, daily nudges. */
export * from "./notify.js";
/** Course editor: publish, unpublish and delete authored units. */
export * from "./content.js";
/** Platform settings: the tracks (and later the languages) that every unit and screen uses. */
export { saveSettings } from "./settings.js";
export { publishLanguage, unpublishLanguage } from "./languages.js";
/** Analytics: phones' event batches (and Google Analytics), and the accounts and organizations overview. */
export { collect, refreshStats, setGaConfig, statsJob } from "./analytics.js";
/** Platform admins: organizations and anyone's role. */
export { createOrg, deleteOrg, findAccount, setUserRole, updateOrg } from "./platform.js";
/** An organization's people, managed in bulk: lists, edits, suspension, leaving (orgMembers.ts). */
export { bulkMembers, leaveOrg, listMembers, setMemberSuspended, updateMembers } from "./orgMembers.js";
/** Course access granted or taken back for people and classes, and a course's results (access.ts). */
export { courseResults, grantCourseAccess, revokeCourseAccess } from "./access.js";
/** An organization's own audit trail, for its admins (audit.ts). */
export { orgAudit } from "./audit.js";
/** An organization's data as a file, for its admins (orgExport.ts). */
export { exportOrgData } from "./orgExport.js";
/** How long data is kept, and the job that removes what is older (retention.ts). */
export { deleteBugReport, previewRetention, retentionJob, saveRetention } from "./retention.js";
/** The terms and privacy texts, and who accepted which version (legal.ts). */
export { acceptTerms, saveLegal } from "./legal.js";
/** Content-Security-Policy reports from browsers (csp.ts). */
export { cspReport } from "./csp.js";
/** An organization's admins (and platform admins): which courses its teachers, students and classes see. */
export { setOrgCourses } from "./orgCourses.js";
/** Organizations' own web addresses (cis.darsiai.org): asked for by org admins, approved and connected by platform admins. */
export { manageSite, onOrgSite, setOrgSite, sitesJob } from "./sites.js";
/** Data rights and abuse: an account's data exported or deleted, an account suspended, a project's content removed. */
export { deleteAccount, exportAccountData, moderateSubmission, onAccountDeletion, setAccountSuspended } from "./account.js";
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
export { sendFeedback } from "./feedback.js";
export { manageOrgPage } from "./orgPage.js";
export { seoPage } from "./seo.js";
/** School sign-in (OpenID Connect): start, finish and the school lookup; the provider's callback; the wizard; the daily job (sso.ts). */
export { manageSso, ssoCallback, ssoEdge, ssoJob } from "./sso.js";

const MEMBER_ROLES: Role[] = ["student", "teacher", "orgAdmin"];

/**
 * This organization's admins (or a platform admin), checked against the claims Auth holds now (freshCaller). An
 * organization that is suspended, or being deleted, is managed by platform admins only: its own admins are refused
 * here, so none of the callables below changes it meanwhile (one read of the org document per call).
 */
async function requireOrgAdmin(req: CallableRequest, orgId: string) {
  const c = await freshCaller(req);
  if (c.role === "superadmin") return c;
  if (c.role !== "orgAdmin" || c.orgId !== orgId) throw new HttpsError("permission-denied", "Only this organization's admins can do that.", { reason: "not-org-admin" });
  const status = (await db.doc(`orgs/${orgId}`).get()).get("status");
  if (status === "suspended") throw new HttpsError("permission-denied", "This organization is suspended. Ask Darsi's team to lift it.", { reason: "org-suspended" });
  if (status === "deleting") throw new HttpsError("permission-denied", "This organization is being deleted.", { reason: "org-deleting" });
  return c;
}
/**
 * Role and organization, on the profile and in the claims (writeClaims keeps Darsi Super; a new organization means no
 * seat yet). The two writes can't be one, so their order is chosen by what a failure in between would leave:
 * - a change that takes power away (a demotion, leaving the organization: roles.ts losesPower) writes the claims
 *   first. The rules and every callable go by the claims, so access ends at once; if the profile write then fails, the
 *   profile still names the organization and the admin can simply repeat the change. (Profile first, a failed claims
 *   write left a removed person with their old access and a profile that refused the retry as "not a member".)
 * - any other change writes the profile first, as before: a failure leaves the lists saying more than the person can
 *   do, never the reverse, and repeating it finishes the job.
 * A profile this makes (an invite code used at sign-up can get here before the app creates it, and the app's own
 * create is then refused) also gets the email, name and creation time from Auth (basicsFor), so the person isn't a
 * nameless row on the admins' lists (ux-accounts-04).
 * `afterClaims` runs once the claims are written (in a change that takes power away: before the profile, so a failure
 * in it leaves a member the admin can repeat the change for).
 */
async function setRole(uid: string, role: Role, orgId: string | null, extra: Record<string, unknown> = {}, afterClaims?: () => Promise<unknown>) {
  const profile = await db.doc(`users/${uid}`).get();
  const before = profile.get("orgId") ?? null;
  const basics = await basicsFor(uid, profile);
  const writeProfile = () => db.doc(`users/${uid}`).set({ ...basics, role, orgId, ...extra, ...(before !== orgId ? { superSeat: false } : {}), claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (losesPower({ role: profile.get("role"), orgId: before }, { role, orgId })) { await writeClaims(uid, role, orgId); await afterClaims?.(); await writeProfile(); }
  else { await writeProfile(); await writeClaims(uid, role, orgId); await afterClaims?.(); }
}
/**
 * A member's profile, for the callables that change one: users/{uid} names this organization. Also someone whose
 * profile names no organization while Auth's claims still name this one: a change that stopped half-way (a removal
 * from before the claims were written first, a deleted organization), which its admin can then repeat to finish.
 * A profile that names another organization is that organization's member, whatever old claims say: refused.
 */
async function memberOf(orgId: string, uid: string) {
  const u = uid ? await db.doc(`users/${uid}`).get() : null;
  if (u && u.get("orgId") === orgId) return u;
  if (u && !u.get("orgId") && orgId && (await auth.getUser(uid).catch(() => null))?.customClaims?.orgId === orgId) return u;
  throw new HttpsError("not-found", "Not a member of this organization.", { reason: "not-member" });
}

/** A username login someone signed up for by hand (roles.ts handMadeUsername) gets no organization: it is refused here. */
async function refuseHandMadeUsername(req: CallableRequest, uid: string) {
  const email = String(req.auth?.token.email ?? "").toLowerCase();
  if (!isUsernameEmail(email)) return;
  if (handMadeUsername(email, (await db.doc(`users/${uid}`).get()).get("createdBy"), USERNAME_DOMAINS)) {
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
  // Whether Auth has verified the requester's email goes with it, for the platform admin who reviews (never a refusal:
  // schools whose people have no email of their own ask too).
  batch.set(requestRef(ref.id), { contact: str(req.data?.contact, 120), reason: str(req.data?.reason, 1000), emailVerified: req.auth?.token.email_verified === true, at: FieldValue.serverTimestamp() });
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
 *
 * Repair: the approval and the requester's new role are two steps, and the second can fail (Auth down for a moment),
 * leaving an active organization nobody administers and a request that reads "already reviewed". Approving such an
 * organization again (active, and no profile is its admin, or the requester's profile is but Auth's claims are not)
 * makes the requester its admin and answers {status: "active", repaired: true}: no new codes, no second member count.
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
    const by = str(o.get("createdBy"), 128), name = str(o.get("name"), 120);
    if (o.get("status") !== "pending") {
      // `reviewedBy`: only a request approved here is repaired, never an organization a platform admin made (createOrg).
      if (approve && o.get("status") === "active" && by && o.get("reviewedBy")) {
        const requester = (await tx.get(db.doc(`users/${by}`))).data();
        if (!approveProblem(requester, orgId)) {
          const admins = await tx.get(db.collection("users").where("orgId", "==", orgId).where("role", "==", "orgAdmin").select().limit(1));
          if (admins.empty) return { by, name, repair: "role" as const };
          if (requester?.role === "orgAdmin" && requester.orgId === orgId) return { by, name, repair: "claims" as const };
        }
      }
      throw new HttpsError("failed-precondition", "This request was already reviewed.", { reason: "reviewed" });
    }
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
    return { by, name, repair: null };
  });
  if (org.repair) {
    // The profile already says admin: only claims that disagree are left to repair (nothing for an account Auth can't find).
    const account = org.repair === "claims" ? await auth.getUser(org.by).catch(() => null) : undefined;
    if (org.repair === "claims" && (!account || (account.customClaims?.role === "orgAdmin" && account.customClaims.orgId === orgId))) throw new HttpsError("failed-precondition", "This request was already reviewed.", { reason: "reviewed" });
    await setRole(org.by, "orgAdmin", orgId);
    await audit("repairOrg", c.uid, { orgId, requester: org.by });
    await alertOrgReviewed(org.by, orgId, org.name, true, "").catch((e) => logger.warn("orgReviewed not sent", { orgId, error: String(e) }));
    return { status: "active", repaired: true };
  }
  if (approve && org.by) await setRole(org.by, "orgAdmin", orgId);
  await audit(approve ? "approveOrg" : "rejectOrg", c.uid, { orgId, requester: org.by || null });
  // The requester hears either way; a failed alert never fails the review.
  if (org.by) await alertOrgReviewed(org.by, orgId, org.name, approve, note).catch((e) => logger.warn("orgReviewed not sent", { orgId, error: String(e) }));
  return approve ? { status: "active", inviteCodes: codes } : { status: "rejected" };
});

/**
 * An organization's invite codes: orgs/{orgId}/private/invites, which only its admins and platform admins can read.
 * (Before 2026-11 they sat on the org document, which every member reads, so a student could see the teacher code.)
 * Beside the two codes it holds who may join with them (`policy`: membersCore JoinPolicy) and, as a copy for the
 * admins' screen, each code's limits and uses (`limits`, `uses`: no client reads inviteCodes/{code}, where joinOrg
 * checks them).
 */
const invitesRef = (orgId: string) => db.doc(`orgs/${orgId}/private/invites`);
/**
 * People this organization removed: orgs/{orgId}/private/removed {uids: {uid: {at, name}}}. Its codes are shared
 * widely (a class group, a poster), so a removed person still has one: joinOrg refuses them until an admin lets
 * them back (readmitMember). Removing someone never changes the codes everyone else uses.
 */
const removedRef = (orgId: string) => db.doc(`orgs/${orgId}/private/removed`);
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

/** Why a code that exists can't be used (membersCore.codeProblem), as the refusal the join screen words. */
const codeRefusal = (why: "code-expired" | "code-used-up") => new HttpsError("failed-precondition",
  why === "code-expired" ? "This code has expired. Ask your school for a new one." : "This code has been used as many times as it allows. Ask your school for a new one.", { reason: why });

/**
 * Join an organization with an invite code (teacher or student code).
 * Every try is counted first (wrong codes cost the caller, never a guess for free). Then, in order:
 * - who is asking, as the profile and Auth say now, not the ID token, which is up to an hour old: someone already in
 *   an organization, or an org or platform admin, is refused (a second tab, a token from before they joined; joining
 *   would otherwise move them, or demote an admin), and so is a disabled account;
 * - the code: unknown, its organization not active, expired or used up (inviteCodes/{code} expiresAt, maxUses, uses);
 * - the organization's policy (private/invites.policy): a verified email, an email on one of its domains;
 * - whether it removed this person (private/removed).
 * The use is counted before the person is let in, in a transaction that checks the limit again, so people joining at
 * the same moment can't take a code past its limit; a join that then fails has still used one (the admin can raise it).
 */
export const joinOrg = onCall(async (req) => {
  const c = caller(req);
  const inOrg = () => new HttpsError("failed-precondition", "You already belong to an organization.", { reason: "in-org" });
  if (c.orgId) throw inOrg();
  await refuseHandMadeUsername(req, c.uid);
  if (!(await countJoinTry(c.uid))) throw new HttpsError("resource-exhausted", "Too many wrong codes. Try again in an hour.", { reason: "too-many-tries" });
  const [me, account] = await Promise.all([db.doc(`users/${c.uid}`).get(), auth.getUser(c.uid).catch(() => null)]);
  // Auth must answer before anyone is let in: a join never goes ahead on the token's word alone (Auth down for a
  // moment; an account deleted within its token's hour, which would be left as a profile on the organization's lists).
  if (!account) throw new HttpsError("unavailable", "Try again in a moment.", { reason: "try-again" });
  const claims = account.customClaims ?? {};
  const staff = (role: unknown) => role === "orgAdmin" || role === "superadmin";
  if (me.get("orgId") || claims.orgId || staff(me.get("role")) || staff(claims.role)) throw inOrg();
  if (account.disabled) throw new HttpsError("permission-denied", "This account is suspended.", { reason: "disabled" });
  const code = normalizeCode(req.data?.code);
  const invRef = code ? db.doc(`inviteCodes/${code}`) : null;
  const inv = invRef ? await invRef.get() : null;
  if (!invRef || !inv?.exists) throw new HttpsError("not-found", "That code is not valid.", { reason: "bad-code" });
  const { orgId, role } = inv.data() as { orgId: string; role: Role };
  const [org, priv, removed] = await Promise.all([db.doc(`orgs/${orgId}`).get(), invitesRef(orgId).get(), removedRef(orgId).get()]);
  if (org.get("status") !== "active") throw new HttpsError("failed-precondition", "This organization is not active.", { reason: "org-inactive" });
  const worn = codeProblem(inv.data(), Date.now());
  if (worn) throw codeRefusal(worn);
  const barred = policyProblem(priv.get("policy"), req.auth?.token);
  if (barred === "email-unverified") throw new HttpsError("permission-denied", "Confirm your email address first (open the link Darsi emailed you), then use the code again.", { reason: barred });
  if (barred === "email-domain") throw new HttpsError("permission-denied", "This organization only accepts its own email addresses. Sign in with the one it gave you.", { reason: barred });
  if (Object.hasOwn((removed.get("uids") as Removed | undefined) ?? {}, c.uid)) throw new HttpsError("permission-denied", "This organization removed you. Ask its admin to let you back in.", { reason: "removed" });
  const late = await db.runTransaction(async (tx) => {
    const now = await tx.get(invRef);
    if (!now.exists) return "bad-code" as const; // replaced by a new code meanwhile
    const why = codeProblem(now.data(), Date.now());
    if (why) return why;
    tx.update(invRef, { uses: FieldValue.increment(1) });
    tx.set(invitesRef(orgId), { uses: { [role]: FieldValue.increment(1) } }, { merge: true });
    return null;
  });
  if (late === "bad-code") throw new HttpsError("not-found", "That code is not valid.", { reason: "bad-code" });
  if (late) throw codeRefusal(late);
  await setRole(c.uid, role, orgId);
  await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(1) });
  await db.doc(`joinAttempts/${c.uid}`).delete().catch(() => {});
  await audit("joinOrg", c.uid, { orgId, role });
  return { orgId, role, orgName: org.get("name") };
});

/**
 * A new invite code for teachers or students; the old one stops working. Only for an active organization, whoever
 * asks (a platform admin too): a code made for one that is suspended or being deleted would be a key nobody may use
 * (joinOrg refuses them), and deleteOrg removes codes it never knew about only at its end. `org-suspended`,
 * `org-deleting`, or `org-inactive` for a request not yet approved or refused.
 */
export const regenerateInviteCode = onCall(async (req) => {
  const orgId = str(req.data?.orgId), role = str(req.data?.role) as Role;
  await requireOrgAdmin(req, orgId);
  if (role !== "teacher" && role !== "student") throw new HttpsError("invalid-argument", "role must be teacher or student", { reason: "bad-role" });
  const [org, priv] = await Promise.all([db.doc(`orgs/${orgId}`).get(), invitesRef(orgId).get()]);
  if (!org.exists) throw new HttpsError("not-found", "No such organization.", { reason: "no-org" });
  const status = org.get("status");
  if (status === "suspended") throw new HttpsError("failed-precondition", "This organization is suspended.", { reason: "org-suspended" });
  if (status === "deleting") throw new HttpsError("failed-precondition", "This organization is being deleted.", { reason: "org-deleting" });
  if (status !== "active") throw new HttpsError("failed-precondition", "This organization is not active.", { reason: "org-inactive" });
  const old = (priv.get(role) ?? org.get(`inviteCodes.${role}`)) as string | undefined;
  const code = generateCode();
  const batch = db.batch();
  if (old) batch.delete(db.doc(`inviteCodes/${old}`));
  // A new code starts with no expiry, no limit and no uses: the old code's went with it (setJoinPolicy sets new ones).
  batch.set(db.doc(`inviteCodes/${code}`), { orgId, role });
  // Both codes now live privately; an org document from before 2026-11 loses its readable copy.
  const other = role === "teacher" ? "student" : "teacher";
  batch.set(invitesRef(orgId), {
    [role]: code, limits: { [role]: FieldValue.delete() }, uses: { [role]: FieldValue.delete() },
    ...(priv.get(other) || !org.get(`inviteCodes.${other}`) ? {} : { [other]: org.get(`inviteCodes.${other}`) }),
  }, { merge: true });
  if (org.get("inviteCodes")) batch.update(org.ref, { inviteCodes: FieldValue.delete() });
  await batch.commit();
  await audit("regenerateInviteCode", req.auth!.uid, { orgId, role });
  return { code };
});

type CodeState = { expiresAt: number | null; maxUses: number | null; uses: number };
/**
 * Who may join with the organization's codes, and each code's limits: {orgId, requireVerifiedEmail?, allowedDomains?
 * (at most 20), codes?: {teacher?: {expiresAt?: ms | null, maxUses?: n | null}, student?: {…}}}. What isn't sent stays
 * as it is; null clears a limit. Answers the policy and both codes' limits and uses as they now are, so a call with
 * only `orgId` reads them (nothing is written or audited then). Anything wrong refuses the whole request as
 * `bad-policy`. The policy binds joinOrg only: people an admin adds (createMembers) are the admin's own choice.
 */
export const setJoinPolicy = onCall(async (req) => {
  const orgId = str(req.data?.orgId, 128);
  const by = await requireOrgAdmin(req, orgId);
  const bad = (message: string) => new HttpsError("invalid-argument", message, { reason: "bad-policy" });
  const change = joinPolicyChange(req.data, Date.now());
  if (!change) throw bad("Check the email domains (at most 20, like school.edu), the expiry (a time still to come) and the limit (1 or more).");
  const [org, priv] = await Promise.all([db.doc(`orgs/${orgId}`).get(), invitesRef(orgId).get()]);
  if (!org.exists) throw new HttpsError("not-found", "No such organization.", { reason: "no-org" });
  const roles = ["teacher", "student"] as const;
  const invs = await Promise.all(roles.map((r) => {
    const code = (priv.get(r) ?? org.get(`inviteCodes.${r}`)) as string | undefined;
    return code ? db.doc(`inviteCodes/${code}`).get() : null;
  }));
  const policy = { ...readJoinPolicy(priv.get("policy")), ...change.policy };
  const codes = {} as Record<(typeof roles)[number], CodeState>;
  const batch = db.batch();
  let changed = Object.keys(change.policy).length > 0;
  for (const [i, r] of roles.entries()) {
    const inv = invs[i], want = change.codes[r] ?? {};
    const state: CodeState = { expiresAt: Number(inv?.get("expiresAt")) || null, maxUses: Number(inv?.get("maxUses")) || null, uses: Number(inv?.get("uses")) || 0 };
    if (want.expiresAt !== undefined || want.maxUses !== undefined) {
      if (!inv?.exists) throw bad("This organization has no such code yet: make a new one first.");
      if (want.expiresAt !== undefined) state.expiresAt = want.expiresAt;
      if (want.maxUses !== undefined) state.maxUses = want.maxUses;
      batch.update(inv.ref, { expiresAt: state.expiresAt ?? FieldValue.delete(), maxUses: state.maxUses ?? FieldValue.delete() });
      changed = true;
    }
    codes[r] = state;
  }
  if (changed) {
    const limits = Object.fromEntries(roles.map((r) => [r, { expiresAt: codes[r].expiresAt, maxUses: codes[r].maxUses }]));
    batch.set(invitesRef(orgId), { policy, limits }, { merge: true });
    await batch.commit();
    await audit("setJoinPolicy", by.uid, { orgId, policy, limits });
  }
  return { policy, codes };
});

/** Lets someone the organization removed join again with a code (it does not add them back by itself). */
export const readmitMember = onCall(async (req) => {
  const orgId = str(req.data?.orgId, 128), uid = str(req.data?.uid, 128);
  const by = await requireOrgAdmin(req, orgId);
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.", { reason: "no-account" });
  const ref = removedRef(orgId);
  const was = await db.runTransaction(async (tx) => {
    const uids: Removed = { ...((await tx.get(ref)).get("uids") as Removed | undefined) };
    if (!Object.hasOwn(uids, uid)) return false;
    delete uids[uid];
    tx.set(ref, { uids });
    return true;
  });
  if (was) await audit("readmitMember", by.uid, { orgId, uid });
  return { ok: true };
});

/* ---------- Members ---------- */

/** One row as the admin's screen sends it. A `password` an older app (or anyone) sends is ignored: Darsi makes every password. */
interface MemberInput { name: string; email?: string; username?: string; role?: Role; group?: string; teacherEmail?: string; lang?: string; password?: string }
/**
 * One row's outcome, in the request's row order. "exists": the typed email already has an account; "taken": the typed
 * username belongs to someone else. `warning: "teacherNotFound"`: created, but its teacher column named no teacher or
 * admin of this organization, so it has no teacher.
 */
interface MemberResult { row: number; name: string; login: string; password?: string; uid?: string; status: "created" | "exists" | "taken" | "error"; error?: string; reason?: RowReason; warning?: "teacherNotFound" }

/**
 * Create accounts for an organization (manual add or Excel import).
 * People without an email get a username; every account gets a random password Darsi makes (never one the request
 * names: a sheet's own passwords are the weak, shared kind, and would sit in the request and its logs) and must
 * change it at first sign-in unless the admin says otherwise.
 * Accounts are made six at a time (CREATE_WIDTH), teachers and admins first and all of them before any pupil, so the
 * pupils who name them in the same request get their teacher. A login on the username domain is the organization's
 * own account (`managedBy`: its admins reset its password and delete it); a typed real email stays its owner's.
 */
export const createMembers = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (req): Promise<{ results: MemberResult[] }> => {
  const orgId = str(req.data?.orgId);
  const by = await requireOrgAdmin(req, orgId);
  const org = await db.doc(`orgs/${orgId}`).get();
  if (org.get("status") !== "active") throw new HttpsError("failed-precondition", "Organization is not active.", { reason: "org-inactive" });
  const members: MemberInput[] = Array.isArray(req.data?.members) ? req.data.members : [];
  if (!members.length || members.length > 500) throw new HttpsError("invalid-argument", "Send between 1 and 500 people per request.", { reason: "batch-size" });
  const pwLen = passwordLength(req.data?.passwordLength);
  const mustChange = req.data?.mustChangePassword !== false;
  const defaultRole: Role = MEMBER_ROLES.includes(req.data?.defaultRole) ? req.data.defaultRole : "student";
  const roleOf = (m: MemberInput): Role => (MEMBER_ROLES.includes(m?.role as Role) ? (m.role as Role) : defaultRole);

  // Resolve teachers' emails (or username logins) to uids, through Auth: a profile's email is only what its owner typed
  // (H1), Auth's is the account's. The account must be a teacher or admin of this org. Ten lookups at a time; teachers
  // this request makes are added as they are created.
  const teacherEmails = [...new Set(members.map((m) => str(m?.teacherEmail).toLowerCase()).filter(Boolean))].slice(0, 200);
  const teacherIds: Record<string, string> = {};
  for (const group of chunks(teacherEmails, 10)) {
    await Promise.all(group.map(async (e) => {
      const login = e.includes("@") ? e : isValidUsername(e) ? usernameToEmail(e) : "";
      const account = login ? await accountByLogin(login) : null;
      if (!account) return;
      const t = await db.doc(`users/${account.uid}`).get();
      if (t.get("orgId") === orgId && (t.get("role") === "teacher" || t.get("role") === "orgAdmin")) teacherIds[e] = account.uid;
    }));
  }

  const results: MemberResult[] = [];
  // Logins this request uses or has tried. Every typed login is in from the start, so a made-up login never takes one
  // a later row asks for; a drawn login goes in as it is drawn (no await in between), so two rows being made at the
  // same time never draw the same one.
  const tried = new Set<string>();
  for (const m of members) {
    const email = str(m?.email, 200).toLowerCase(), username = str(m?.username, 40).toLowerCase();
    if (email) tried.add(email); else if (username) tried.add(usernameToEmail(username));
  }
  const draw = (name: string) => { let u: string; do u = suggestUsername(name); while (tried.has(usernameToEmail(u))); tried.add(usernameToEmail(u)); return u; };
  const made: Partial<Record<Role, number>> = {};

  /** One row, start to finish; it reports its own failure and never throws, so one bad row doesn't stop the others. */
  const createOne = async (i: number) => {
    const m = members[i] ?? ({} as MemberInput);
    const name = str(m.name, 120);
    const role = roleOf(m);
    let email = str(m.email, 200).toLowerCase();
    let username = str(m.username, 40).toLowerCase();
    if (!name) { results.push({ row: i + 1, name, login: email || username, status: "error", error: "Missing name", reason: "missingName" }); return; }
    if (email && !isValidEmail(email)) { results.push({ row: i + 1, name, login: email, status: "error", error: "Invalid email", reason: "invalidEmail" }); return; }
    const typedEmail = Boolean(email), generated = !email && !username;
    if (!email) {
      if (generated) username = draw(name);
      if (!isValidUsername(username)) { results.push({ row: i + 1, name, login: username, status: "error", error: "Invalid username", reason: "invalidUsername" }); return; }
      email = usernameToEmail(username);
    }
    // Someone the school's sign-in already made has no email at Auth: their address is their profile's ssoEmail.
    if (typedEmail) {
      const sso = await db.collection("users").where("orgId", "==", orgId).where("ssoEmail", "==", email).select().limit(1).get();
      if (!sso.empty) { results.push({ row: i + 1, name, login: email, uid: sso.docs[0].id, status: "exists", error: "Account already exists", reason: "exists" }); return; }
    }
    const password = generatePassword(pwLen);
    const teacher = str(m.teacherEmail).toLowerCase();
    for (let draws = 1; ; draws++) {
      let uid = "";
      try {
        // A username an account still holds at the old domain is taken (usernameDomain.ts), as Auth would answer.
        if (!typedEmail && await legacyHolds(email)) throw Object.assign(new Error("The username is taken."), { code: "auth/email-already-exists" });
        const user = await auth.createUser({ email, password, displayName: name, emailVerified: false });
        uid = user.uid;
        await auth.setCustomUserClaims(uid, { role, orgId }); // a new account: no Super yet
        const teacherId = teacher ? teacherIds[teacher] ?? null : null;
        await db.doc(`users/${uid}`).set({
          name, email, username: username || null, role, orgId, group: str(m.group, 60) || null,
          teacherId, lang: str(m.lang, 8) || "en",
          mustChangePassword: mustChange, passwordSetAt: Date.now(), createdAt: FieldValue.serverTimestamp(), createdBy: by.uid, active: true,
          ...(isUsernameEmail(email) ? { managedBy: orgId } : {}),
        });
        made[role] = (made[role] ?? 0) + 1;
        if (role === "teacher" || role === "orgAdmin") for (const k of teacherKeys(email, username || null, usernameToEmail)) teacherIds[k] ??= uid;
        results.push({ row: i + 1, name, login: username || email, password, uid, status: "created", ...(teacher && !teacherId ? { warning: "teacherNotFound" as const } : {}) });
        return;
      } catch (e: unknown) {
        // An account made whose claims or profile then failed is taken back, so it isn't left with a password nobody
        // was shown and the row can be sent again (it would answer "already exists").
        if (uid) await auth.deleteUser(uid).catch((err) => logger.error("createMembers: half-made account not removed", { orgId, uid, error: String(err) }));
        const code = (e as { code?: string }).code;
        const next = uid ? null : onCreateError(code, { generated, typedEmail, draws });
        // A generated login someone already has: a new draw (a failed createUser leaves nothing behind).
        if (next === "retry") { username = draw(name); email = usernameToEmail(username); continue; }
        results.push(next === "exists" ? { row: i + 1, name, login: username || email, status: "exists", error: "Account already exists", reason: "exists" }
          : next === "taken" ? { row: i + 1, name, login: username || email, status: "taken", reason: "taken" }
          : { row: i + 1, name, login: username || email, status: "error", error: String((e as Error).message) });
        return;
      }
    }
  };
  const [staff, pupils] = creationWaves(members.map(roleOf));
  await pool(staff, CREATE_WIDTH, createOne);
  await pool(pupils, CREATE_WIDTH, createOne);
  // Row order, as the client reads the results beside the rows it sent.
  results.sort((a, b) => a.row - b.row);
  const created = Object.values(made).reduce((n, k) => n + k, 0);
  if (created) await org.ref.update({ memberCount: FieldValue.increment(created) });
  await audit("createMembers", by.uid, { orgId, created, total: members.length, mustChange, roles: made });
  return { results };
});

export const setMemberRole = onCall(async (req) => {
  const orgId = str(req.data?.orgId), uid = str(req.data?.uid), role = str(req.data?.role) as Role;
  const by = await requireOrgAdmin(req, orgId);
  if (!MEMBER_ROLES.includes(role)) throw new HttpsError("invalid-argument", "Invalid role.", { reason: "bad-role" });
  // Nobody changes their own role (M2): a demoted admin holding an old token can't promote themselves back.
  if (uid === by.uid) throw new HttpsError("failed-precondition", "You cannot change your own role.", { reason: "self-role" });
  const u = await memberOf(orgId, uid);
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
  // An account only the school's sign-in opens has no password to reset (and no mailbox for "Forgot password").
  if (u.get("sso") === true && !ownLogin(account)) throw new HttpsError("failed-precondition", "This person signs in with the school's own sign-in, which has no Darsi password.", { reason: "sso-login" });
  const own = !account || !isUsernameEmail(account.email) || account.providerData.some((p) => p.providerId !== "password");
  if (own) throw new HttpsError("failed-precondition", "This person signs in with their own email or Google account, so only they can change its password: ask them to use \"Forgot password\" on the sign-in page.", { reason: "own-login" });
  const password = generatePassword(Number(req.data?.passwordLength) || 10);
  await auth.updateUser(uid, { password });
  // The time the password was set, so passwordChanged can tell a real change from a flag cleared without one (I1).
  await u.ref.update({ mustChangePassword: true, passwordSetAt: Date.now() });
  await audit("resetMemberPassword", by.uid, { orgId, uid });
  return { password, login: u.get("username") || u.get("email") };
});

/**
 * Takes someone out of the organization: they become an independent learner and keep their learning. Their sessions
 * end (the claims are written first, and writeClaims revokes the tokens), the organization's count drops, and they
 * are put on its removed list, so the invite code they still know doesn't let them back in (readmitMember does).
 * The codes themselves stay: everyone else was given the same ones. A login the organization itself suspended works
 * again (platform.liftOrgSuspension: that suspension was the organization's business); a platform admin's stays.
 *
 * Order, so a failure part-way can be repeated: the removed-list entry first (writing it again changes nothing), then
 * the role (setRole: claims first), with the organization's suspension lifted between its two writes, and the count
 * last. Once setRole has run, a repeat finds no member (`not-member`), so nothing that must happen may wait until
 * after it but the count. The suspension is lifted only after the claims are gone, so a removal that failed never
 * leaves a suspended member with a working sign-in; and before the profile changes, so a lifting that failed leaves a
 * member the admin removes again.
 */
export const removeMember = onCall(async (req) => {
  const orgId = str(req.data?.orgId), uid = str(req.data?.uid);
  const by = await requireOrgAdmin(req, orgId);
  if (uid === by.uid) throw new HttpsError("failed-precondition", "You cannot remove yourself.", { reason: "self-remove" });
  const u = await memberOf(orgId, uid);
  if (u.get("role") === "orgAdmin") await refuseLastAdmin(uid, orgId);
  await db.runTransaction(async (tx) => {
    const uids = withRemoved((await tx.get(removedRef(orgId))).get("uids") as Removed | undefined, uid, { at: Date.now(), name: str(u.get("name"), 120) });
    tx.set(removedRef(orgId), { uids });
  });
  await setRole(uid, "learner", null, { teacherId: null, group: null }, () => liftOrgSuspension(uid, u.get("suspended"), orgId));
  // Only a count: if this one write fails the person is still removed, and it is logged rather than undone.
  await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(-1) })
    .catch((e) => logger.error("removeMember: member count not lowered", { orgId, uid, error: String(e) }));
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
 * Bad input never throws there (it returns why it did nothing), so only real failures are retried.
 */
export const onProgressWrite = onDocumentWritten({ document: "users/{uid}/progress/{lessonId}", maxInstances: 20, retry: true }, async (event) => {
  // Retried on failure (a Firestore hiccup used to lose the lesson from the summary until the person's next one;
  // progressChanged recomputes from the stored rows, so a second run changes nothing), for up to six hours.
  if (Date.now() - Date.parse(event.time) > 6 * 3600e3) { logger.error("onProgressWrite: gave up retrying", { uid: event.params.uid, lessonId: event.params.lessonId, time: event.time }); return; }
  await progressChanged(event.params.uid, event.params.lessonId);
});
