/**
 * Data rights and abuse (TECHNICAL.md "Accounts: data, deletion and suspension"):
 * - exportAccountData: everything Darsi keeps about an account, as JSON ("Download my data" in Me, and on the person
 *   page for staff handling a request).
 * - deleteAccount: the account and its data, for the person themself ("Delete my account" in Me), a platform admin
 *   handling a request, or an organization's admin for an account the organization made. Payment records are kept for
 *   the accounts, with the person's id replaced by a hash; the audit log keeps who deleted which account.
 * - setAccountSuspended: a platform admin stops (or allows again) an account's sign-in, for abuse.
 * - moderateSubmission: a platform admin removes a project's text and files, for abuse.
 * Who may do what is accountActionProblem (roles.ts, pure and tested).
 */
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { audit, auth, db, freshCaller, releasePupils, requireSuper, str } from "./admin.js";
import { hashedUid, ownFileRe, recentSignIn, submissionFiles } from "./accountCore.js";
import { renewsByItself, type Subscription } from "./billingCore.js";
import { forgetAllDevices } from "./notify.js";
import { USERNAME_DOMAIN } from "./passwords.js";
import { accountActionProblem, type AccountAction } from "./roles.js";
import { bucket } from "./storage.js";

/** Firestore values as plain JSON (timestamps as ISO dates). */
function plain(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x)]));
  return v;
}

const MESSAGES = {
  "self-staff": "You are an admin: someone else must take your role over before your account can be deleted.",
  "self-org": "Your organization made this account: ask its admin to delete it.",
  superadmin: "That person is a platform admin. Change their role on their page first.",
  "not-yours": "Only a platform admin, or the admin of the organization that made the account, can do that.",
  missing: "No such account.",
} as const;

/** The account a request is about, and whether the caller may act on it (throws when not). */
async function target(req: CallableRequest, action: AccountAction) {
  const c = await freshCaller(req);
  const uid = str(req.data?.uid, 128) || c.uid;
  const [profile, account] = await Promise.all([db.doc(`users/${uid}`).get(), auth.getUser(uid).catch(() => null)]);
  if (!profile.exists && !account) throw new HttpsError("not-found", MESSAGES.missing, { reason: "missing" });
  const problem = accountActionProblem(action, { uid: c.uid, role: c.role, orgId: c.orgId ?? null }, {
    uid, exists: profile.exists, role: profile.get("role"), orgId: profile.get("orgId"), createdBy: profile.get("createdBy"),
    email: account?.email ?? (profile.get("email") as string | undefined) ?? null,
  }, USERNAME_DOMAIN);
  if (problem) throw new HttpsError(problem === "missing" ? "not-found" : problem === "not-yours" ? "permission-denied" : "failed-precondition", MESSAGES[problem], { reason: problem });
  return { c, uid, self: uid === c.uid, profile, account };
}

/** Everything kept about an account, as JSON. Notes are private: only the person and platform admins get them. */
export const exportAccountData = onCall({ timeoutSeconds: 120, memory: "512MiB" }, async (req) => {
  const { c, uid, self, profile, account } = await target(req, "export");
  const withNotes = self || c.role === "superadmin";
  const [progress, submissions, certs, notes, credits, subscription, access, payments, reports] = await Promise.all([
    db.collection(`users/${uid}/progress`).get(),
    db.collection(`users/${uid}/submissions`).get(),
    db.collection(`users/${uid}/certs`).get(),
    withNotes ? db.collection(`users/${uid}/notes`).get() : null,
    db.doc(`credits/${uid}`).get(),
    db.doc(`subscriptions/${uid}`).get(),
    db.doc(`courseAccess/${uid}`).get(),
    db.collection("payments").where("uid", "==", uid).get(),
    db.collection("bugReports").where("user.uid", "==", uid).select("createdAt", "text", "url", "status").get(),
  ]);
  const { notify, ...rest } = (profile.data() ?? {}) as Record<string, unknown>;
  await audit("exportAccountData", c.uid, { uid, self });
  return {
    exportedAt: new Date().toISOString(), uid,
    account: account ? {
      email: account.email ?? null, emailVerified: account.emailVerified, name: account.displayName ?? null, disabled: account.disabled,
      createdAt: account.metadata.creationTime ?? null, lastSignIn: account.metadata.lastSignInTime ?? null,
      providers: account.providerData.map((p) => p.providerId),
    } : null,
    profile: plain(rest),
    notifications: notify ? plain({ ...(notify as Record<string, unknown>) }) : null,
    lessons: progress.docs.map((d) => plain({ id: d.id, ...d.data() })),
    projects: submissions.docs.map((d) => plain({ id: d.id, ...d.data() })),
    certificates: certs.docs.map((d) => plain({ unitId: d.id, ...d.data() })),
    ...(notes ? { notes: notes.docs.map((d) => plain({ lessonId: d.id, ...d.data() })) } : {}),
    tutorCredits: credits.exists ? plain(credits.data()) : null,
    subscription: subscription.exists ? plain(subscription.data()) : null,
    courseAccess: access.exists ? plain(access.data()) : null,
    payments: payments.docs.map((d) => plain({ id: d.id, ...d.data() })),
    problemReports: reports.docs.map((d) => plain({ id: d.id, ...d.data() })),
  };
});

/**
 * Deletes an account and its data. The profile goes first, so the summary trigger writes nothing back (progress.ts),
 * then everything under it, the person's project files in every organization's folder, their other records, their
 * problem reports and screenshots, and last the sign-in itself. The sign-in is switched off at the start, so the
 * account can't be used while this runs, and a run that fails part-way can simply be repeated.
 */
export const deleteAccount = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (req) => {
  const { c, uid, self, profile, account } = await target(req, "delete");
  if (self && !recentSignIn(req.auth?.token.auth_time)) {
    throw new HttpsError("failed-precondition", "Sign in again, then delete your account within 10 minutes.", { reason: "recent-login" });
  }
  // A Stripe subscription that renews by itself would keep charging a card nobody can manage any more.
  if (renewsByItself((await db.doc(`subscriptions/${uid}`).get()).data() as Subscription | undefined)) {
    throw new HttpsError("failed-precondition", "This account's Darsi Super subscription renews by itself: turn its renewal off first.", { reason: "renewing" });
  }
  const done = await wipeAccount(uid, profile, Boolean(account));
  await audit("deleteAccount", c.uid, { uid, self, role: profile.get("role") ?? null, orgId: profile.get("orgId") ?? null, ...done });
  return { ok: true };
});

async function wipeAccount(uid: string, profile: DocumentSnapshot, hasAccount: boolean) {
  const orgId = (profile.get("orgId") as string | null | undefined) ?? null;
  if (hasAccount) {
    await auth.updateUser(uid, { disabled: true });
    await auth.revokeRefreshTokens(uid);
  }
  // Project files: the folders of every organization the person sent work from, and any link a project holds.
  const subs = await db.collection(`users/${uid}/submissions`).get();
  const files = new Set(subs.docs.flatMap((d) => submissionFiles(d.data(), uid)));
  const orgs = new Set(["none", ...(orgId ? [orgId] : []), ...subs.docs.map((d) => d.get("orgId")).filter((o): o is string => typeof o === "string" && !!o)]);
  for (const f of files) orgs.add(f.split("/")[1]);

  const devices = await forgetAllDevices(uid);
  await db.doc(`users/${uid}`).delete();
  await db.recursiveDelete(db.doc(`users/${uid}`)); // progress, projects, notes, private rows: the profile is already gone

  let removedFiles = 0;
  const own = ownFileRe(uid);
  for (const o of orgs) {
    const [list] = await bucket().getFiles({ prefix: `submissions/${o}/${uid}/` });
    await Promise.all(list.map((f) => f.delete({ ignoreNotFound: true })));
    removedFiles += list.length;
  }
  // Files left in an organization's folder the person no longer sent work from (an upload never sent): one listing,
  // narrowed by Storage where it can, and checked by name here (the emulator ignores matchGlob).
  try {
    const [rest] = await bucket().getFiles({ prefix: "submissions/", matchGlob: `submissions/*/${uid}/**` });
    const left = rest.filter((f) => own.test(f.name));
    await Promise.all(left.map((f) => f.delete({ ignoreNotFound: true })));
    removedFiles += left.length;
  } catch (e) { logger.warn("deleteAccount: leftover files not listed", { uid, error: String(e) }); }
  await Promise.all([...files].map((p) => bucket().file(p).delete({ ignoreNotFound: true })));

  // The person's other records.
  await Promise.all(["credits", "subscriptions", "courseAccess", "joinAttempts", "capstoneLimits", "tutorLeases"].map((col) => db.doc(`${col}/${uid}`).delete()));
  await db.recursiveDelete(db.doc(`tutorUsage/${uid}`));
  // Problem reports they sent, with their screenshots.
  const reports = await db.collection("bugReports").where("user.uid", "==", uid).get();
  for (const r of reports.docs) {
    const shot = r.get("shot.path");
    if (typeof shot === "string" && shot.startsWith("bugReports/")) await bucket().file(shot).delete({ ignoreNotFound: true });
    await r.ref.delete();
  }
  // Organization requests they made that never became an organization.
  const requests = await db.collection("orgs").where("createdBy", "==", uid).where("status", "in", ["pending", "rejected"]).get();
  for (const o of requests.docs) await db.recursiveDelete(o.ref);
  // Payments and checkouts stay for the accounts, without the person: their id becomes a hash.
  const hashed = hashedUid(uid);
  const [pays, checkouts] = await Promise.all([db.collection("payments").where("uid", "==", uid).get(), db.collection("checkouts").where("uid", "==", uid).get()]);
  await Promise.all([...pays.docs.map((d) => d.ref.update({ uid: hashed })), ...checkouts.docs.map((d) => d.ref.update({ uid: hashed, clientId: null }))]);

  // Their organization: one member fewer, and their pupils get a new teacher.
  const released = orgId ? await releasePupils(orgId, uid) : 0;
  if (orgId) await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(-1) }).catch(() => {});

  if (hasAccount) await auth.deleteUser(uid).catch((e: { code?: string }) => { if (e?.code !== "auth/user-not-found") throw e; });
  return { devices, files: removedFiles, projects: subs.size, reports: reports.size, requests: requests.size, payments: pays.size, released };
}

/** A platform admin stops an account's sign-in (abuse), or allows it again. Its sessions end at once. */
export const setAccountSuspended = onCall(async (req) => {
  const c = await requireSuper(req);
  const uid = str(req.data?.uid, 128), suspended = req.data?.suspended === true;
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.");
  if (uid === c.uid) throw new HttpsError("failed-precondition", "You can't suspend your own account.");
  const [profile, account] = await Promise.all([db.doc(`users/${uid}`).get(), auth.getUser(uid).catch(() => null)]);
  if (!account) throw new HttpsError("not-found", MESSAGES.missing);
  if (profile.get("role") === "superadmin") throw new HttpsError("failed-precondition", MESSAGES.superadmin, { reason: "superadmin" });
  const reason = str(req.data?.reason, 500);
  await auth.updateUser(uid, { disabled: suspended });
  if (suspended) await auth.revokeRefreshTokens(uid);
  if (profile.exists) await profile.ref.update({ suspended: suspended ? { at: FieldValue.serverTimestamp(), by: c.uid, reason } : FieldValue.delete() });
  await audit("setAccountSuspended", c.uid, { uid, suspended, reason });
  return { suspended };
});

/**
 * A platform admin removes a project's content (abuse): its text, explanations, links and files go, and it is marked
 * `moderated`. Its review status and feedback stay, so nobody is told it was reviewed.
 */
export const moderateSubmission = onCall(async (req) => {
  const c = await requireSuper(req);
  const uid = str(req.data?.uid, 128), id = str(req.data?.id, 128);
  if (!uid || !id) throw new HttpsError("invalid-argument", "uid and id are required.");
  const ref = db.doc(`users/${uid}/submissions/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "No such project.");
  const files = submissionFiles(snap.data(), uid);
  await Promise.all(files.map((p) => bucket().file(p).delete({ ignoreNotFound: true })));
  await ref.update({
    text: "", fileUrl: null, fileName: null, files: [], explain: FieldValue.delete(), aiUse: FieldValue.delete(),
    repo: FieldValue.delete(), links: FieldValue.delete(),
    moderated: { by: c.uid, at: FieldValue.serverTimestamp(), reason: str(req.data?.reason, 500) },
  });
  await audit("moderateSubmission", c.uid, { uid, id, files: files.length });
  return { ok: true, files: files.length };
});
